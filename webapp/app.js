/**
 * APP.JS - Chef d'orchestre de la PWA Généalogie
 */

window.App = {
  fullData: null, // Objet complet {nodes, links}
  nodes: [], // Liste simple des personnes
  currentPerson: null, // Personne actuellement sélectionnée

  async init() {
    console.log("Initialisation de l'application...");

    // 1. Astuce de Pro : Détection de mise à jour du Service Worker
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        this.showToast("Mise à jour installée ! Actualisation...");
        setTimeout(() => window.location.reload(), 1500);
      });
    }

    // 2. Chargement des données JSON
    let response = null;
    let dataUrl = "data.json?v=" + new Date().getTime();
    try {
      response = await fetch(dataUrl);
      console.log("Response.ok = ", response.ok);
      if (!response.ok) {
        dataUrl = "data.json";
        response = await fetch(dataUrl);
        console.log("Response.ok = ", response.ok);
      }
      console.log("Données chargées avec succès depuis", dataUrl);
    } catch (err) {
      console.error(
        "Erreur de chargement des données, tentative sans timestamp...",
      );
      response = await fetch("data.json"); // Fallback immédiat
    }
    const rawData = await response.json();

    this.fullData = this.prepareFamilyData(rawData);
    this.nodes = this.fullData.nodes;

    // 3. Initialisation des modules
    MapModule.init(this.nodes);
    TreeModule.init(this.fullData); // PAS de données ici, juste l'initialisation du SVG
    RelationModule.init();
    NetworkModule.init(this.fullData);
    SearchModule.init(this.nodes);
    SankeyModule.init();

    console.log("Application prête !");
  },

  resetAllFilters() {
    console.log("[App] Réinitialisation globale des filtres");

    // 1. Vider le champ de recherche
    const searchInputs = document.querySelectorAll("#mobile-search");
    searchInputs.forEach((input) => {
      input.value = "";
    });

    // 2. Réinitialiser la variable de personne courante
    this.currentPerson = null;

    // 3. Demander au MapModule de réafficher tout le monde
    if (window.MapModule) {
      window.MapModule.filterByLineage(null);
    }

    window.NetworkModule.resetFilter();

    // 4. Vider les résultats de recherche affichés
    const results = document.getElementById("search-results");
    if (results) results.style.display = "none";

    this.showToast("Filtres réinitialisés");
  },

  prepareFamilyData(data) {
    // 1. SÉCURISATION ET NETTOYAGE GLOBAL (Prise en compte des nouveaux champs de lieu)
    data.nodes.forEach((n) => {
      n.surname = (n.surname || "Inconnu").trim();
      n.firstname = (n.firstname || "Inconnu").trim();

      // Nouveau découpage des lieux
      n.place = (n.place || "Lieu Inconnu").trim(); // Commune issue de GeoNames
      n.place_orig = (n.place_orig || "Lieu Inconnu").trim(); // Lieu GEDCOM original
      n.dept = (n.dept || "Département Inconnu").trim(); // Département
      n.insee = (n.insee || "Code INSEE Inconnu").trim(); // Code INSEE

      // Construction d'une chaîne d'affichage enrichie pour la commune
      if (n.place) {
        let details = [];
        if (n.dept) details.push(`Dépt: ${n.dept}`);
        if (n.insee) details.push(`INSEE: ${n.insee}`);
        
        n.displayPlace = details.length > 0 
          ? `${n.place} (${details.join(", ")})` 
          : n.place;
      } else if (n.place_orig) {
        n.displayPlace = n.place_orig;
      } else {
        n.displayPlace = "Lieu Inconnu";
      }

      // Initialisation du calcul des dates (votre algo original)
      n.computedBirth = n.birth > 0 ? n.birth : null;
    });

    // Algorithme de propagation des dates
    let changed = true;
    let iterations = 0;
    while (changed && iterations < 10) {
      changed = false;
      iterations++;
      data.links.forEach((link) => {
        if (link.type !== "parent") return;
        const source = data.nodes.find((node) => node.id === link.source);
        const target = data.nodes.find((node) => node.id === link.target);
        if (!source || !target) return;

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
        data.nodes.filter((n) => n.birth > 0),
        (n) => n.birth,
      ) || 1900;

    // 2. Génération des champs d'affichage définitifs
    data.nodes.forEach((n) => {
      // Finalisation du computedBirth si toujours nul
      if (!n.computedBirth) n.computedBirth = Math.round(avgBirth);

      // A. Formatage Naissance (Ex: "1970" ou "~1940")
      if (n.birth > 0) {
        n.displayBirth = `${n.birth}`;
      } else {
        n.displayBirth = `~${Math.round(n.computedBirth)}`;
      }

      // B. Formatage Décès (Ex: "†" ou "† 1995")
      const isDead = n.deceased === 1 || (n.death_year && n.death_year > 0);
      n.displayDeath = "";
      if (isDead) {
        n.displayDeath = "†";
        if (n.death_year && n.death_year > 0) {
          n.displayDeath += ` ${n.death_year}`;
        }
      }
    });

    return data;
  },

  renderInfoView() {
    const person = this.currentPerson;
    const emptyDiv = document.getElementById("info-empty");
    const cardDiv = document.getElementById("info-card");

    if (!person) {
      emptyDiv.style.display = "block";
      cardDiv.style.display = "none";
      return;
    }

    emptyDiv.style.display = "none";
    cardDiv.style.display = "block";

    // Remplissage des textes principaux
    document.getElementById("info-name").innerText =
      `${person.surname.toUpperCase()} ${person.firstname}`;
    document.getElementById("info-dates").innerText =
      `${person.displayBirth || ""} — ${person.displayDeath || ""}`;

    // Affichage enrichi du lieu (Commune GeoNames + Lieu original GEDCOM en sous-titre)
    const placeElem = document.getElementById("info-place");
    if (placeElem) {
      if (person.place) {
        let placeHTML = `📍 <strong>${person.displayPlace}</strong>`;
        if (person.place_orig && person.place_orig !== person.place) {
          placeHTML += `<div style="font-size:0.8em; color:#718096; margin-top:2px;">Origine GEDCOM : <em>${person.place_orig}</em></div>`;
        }
        placeElem.innerHTML = placeHTML;
      } else if (person.place_orig) {
        placeElem.innerHTML = `📍 ${person.place_orig} <span style="font-size:0.8em; color:#e53e3e;">(non géolocalisé)</span>`;
      } else {
        placeElem.innerText = "📍 Lieu inconnu";
      }
    }

    // 1. Gestion des Parents
    const parentsContainer = document.getElementById("info-parents");
    parentsContainer.innerHTML = "";
    const parentLinks = this.fullData.links.filter(
      (l) => l.target === person.id && l.type === "parent",
    );

    parentLinks.forEach((l) => {
      const p = this.nodes.find((n) => n.id === l.source);
      if (p) {
        const div = document.createElement("div");
        div.style =
          "background: #f8fafc; padding: 12px; border-radius: 10px; border: 1px solid #e2e8f0; cursor: pointer; text-align:center;";
        div.innerHTML = `<div style="font-size:0.7em; color:#718096;">${p.sex === "F" ? "MÈRE" : "PÈRE"}</div><div style="font-weight:bold; font-size:0.9em;">${p.surname.toUpperCase()} ${p.firstname}</div>`;
        div.onclick = () => {
          this.currentPerson = p;
          this.renderInfoView();
        };
        parentsContainer.appendChild(div);
      }
    });

    // 2. Gestion des Unions et Enfants
    const familyContainer = document.getElementById("info-family");
    familyContainer.innerHTML = "";

    const partnerIds = new Set();
    this.fullData.links
      .filter((l) => l.source === person.id && l.type === "parent")
      .forEach((l) => {
        this.fullData.links
          .filter(
            (l2) =>
              l2.target === l.target &&
              l2.source !== person.id &&
              l2.type === "parent",
          )
          .forEach((l2) => partnerIds.add(l2.source));
      });

    if (partnerIds.size === 0) {
      familyContainer.innerHTML =
        '<p style="color:#cbd5e0; font-style:italic; font-size:0.9em;">Aucun conjoint ou enfant détecté.</p>';
    } else {
      partnerIds.forEach((pId) => {
        const partner = this.nodes.find((n) => n.id === pId);
        const unionDiv = document.createElement("div");
        unionDiv.style =
          "margin-bottom: 20px; padding: 10px; border-left: 3px solid #edf2f7;";
        unionDiv.innerHTML = `<div style="font-weight:bold; color:#4a5568; margin-bottom:10px;">× avec ${partner ? partner.firstname + " " + partner.surname : "Inconnu"}</div>`;

        const children = this.nodes.filter((c) => {
          const lks = this.fullData.links.filter(
            (lnk) => lnk.target === c.id && lnk.type === "parent",
          );
          return (
            lks.some((lnk) => lnk.source === person.id) &&
            lks.some((lnk) => lnk.source === pId)
          );
        });

        children.forEach((c) => {
          const cDiv = document.createElement("div");
          cDiv.style =
            "padding: 8px; background: white; border: 1px solid #f0f4f8; border-radius: 8px; margin-bottom: 5px; cursor:pointer; font-size: 0.9em;";
          cDiv.innerHTML = `👶 ${c.firstname} <span style="color:#a0aec0; font-size:0.8em;">(${c.birth || "?"})</span>`;
          cDiv.onclick = () => {
            this.currentPerson = c;
            this.renderInfoView();
          };
          unionDiv.appendChild(cDiv);
        });
        familyContainer.appendChild(unionDiv);
      });
    }
  },

  switchView(viewName) {
    console.log("Tentative de passage à :", viewName);
    this.currentView = viewName;

    document.querySelectorAll(".app-view").forEach((view) => {
      view.classList.remove("active");
    });

    const target = document.getElementById(viewName + "-view");
    if (target) {
      target.classList.add("active");
    }

    if (viewName === "relation") {
      RelationModule.prepareView(this.currentPerson);
      return;
    }

    if (viewName === "map") {
      MapModule.handlePersonSelection(this.currentPerson);
      MapModule.refresh();
    } else if (viewName === "tree") {
      TreeModule.render(this.currentPerson);
    }

    if (viewName === "network") {
      NetworkModule.render(this.currentPerson);
    }

    if (viewName === "info") {
      this.renderInfoView();
    }

    if (viewName === "sankey") {
      SankeyModule.render(this.currentPerson);
    }
  },

  viewTreeFromSelected() {
    if (this.currentPerson) {
      closeBottomSheet();
      this.switchView("tree");
      setTimeout(() => {
        TreeModule.render(this.currentPerson, this.fullData);
      }, 100);
    }
  },

  showToast(message) {
    const toast = document.getElementById("toast");
    if (toast) {
      toast.innerText = message;
      toast.classList.add("show");
      setTimeout(() => toast.classList.remove("show"), 3000);
    }
  },
};

function closeBottomSheet() {
  const sheet = document.getElementById("bottom-sheet");
  const overlay = document.getElementById("sheet-overlay");
  if (sheet) sheet.classList.add("sheet-hidden");
  if (overlay) overlay.style.display = "none";
}

window.getVerticalLineageIds = function (targetId, allLinks) {
  const familyIds = new Set();
  familyIds.add(targetId);

  if (!allLinks || allLinks.length === 0) {
    console.error("Aucun lien (links) trouvé pour calculer la lignée.");
    return familyIds;
  }

  function collectAncestors(id) {
    allLinks.forEach((l) => {
      if (l.target === id && l.type === "parent") {
        if (!familyIds.has(l.source)) {
          familyIds.add(l.source);
          collectAncestors(l.source);
        }
      }
    });
  }

  function collectDescendants(id) {
    allLinks.forEach((l) => {
      if (l.source === id && l.type === "parent") {
        if (!familyIds.has(l.target)) {
          familyIds.add(l.target);
          collectDescendants(l.target);
        }
      }
    });
  }

  collectAncestors(targetId);
  collectDescendants(targetId);

  return familyIds;
};

window.onload = () => App.init();

let deferredPrompt;

window.addEventListener("beforeinstallprompt", (e) => {
  // Empêche Chrome d'afficher sa propre bannière
  e.preventDefault();
  // Garde l'événement pour l'utiliser plus tard
  deferredPrompt = e;

  // ICI : Fais apparaître un bouton "Installer" dans ton interface
  const installBtn = document.createElement("button");
  installBtn.innerText = "📲 Installer l'application";
  installBtn.style.position = "fixed";
  installBtn.style.bottom = "20px";
  installBtn.style.left = "20px";
  installBtn.style.zIndex = "9999";
  document.body.appendChild(installBtn);

  installBtn.addEventListener("click", async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === "accepted") {
        console.log("L'utilisateur a installé l'appli");
      }
      deferredPrompt = null;
      installBtn.remove();
    }
  });
});
