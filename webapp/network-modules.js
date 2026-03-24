/**
 * NETWORK-MODULE.JS
 * Vue en graphe de force (D3.js) parfaitement intégrée
 */
window.NetworkModule = {
  simulation: null,
  svg: null,
  container: null,
  allNodes: [],
  links: [],
  zoom: null,

  // Configuration temporelle
  YEAR_SPACING: 6,
  START_YEAR: 1500,

  /**
   * Appelé une seule fois au chargement par App.init()
   */
  init(data) {
    console.log("[Network] Initialisation structurelle");
    this.allNodes = data.nodes;
    //this.links = data.links;
    this.links = data.links.map((l) => ({ ...l }));

    this.svg = d3.select("#network-viz");
    this.svg.selectAll("*").remove(); // Nettoyage

    this.container = this.svg.append("g");
    this.container.append("g").attr("class", "links-layer");
    this.container.append("g").attr("class", "nodes-layer");

    this.setupMarkers();

    // Initialisation du zoom une seule fois
    this.zoom = d3
      .zoom()
      .scaleExtent([0.1, 3])
      .on("zoom", (e) => this.container.attr("transform", e.transform));

    this.svg.call(this.zoom);
  },

  /**
   * Appelé par App.switchView('network')
   * C'est ici que l'on lance ou met à jour la simulation
   */
  render(selectedPerson) {
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.svg.attr("width", width).attr("height", height);

    // Si la simulation n'existe pas, on la crée
    if (!this.simulation) {
      this.createSimulation(width, height);
    } else {
      this.simulation.alpha(1).restart();
    }

    // --- LE LIEN AVEC LE SEARCH MODULE ---
    // On utilise la personne passée en argument, sinon celle stockée dans App
    const target = selectedPerson || window.App.currentPerson;

    if (target) {
      console.log(
        "[Network] Application du filtre de recherche pour:",
        target.surname,
      );
      this.selectPerson(target); // Applique le filtre visuel (opacité/couleur)
    } else {
      this.resetFilter(); // Affiche tout le monde si aucune sélection
    }
  },

  resetFilter() {
    this.nodeElements
      .transition()
      .duration(300)
      .style("opacity", 1)
      .style("filter", "none");
    this.linkElements.transition().duration(300).style("opacity", 1);
  },

  createSimulation(width, height) {
    console.log("[Network] Création de la force D3");

    const surnames = Array.from(
      new Set(this.allNodes.map((d) => d.surname)),
    ).sort();
    const xCenterScale = d3
      .scalePoint()
      .domain(surnames)
      .range([100, width - 100])
      .padding(0.5);

    this.simulation = d3
      .forceSimulation(this.allNodes)
      .force(
        "link",
        d3
          .forceLink(this.links)
          .id((d) => d.id)
          .distance(100),
      )
      .force("charge", d3.forceManyBody().strength(-800))
      .force("x", d3.forceX((d) => xCenterScale(d.surname)).strength(0.5))
      .force(
        "y",
        d3
          .forceY(
            (d) => (d.computedBirth - this.START_YEAR) * this.YEAR_SPACING,
          )
          .strength(3),
      )
      .force("collision", d3.forceCollide().radius(40));

    // Rendu des liens
    this.linkElements = this.container
      .select(".links-layer")
      .selectAll(".link")
      .data(this.links)
      .enter()
      .append("path")
      .attr("class", (d) => `link link-${d.type}`)
      .attr("stroke", "#cbd5e0")
      .attr("fill", "none");

    // Rendu des nœuds
    this.nodeElements = this.container
      .select(".nodes-layer")
      .selectAll(".node")
      .data(this.allNodes)
      .enter()
      .append("g")
      .attr("class", "node")
      .on("click", (e, d) => {
        e.stopPropagation();
        // On informe l'App de la nouvelle sélection
        window.App.currentPerson = d;
        this.selectPerson(d);
      })
      .call(this.drag(this.simulation));

    this.nodeElements
      .append("circle")
      .attr("r", 12)
      .attr("fill", (d) => this.stringToColor(d.surname))
      .attr("stroke", "#fff")
      .attr("stroke-width", 2);

    this.nodeElements
      .append("text")
      .attr("dy", -18)
      .attr("text-anchor", "middle")
      .style("font-size", "12px")
      .text((d) => d.firstname);

    this.simulation.on("tick", () => {
      this.linkElements.attr("d", (d) => {
        const dr = d.type === "marriage" ? 150 : 0;
        return `M${d.source.x},${d.source.y}A${dr},${dr} 0 0,1 ${d.target.x},${d.target.y}`;
      });
      this.nodeElements.attr("transform", (d) => `translate(${d.x},${d.y})`);
    });
  },

  selectPerson(person) {
    if (!person) return;

    console.log("[Network] Filtrage visuel pour :", person.surname);

    // 1. On récupère les IDs de la lignée via la fonction globale de App.js
    // On utilise App.fullData.links (les données originales non transformées)
    const lineageIds = window.getVerticalLineageIds(
      person.id,
      window.App.fullData.links,
    );

    // 2. On change l'apparence des NOEUDS
    this.nodeElements
      .transition()
      .duration(300)
      .style("opacity", (d) => (lineageIds.has(d.id) ? 1 : 0.1))
      .style("filter", (d) =>
        lineageIds.has(d.id) ? "none" : "grayscale(100%)",
      );

    // 3. On change l'apparence des LIENS
    this.linkElements
      .transition()
      .duration(300)
      .style("opacity", (d) => {
        // Un lien est visible si la source ET la cible sont dans la lignée
        const sId = typeof d.source === "object" ? d.source.id : d.source;
        const tId = typeof d.target === "object" ? d.target.id : d.target;
        return lineageIds.has(sId) && lineageIds.has(tId) ? 1 : 0.05;
      });

    // 4. Zoom automatique sur la personne sélectionnée
    const node = this.allNodes.find((n) => n.id === person.id);
    if (node) {
      this.svg
        .transition()
        .duration(750)
        .call(
          this.zoom.transform,
          d3.zoomIdentity
            .translate(window.innerWidth / 2, window.innerHeight / 2)
            .scale(1.2)
            .translate(-node.x, -node.y),
        );
    }
  },

  highlightFamily(root) {
    const upIds = new Set(),
      downIds = new Set();
    const upLinks = new Set(),
      downLinks = new Set();
    const spouseIds = new Set();

    // Réutilisation des liens (this.links au lieu de familyData)
    const findUp = (id) => {
      upIds.add(id);
      this.links.forEach((l) => {
        const sId = typeof l.source === "object" ? l.source.id : l.source;
        const tId = typeof l.target === "object" ? l.target.id : l.target;
        if (tId === id && l.type === "parent") {
          upLinks.add(sId + "-" + tId);
          findUp(sId);
        }
      });
    };

    const findDown = (id) => {
      downIds.add(id);
      this.links.forEach((l) => {
        const sId = typeof l.source === "object" ? l.source.id : l.source;
        const tId = typeof l.target === "object" ? l.target.id : l.target;
        if (sId === id && l.type === "parent") {
          downLinks.add(sId + "-" + tId);
          findDown(tId);
        }
      });
    };

    findUp(root.id);
    findDown(root.id);

    // Highlight des éléments
    this.nodeElements
      .classed("highlight-up", (d) => upIds.has(d.id))
      .classed("highlight-down", (d) => downIds.has(d.id))
      .classed("fade", (d) => !upIds.has(d.id) && !downIds.has(d.id))
      .classed("selected", (d) => d.id === root.id);

    this.linkElements.each(function (l) {
      const sId = typeof l.source === "object" ? l.source.id : l.source;
      const tId = typeof l.target === "object" ? l.target.id : l.target;
      const isUp = upLinks.has(sId + "-" + tId);
      const isDown = downLinks.has(sId + "-" + tId);

      d3.select(this)
        .classed("highlight-up", isUp)
        .classed("highlight-down", isDown)
        .classed("fade", !(isUp || isDown));
    });
  },

  resetHighlights() {
    if (this.nodeElements)
      this.nodeElements.classed(
        "highlight-up highlight-down fade selected",
        false,
      );
    if (this.linkElements)
      this.linkElements.classed("highlight-up highlight-down fade", false);
  },

  centerOn(d) {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const transform = d3.zoomIdentity
      .translate(width / 2, height / 2)
      .scale(1)
      .translate(-d.x, -d.y);

    this.svg.transition().duration(750).call(this.zoom.transform, transform);
  },

  resetView() {
    this.svg
      .transition()
      .duration(750)
      .call(this.zoom.transform, d3.zoomIdentity);
    this.resetHighlights();
  },

  drag(simulation) {
    return d3
      .drag()
      .on("start", (e) => {
        if (!e.active) simulation.alphaTarget(0.3).restart();
        e.subject.fx = e.subject.x;
        e.subject.fy = e.subject.y;
      })
      .on("drag", (e) => {
        e.subject.fx = e.x;
        e.subject.fy = e.y;
      })
      .on("end", (e) => {
        if (!e.active) simulation.alphaTarget(0);
        e.subject.fx = null;
        e.subject.fy = null;
      });
  },

  stringToColor(name) {
    let hash = 0;
    const s = (name || "").toUpperCase();
    for (let i = 0; i < s.length; i++)
      hash = s.charCodeAt(i) + ((hash << 5) - hash);
    return `hsl(${Math.abs(hash * 137.5) % 360}, 65%, 50%)`;
  },

  setupMarkers() {
    let defs = this.svg.select("defs");
    if (defs.empty()) defs = this.svg.append("defs");

    const createArrow = (id, color) => {
      defs
        .append("marker")
        .attr("id", id)
        .attr("viewBox", "0 -5 10 10")
        .attr("refX", 28)
        .attr("refY", 0)
        .attr("orient", "auto")
        .attr("markerWidth", 6)
        .attr("markerHeight", 6)
        .append("path")
        .attr("d", "M0,-4L10,0L0,4")
        .attr("fill", color);
    };

    createArrow("arrow-default", "#a0aec0");
    createArrow("arrow-up", "#2b6cb0");
    createArrow("arrow-down", "#ed8936");
  },
};
