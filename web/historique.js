// MODIFIE CE NUMÉRO pour faire réapparaître le popup chez tout le monde lors d'une mise à jour
const APP_VERSION = "7.4";

// Fonction pour ouvrir manuellement le popup via le bouton
// Fonction utilitaire pour charger le contenu de l'aide dans le popup
// 1. La fonction de chargement (avec injection de version et anti-cache)
async function loadHelpContent() {
  const container = document.querySelector(
    "#news-popup-overlay div[style*='padding:20px']",
  );
  if (!container) return;

  try {
    const response = await fetch("aide.html?t=" + new Date().getTime());
    if (!response.ok) throw new Error();

    let html = await response.text();

    // Remplacement dynamique de la version
    // On remplace toutes les balises {{VERSION}} par la constante globale
    html = html.replace(/{{VERSION}}/g, APP_VERSION);

    container.innerHTML = html;
  } catch (error) {
    container.innerHTML = "<p>⚠️ Erreur de chargement du manuel.</p>";
  }
}

// 2. Vérification automatique au démarrage
async function checkNewsPopup() {
  const lastSeenVersion = localStorage.getItem("genealogy_news_version");

  // On met à jour l'affichage du numéro de version dans le petit label du popup (si existant)
  const versionDisplay = document.getElementById("app-version-display");
  if (versionDisplay) versionDisplay.innerText = "v" + APP_VERSION;

  if (lastSeenVersion !== APP_VERSION) {
    // IMPORTANT : On attend le chargement et l'injection avant d'afficher
    await loadHelpContent();
    document.getElementById("news-popup-overlay").style.display = "flex";
  }
}

// 3. Ouverture manuelle via le bouton "À propos"
async function openNewsPopup() {
  const popup = document.getElementById("news-popup-overlay");
  if (popup) {
    await loadHelpContent();
    popup.style.display = "flex";
  }
  const versionDisplay = document.getElementById("app-version-display");
  if (versionDisplay) versionDisplay.innerText = "v" + APP_VERSION;
}

function closeNewsPopup() {
  localStorage.setItem("genealogy_news_version", APP_VERSION);
  document.getElementById("news-popup-overlay").style.display = "none";
}

// Lancement au chargement de la page
window.addEventListener("DOMContentLoaded", checkNewsPopup);

let familyData = { nodes: [], links: [] };
let mapSvg,
  mapG,
  projection,
  zoom,
  colorScale,
  currentTransform = d3.zoomIdentity;
const YEAR_SPACING = 6;

let hoverTimer;
const HOVER_THRESHOLD = 2; // Seuil de zoom (50%)

const HISTORIC_PERIODS = [
  { name: "Louis XIV", start: 1643, end: 1715, color: "#edf2f7" },
  { name: "Louis XVI", start: 1774, end: 1789, color: "#f7fafc" },
  { name: "Révolution", start: 1789, end: 1804, color: "#edf2f7" },
  { name: "Premier Empire", start: 1804, end: 1815, color: "#fefcbf" },
  { name: "Seconde Empire", start: 1852, end: 1870, color: "#f7fafc" },
  {
    name: "Première guerre mondiale",
    start: 1914,
    end: 1918,
    color: "#fff5f5",
  },
  { name: "Seconde Guerre Mondiale", start: 1939, end: 1945, color: "#f7fafc" },
];

function estimateAllDates() {
  familyData.nodes.forEach((n) => {
    n.computedBirth = n.birth > 0 ? n.birth : null;
  });
  let changed = true;
  let iterations = 0;
  while (changed && iterations < 10) {
    changed = false;
    iterations++;
    familyData.links.forEach((link) => {
      if (link.type !== "parent") return;
      const source = familyData.nodes.find((n) => n.id === link.source);
      const target = familyData.nodes.find((n) => n.id === link.target);
      if (source.computedBirth && !target.computedBirth) {
        target.computedBirth = source.computedBirth + 30;
        changed = true;
      } else if (target.computedBirth && !source.computedBirth) {
        source.computedBirth = target.computedBirth - 30;
        changed = true;
      }
    });
  }
  const avgBirth =
    d3.mean(
      familyData.nodes.filter((n) => n.birth > 0),
      (n) => n.birth,
    ) || 1900;
  familyData.nodes.forEach((n) => {
    if (!n.computedBirth) n.computedBirth = Math.round(avgBirth);
  });
}

async function init() {
  mapSvg = d3.select("#map-svg");
  mapG = mapSvg.append("g");

  // On définit lineageSelect ici pour éviter l'erreur "ReferenceError"
  const lineageSelect = d3.select("#filter-lineage-select");

  mapSvg
    .append("defs")
    .append("marker")
    .attr("id", "arrowhead")
    .attr("viewBox", "0 -5 10 10")
    .attr("refX", 30)
    .attr("refY", 0)
    .attr("markerWidth", 5)
    .attr("markerHeight", 5)
    .attr("orient", "auto")
    .append("path")
    .attr("d", "M0,-5L12,0 L0,5")
    .attr("fill", "#2b6cb0");

  try {
    const url = "data.json?t=" + new Date().getTime();
    familyData = await d3.json(url);

    if (!familyData || !familyData.nodes) {
      throw new Error("Données invalides");
    }

    console.log(
      "Test de présence :",
      document.getElementById("btn-relation-search"),
    );
    estimateAllDates();
    setupPanelSearch();

    const validYears = familyData.nodes
      .map((d) => d.birth)
      .filter((y) => y > 0);
    colorScale = d3
      .scaleSequential(d3.interpolateViridis)
      .domain([d3.min(validYears), d3.max(validYears)]);

    setupFilters(familyData.nodes.map((d) => d.birth));

    projection = d3
      .geoMercator()
      .center([5.5, 46.8])
      .scale(4000)
      .translate([window.innerWidth / 2, window.innerHeight / 2]);

    zoom = d3
      .zoom()
      .scaleExtent([0.1, 1000])
      .on("zoom", (e) => {
        currentTransform = e.transform;
        mapG.attr("transform", currentTransform);
        update();
      });

    mapSvg.call(zoom);
    loadGeoJSON();

    // On écoute le changement de lignée
    lineageSelect.on("change", update);

    // Lancement initial
    update();

    // Initialisation de la frise avec les données chargées
    updateTimeline(familyData.nodes);
  } catch (err) {
    console.error(err);
    d3.select("#lbl-years").text("Erreur chargement données");
  }
}

// --- LOGIQUE DE RECHERCHE DANS LE PANNEAU ---
function setupPanelSearch() {
  const input = document.getElementById("search-input-panel");
  const results = document.getElementById("search-results-panel");

  input.addEventListener("input", (e) => {
    const query = e.target.value.toLowerCase().trim();
    if (query.length < 2) {
      results.style.display = "none";
      return;
    }

    // Recherche sur Nom + Prénom
    const matches = familyData.nodes
      .filter((n) =>
        (n.firstname + " " + n.surname).toLowerCase().includes(query),
      )
      .slice(0, 20); // Limite pour performance

    if (matches.length > 0) {
      results.innerHTML = matches
        .map(
          (m) => `
                <div class="search-item" onclick="selectFromSearch('${m.id}')">
                    <b>${m.surname}</b> ${m.firstname} 
                    <span style="color:#718096; font-size:11px;">(📅 ${m.birth || "?"})</span>
                </div>
            `,
        )
        .join("");
      results.style.display = "block";
    } else {
      results.style.display = "none";
    }
  });

  // Fermer si clic ailleurs
  document.addEventListener("click", (e) => {
    if (e.target.id !== "search-input-panel") results.style.display = "none";
  });
}

function selectFromSearch(id) {
  document.getElementById("search-results-panel").style.display = "none";
  document.getElementById("search-input-panel").value = "";
  openHourglass(id); // Recentre l'organigramme sur la personne
}

async function loadGeoJSON() {
  const urls = [
    "departements-version-simplifiee.geojson",
    "ch-districts.geojson",
  ];
  for (const url of urls) {
    try {
      const data = await d3.json(url);
      mapG
        .selectAll(".sub")
        .data(data.features)
        .enter()
        .insert("path", ":first-child")
        .attr("class", "subdivision")
        .attr("d", d3.geoPath().projection(projection));
    } catch (e) {}
  }
}

function setupFilters(years) {
  const validYears = years.filter((y) => y > 0);
  const min = d3.min(validYears),
    max = d3.max(validYears);
  const iMin = document.getElementById("min-year"),
    iMax = document.getElementById("max-year");
  [iMin, iMax].forEach((i) => {
    i.min = min;
    i.max = max;
  });
  iMin.value = min;
  iMax.value = max;
  const handleInput = (e) => {
    if (+iMin.value > +iMax.value) {
      e.target.id === "min-year"
        ? (iMin.value = iMax.value)
        : (iMax.value = iMin.value);
    }
    update();
  };
  iMin.addEventListener("input", handleInput);
  iMax.addEventListener("input", handleInput);
  d3.select("#lbl-years").text(`Période : ${iMin.value} - ${iMax.value}`);
  d3.selectAll("input[type=checkbox]").on("change", update);
  const names = [
    ...new Set(familyData.nodes.map((d) => d.surname.toUpperCase())),
  ].sort();
  d3.select("#filter-names")
    .selectAll("option")
    .data(["TOUS", ...names])
    .enter()
    .append("option")
    .text((d) => d)
    .property("selected", (d) => d === "TOUS");
  d3.select("#filter-names").on("change", update);
  const places = [
    ...new Set(
      familyData.nodes.map((d) => d.place).filter((p) => p && p.trim() !== ""),
    ),
  ].sort();
  d3.select("#filter-places")
    .selectAll("option")
    .data(["TOUS", ...places])
    .enter()
    .append("option")
    .text((d) => d)
    .property("selected", (d) => d === "TOUS");
  d3.select("#filter-places").on("change", update);

  // --- Dans la fonction setupFilters(years) ---

  const lineageSelect = d3.select("#filter-lineage-select");
  const lineageSearch = document.getElementById("lineage-search");

  // Préparation des données pour la liste
  const people = familyData.nodes
    .map((n) => ({
      id: n.id,
      label: `${n.surname.toUpperCase()} ${n.firstname} (${n.birth || "?"})`,
      searchKey: `${n.surname} ${n.firstname}`.toLowerCase(),
    }))
    .sort((a, b) => a.label.localeCompare(b.label));

  // Fonction pour remplir le select selon un filtre
  function fillLineageSelect(filterText = "") {
    const filteredPeople = people.filter((p) =>
      p.searchKey.includes(filterText.toLowerCase()),
    );

    lineageSelect.selectAll("option.person").remove();

    lineageSelect
      .selectAll("option.person")
      .data(filteredPeople)
      .enter()
      .append("option")
      .attr("class", "person")
      .attr("value", (d) => d.id)
      .text((d) => d.label);
  }

  // Initialisation au chargement
  fillLineageSelect();

  // Écouteur sur la saisie libre
  lineageSearch.addEventListener("input", (e) => {
    fillLineageSelect(e.target.value);
  });

  lineageSelect.on("change", update);
}

function getLineageIds(rootId) {
  if (!rootId) return null;
  const relatedIds = new Set();
  relatedIds.add(rootId);

  // Fonction récursive pour monter (ancêtres)
  const findUp = (id) => {
    familyData.links
      .filter((l) => l.target === id && l.type === "parent")
      .forEach((l) => {
        if (!relatedIds.has(l.source)) {
          relatedIds.add(l.source);
          findUp(l.source);
        }
      });
  };

  // Fonction récursive pour descendre (descendants)
  const findDown = (id) => {
    familyData.links
      .filter((l) => l.source === id && l.type === "parent")
      .forEach((l) => {
        if (!relatedIds.has(l.target)) {
          relatedIds.add(l.target);
          findDown(l.target);
        }
      });
  };

  findUp(rootId);
  findDown(rootId);
  return relatedIds;
}

function clearLineageFilter() {
  document.getElementById("filter-lineage-select").value = "";
  document.getElementById("lineage-search").value = ""; // Vide le champ de recherche
  // On peut aussi choisir de réinitialiser la liste complète
  const lineageSearch = document.getElementById("lineage-search");
  lineageSearch.dispatchEvent(new Event("input"));
  update();
}

function updateHistogram(filteredData, vMin, vMax) {
  const statsContainer = d3.select("#stats-container");
  statsContainer.selectAll("*").remove();
  const validYears = filteredData.map((d) => d.birth).filter((y) => y > 0);
  if (validYears.length === 0) return;
  const step = 25;
  const bins = [];
  const minAll = +document.getElementById("min-year").min;
  const maxAll = +document.getElementById("max-year").max;
  for (let i = Math.floor(minAll / step) * step; i <= maxAll; i += step) {
    const count = validYears.filter((y) => y >= i && y < i + step).length;
    bins.push({ start: i, count: count });
  }
  const maxCount = d3.max(bins, (d) => d.count) || 1;
  //statsContainer.selectAll(".stat-bar").data(bins).enter().append("div").attr("class", "stat-bar").classed("active", d => d.start >= vMin - step && d.start <= vMax).style("height", d => Math.max(2, (d.count / maxCount) * 40) + "px");
  statsContainer
    .selectAll(".stat-bar")
    .data(bins)
    .enter()
    .append("div")
    .attr("class", "stat-bar")
    // Ajoutez ceci pour garantir la fluidité
    .style("flex", "1")
    .classed("active", (d) => d.start >= vMin - step && d.start <= vMax)
    .style("height", (d) => Math.max(2, (d.count / maxCount) * 40) + "px");
}

function update() {
  if (!familyData || !familyData.nodes) return;

  const vMin = +document.getElementById("min-year").value,
    vMax = +document.getElementById("max-year").value;
  const selN = Array.from(
    d3.select("#filter-names").property("selectedOptions"),
  ).map((o) => o.value);
  const selP = Array.from(
    d3.select("#filter-places").property("selectedOptions"),
  ).map((o) => o.value);

  // 1. RÉCUPÉRATION DE LA VALEUR
  const lineageSelectEl = document.getElementById("filter-lineage-select");
  const lineageId = lineageSelectEl ? lineageSelectEl.value : "";

  // 2. MISE À JOUR DES BOUTONS (APPARENCE)
  const navContainer = document.getElementById("quick-nav-container");
  const btnOrg = document.getElementById("btn-go-to-org");
  const btnRel = document.getElementById("btn-relation-search");

  if (lineageId && lineageId !== "") {
    if (navContainer) navContainer.style.display = "flex";
    if (btnOrg) btnOrg.onclick = () => openHourglass(lineageId);
    if (btnRel) {
      btnRel.style.display = "inline-block";
      btnRel.onclick = () => {
        console.log("Clic sur bouton relation");
        openRelationModal(lineageId);
      };
    }
  } else {
    if (navContainer) navContainer.style.display = "none";
  }

  const lineageSet = lineageId ? getLineageIds(lineageId) : null;

  const filteredByNameAndPlace = familyData.nodes.filter((d) => {
    const nameMatch =
      selN.includes("TOUS") || selN.includes(d.surname.toUpperCase());
    const placeMatch =
      selP.includes("TOUS") || (d.place && selP.includes(d.place));

    // NOUVEAU : Test de la lignée
    const lineageMatch = lineageSet ? lineageSet.has(d.id) : true;

    return nameMatch && placeMatch && lineageMatch;
  });

  //const filteredByNameAndPlace = familyData.nodes.filter(d => {
  //    const nameMatch = (selN.includes("TOUS") || selN.includes(d.surname.toUpperCase()));
  //    const placeMatch = (selP.includes("TOUS") || (d.place && selP.includes(d.place)));
  //    return nameMatch && placeMatch;
  //});

  updateHistogram(filteredByNameAndPlace, vMin, vMax);
  const filtered = filteredByNameAndPlace.filter((d) => {
    const yearMatch = d.birth >= vMin && d.birth <= vMax;
    const hasCoords =
      d.lat !== undefined && d.lon !== undefined && d.lat !== null;
    return yearMatch && hasCoords;
  });

  d3.select("#lbl-years").text(`Période : ${vMin} - ${vMax}`);
  d3.select("#lbl-count").text(`(${filtered.length} personnes sur la carte)`);
  const clusters = [];
  filtered.forEach((node) => {
    const proj = projection([node.lon, node.lat]);
    if (!proj) return;
    const sX = proj[0] * currentTransform.k + currentTransform.x,
      sY = proj[1] * currentTransform.k + currentTransform.y;
    let cluster = clusters.find((c) => Math.hypot(c.sX - sX, c.sY - sY) < 25);
    if (cluster) cluster.members.push(node);
    else clusters.push({ sX, sY, x: proj[0], y: proj[1], members: [node] });
  });
  const activeIds = new Set(filtered.map((d) => d.id));
  const activeLinks = familyData.links.filter(
    (l) =>
      activeIds.has(l.source) &&
      activeIds.has(l.target) &&
      ((l.type === "parent" &&
        d3.select("#check-parent").property("checked")) ||
        (l.type === "marriage" &&
          d3.select("#check-marriage").property("checked"))),
  );
  renderMap(clusters, activeLinks);

  updateTimeline(filteredByNameAndPlace);
}

function renderMap(clusters, links) {
  // 1. Gestion des liens
  const l = mapG
    .selectAll(".link")
    .data(links, (d) => d.source + "-" + d.target + "-" + d.type);
  l.exit().remove();
  l.enter()
    .append("path")
    .merge(l)
    .attr("class", (d) => "link link-" + d.type)
    .attr("d", (d) => {
      const s = familyData.nodes.find((n) => n.id === d.source);
      const t = familyData.nodes.find((n) => n.id === d.target);
      const pS = projection([s.lon, s.lat]),
        pT = projection([t.lon, t.lat]);
      const dx = pT[0] - pS[0],
        dy = pT[1] - pS[1],
        dr = Math.sqrt(dx * dx + dy * dy);
      if (dr < 2) {
        const sz = 12 / currentTransform.k;
        return `M${pS[0]},${pS[1]} C${pS[0] - sz},${pS[1] - sz} ${pS[0] + sz},${pS[1] - sz} ${pS[0]},${pS[1]}`;
      }
      return `M${pS[0]},${pS[1]}A${dr},${dr} 0 0,1 ${pT[0]},${pT[1]}`;
    })
    .style("stroke-width", 1.2 / currentTransform.k)
    .attr("marker-end", (d) =>
      d.type === "parent" ? "url(#arrowhead)" : null,
    );

  // 2. Gestion des pastilles (Noeuds/Clusters)
  const g = mapG.selectAll(".node-group").data(clusters, (d) =>
    d.members
      .map((m) => m.id)
      .sort()
      .join("-"),
  );

  g.exit().remove();

  const e = g.enter().append("g").attr("class", "node-group");

  // Ajout du cercle
  e.append("circle").attr("class", "node-circle");
  // Ajout du texte (nombre de personnes si cluster)
  e.append("text").attr("class", "node-text");

  const u = e.merge(g).attr("transform", (d) => `translate(${d.x}, ${d.y})`);

  const r = 10 / currentTransform.k;

  u.select("circle")
    .attr("r", r)
    .attr("fill", (d) => colorScale(d3.mean(d.members, (n) => n.computedBirth)))
    .style("stroke-width", 1 / currentTransform.k)
    .on("click", (evt, d) => {
      evt.stopPropagation();

      // On sélectionne l'ID #popup
      const pop = d3.select("#popup");
      if (pop.empty()) return; // Sécurité si l'élément manque au HTML

      // Remplissage du contenu
      pop.html(
        d.members
          .map(
            (m) => `
            <div class="popup-item">
                <div class="popup-card-content">
                    <b style="color:var(--text-dark)">${m.firstname} ${m.surname.toUpperCase()}</b>
                    <span>📅 ${m.birth || "Inconnue"} | 📍 ${m.place || "Lieu inconnu"}</span>
                </div>
                <button class="popup-btn" onclick="openHourglass('${m.id}')">
                    Voir l'arbre généalogique
                </button>
            </div>
        `,
          )
          .join(""),
      );

      // AFFICHAGE TEMPORAIRE POUR MESURE
      pop.style("display", "block").style("visibility", "hidden");

      const popNode = pop.node();
      const popRect = popNode.getBoundingClientRect();

      // Calcul des positions
      let x = evt.clientX + 20;
      let y = evt.clientY;

      if (x + popRect.width > window.innerWidth)
        x = evt.clientX - popRect.width - 20;
      if (evt.clientY > window.innerHeight / 2) {
        y = evt.clientY - popRect.height - 10;
      } else {
        y = evt.clientY + 10;
      }

      // Sécurité bordures écran
      if (y < 10) y = 10;
      if (y + popRect.height > window.innerHeight)
        y = window.innerHeight - popRect.height - 10;

      // APPLICATION FINALE
      pop
        .style("left", x + "px")
        .style("top", y + "px")
        .style("visibility", "visible");
    });

  u.select("text")
    .text((d) => (d.members.length > 1 ? d.members.length : ""))
    .style("font-size", 11 / currentTransform.k + "px")
    .style("fill", "white")
    .style("text-anchor", "middle")
    .style("dominant-baseline", "central")
    .style("pointer-events", "none");
}

function openHourglass(id) {
  togglePanel(true);
  const container = d3.select("#tree-viz");
  container.selectAll("*").remove();
  const svg = container
    .append("svg")
    .attr("width", "100%")
    .attr("height", "100%");

  setTimeout(() => {
    const rect = container.node().getBoundingClientRect();
    const g = svg
      .append("g")
      .attr("transform", `translate(${rect.width / 2}, ${rect.height / 2})`);
    const targetNode = familyData.nodes.find((n) => n.id === id);
    if (!targetNode) return;

    let birthRef = targetNode.birth;
    if (birthRef === 0 || birthRef === "0000") {
      const directLinks = familyData.links.filter(
        (l) => l.source === id || l.target === id,
      );
      let foundDate = null;
      for (let l of directLinks) {
        const relative = familyData.nodes.find(
          (n) => n.id === (l.source === id ? l.target : l.source),
        );
        if (relative && relative.birth > 0) {
          foundDate =
            l.source === relative.id
              ? relative.birth + 30
              : relative.birth - 30;
          break;
        }
      }
      birthRef =
        foundDate ||
        (familyData.nodes.filter((n) => n.birth > 0).length > 0
          ? Math.round(
              d3.mean(
                familyData.nodes.filter((n) => n.birth > 0),
                (n) => n.birth,
              ),
            )
          : 1900);
    }

    const bgLayer = g.append("g").attr("class", "background-layer");
    const treeLayer = g.append("g").attr("class", "tree-layer");
    svg.call(d3.zoom().on("zoom", (e) => g.attr("transform", e.transform)));

    const build = (rootId, isUp) => {
      const p = familyData.nodes.find((n) => n.id === rootId);
      if (!p) return null;
      const node = { ...p, children: [], direction: isUp ? -1 : 1 };
      familyData.links
        .filter(
          (l) =>
            (isUp ? l.target === rootId : l.source === rootId) &&
            l.type === "parent",
        )
        .forEach((l) => {
          const nextId = isUp ? l.source : l.target;
          const c = build(nextId, isUp);
          if (c) node.children.push(c);
        });
      return node;
    };

    const upD = build(id, true),
      downD = build(id, false);
    const rUp = upD ? d3.hierarchy(upD) : null,
      rDown = downD ? d3.hierarchy(downD) : null;
    const treeLayout = d3.tree().nodeSize([180, 0]);
    let minX = 0,
      maxX = 0;
    if (rUp) {
      treeLayout(rUp);
      rUp.descendants().forEach((d) => {
        minX = Math.min(minX, d.x);
        maxX = Math.max(maxX, d.x);
      });
    }
    if (rDown) {
      treeLayout(rDown);
      rDown.descendants().forEach((d) => {
        minX = Math.min(minX, d.x);
        maxX = Math.max(maxX, d.x);
      });
    }

    const padding = 200;
    drawHistoryBackground(
      bgLayer,
      minX - padding / 2,
      maxX + padding / 2,
      birthRef,
      maxX - minX + padding,
    );

    const allNodes = [
      ...(rUp ? rUp.descendants() : []),
      ...(rDown ? rDown.descendants() : []),
    ];
    const allIds = allNodes.map((d) => d.data.id);
    const counts = allIds.reduce((acc, v) => {
      acc[v] = (acc[v] || 0) + 1;
      return acc;
    }, {});

    if (rUp) drawTreePart(treeLayer, rUp, birthRef, counts, -1);
    if (rDown) drawTreePart(treeLayer, rDown, birthRef, counts, 1);
  }, 250);
}

function drawHistoryBackground(container, minX, maxX, birthRef, totalWidth) {
  HISTORIC_PERIODS.forEach((p) => {
    const yStart = (p.start - birthRef) * YEAR_SPACING;
    const yEnd = (p.end - birthRef) * YEAR_SPACING;
    container
      .append("rect")
      .attr("x", minX)
      .attr("y", yStart)
      .attr("width", maxX - minX)
      .attr("height", yEnd - yStart)
      .attr("fill", p.color)
      .attr("opacity", 0.6);
    container
      .append("text")
      .attr("class", "hist-label")
      .attr("x", minX + 20)
      .attr("y", yStart + 25)
      .text(p.name);
  });
  for (let yr = 1500; yr <= 2030; yr += 50) {
    const yPos = (yr - birthRef) * YEAR_SPACING;
    container
      .append("line")
      .attr("class", "year-line")
      .attr("x1", minX)
      .attr("x2", maxX)
      .attr("y1", yPos)
      .attr("y2", yPos);
    container
      .append("text")
      .attr("class", "year-label")
      .attr("x", minX + 10)
      .attr("y", yPos - 5)
      .text(yr);
  }
}

function drawTreePart(container, root, birthRef, counts, treeDir) {
  let isDead = false;
  let deathStr = "";
  root.each((d) => {
    d.actualBirth = d.data.computedBirth;
    d.y = (d.actualBirth - birthRef) * YEAR_SPACING;
    d.isDead =
      d.data.deceased === 1 || (d.data.death_year && d.data.death_year > 0);
    d.deathStr = "";
    if (d.isDead) {
      d.deathStr = " †";
      if (d.data.death_year && d.data.death_year > 0) {
        d.deathStr += ` ${d.data.death_year}`;
      }
    }
  });
  container
    .selectAll(".hl" + birthRef + treeDir)
    .data(root.links())
    .enter()
    .append("path")
    .attr("class", "hg-link")
    .attr(
      "d",
      d3
        .linkVertical()
        .x((d) => d.x)
        .y((d) => d.y),
    );
  const n = container
    .selectAll(".hn" + birthRef + treeDir)
    .data(root.descendants())
    .enter()
    .append("g")
    .attr("transform", (d) => `translate(${d.x - 75}, ${d.y})`)
    .style("cursor", "pointer")
    .on("click", (e, d) => {
      e.stopPropagation();
      openHourglass(d.data.id);
    });

  // --- LOGIQUE DE SURVOL (HOVER ZOOM) ---
  n.on("mouseenter", function (event, d) {
    // 1. Vérifier le niveau de zoom actuel de l'arbre
    const currentTransform = d3.zoomTransform(
      d3.select("#tree-viz svg").node(),
    );

    if (currentTransform.k < HOVER_THRESHOLD) {
      // 2. Lancer le timer de 1 seconde
      hoverTimer = setTimeout(() => {
        showZoomPanel(d.data, event);
      }, 1000);
    }
  }).on("mouseleave", function () {
    clearTimeout(hoverTimer);
    hideZoomPanel();
  });

  n.append("rect")
    .attr(
      "class",
      (d) => "hg-card-rect " + (d.data.birth === 0 ? "hg-card-approx" : ""),
    )
    .attr("width", 150)
    .attr("height", 55)
    .attr("rx", 8)
    .style("fill", "#fff")
    .style("stroke", (d) =>
      d.depth === 0 && d.actualBirth === birthRef
        ? "var(--primary)"
        : counts[d.data.id] > 1
          ? "var(--accent)"
          : "#e2e8f0",
    )
    .style("stroke-width", (d) =>
      d.depth === 0 || counts[d.data.id] > 1 ? "3px" : "1px",
    );
  n.append("text")
    .attr("class", "hg-name")
    .attr("x", 10)
    .attr("y", 20)
    .text((d) => `${d.data.firstname} ${d.data.surname.toUpperCase()}`);
  n.append("text")
    .attr(
      "class",
      (d) => "hg-details " + (d.data.birth === 0 ? "hg-details-approx" : ""),
    )
    .attr("x", 10)
    .attr("y", 36)
    .text((d) =>
      d.data.birth === 0
        ? `📅 vers ${Math.round(d.actualBirth)} ? ${d.deathStr}`
        : `📅 ${d.data.birth}${d.deathStr}`,
    );
  n.append("text")
    .attr("class", "hg-details")
    .attr("x", 10)
    .attr("y", 48)
    .text((d) =>
      d.data.place && d.data.place !== ""
        ? d.data.place.substring(0, 30)
        : "Lieu inconnu",
    );
}

function showZoomPanel(person, event) {
  const panel = d3.select("#hover-zoom-panel");

  // 1. On construit le contenu (Parents / Sélection / Enfants)
  const parents = familyData.links
    .filter((l) => l.target === person.id && l.type === "parent")
    .map((l) => familyData.nodes.find((n) => n.id === l.source));

  const children = familyData.links
    .filter((l) => l.source === person.id && l.type === "parent")
    .map((l) => familyData.nodes.find((n) => n.id === l.target));

  let html = `<div>`;
  if (parents.length > 0) {
    html += `<div class="zoom-section-title">ASCENDANCE DIRECTE</div>`;
    parents.forEach(
      (p) =>
        (html += `<div class="zoom-card"><b>${p.firstname} ${p.surname}</b><span>📅 ${p.birth || "?"} | 📍 ${p.place || "Lieu inconnu"}</span></div>`),
    );
  }

  html += `<div class="zoom-section-title" style="color:var(--accent)">INDIVIDU</div>`;
  html += `<div class="zoom-card" style="border-left-color:var(--accent); background:#fffbeb">
                <b>${person.firstname} ${person.surname.toUpperCase()}</b>
                <span>📅 ${person.birth || "?"} | 📍 ${person.place || ""}</span>
             </div>`;

  if (children.length > 0) {
    html += `<div class="zoom-section-title">DESCENDANCE (${children.length})</div>`;
    children.forEach(
      (c) =>
        (html += `<div class="zoom-card"><b>${c.firstname} ${c.surname}</b><span>📅 ${c.birth || "?"} | 📍 ${c.place || "Lieu inconnu"}</span></div>`),
    );
  }
  html += `</div>`;

  panel.html(html).style("display", "block");

  // 2. Calcul du positionnement intelligent
  const panelNode = panel.node();
  const panelHeight = panelNode.offsetHeight;
  const windowHeight = window.innerHeight;

  let posY = event.clientY - 50; // Position par défaut (un peu au dessus de la souris)

  // Si le panneau dépasse en bas, on le remonte
  if (posY + panelHeight > windowHeight - 20) {
    posY = windowHeight - panelHeight - 20;
  }

  // Sécurité si le panneau est très grand, on ne le laisse pas monter au dessus de 10px
  if (posY < 10) posY = 10;

  panel.style("left", event.clientX + 25 + "px").style("top", posY + "px");
}

function hideZoomPanel() {
  d3.select("#hover-zoom-panel")
    .style("display", "none")
    .style("transform", "scale(0.9)");
}

function toggleFullScreen() {
  const p = d3.select("#side-panel");
  const isF = p.classed("full-screen");
  p.classed("full-screen", !isF);
  d3.select("#btn-fs").text(isF ? "Agrandir" : "Réduire");
  setTimeout(() => {
    if (!d3.select("#tree-viz svg").empty()) {
      const r = document.getElementById("tree-viz").getBoundingClientRect();
      d3.select("#tree-viz svg g")
        .transition()
        .duration(400)
        .attr("transform", `translate(${r.width / 2}, ${r.height / 2})`);
    }
  }, 450);
}

function generatePoster() {
  const rootId = d3.select("#filter-lineage-select").property("value");
  if (!rootId || rootId === "") {
    alert("Veuillez sélectionner une personne dans le filtre.");
    return;
  }

  // 1. COLLECTE DES DONNÉES (Identique à ton code actuel)
  const directLineIds = new Set();
  function collectAscendants(id) {
    if (!id || directLineIds.has(id)) return;
    directLineIds.add(id);
    familyData.links
      .filter((l) => l.target === id && l.type === "parent")
      .forEach((l) => collectAscendants(l.source));
  }
  function collectDescendants(id) {
    if (!id) return;
    directLineIds.add(id);
    familyData.links
      .filter((l) => l.source === id && l.type === "parent")
      .forEach((l) => {
        if (!directLineIds.has(l.target)) collectDescendants(l.target);
      });
  }
  collectAscendants(rootId);
  collectDescendants(rootId);

  const person = familyData.nodes.find((n) => n.id === rootId);
  const personName = `${person.firstname} ${person.surname.toUpperCase()}`;
  const displayNodes = familyData.nodes
    .filter((n) => directLineIds.has(n.id))
    .sort((a, b) => (a.computedBirth || 0) - (b.computedBirth || 0));

  // 2. PRÉPARATION DU SVG - LA CORRECTION EST ICI
  const originalSvg = document.getElementById("map-svg");
  const svgElement = originalSvg.cloneNode(true);

  // Calcul de la zone réelle occupée par le dessin pour ne rien tronquer
  const bbox = originalSvg.getBBox();
  const padding = 20;

  // On définit le viewBox sur la zone réelle du dessin + une petite marge
  svgElement.setAttribute(
    "viewBox",
    `${bbox.x - padding} ${bbox.y - padding} ${bbox.width + padding * 2} ${bbox.height + padding * 2}`,
  );

  // On supprime les tailles fixes pour laisser le CSS gérer l'adaptation à la page
  svgElement.removeAttribute("width");
  svgElement.removeAttribute("height");
  svgElement.setAttribute("xmlns", "http://www.w3.org/2000/svg");

  // Nettoyage des couleurs pour l'impression
  svgElement.querySelectorAll(".subdivision").forEach((s) => {
    s.setAttribute("fill", "#f8fafc");
    s.setAttribute("stroke", "#cbd5e0");
    s.style.fill = "#f8fafc";
    s.style.stroke = "#cbd5e0";
  });

  svgElement.querySelectorAll(".link").forEach((l) => {
    l.setAttribute("fill", "none");
    l.style.fill = "none";
    const color = l.classList.contains("link-parent") ? "#2b6cb0" : "#c53030";
    l.setAttribute("stroke", color);
    l.style.stroke = color;
    l.style.strokeWidth = "2px";
  });

  // 3. CONSTRUCTION DU TABLEAU (Logique death_year et computedBirth)
  let tableHTML = `<table class="modern-table"><thead><tr><th>NAISSANCE</th><th>DÉCÈS</th><th>RÔLE</th><th>INDIVIDU</th><th>PÈRE</th><th>MÈRE</th><th>LIEU</th></tr></thead><tbody>`;
  displayNodes.forEach((p) => {
    const isRoot = p.id === rootId;
    let roleLabel = isRoot
      ? "PIVOT"
      : p.computedBirth < (person.computedBirth || 9999)
        ? "ANCÊTRE"
        : "DESCENDANT";
    const roleClass = isRoot
      ? "badge-pivot"
      : roleLabel === "ANCÊTRE"
        ? "badge-anc"
        : "badge-des";

    // Naissance
    const realBirth = p.birth_year || p.birth;
    let birthDisplay =
      realBirth && realBirth > 0
        ? realBirth
        : p.computedBirth
          ? `~${p.computedBirth}`
          : "—";

    // Décès avec Croix (†)
    const realDeath = p.death_year;
    let deathDisplay = ".";
    if (p.deceased) {
      deathDisplay = "†";
      if (realDeath && realDeath > 0) deathDisplay += ` ${realDeath}`;
    }

    let fatherName = "—",
      motherName = "—";
    familyData.links
      .filter((l) => l.target === p.id && l.type === "parent")
      .forEach((l) => {
        const parent = familyData.nodes.find((n) => n.id === l.source);
        if (parent) {
          const fn = `${parent.firstname} <b>${parent.surname.toUpperCase()}</b>`;
          if (
            parent.gender === "M" ||
            (parent.firstname && !parent.firstname.endsWith("e"))
          )
            fatherName = fn;
          else motherName = fn;
        }
      });

    tableHTML += `<tr class="${isRoot ? "active-row" : ""}">
            <td class="year-col">${birthDisplay}</td>
            <td class="year-col death-col" style="color: #64748b;">${deathDisplay}</td>
            <td><span class="badge ${roleClass}">${roleLabel}</span></td>
            <td class="name-col">${p.firstname} <b>${p.surname.toUpperCase()}</b></td>
            <td class="parent-col">${fatherName}</td>
            <td class="parent-col">${motherName}</td>
            <td class="place-col">${p.place || "—"}</td>
        </tr>`;
  });
  tableHTML += `</tbody></table>`;

  // 4. OUVERTURE ET ÉCRITURE
  const printWindow = window.open("", "_blank");
  printWindow.document.write(`
        <html>
        <head>
            <title>Poster - ${personName}</title>
            <style>
                body { font-family: 'Segoe UI', system-ui, sans-serif; margin: 0; padding: 0; background: #fff; }
                .poster-container { width: 100%; }
                
                /* PAGE 1 : CARTE CENTRÉE ET ADAPTÉE */
                .first-page {
                    break-after: page;
                    height: 100vh;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    padding: 40px;
                    box-sizing: border-box;
                }
                .map-card {
                    width: 100%;
                    max-width: 900px; /* Limite la largeur pour ne pas pixeliser */
                    margin: 0 auto;
                }
                .map-card svg {
                    width: 100%;
                    height: auto; /* S'adapte à la largeur de la page sans déformer */
                    display: block;
                }

                /* TABLEAU */
                .table-section { padding: 40px; }
                .modern-table { width: 100%; border-collapse: collapse; font-size: 11px; table-layout: fixed; }
                .modern-table th { background: #f8fafc; text-align: left; padding: 10px; border-bottom: 2px solid #2b6cb0; }
                .modern-table td { padding: 8px; border-bottom: 1px solid #eee; vertical-align: top; }
                .year-col { font-weight: bold; color: #2b6cb0; width: 60px; font-family: monospace; }
                .badge { padding: 2px 5px; border-radius: 3px; font-size: 9px; font-weight: bold; text-transform: uppercase; }
                .badge-pivot { background: #dbeafe; color: #1e40af; }
                .badge-anc { background: #f1f5f9; color: #475569; }
                .badge-des { background: #ecfdf5; color: #059669; }
                
                @media print { 
                    .no-print { display: none; } 
                }
            </style>
        </head>
        <body>
            <div class="no-print" style="text-align:center; padding:20px;">
                <button onclick="window.print()" style="padding:10px 20px; font-weight:bold; cursor:pointer;">IMPRIMER LE PDF</button>
            </div>
            <div class="poster-container">
                <div class="first-page">
                    <h1 style="text-transform:uppercase; margin-bottom:0;">Généalogie de la lignée</h1>
                    <h2 style="color:#2b6cb0; margin-top:5px;">${personName}</h2>
                    <div class="map-card">${svgElement.outerHTML}</div>
                </div>
                <div class="table-section">
                    ${tableHTML}
                </div>
            </div>
        </body>
        </html>
    `);
  printWindow.document.close();
}

function generateIndentedList(rootId, level = 0, visited = new Set()) {
  if (visited.has(rootId)) return "";
  visited.add(rootId);

  const node = familyData.nodes.find((n) => n.id === rootId);
  if (!node) return "";

  // 1. Préparation des dates et lieux
  // On utilise la date réelle si elle existe, sinon la calculée (précédée de ~)
  const birthDate = node.birth
    ? node.birth
    : node.computedBirth
      ? `~${node.computedBirth}`
      : "?";
  const deathDate = node.death ? ` - † ${node.death}` : "";
  const place = node.place ? ` 📍 ${node.place}` : "";

  // 1. On calcule d'abord le bloc "Identité" (Individu + Conjoints)
  let identityHtml = `<div style="flex-shrink: 0; white-space: nowrap;">`;
  let indent = "&nbsp;".repeat(level * 4);

  // Ligne de l'individu principal
  identityHtml += `${indent} <span style="color:#718096;">[G${level}]</span> `;
  identityHtml += `👤 <b style="color:#1a202c;">${node.surname.toUpperCase()} ${node.firstname}</b> `;
  identityHtml += `<span style="color:#4a5568;">(${birthDate}${deathDate})</span>`;

  // Ajout des conjoints juste en dessous, SANS fermer la colonne 1
  const marriages = familyData.links.filter(
    (l) =>
      (l.source === rootId || l.target === rootId) && l.type === "marriage",
  );

  marriages.forEach((m) => {
    const spouseId = m.source === rootId ? m.target : m.source;
    const spouse = familyData.nodes.find((n) => n.id === spouseId);
    if (spouse) {
      const sBirth = spouse.birth
        ? spouse.birth
        : spouse.computedBirth
          ? `~${spouse.computedBirth}`
          : "?";
      // On utilise une div pour forcer le retour à la ligne proprement
      identityHtml += `<div style="color:#c53030; font-size: 10px;">`;
      identityHtml += `${indent} &nbsp;&nbsp;&nbsp;&nbsp;&nbsp; 💍 x <i>${spouse.firstname} ${spouse.surname.toUpperCase()}</i> (${sBirth})`;
      identityHtml += `</div>`;
    }
  });
  identityHtml += `</div>`; // On ferme la colonne 1 ici

  // 2. On assemble le tout dans le Flexbox principal
  let line = `<div style="display: flex; align-items: flex-start; margin-bottom: 8px; font-family: 'Roboto Mono', monospace; font-size: 11px;">`;

  line += identityHtml; // Colonne 1 (Individu + Conjoint)

  // Colonne 2 : Le lieu (aligné sur la première ligne de l'individu)
  line += `<div style="flex-grow: 1; text-align: left; color:#ed8936; font-size: 11px; padding-left: 20px; padding-top: 1px;">`;
  line += node.place ? `📍 ${node.place}` : "";
  line += `</div>`;

  line += `</div>`; // On ferme le Flexbox

  // 4. Appel récursif pour les enfants
  const childrenLinks = familyData.links.filter(
    (l) => l.source === rootId && l.type === "parent",
  );
  let childrenHtml = childrenLinks
    .sort((a, b) => {
      const nodeA = familyData.nodes.find((n) => n.id === a.target);
      const nodeB = familyData.nodes.find((n) => n.id === b.target);
      return (nodeA.computedBirth || 0) - (nodeB.computedBirth || 0);
    })
    .map((l) => generateIndentedList(l.target, level + 1, visited))
    .join("");

  return line + childrenHtml;
}

function generateAscendantList(rootId, level = 0, visited = new Set()) {
  if (visited.has(rootId) || level > 20) return ""; // Sécurité
  visited.add(rootId);

  const node = familyData.nodes.find((n) => n.id === rootId);
  if (!node) return "";

  const birthDate = node.birth
    ? node.birth
    : node.computedBirth
      ? `~${node.computedBirth}`
      : "?";
  const deathDate = node.death ? ` - † ${node.death}` : "";
  const place = node.place ? ` 📍 ${node.place}` : "";

  // Calcul du numéro de Sosa (optionnel mais classique en généalogie)
  // Ici on reste sur un affichage simple par indentation
  // Conteneur principal en Flexbox
  let line = `<div style="display: flex; align-items: flex-start; margin-bottom: 6px; font-family: monospace; font-size: 13px;">`;

  // Colonne 1 : Indentation, Génération et Identité (Largeur fixe ou flexible selon ton goût)
  line += `<div style="flex-shrink: 0; white-space: nowrap;">`;
  let indent = "&nbsp;".repeat(level * 4);
  line += `${indent} <span style="color:#718096;">[G-${level}]</span> `;
  line += `👤 <b>${node.surname.toUpperCase()} ${node.firstname}</b> `;
  line += `<span style="color:#4a5568;">(${birthDate}${deathDate})</span>`;
  line += `</div>`;

  // Colonne 2 : Le Lieu (S'aligne sans déborder sous le nom)
  line += `<div style="margin-left: 10px; color:#ed8936; font-size: 11px; flex-grow: 1;">`;
  line += node.place ? ` 📍 ${node.place}` : "";
  line += `</div>`;

  line += `</div>`;
  // On cherche les parents (ceux qui pointent vers cet individu)
  const parentLinks = familyData.links.filter(
    (l) => l.target === rootId && l.type === "parent",
  );

  // Appel récursif pour le père et la mère
  let parentsHtml = parentLinks
    .map((l) => generateAscendantList(l.source, level + 1, visited))
    .join("");

  return line + parentsHtml;
}

function showTextReport() {
  const lineageId = d3.select("#filter-lineage-select").property("value");
  if (!lineageId) return alert("Sélectionnez une personne dans la liste.");
  const node = familyData.nodes.find((n) => n.id === lineageId);
  // On crée un nom de fichier propre basé sur l'individu
  const fileName = `Rapport_${node.surname}_${node.firstname}`.replace(
    /\s+/g,
    "_",
  );
  const reportWindow = window.open("", "_blank");

  // On génère les deux contenus
  const descendance = generateIndentedList(lineageId);
  const ascendance = generateAscendantList(lineageId);

  reportWindow.document.write(`
        <html>
            <head>
                <title>${fileName}</title>
                <style>
                    body { font-family: 'Segoe UI', sans-serif; padding: 40px; color: #2d3748; }
                    .section { margin-bottom: 50px; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px; }
                    h2 { color: #2b6cb0; border-bottom: 2px solid #2b6cb0; padding-bottom: 5px; }
                    @media print {
					/* Cache tout ce qui a la classe no-print lors de l'impression */
					.no-print { 
						display: none !important; 
					}
                    button { padding: 10px 20px; cursor: pointer; background: #2b6cb0; color: white; border: none; border-radius: 4px; font-weight: bold; }
                </style>
            </head>
            <body>
                <div class="no-print">
                    <button onclick="window.print()">🖨️ Imprimer le dossier complet (PDF)</button>
                </div>

                <div class="section">
                    <h2>⬅️ Ascendance (Les Ancêtres)</h2>
                    <p style="font-size: 12px; font-style: italic;">On remonte le temps de génération en génération.</p>
                    ${ascendance}
                </div>

                <div class="section">
                    <h2>➡️ Descendance (Les Enfants)</h2>
                    <p style="font-size: 12px; font-style: italic;">On suit la lignée vers le futur.</p>
                    ${descendance}
                </div>

                <div style="font-size: 11px; color: #a0aec0; text-align: center;">
                    Document généré par votre logiciel de généalogie interactive.
                </div>
            </body>
        </html>
    `);
}

function updateTimeline(nodes) {
  const currentYear = new Date().getFullYear();

  // 1. Préparation des données
  const validNodes = nodes
    .filter((d) => d.computedBirth)
    .sort((a, b) => a.computedBirth - b.computedBirth);

  const container = document.getElementById("timeline-content");
  if (!container) return;

  const availableWidth =
    container.clientWidth > 0 ? container.clientWidth : window.innerWidth;
  const margin = { top: 20, right: 30, bottom: 40, left: 400 },
    width = availableWidth - margin.left - margin.right,
    rowHeight = 24,
    height = validNodes.length * rowHeight;

  const svg = d3
    .select("#timeline-svg")
    .attr("width", width + margin.left + margin.right)
    .attr("height", height + margin.top + margin.bottom);

  svg.html("");

  // 4. Définition du dégradé
  const defs = svg.append("defs");
  const gradient = defs
    .append("linearGradient")
    .attr("id", "fade-death")
    .attr("x1", "0%")
    .attr("y1", "0%")
    .attr("x2", "100%")
    .attr("y2", "0%");

  // La couleur reste pleine jusqu'à 50% de la barre (au lieu de 70%)
  gradient
    .append("stop")
    .attr("offset", "50%")
    .attr("stop-color", "#2b6cb0")
    .attr("stop-opacity", 0.5);

  // Puis elle s'estompe très vite jusqu'à être presque transparente (0.05 au lieu de 0.2)
  gradient
    .append("stop")
    .attr("offset", "100%")
    .attr("stop-color", "#2b6cb0")
    .attr("stop-opacity", 0.01);

  const mainG = svg
    .append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  const minYear = d3.min(validNodes, (d) => d.computedBirth) - 5;
  const x = d3.scaleLinear().domain([minYear, currentYear]).range([0, width]);

  mainG
    .append("g")
    .attr("transform", `translate(0,${height})`)
    .style("font-family", "'Roboto Mono', monospace")
    .style("font-size", "10px")
    .call(
      d3
        .axisBottom(x)
        .tickFormat(d3.format("d"))
        .ticks(Math.max(5, width / 100)),
    );

  const bars = mainG
    .selectAll(".bar-group")
    .data(validNodes)
    .enter()
    .append("g")
    .attr("class", "bar-group")
    .attr("transform", (d, i) => `translate(0, ${i * rowHeight})`);

  // Ligne de liaison (liseret)
  bars
    .append("line")
    .attr("x1", -10) // Part de la fin du texte (marge de 10px)
    .attr("y1", 11) // Centré verticalement dans la ligne (rowHeight est à 24)
    .attr("x2", (d) => x(d.computedBirth)) // S'arrête exactement au début de la vie
    .attr("y2", 11)
    .attr("stroke", "#e2e8f0") // Gris très doux (plus discret que le texte)
    .attr("stroke-width", 1.2)
    .attr("stroke-dasharray", "1,1"); // Optionnel : fait des petits pointillés pour plus de finesse

  // Rectangle de vie avec logique "deceased"

  bars
    .append("rect")
    .attr("x", (d) => x(d.computedBirth))
    .attr("y", 7.5)
    .attr("width", (d) => {
      const birth = d.computedBirth;
      const hasValidDeath = d.death_year && d.death_year > 0;

      let endYear;
      // On calcule l'âge actuel pour le test des 110 ans
      const ageIfAlive = currentYear - birth;

      if (hasValidDeath) {
        endYear = d.death_year;
      } else if (
        d.deceased === false ||
        (d.deceased === undefined && ageIfAlive < 110)
      ) {
        // Cas "Vivant" : soit explicitement, soit implicitement (moins de 110 ans)
        endYear = currentYear;
      } else {
        // Cas "Décédé estimé" : plus de 110 ans ou marqué deceased sans date
        endYear = Math.min(currentYear, birth + 80);
      }
      return Math.max(5, x(endYear) - x(birth));
    })
    .attr("height", 7)
    .attr("rx", 3.5)
    .attr("fill", (d) => {
      const currentYear = new Date().getFullYear();
      const ageIfAlive = currentYear - d.computedBirth;

      // On définit si la personne est "Présumée Vivante" :
      // - Soit elle est marquée explicitement vivante (deceased === false)
      // - Soit elle n'est PAS marquée décédée ET elle a moins de 110 ans
      const isPresumedAlive =
        d.deceased === false || (d.deceased !== true && ageIfAlive < 110);

      // On a une date de décès réelle
      const hasDeathDate = d.death_year && d.death_year > 0;

      if (hasDeathDate || isPresumedAlive) {
        return "#2b6cb0"; // BARRE PLEINE
      } else {
        return "url(#fade-death)"; // BARRE DÉGRADÉE (morts sans date ou +110 ans)
      }
    })
    .style("opacity", (d) => {
      const ageIfAlive = currentYear - d.computedBirth;
      // On renforce l'opacité pour les vivants (1.0 au lieu de 0.8)
      return d.deceased === false ||
        (d.deceased === undefined && ageIfAlive < 110)
        ? 1
        : 0.8;
    });

  bars
    .append("text")
    .attr("x", -10)
    .attr("y", 15)
    .attr("text-anchor", "end")
    .style("font-family", "'Roboto Mono', monospace")
    .style("font-size", "11px")
    .style("fill", "#4a5568")
    .text((d) => {
      // 1. NAISSANCE : On vérifie si birth_year existe et est valide (> 0)
      // Si oui, c'est une date réelle. Sinon, on met le tilde devant la date calculée.
      const isBirthKnown = d.birth && d.birth > 0;
      const birthPart = isBirthKnown ? d.birth : `~${d.computedBirth}`;

      // 2. DÉCÈS : Même logique pour la croix
      let deathPart = "";
      const isDeathKnown = d.death_year && d.death_year > 0;

      if (isDeathKnown) {
        deathPart = ` ✝${d.death_year}`;
      } else if (d.deceased === true) {
        deathPart = " ✝";
      }

      return `${d.surname.toUpperCase()} ${d.firstname} (${birthPart}${deathPart})`;
    });
}

function onLineageChange(selectedId) {
  const btnSearch = document.getElementById("btn-relation-search");
  const otherButtons = document.querySelectorAll(".nav-btn-group"); // Vos boutons existants

  if (selectedId && selectedId !== "") {
    // Affiche les boutons existants et le nouveau bouton
    btnSearch.style.display = "inline-block";
    // ... (votre code pour afficher les boutons Rapport/Poster)

    btnSearch.onclick = () => openRelationModal(selectedId);
  } else {
    btnSearch.style.display = "none";
  }
}

let currentSourceId = null;

function openRelationModal(sourceId) {
  if (!sourceId) {
    console.error("Aucun ID source fourni à la modale");
    return;
  }

  currentSourceId = sourceId;
  const modal = document.getElementById("modal-relation");
  modal.style.display = "flex"; // Utilise flex pour le centrage horizontal
  modal.scrollTop = 0; // Remonte l'ascenseur de la modale elle-même
  const sourceDisplay = document.getElementById("relation-source-name");
  //const selectTarget = document.getElementById("select-person-target");

  // 1. On cherche la personne dans les données
  const personA = familyData.nodes.find(
    (n) => n.id === sourceId || n.id == sourceId,
  );

  if (personA && sourceDisplay) {
    // On valorise le champ avec Nom et Prénom
    sourceDisplay.innerHTML = `👤 ${personA.surname.toUpperCase()} ${personA.firstname}`;
  } else {
    sourceDisplay.innerText = "Personne introuvable";
  }

  // Reset des champs
  const searchInput = document.getElementById("relation-search-input");
  const selectTarget = document.getElementById("select-person-target");

  if (searchInput) searchInput.value = "";
  if (selectTarget) {
    selectTarget.innerHTML = "";
    selectTarget.style.display = "none";
  }

  // Initialisation des écouteurs de recherche si ce n'est pas fait
  if (!window.relationAutocompleteInitialized) {
    setupRelationAutocomplete();
    window.relationAutocompleteInitialized = true;
  }
  prepareRelationList();
  document.getElementById("modal-relation").style.display = "block";
}

function closeRelationModal() {
  document.getElementById("modal-relation").style.display = "none";
}

function setupRelationAutocomplete() {
  const input = document.getElementById("relation-search-input");
  const select = document.getElementById("select-person-target");

  input.addEventListener("input", (e) => {
    const query = e.target.value.toLowerCase().trim();

    // On récupère et trie les personnes
    const filtered = familyData.nodes
      .filter((n) => {
        const fullName = `${n.surname} ${n.firstname}`.toLowerCase();
        const year = String(n.birth || n.computedBirth || "");
        return fullName.includes(query) || year.includes(query);
      })
      .sort((a, b) => (a.surname || "").localeCompare(b.surname || ""));

    // Affichage des options avec les dates
    if (query.length > 0 && filtered.length > 0) {
      select.innerHTML = filtered
        .map((n) => {
          // Priorité à la date réelle, sinon date calculée avec un tilde (~)
          const displayYear = n.birth
            ? n.birth
            : n.computedBirth
              ? `~${n.computedBirth}`
              : "?";
          return `<option value="${n.id}">${n.surname.toUpperCase()} ${n.firstname} (${displayYear})</option>`;
        })
        .join("");

      select.style.display = "block";
      select.size = Math.min(filtered.length, 8); // Ajuste la hauteur
    } else {
      select.style.display = query.length > 0 ? "block" : "none";
      if (query.length === 0) select.innerHTML = "";
    }
  });

  // Quand on clique sur une option dans la liste filtrée
  select.addEventListener("change", () => {
    if (select.selectedIndex !== -1) {
      const selectedOption = select.options[select.selectedIndex];
      const input = document.getElementById("relation-search-input");

      // On met à jour le texte du champ de recherche
      input.value = selectedOption.text;

      // On stocke l'ID sélectionné dans une propriété de l'input pour le retrouver plus tard
      input.dataset.selectedId = selectedOption.value;

      // ON REPLIE LA LISTE
      select.style.display = "none";
    }
  });

  // Optionnel : fermer la liste si on clique en dehors
  document.addEventListener("click", (e) => {
    if (
      e.target.id !== "relation-search-input" &&
      e.target.id !== "select-person-target"
    ) {
      select.style.display = "none";
    }
  });
}

function executeRelationSearch() {
  const inputB = document.getElementById("relation-search-input");
  const targetId = inputB.dataset.selectedId;
  const resultZone = document.getElementById("relation-result-zone");
  const pathList = document.getElementById("path-list");

  if (!targetId) return;

  const path = findShortestPath(currentSourceId, targetId);
  resultZone.style.display = "block";

  if (!path) {
    pathList.innerHTML =
      "<p style='color:#c53030; padding:10px;'>Aucun lien trouvé.</p>";
    return;
  }

  // --- PHASE D'ANALYSE DU CHEMIN ---
  let hasUnion = false;
  let directions = []; // Stockera 'UP' ou 'DOWN'

  const stepsData = path.map((id, index) => {
    const p = familyData.nodes.find((n) => n.id == id);
    let symbol = "●";

    if (index > 0) {
      const prevId = path[index - 1];
      const edge = familyData.links.find(
        (l) =>
          (l.source == prevId && l.target == id) ||
          (l.source == id && l.target == prevId),
      );

      if (edge) {
        if (
          edge &&
          (edge.type === "union" ||
            edge.type === "mariage" ||
            edge.type === "marriage")
        ) {
          hasUnion = true;
          symbol = "💍";
        } else if (edge.type === "parent") {
          const dir = edge.target == id ? "▼" : "▲";
          symbol = dir;
          directions.push(dir === "▲" ? "UP" : "DOWN");
        }
      }
    }
    return { p, symbol };
  });

  // Détermination du type de relation
  let relationType = "";
  let typeColor = "";

  if (hasUnion) {
    relationType = "Relation par alliance";
    typeColor = "#ed64a6"; // Rose
  } else {
    const uniqueDirs = [...new Set(directions)];
    if (uniqueDirs.length <= 1) {
      relationType = "Lien de parenté direct";
      typeColor = "#48bb78"; // Vert
    } else {
      relationType = "Relation collatérale";
      typeColor = "#4299e1"; // Bleu
    }
  }

  // --- CONSTRUCTION DU HTML ---
  let html = `
        <div style="background:${typeColor}; color:white; padding:8px 12px; font-weight:bold; border-radius:6px; margin-bottom:15px; font-size:13px; text-align:center; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
            ${relationType} (${path.length - 1} générations)
        </div>
    `;

  stepsData.forEach((step, index) => {
    const iconColor = getIconColor(step.symbol);
    html += `
            <div style="display:flex; align-items:center; padding: 4px 10px;">
                <div style="min-width:35px; font-size:1.6em; display:flex; justify-content:center; color:${iconColor}; font-weight:bold;">
                    ${step.symbol}
                </div>
                <div style="flex:1; padding:8px; border-left:4px solid ${iconColor}; background:white; margin:3px 0; border-radius:0 6px 6px 0; box-shadow: 0 1px 2px rgba(0,0,0,0.05); border:1px solid #f0f0f0; border-left:4px solid ${iconColor};">
                    <div style="font-size:13px;">
                        <span style="text-transform:uppercase; font-weight:700;">${step.p.surname || ""}</span> ${step.p.firstname || ""}
                    </div>
                    <div style="font-size:11px; color:#718096;">
                        ${step.p.birth || ""}
                    </div>
                </div>
            </div>`;
  });

  pathList.innerHTML = html;
  document.getElementById("relation-final-actions").style.display = "block";
}

/**
 * Fonction utilitaire pour associer une couleur à chaque type de lien
 */
function getIconColor(symbol) {
  switch (symbol) {
    case "▲":
      return "#4299e1"; // Bleu (Ascendance)
    case "▼":
      return "#48bb78"; // Vert (Descendance)
    case "💍":
      return "#ed64a6"; // Rose (Mariage - l'émoji reste OK ici)
    case "●":
      return "#2b6cb0"; // Bleu foncé (Point de départ)
    default:
      return "#cbd5e0"; // Gris (Inconnu)
  }
}

// 1. Initialiser la liste avec tout le monde à l'ouverture de la modale
function prepareRelationList() {
  const select = document.getElementById("select-person-target");
  const input = document.getElementById("relation-search-input");

  // 1. On pré-remplit TOUTE la liste immédiatement
  select.innerHTML = "";
  const sortedNodes = [...familyData.nodes].sort((a, b) =>
    (a.surname || "").localeCompare(b.surname || ""),
  );

  sortedNodes.forEach((p) => {
    const opt = document.createElement("option");
    opt.value = p.id;
    opt.text = `${p.surname?.toUpperCase()} ${p.firstname || ""} (${p.birth || "?"})`;
    select.appendChild(opt);
  });

  // 2. Événement : Quand on clique dans le champ (Focus)
  input.onfocus = function () {
    // On affiche tout le monde si le champ est vide,
    // ou on laisse le filtrage agir si du texte est déjà là
    select.style.display = "block";
    filterList(this.value);
  };

  // 3. Événement : Filtrage en temps réel
  input.oninput = function () {
    filterList(this.value);
  };

  // Fonction interne de filtrage
  function filterList(val) {
    const search = val.toLowerCase();
    let visibleCount = 0;

    Array.from(select.options).forEach((opt) => {
      const match = opt.text.toLowerCase().includes(search);
      opt.style.display = match ? "block" : "none";
      if (match) visibleCount++;
    });

    // Si aucun résultat, on peut choisir de cacher ou d'afficher un message
    select.style.display = visibleCount > 0 ? "block" : "none";
  }

  // 4. Gestion de la sélection (Clic ou Entrée)
  const handleSelect = () => {
    const selectedOption = select.options[select.selectedIndex];
    if (selectedOption) {
      input.value = selectedOption.text;
      input.dataset.selectedId = select.value;
      select.style.display = "none";
    }
  };

  select.onclick = handleSelect;

  // Fermer la liste si on clique ailleurs dans la modale
  document.addEventListener("click", (e) => {
    if (e.target !== input && e.target !== select) {
      select.style.display = "none";
    }
  });
}

// Algorithme de recherche (BFS) - Parcourt les liens source/target
function findShortestPath(startId, endId) {
  if (startId === endId) return [startId];

  let queue = [[startId]];
  let visited = new Set([startId]);

  while (queue.length > 0) {
    let path = queue.shift();
    let node = path[path.length - 1];

    // On cherche tous les voisins connectés (parents ou mariages)
    const neighbors = familyData.links
      .filter((l) => l.source === node || l.target === node)
      .map((l) => (l.source === node ? l.target : l.source));

    for (let neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        if (neighbor === endId) return [...path, neighbor];
        visited.add(neighbor);
        queue.push([...path, neighbor]);
      }
    }
  }
  return null;
}

function generateRelationReport() {
  const resultZone = document.getElementById("relation-result-zone");
  const inputB = document.getElementById("relation-search-input");

  let path = [];
  const storedPath = resultZone.dataset.currentPath;

  if (storedPath && storedPath !== "[]") {
    path = JSON.parse(storedPath);
  } else {
    const targetId = inputB.dataset.selectedId;
    if (!currentSourceId || !targetId) {
      alert(
        "Veuillez sélectionner les deux personnes (A et B) pour établir le lien.",
      );
      return;
    }
    path = findShortestPath(currentSourceId, targetId);
    if (!path) {
      alert("Aucun lien de parenté n'a été trouvé.");
      return;
    }
  }

  let hasMarriage = false;
  let directions = [];
  path.forEach((id, index) => {
    if (index > 0) {
      const prevId = path[index - 1];
      const edge = familyData.links.find(
        (l) =>
          (l.source == prevId && l.target == id) ||
          (l.source == id && l.target == prevId),
      );
      if (edge && edge.type === "marriage") hasMarriage = true;
      else if (edge && edge.type === "parent")
        directions.push(edge.target == id ? "DOWN" : "UP");
    }
  });

  let relationType = "Relation collatérale";
  if (hasMarriage) relationType = "Relation par alliance";
  else if ([...new Set(directions)].length <= 1)
    relationType = "Lien de parenté direct";

  let reportContent = "";
  // On réduit l'indentation de départ à 10 pour coller davantage à la gauche du PDF
  let currentIndent = 25;

  path.forEach((id, index) => {
    const p = familyData.nodes.find((n) => n.id == id);
    if (!p) return;

    let icon = "●";
    if (index > 0) {
      const prevId = path[index - 1];
      const edge = familyData.links.find(
        (l) =>
          (l.source == prevId && l.target == id) ||
          (l.source == id && l.target == prevId),
      );
      if (edge) {
        if (edge.type === "marriage") icon = "💍";
        else if (edge.type === "parent") {
          if (edge.target == id) {
            icon = "▼";
            currentIndent -= 4;
          } else {
            icon = "▲";
            currentIndent += 4;
          }
        }
      }
    }

    let bYear =
      p.birth && p.birth !== 0 && p.birth !== -1
        ? p.birth
        : p.computedBirth && p.computedBirth !== 0 && p.computedBirth !== -1
          ? `~${p.computedBirth}`
          : "?";

    let bPlace = p.birth_place || p.place || "";

    let dInfo = "";
    if (p.deceased === 1) {
      const hasValidDeathYear = p.death_year && p.death_year > 1;
      dInfo = hasValidDeathYear ? `(† ${p.death_year})` : "(†)";
    }

    reportContent += `
            <div style="margin-left: ${currentIndent * 5}px; margin-bottom: 8px; display: flex; align-items: flex-start; font-family: sans-serif;">
                <span style="font-size: 16px; margin-right: 10px; width: 20px; text-align: center; color: #4a5568;">${icon}</span>
                <div style="border-bottom: 1px solid #edf2f7; padding-bottom: 4px; flex: 1;">
                    <div style="font-size: 12px; color: #2d3748; line-height: 1.2;">
                        <strong style="text-transform: uppercase;">${p.surname || ""}</strong> ${p.firstname || ""}
                    </div>
                    <div style="font-size: 10px; color: #718096; margin-top: 1px;">
                        ${bYear} ${dInfo} ${bPlace ? `| 📍 ${bPlace}` : ""}
                    </div>
                </div>
            </div>`;
  });

  const printWindow = window.open("", "_blank");
  const fullHtml = `
        <html>
        <head>
            <title>Rapport - ${relationType}</title>
            <style>
                @page { size: A4; margin: 15mm; }
                body { font-family: 'Segoe UI', Arial, sans-serif; color: #2d3748; margin: 0; padding: 0; }
                .header { text-align: center; border-bottom: 2px solid #2d3748; padding-bottom: 10px; margin-bottom: 20px; }
                .meta { background: #f7fafc; padding: 12px; border-radius: 6px; margin-bottom: 25px; border: 1px solid #e2e8f0; }
                .content { width: 100%; }
            </style>
        </head>
        <body onload="window.print()">
            <div class="header">
                <h1 style="margin:0; font-size: 20px;">RAPPORT DE PARENTÉ</h1>
                <div style="color: #cbd5e0; letter-spacing: 3px; font-size: 9px; margin-top:5px; font-weight:bold;">
                   &larr; DESCENDANCE &mdash; ASCENDANCE &rarr;
                </div>
            </div>
            <div class="meta">
                <div style="font-size: 9px; color: #a0aec0; text-transform: uppercase; font-weight: bold;">Analyse :</div>
                <div style="font-size: 18px; font-weight: bold; color: #2b6cb0;">${relationType}</div>
                <div style="font-size: 11px; margin-top: 3px; color: #718096;">Distance : ${path.length - 1} étapes.</div>
            </div>
            <div class="content">${reportContent}</div>
        </body>
        </html>`;

  printWindow.document.write(fullHtml);
  printWindow.document.close();
}

function toggleTimeline() {
  const drawer = document.getElementById("timeline-drawer");
  drawer.classList.toggle("open");
  document.getElementById("timeline-arrow").innerText =
    drawer.classList.contains("open") ? "▼" : "▲";
}

function togglePanel(o) {
  d3.select("#side-panel").classed("open", o);
  if (!o) {
    d3.select("#side-panel").classed("full-screen", false);
  }
}
window.onclick = () => d3.select("#popup").style("display", "none");
function resetZoom() {
  mapSvg.transition().duration(750).call(zoom.transform, d3.zoomIdentity);
}

window.onload = init;
