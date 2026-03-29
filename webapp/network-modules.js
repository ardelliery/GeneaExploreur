/**
 * NETWORK-MODULE.JS
 * Gestion du graphe de force avec support des lignées et des chemins de parenté
 */
window.NetworkModule = {
  simulation: null,
  svg: null,
  container: null,
  allNodes: [],
  links: [],
  nodeElements: null,
  linkElements: null,
  isPathMode: false,
  zoom: null,

  // Configuration
  YEAR_SPACING: 6,
  START_YEAR: 1500,

  init(data) {
    console.log("[Network] Initialisation");
    this.allNodes = data.nodes;
    this.links = data.links.map((l) => ({ ...l }));

    this.svg = d3.select("#network-viz");
    this.svg.selectAll("*").remove();

    this.container = this.svg.append("g");
    this.container.append("g").attr("class", "links-layer");
    this.container.append("g").attr("class", "nodes-layer");

    this.setupMarkers();

    this.zoom = d3
      .zoom()
      .scaleExtent([0.1, 3])
      .on("zoom", (e) => this.container.attr("transform", e.transform));

    this.svg.call(this.zoom);
  },

  render(selectedPerson) {
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.svg.attr("width", width).attr("height", height);

    // 1. Initialisation ou redémarrage de la simulation
    if (!this.simulation) {
      this.createSimulation(width, height);
    } else {
      this.simulation.alpha(1).restart();
    }

    // On s'assure que les éléments existent avant de styliser
    if (!this.nodeElements) return;

    // --- AJOUT DU FOND ICI ---
    // Dans le Network, on dessine le fond sur toute la largeur disponible
    // car on ne connaît pas encore la position finale des nœuds (simulation en cours)
    if (this.container) {
      // On nettoie l'ancien fond s'il existe pour éviter les superpositions
      this.container.selectAll(".timeline-bg").remove();

      // On dessine le fond.
      // xMin et xMax sont ici très larges pour couvrir tout l'écran
      //this.drawTimelineBackground(this.container, 1850, -1000, 2000);

      // On s'assure que le fond passe derrière les liens et les nœuds
      this.container.select(".timeline-bg").lower();
    }

// --- LOGIQUE DE SÉLECTION DE LA CIBLE ---
    let target = null;

    // 2. LOGIQUE DES 3 MODES

    // MODE 3 : Chemin entre A et B (Prioritaire)
    if (
      window.RelationModule &&
      window.RelationModule.selectedA &&
      window.RelationModule.selectedB
    ) {
      const path = window.RelationModule.findShortestPath(
        window.RelationModule.selectedA,
        window.RelationModule.selectedB,
      );
      if (path) {
        console.log("[Network] Mode 3 : Affichage Chemin Rouge");
        this.applyPathStyle(path);
        setTimeout(
          () => this.centerOnPerson(window.RelationModule.selectedA),
          200,
        );
        return; // On sort, le travail est fait
      }
    }

    // MODE 2 : Une personne sélectionnée (Lignée standard)
    //const target = selectedPerson || window.App.currentPerson;
    target = selectedPerson || window.App.currentPerson;
    if (target) {
      console.log("[Network] Mode 2 : Affichage Lignée de", target.surname);
      this.applyLineageStyle(target);
    }
    // MODE 1 : Vue globale (Tout le monde par défaut)
    else {
      console.log("[Network] Mode 1 : Vue Globale");
      this.resetFilter();
    }
    if (target) {
        // On attend que la simulation ait fait quelques "ticks" 
        // 500ms est le "sweet spot" pour que les positions soient exploitables
        setTimeout(() => {
            this.centerOnPerson(target);
        }, 500);
    }
  },

  centerOnPerson(person) {
    if (!person || !this.svg || !this.zoom) return;

    const width = window.innerWidth;
    const height = window.innerHeight;

    const node = this.allNodes.find((n) => n.id === person.id);
    if (!node) return;

    // SÉCURITÉ : Si la simulation n'a pas encore calculé x et y,
    // on utilise le centre par défaut pour éviter le saut à (0,0)
    const posX = node.x || width / 2;
    const posY = node.y || height / 2;

    const scale = 0.8;
    const transform = d3.zoomIdentity
      .translate(width / 2, height / 2)
      .scale(scale)
      .translate(-posX, -posY);

    this.svg
      .transition()
      .duration(1000)
      .ease(d3.easePolyOut) // Transition plus douce
      .call(this.zoom.transform, transform);
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

  applyLineageStyle(person) {
    const lineageIds = window.getVerticalLineageIds(
      person.id,
      window.App.fullData.links,
    );

    // Reset des styles de base (couleurs HSL)
    this.nodeElements
      .select("circle")
      .attr("fill", (d) => this.stringToColor(d.surname))
      .attr("stroke", (d) => (lineageIds.has(d.id) ? "#e53e3e" : "#fff"))
      .attr("stroke-width", (d) => (lineageIds.has(d.id) ? 3 : 2))
      .attr("stroke-dasharray", (d) => (lineageIds.has(d.id) ? "4,2" : "none"));

    this.nodeElements
      .transition()
      .duration(500)
      .style("opacity", (d) => (lineageIds.has(d.id) ? 1 : 0.1))
      .style("filter", "none");

    this.linkElements
      .transition()
      .duration(500)
      .style("opacity", (d) => {
        const sId = typeof d.source === "object" ? d.source.id : d.source;
        const tId = typeof d.target === "object" ? d.target.id : d.target;
        return lineageIds.has(sId) && lineageIds.has(tId) ? 1 : 0.05;
      })
      .attr("stroke", (d) => (d.type === "marriage" ? "#f687b3" : "#cbd5e0"))
      .attr("stroke-width", (d) => (d.type === "marriage" ? 3 : 2));
  },

  applyPathStyle(pathIds) {
    const pathSet = new Set(pathIds);
    const RED = "#e53e3e";

    // Contexte élargi (tous les liens directs des gens du chemin)
    const context = new Set();
    pathIds.forEach((id) => {
      context.add(id);
      this.links.forEach((l) => {
        const sId = typeof l.source === "object" ? l.source.id : l.source;
        const tId = typeof l.target === "object" ? l.target.id : l.target;
        if (sId === id) context.add(tId);
        if (tId === id) context.add(sId);
      });
    });

    this.nodeElements
      .transition()
      .duration(500)
      .style("opacity", (d) =>
        pathSet.has(d.id) ? 1 : context.has(d.id) ? 0.4 : 0.05,
      )
      .style("filter", (d) => (pathSet.has(d.id) ? "none" : "grayscale(100%)"));

    this.nodeElements
      .filter((d) => pathSet.has(d.id))
      .select("circle")
      .attr("fill", RED)
      .attr("stroke", RED)
      .attr("stroke-width", 6)
      .attr("stroke-dasharray", "none");

    this.linkElements
      .transition()
      .duration(500)
      .style("opacity", (d) => {
        const sId = typeof d.source === "object" ? d.source.id : d.source;
        const tId = typeof d.target === "object" ? d.target.id : d.target;
        const isPath =
          pathSet.has(sId) &&
          pathSet.has(tId) &&
          Math.abs(pathIds.indexOf(sId) - pathIds.indexOf(tId)) === 1;
        return isPath ? 1 : context.has(sId) && context.has(tId) ? 0.2 : 0.02;
      })
      .attr("stroke", (d) => {
        const sId = typeof d.source === "object" ? d.source.id : d.source;
        const tId = typeof d.target === "object" ? d.target.id : d.target;
        return pathSet.has(sId) && pathSet.has(tId) ? RED : "#cbd5e0";
      })
      .attr("stroke-width", (d) => {
        const sId = typeof d.source === "object" ? d.source.id : d.source;
        const tId = typeof d.target === "object" ? d.target.id : d.target;
        return pathSet.has(sId) && pathSet.has(tId) ? 8 : 1;
      });

    this.nodeElements.filter((d) => pathSet.has(d.id)).raise();
  },

  createSimulation(width, height) {
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

    this.linkElements = this.container
      .select(".links-layer")
      .selectAll(".link")
      .data(this.links)
      .enter()
      .append("path")
      .attr("class", (d) => `link link-${d.type}`)
      .attr("stroke", (d) => (d.type === "marriage" ? "#f687b3" : "#cbd5e0"))
      .attr("stroke-width", (d) => (d.type === "marriage" ? 3 : 2))
      .attr("fill", "none");

    this.nodeElements = this.container
      .select(".nodes-layer")
      .selectAll(".node")
      .data(this.allNodes)
      .enter()
      .append("g")
      .attr("class", "node")
      .on("click", (e, d) => {
        e.stopPropagation();
        window.App.currentPerson = d;
        this.isPathMode = false; // On quitte le mode chemin au clic
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
      .attr("dy", -28)
      .attr("text-anchor", "middle")
      .style("font-size", "12px")
      .text((d) => d.surname.toUpperCase());
    this.nodeElements
      .append("text")
      .attr("dy", -14)
      .attr("text-anchor", "middle")
      .style("font-size", "12px")
      .text((d) => d.firstname);

    this.simulation.on("tick", () => {
      this.linkElements.attr("d", (d) => {
        const sx = d.source.x,
          sy = d.source.y,
          tx = d.target.x,
          ty = d.target.y;
        if (d.type === "marriage") {
          const dx = tx - sx,
            dy = ty - sy;
          const dr = Math.sqrt(dx * dx + dy * dy) * 1.5;
          return `M${sx},${sy}A${dr},${dr} 0 0,1 ${tx},${ty}`;
        }
        return `M${sx},${sy}L${tx},${ty}`;
      });
      this.nodeElements.attr("transform", (d) => `translate(${d.x},${d.y})`);
    });
  },

  selectPerson(person) {
    if (!person || !this.nodeElements) return;
    const lineageIds = window.getVerticalLineageIds(
      person.id,
      window.App.fullData.links,
    );

    // Calcul des conjoints pour l'affichage standard
    const partnerIds = new Set();
    window.App.fullData.links.forEach((l) => {
      if (l.type === "marriage") {
        const sId = typeof l.source === "object" ? l.source.id : l.source;
        const tId = typeof l.target === "object" ? l.target.id : l.target;
        if (lineageIds.has(sId)) partnerIds.add(tId);
        if (lineageIds.has(tId)) partnerIds.add(sId);
      }
    });

    this.nodeElements
      .transition()
      .duration(300)
      .style("opacity", (d) =>
        lineageIds.has(d.id) || partnerIds.has(d.id) ? 1 : 0.1,
      );

    this.nodeElements
      .select("circle")
      .attr("stroke", (d) => (lineageIds.has(d.id) ? "#e53e3e" : "#fff"))
      .attr("stroke-width", (d) => (lineageIds.has(d.id) ? 3 : 2))
      .attr("stroke-dasharray", (d) => (lineageIds.has(d.id) ? "4,2" : "none"));

    this.linkElements
      .transition()
      .duration(300)
      .style("opacity", (d) => {
        const sId = typeof d.source === "object" ? d.source.id : d.source;
        const tId = typeof d.target === "object" ? d.target.id : d.target;
        return (lineageIds.has(sId) || partnerIds.has(sId)) &&
          (lineageIds.has(tId) || partnerIds.has(tId))
          ? 1
          : 0.05;
      });
  },

  highlightPath(pathIds) {
    console.log("[Network] Highlighting path with IDs:", pathIds);
    if (!pathIds || pathIds.length < 2) return;

    // --- SÉCURITÉ : Si le graphe n'est pas encore dessiné ---
    if (!this.nodeElements || this.nodeElements.empty?.()) {
      console.log("[Network] Graphe non prêt, initialisation forcée...");
      this.render(); // Crée la simulation et les nodeElements

      // On attend un court instant que D3 ait fini de créer les éléments DOM
      setTimeout(() => this.highlightPath(pathIds), 100);
      return;
    }

    this.isPathMode = true;
    const pathSet = new Set(pathIds);
    const RED = "#e53e3e";

    // Contexte élargi pour voir les mariages/familles de fond
    const backgroundContext = new Set();
    pathIds.forEach((id) => {
      backgroundContext.add(id);
      window.App.fullData.links.forEach((l) => {
        const sId = typeof l.source === "object" ? l.source.id : l.source;
        const tId = typeof l.target === "object" ? l.target.id : l.target;
        if (sId === id) backgroundContext.add(tId);
        if (tId === id) backgroundContext.add(sId);
      });
    });

    this.nodeElements
      .interrupt()
      .transition()
      .duration(500)
      .style("opacity", (d) =>
        pathSet.has(d.id) ? 1 : backgroundContext.has(d.id) ? 0.4 : 0.05,
      )
      .style("filter", (d) => (pathSet.has(d.id) ? "none" : "grayscale(100%)"));

    this.linkElements
      .interrupt()
      .transition()
      .duration(500)
      .style("opacity", (d) => {
        const sId = typeof d.source === "object" ? d.source.id : d.source;
        const tId = typeof d.target === "object" ? d.target.id : d.target;
        const idxS = pathIds.indexOf(sId),
          idxT = pathIds.indexOf(tId);
        if (idxS !== -1 && idxT !== -1 && Math.abs(idxS - idxT) === 1) return 1;
        return backgroundContext.has(sId) && backgroundContext.has(tId)
          ? 0.2
          : 0.02;
      })
      .attr("stroke", (d) => {
        const sId = typeof d.source === "object" ? d.source.id : d.source;
        const tId = typeof d.target === "object" ? d.target.id : d.target;
        const idxS = pathIds.indexOf(sId),
          idxT = pathIds.indexOf(tId);
        return idxS !== -1 && idxT !== -1 && Math.abs(idxS - idxT) === 1
          ? RED
          : "#cbd5e0";
      })
      .attr("stroke-width", (d) => {
        const sId = typeof d.source === "object" ? d.source.id : d.source;
        const tId = typeof d.target === "object" ? d.target.id : d.target;
        const idxS = pathIds.indexOf(sId),
          idxT = pathIds.indexOf(tId);
        return idxS !== -1 && idxT !== -1 && Math.abs(idxS - idxT) === 1
          ? 8
          : 1;
      });

    this.nodeElements.filter((d) => pathSet.has(d.id)).raise();
    this.nodeElements
      .filter((d) => pathSet.has(d.id))
      .select("circle")
      .attr("fill", RED)
      .attr("stroke", RED)
      .attr("stroke-width", 6);
  },

  resetFilter() {
    if (!this.nodeElements) return;
    this.nodeElements
      .transition()
      .duration(300)
      .style("opacity", 1)
      .style("filter", "none");
    this.linkElements.transition().duration(300).style("opacity", 1);
  },

  stringToColor(name) {
    let hash = 0;
    const s = (name || "").toUpperCase();
    for (let i = 0; i < s.length; i++)
      hash = s.charCodeAt(i) + ((hash << 5) - hash);
    return `hsl(${Math.abs(hash * 137.5) % 360}, 65%, 50%)`;
  },

  drag(simulation) {
    return d3
      .drag()
      .on("start", (e, d) => {
        if (!e.active) simulation.alphaTarget(0.3).restart();
        d.fx = d.x;
        d.fy = d.y;
      })
      .on("drag", (e, d) => {
        d.fx = e.x;
        d.fy = e.y;
      })
      .on("end", (e, d) => {
        if (!e.active) simulation.alphaTarget(0);
        d.fx = null;
        d.fy = null;
      });
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
  },
};
