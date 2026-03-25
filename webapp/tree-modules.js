/**
 * TREE-MODULES.JS - Version DEBUG
 */
const HISTORIC_PERIODS = [
  { name: "LOUIS XIV", start: 1638, end: 1715, color: "#fff2d1" },
  { name: "LOUIS XV", start: 1715, end: 1774, color: "#cbd4f4" },
  { name: "LOUIS XVI", start: 1774, end: 1789, color: "#fff2d1" },
  { name: "REVOLUTION", start: 1789, end: 1804, color: "#cbd4f4" },
  { name: "NAPOLEON BONAPARTE", start: 1804, end: 1815, color: "#fff2d1" },
  { name: "LOUIS XVIII", start: 1815, end: 1824, color: "#cbd4f4" },
  { name: "NAPOLEON III", start: 1852, end: 1870, color: "#fff2d1" },
  { name: "1ERE GUERRE MONDIALE", start: 1914, end: 1918, color: "#f8ceff" },
  { name: "2EME GUERRE MONDIALE", start: 1939, end: 1945, color: "#f8ceff" },
];
const YEAR_SPACING = 6;

window.TreeModule = {
  svg: null,
  container: null,
  g: null,
  data: null,

  init(data) {
    console.log("[Tree] Initialisation avec données");
    this.data = data;
    this.container = document.getElementById("tree-viz");

    if (!this.container) {
      console.error(
        "DEBUG ERROR: Conteneur #tree-viz introuvable dans le DOM !",
      );
      return;
    }

    d3.select("#tree-viz").selectAll("*").remove();
    const svg = d3
      .select("#tree-viz")
      .append("svg")
      .attr("width", "100%")
      .attr("height", "100%");

    this.g = svg.append("g");
    console.log("DEBUG: SVG et Groupe principal (g) créés avec succès");

    const zoom = d3
      .zoom()
      .on("zoom", (e) => this.g.attr("transform", e.transform));
    svg.call(zoom);
  },

  buildHierarchy(person, allData, direction) {
    if (!person) {
      console.warn(`DEBUG: buildHierarchy (${direction}) - Personne est null`);
      return null;
    }

    console.log(
      `DEBUG: Construction ${direction} pour ${person.firstname} (ID: ${person.id})`,
    );

    const node = { ...person, children: [] };
    const links = allData.links || [];
    const nodes = allData.nodes || [];

    if (direction === "children") {
      const childLinks = links.filter(
        (l) => l.source === person.id && l.type === "parent",
      );
      console.log(
        `DEBUG: ${childLinks.length} liens enfants trouvés pour ${person.id}`,
      );

      const ids = childLinks.map((l) => l.target);
      const children = nodes.filter((n) => ids.includes(n.id));
      node.children = children.map((c) =>
        this.buildHierarchy(c, allData, direction),
      );
    } else {
      const parentLinks = links.filter(
        (l) => l.target === person.id && l.type === "parent",
      );
      console.log(
        `DEBUG: ${parentLinks.length} liens parents trouvés pour ${person.id}`,
      );

      const ids = parentLinks.map((l) => l.source);
      const parents = nodes.filter((n) => ids.includes(n.id));
      node.children = parents.map((p) =>
        this.buildHierarchy(p, allData, direction),
      );
    }
    return node;
  },

  drawTimelineBackground(container, birthRef, xMin, xMax) {
    // On dessine de xMin à xMax pour que ça colle à l'arbre
    const width = xMax - xMin;

    const bg = container.append("g").attr("class", "timeline-bg");
    const xOffset = -width / 2;

    // 1. Dessin des périodes historiques
    HISTORIC_PERIODS.forEach((p) => {
      const yStart = (p.start - birthRef) * YEAR_SPACING;
      const yEnd = (p.end - birthRef) * YEAR_SPACING;

      bg.append("rect")
        .attr("x", xMin)
        .attr("y", yStart)
        .attr("width", width)
        .attr("height", yEnd - yStart)
        .attr("fill", p.color)
        .attr("opacity", 0.5);

      bg.append("text")
        .attr("x", xMin + 10)
        .attr("y", yStart + 15)
        .attr("fill", "#a0aec0")
        .style("font-size", "16px")
        .style("font-weight", "bold")
        .text(p.name);
    });

    // 2. Lignes tous les 50 ans
    for (let yr = 1600; yr <= 2050; yr += 50) {
      const yPos = (yr - birthRef) * YEAR_SPACING;

      bg.append("line")
        .attr("x1", xMin)
        .attr("x2", xMax)
        .attr("y1", yPos)
        .attr("y2", yPos)
        .attr("stroke", "#4a5568") // Gris foncé (Slate 700)
        .attr("stroke-width", "1.5px")
        .attr("stroke-dasharray", "8,4") // Tirets plus longs pour être plus "marqués"
        .style("opacity", "0.4"); // Légère transparence pour ne pas gêner les liens

      // 2. Le Texte avec effet de Halo (pour la lisibilité)
      // On dessine d'abord le même texte en blanc plus épais dessous
      bg.append("text")
        .attr("x", xMin + 15)
        .attr("y", yPos - 8)
        .attr("fill", "white")
        .attr("stroke", "white")
        .attr("stroke-width", "4px")
        .style("font-size", "14px")
        .style("font-weight", "bold")
        .text(yr);

      // Puis le texte réel par-dessus
      bg.append("text")
        .attr("x", xMin + 15)
        .attr("y", yPos - 8)
        .attr("fill", "#2d3748") // Presque noir
        .style("font-size", "14px")
        .style("font-weight", "bold")
        .text(yr);
    }
  },

  render(centerPerson) {
    // On récupère les données soit en interne, soit via App
    const fullData = this.data || App.fullData;

    if (!fullData || !fullData.nodes) {
      console.error(
        "[Tree] Erreur : Données manquantes pour le rendu de l'ID",
        centerPerson,
      );
      return;
    } else {
      console.log("[Tree]: OK fulldata disponibles");
    }

    console.log("--- DÉBUT RENDU ARBRE ---");
    console.log("DEBUG: Personne centre :", centerPerson);
    console.log("DEBUG: Données complètes reçues :", fullData);

    if (!centerPerson) {
      console.error("DEBUG ERROR: centerPerson est undefined !");
      return;
    }
    if (!fullData || !fullData.links || !fullData.nodes) {
      console.error(
        "DEBUG ERROR: Structure de fullData invalide (manque nodes ou links) !",
      );
      return;
    }
    this.data = fullData;

    this.init();

    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    console.log(`DEBUG: Taille détectée - Largeur: ${w}, Hauteur: ${h}`);

    // 1. Build Data
    const ancestorsData = this.buildHierarchy(
      centerPerson,
      fullData,
      "parents",
    );
    const descendantsData = this.buildHierarchy(
      centerPerson,
      fullData,
      "children",
    );

    // 2. D3 Hierarchy
    console.log("DEBUG: Transformation en hiérarchie D3...");
    const rootAncestors = d3.hierarchy(ancestorsData);
    const rootDescendants = d3.hierarchy(descendantsData);

    // 3. Layout

    const treeLayout = d3.tree().nodeSize([190, 180]);
    treeLayout(rootAncestors);
    treeLayout(rootDescendants);

    // Année de référence pour le centre (Y = 0)
    // On utilise la date de naissance ou une estimation
    const birthRef = centerPerson.birth || 1900;

    // Calcul du positionnement temporel (Y)
    const applyTimeline = (root) => {
      root.descendants().forEach((d) => {
        // UTILISATION DE COMPUTEDBIRTH
        // On prend la date calculée, et si vraiment rien n'existe, on prend birthRef
        const year = d.data.computedBirth || d.data.birth || birthRef;

        // Calcul de la position Y
        d.y = (year - birthRef) * YEAR_SPACING;
      });
    };

    applyTimeline(rootAncestors);
    applyTimeline(rootDescendants);

    // Inversion Y ancêtres
    //rootAncestors.descendants().forEach(d => d.y = -d.y);

    // Calcul de l'étendue horizontale (Largeur de l'arbre)
    let minX = 0;
    let maxX = 0;

    // On parcourt les deux hiérarchies pour trouver les limites
    [rootAncestors, rootDescendants].forEach((root) => {
      root.descendants().forEach((d) => {
        if (d.x < minX) minX = d.x;
        if (d.x > maxX) maxX = d.x;
      });
    });

    // On ajoute une marge de sécurité (padding) pour que le fond dépasse un peu des noms
    const padding = 200;
    const treeWidth = maxX - minX + padding * 2;
    const centerX = (minX + maxX) / 2; // Le centre géométrique de l'arbre

    // const chartWidth = 2000; // Largeur assez grande pour couvrir tout le scroll horizontal

    // 4. Centrage
    const chartGroup = this.g
      .append("g")
      .attr("transform", `translate(${w / 2}, ${h / 2})`);
    console.log("DEBUG: chartGroup centré ajouté au SVG");

    // AJOUT DE L'ARRIÈRE-PLAN ICI (en premier)
    this.drawTimelineBackground(
      chartGroup,
      birthRef,
      minX - padding,
      maxX + padding,
    );
    //this.drawTimelineBackground(chartGroup, birthRef, chartWidth);

    // 5. Dessin des liens
    console.log("DEBUG: Dessin des liens...");
    this.drawLinks(chartGroup, rootAncestors, "ancestor-link");
    this.drawLinks(chartGroup, rootDescendants, "descendant-link");

    // 6. Dessin des noeuds
    console.log("DEBUG: Dessin des nœuds...");
    this.drawNodes(chartGroup, rootAncestors, "anc");
    this.drawNodes(chartGroup, rootDescendants, "des");

    console.log("--- FIN RENDU ARBRE ---");
  },

  drawLinks(group, root, className) {
    const links = group
      .selectAll("." + className)
      .data(root.links())
      .enter()
      .append("path")
      .attr("class", className)
      .attr(
        "d",
        d3
          .linkVertical()
          .x((d) => d.x)
          .y((d) => d.y),
      )
      .attr("fill", "none")
      .attr("stroke", "#cbd5e0")
      .attr("stroke-width", 2);
    console.log(
      `DEBUG: ${root.links().length} liens dessinés pour ${className}`,
    );
  },

  drawNodes(group, root, type) {
    console.log(`DEBUG: drawnodes ${root.surname}`);
    const nodes = group
      .selectAll(".node-" + type)
      .data(root.descendants())
      .enter()
      .append("g")
      .attr("transform", (d) => `translate(${d.x},${d.y})`)
      .style("cursor", "pointer")
      .on("click", (e, d) => {
        console.log("[Tree] Nouvelle personne sélectionnée :", d.data.surname);

        // 1. Mise à jour de la référence globale
        window.App.currentPerson = d.data;

        // 2. Mise à jour visuelle immédiate de l'arbre (votre fonction actuelle)
        this.render(d.data, this.data);

        // 3. Optionnel : Ouvrir le Bottom Sheet pour voir les détails
        // ou synchroniser les autres modules si nécessaire
        if (
          window.SearchModule &&
          typeof window.SearchModule.openBottomSheet === "function"
        ) {
          // Si vous avez une fonction pour afficher les infos en bas
          // window.SearchModule.openBottomSheet(d.data);
        }
      });
    //    .on("click", (e, d) => this.render(d.data, this.data));

    nodes
      .append("rect")
      .attr("class", (d) =>
        d.depth === 0 ? "tree-rect is-center" : "tree-rect",
      )
      //.attr('class', 'tree-rect')
      .attr("x", -90)
      .attr("y", -25)
      .attr("width", 180)
      .attr("height", 55)
      .attr("rx", 8)
      //.attr('fill', d => d.depth === 0 ? '#2b6cb0' : 'white')
      .attr("stroke", "#2b6cb0");

    nodes
      .append("text")
      .attr("class", "tree-surname")
      .attr("dy", -8)
      .attr("text-anchor", "middle")
      //.attr('fill', d => d.depth === 0 ? 'white' : '#2d3748')
      //.style("font-size", "14px")
      .text((d) =>
        d.data && d.data.surname ? d.data.surname.toUpperCase() : "XXXX",
      );
    //.text(d => d.data.surname.toUpperCase());

    nodes
      .append("text")
      .attr("class", "tree-firstname")
      .attr("dy", 10)
      .attr("text-anchor", "middle")
      //.attr('fill', d => d.depth === 0 ? 'white' : '#2d3748')
      //.style("font-size", "10px")
      .text((d) => d.data.firstname);

    // Dans TreeModule.drawNodes(...)
    nodes
      .append("text")
      .attr("class", "tree-dates")
      .attr("dy", 25) // Position sous le nom
      .attr("text-anchor", "middle")
      .text((d) => `${d.data.displayBirth} ${d.data.displayDeath}`);

    console.log(
      `DEBUG: ${root.descendants().length} nœuds dessinés pour ${type}`,
    );
  },
};
