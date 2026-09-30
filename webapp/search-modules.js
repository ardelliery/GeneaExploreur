window.SearchModule = {
  allNodes: [],

  init(nodes) {
    console.log("[Search] Initialisation...");
    this.allNodes = nodes;
    const input = document.getElementById("mobile-search");
    const resultsContainer = document.getElementById("search-results");

    if (!input || !resultsContainer) {
      console.error("[Search] Éléments HTML introuvables");
      return;
    }

    input.addEventListener("input", (e) => {
      const query = e.target.value.toLowerCase().trim();
      if (query.length < 2) {
        resultsContainer.style.display = "none";
        return;
      }
      this.search(query, resultsContainer);
    });
  },

  normalizeString(str) {
    if (!str) return "";
    return str
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  },

  /**
   * Vérifie si une valeur (département ou INSEE) est valide et informative
   */
  isValidValue(val) {
    if (!val) return false;
    const cleanVal = val.toString().trim().toLowerCase();
    const invalidTerms = [
      "",
      "0",
      "n/a",
      "null",
      "undefined",
      "inconnu",
      "département inconnu",
      "code insee inconnu",
      "insee inconnu"
    ];
    return !invalidTerms.includes(cleanVal);
  },

  /**
   * Formatage propre du lieu :
   * N'affiche les détails (Dépt, INSEE) entre parenthèses QUE si ces informations
   * sont réellement connues et significatives.
   */
  formatPlaceLabel(person) {
    const mainPlace = person.place || person.place_orig || "Lieu Inconnu";

    const details = [];
    if (this.isValidValue(person.dept)) {
      details.push(`Dépt: ${person.dept.trim()}`);
    }
    if (this.isValidValue(person.insee)) {
      details.push(`INSEE: ${person.insee.trim()}`);
    }

    // N'affiche les parenthèses QUE si au moins un détail est valide
    if (details.length > 0) {
      return `${mainPlace} (${details.join(", ")})`;
    }

    return mainPlace;
  },

  search(query, container) {
    const q = this.normalizeString(query).toLowerCase();
    console.log(`[Search] query = ${query} | normalized = ${q}`);

    // 1. Filtrage : recherche dans le prénom OU le nom
    const matches = this.allNodes.filter((n) => {
      const fullName = this.normalizeString(
        `${n.surname} ${n.firstname}`
      ).toLowerCase();
      return fullName.includes(q);
    });

    // 2. Tri par NOM puis PRÉNOM
    matches.sort((a, b) => {
      const compareName = a.surname
        .toUpperCase()
        .localeCompare(b.surname.toUpperCase());

      if (compareName === 0) {
        return a.firstname.localeCompare(b.firstname);
      }
      return compareName;
    });

    container.innerHTML = "";
    matches.forEach((person) => {
      const div = document.createElement("div");
      div.className = "search-result-item";
      div.style.padding = "12px";
      div.style.borderBottom = "1px solid #eee";

      // Utilisation du formatage filtré
      const placeLabel = this.formatPlaceLabel(person);

      div.innerHTML = `
        <div style="font-weight: bold;">${person.surname.toUpperCase()} ${person.firstname} ( 📅 ${person.displayBirth} ${person.displayDeath ? person.displayDeath + " " : ""})</div>
        <div style="font-size: 0.85em; color: #666;">📍 ${placeLabel}</div>
      `;

      // CLIC SUR L'ÉLÉMENT
      div.onclick = (e) => {
        e.stopPropagation();
        console.log("[Search] CLIC DÉTECTÉ sur :", person.id);

        const links =
          App.fullData && App.fullData.links ? App.fullData.links : [];
        console.log("[Search] Liens trouvés pour le calcul :", links.length);

        const lineageIds = window.getVerticalLineageIds(person.id, links);
        console.log("[Search] Lignée calculée (IDs) :", lineageIds);

        try {
          App.currentPerson = person;
        } catch (error) {
          console.error(
            "[Search] Erreur lors de la définition de la personne courante :",
            error
          );
        }

        console.log("[Search] Rafraîchissement des modules");

        window.RelationModule.prepareView(person);
        window.TreeModule.render(person);
        window.NetworkModule.render(person);
        window.SankeyModule.render(person);

        App.renderInfoView();

        window.MapModule.filterByLineage(lineageIds);

        if (person.lat && person.lon) {
          window.MapModule.map.setView([person.lat, person.lon], 12);
        }

        setTimeout(() => {
          if (window.SankeyModule) {
            const slider = document.getElementById("sankey-gen-slider");
            if (slider) {
              slider.value = window.SankeyModule.maxGenerations;
            }
            const valBadge = document.getElementById("sankey-gen-val");
            if (valBadge) {
              const plural =
                window.SankeyModule.maxGenerations > 1 ? "s" : "";
              valBadge.textContent = `${window.SankeyModule.maxGenerations} génération${plural}`;
            }

            window.SankeyModule.render(person);
          }
        }, 50);

        container.style.display = "none";
      };

      container.appendChild(div);
    });

    container.style.display = "block";
  },
};