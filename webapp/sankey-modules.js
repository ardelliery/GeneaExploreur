/**
 * SANKEY-MODULES.JS 
 * Version Haute-Précision : Matrice de couleurs bivariée (RGB Géographique)
 * Fix : Highlighting autonome par isolation chirurgicale des classes graphiques (Anti-conflit Axe X)
 */

window.SankeyModule = {
    mode: 'geo', // 'geo' ou 'name'
    colorCache: { names: {}, locations: {} },
    margin: { top: 15, right: 85, bottom: 30, left: 5 },
    maxGenerations: 3,
    
    // Bornes géographiques qui seront calculées dynamiquement
    geoBounds: { minLat: Infinity, maxLat: -Infinity, minLng: Infinity, maxLng: -Infinity },
    hasGeoData: false,
    currentHighlightValue: null,

    /**
     * Calcule la zone géographique de la famille et pré-génère les couleurs
     */
    init() {
        console.log("[Sankey] Initialisation de la matrice de couleurs bivariée...");
        if (!App.nodes || App.nodes.length === 0) return;

        // 1. SCAN DE LA ZONE GÉOGRAPHIQUE (Calcul du Bounding Box de la famille)
        this.geoBounds = { minLat: Infinity, maxLat: -Infinity, minLng: Infinity, maxLng: -Infinity };
        let countGeo = 0;

        App.nodes.forEach(p => {
            const lat = p.lat || p.latitude;
            const lng = p.lng || p.longitude || p.lon;
            
            if (lat && lng && !isNaN(lat) && !isNaN(lng)) {
                countGeo++;
                if (lat < this.geoBounds.minLat) this.geoBounds.minLat = lat;
                if (lat > this.geoBounds.maxLat) this.geoBounds.maxLat = lat;
                if (lng < this.geoBounds.minLng) this.geoBounds.minLng = lng;
                if (lng > this.geoBounds.maxLng) this.geoBounds.maxLng = lng;
            }
        });
        
        // On active le mode géo si on a trouvé au moins 2 points distincts
        this.hasGeoData = (countGeo > 1 && this.geoBounds.maxLat !== this.geoBounds.minLat);

        // 2. GÉNÉRATION ET CACHAGE DES COULEURS
        App.nodes.forEach(p => {
            // Gestion des Patronymes (Hachage de texte classique)
            const sn = (p.surname || "Inconnu").trim().toUpperCase();
            if (sn === "INCONNU") {
                this.colorCache.names[sn] = "#e2e8f0"; // Gris perle
            } else if (!this.colorCache.names[sn]) {
                this.colorCache.names[sn] = this.generateTextHashColor(sn, 75, 50);
            }

            // Gestion des Lieux (Algorithme Bivarié RGB)
            const loc = (p.place || "Lieu Inconnu").trim();
            const isUnknownLoc = !p.place || loc.toLowerCase() === "lieu inconnu" || loc.toLowerCase() === "inconnu";
            
            if (isUnknownLoc) {
                this.colorCache.locations[loc] = "#e2e8f0"; // Gris perle pour les inconnus
            } else if (!this.colorCache.locations[loc]) {
                const lat = p.lat || p.latitude;
                const lng = p.lng || p.longitude || p.lon;

                if (this.hasGeoData && lat && lng) {
                    // Normalisation de la position de la ville entre 0.0 et 1.0 dans la zone familiale
                    const rangeLat = this.geoBounds.maxLat - this.geoBounds.minLat || 1;
                    const rangeLng = this.geoBounds.maxLng - this.geoBounds.minLng || 1;
                    
                    const pctLat = (lat - this.geoBounds.minLat) / rangeLat;
                    const pctLng = (lng - this.geoBounds.minLng) / rangeLng;

                    // FORMULE RGB BIVARIÉE
                    const R = Math.round(60 + pctLng * 195);
                    const B = Math.round(60 + pctLat * 195);
                    const G = Math.round(140 + ((pctLat + pctLng) / 2) * 60);

                    this.colorCache.locations[loc] = `rgb(${R}, ${G}, ${B})`;
                } else {
                    this.colorCache.locations[loc] = this.generateTextHashColor(loc, 60, 55);
                }
            }
        });
    },

    /**
     * Algorithme de secours (Hachage textuel HSL)
     */
    generateTextHashColor(str, saturation, lightness) {
        let hash = 0;
        const cleaned = str.toUpperCase().trim();
        for (let i = 0; i < cleaned.length; i++) {
            hash = (hash << 5) - hash + cleaned.charCodeAt(i);
            hash |= 0;
        }
        const hue = Math.abs(hash) % 360;
        return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
    },

    getPersonColor(person) {
        if (this.mode === 'name') {
            const sn = (person.surname || "Inconnu").trim().toUpperCase();
            return this.colorCache.names[sn] || "#e2e8f0";
        }
        const loc = (person.place || "Lieu Inconnu").trim();
        return this.colorCache.locations[loc] || "#e2e8f0";
    },

    updateMode(newMode) {
        this.mode = newMode;
        if (App.currentPerson) this.render(App.currentPerson);
    },

    prepareData(targetId) {
        let nodes = [];
        let links = [];
        let nodeMap = new Map();

        const traverse = (id, gen) => {
            if (gen > this.maxGenerations) return;
            const p = App.nodes.find(n => n.id === id);
            if (!p) return;

            if (!nodeMap.has(id)) {
                nodeMap.set(id, nodes.length);
                
                // Injection de TOUTES les données de p (provenant d'app.js) dans le nœud D3
                nodes.push({
                    ...p, 
                    name: `${p.firstname} ${p.surname.charAt(0)}.`,
                    year: p.birth || p.computedBirth || 1900,
                    color: this.getPersonColor(p)
                });
            }

            const parents = App.fullData.links.filter(l => l.target === id && l.type === "parent");
            parents.forEach(l => {
                const sourceIdx = traverse(l.source, gen + 1);
                if (sourceIdx !== undefined) {
                    links.push({
                        source: sourceIdx,
                        target: nodeMap.get(id),
                        value: Math.pow(2, this.maxGenerations - gen)
                    });
                }
            });
            return nodeMap.get(id);
        };

        traverse(targetId, 0);
        return { nodes, links };
    },
    
    render(targetPerson) {
        console.log("{Sankey} Rendu du Sankey pour :", targetPerson ? `${targetPerson.firstname} ${targetPerson.surname}` : "Aucune personne cible");
        
        this.currentHighlightValue = null; // Reset de la sélection courante au re-rendu

        const container = document.getElementById('sankey-viz');
        const emptyMsg = document.getElementById('sankey-empty');
        const vizBox = document.getElementById('sankey-viz-container');

        if (!targetPerson) {
            if (emptyMsg) emptyMsg.style.display = 'block';
            if (vizBox) vizBox.style.display = 'none';
            return;
        }

        if (emptyMsg) emptyMsg.style.display = 'none';
        if (vizBox) vizBox.style.display = 'block';
        container.innerHTML = '';

        const width = container.clientWidth - this.margin.left - this.margin.right;
        const currentHeight = container.clientHeight;
        const height = (currentHeight > 50 ? currentHeight : 450) - this.margin.top - this.margin.bottom;

        const svg = d3.select("#sankey-viz")
            .append("svg")
            .attr("width", "100%")
            .attr("height", height + this.margin.top + this.margin.bottom)
            .append("g")
            .attr("transform", `translate(${this.margin.left},${this.margin.top})`);

        const data = this.prepareData(targetPerson.id);
        if (data.nodes.length === 0) return;

        const xScale = d3.scaleLinear()
            .domain([d3.min(data.nodes, d => d.year), d3.max(data.nodes, d => d.year)])
            .range([0, width]);

        const sankey = d3.sankey()
            .nodeWidth(14)
            .nodePadding(6) 
            .extent([[0, 0], [width, height]]);

        let { nodes, links } = sankey({
            nodes: data.nodes.map(d => Object.assign({}, d)),
            links: data.links.map(d => Object.assign({}, d))
        });

        nodes.forEach(n => {
            const xPos = xScale(n.year);
            const w = n.x1 - n.x0;
            n.x0 = xPos;
            n.x1 = xPos + w;
        });
        sankey.update({ nodes, links });

        // Axe X
        const xAxis = d3.axisBottom(xScale).ticks(4).tickFormat(d => d);
        svg.append("g")
            .attr("transform", `translate(0, ${height + 8})`)
            .call(xAxis)
            .style("color", "#718096")
            .selectAll("text").style("font-size", "11px");

        // Liens (Rubans) -> AJOUT DE LA CLASSE sankey-link
        svg.append("g")
            .attr("fill", "none")
            .selectAll("path")
            .data(links)
            .join("path")
            .attr("class", "sankey-link")
            .attr("d", d3.sankeyLinkHorizontal())
            .attr("stroke", d => d.source.color)
            .attr("stroke-width", d => Math.max(4, d.width)) 
            .attr("stroke-opacity", 0.6);

        // Nœuds
        const node = svg.append("g")
            .selectAll("g")
            .data(nodes)
            .join("g");

        // Rectangles -> AJOUT DE LA CLASSE sankey-rect
        node.append("rect")
            .attr("class", "sankey-rect")
            .attr("x", d => d.x0)
            .attr("y", d => d.y0)
            .attr("height", d => Math.max(6, d.y1 - d.y0)) 
            .attr("width", d => d.x1 - d.x0)
            .attr("fill", d => d.color)
            .attr("rx", 3);

        // Textes -> AJOUT DE LA CLASSE sankey-text
        node.append("text")
            .attr("class", "sankey-text")
            .attr("x", d => d.x1 + 6)
            .attr("y", d => (d.y1 + d.y0) / 2)
            .attr("dy", "0.35em")
            .text(d => d.name)
            .style("font-size", "11px")
            .style("font-weight", "500")
            .style("fill", "#2d3748")
            .style("display", d => (d.y1 - d.y0 < 4) ? "none" : "block");

        this.updateLegend(data.nodes);
    },

    /**
     * Slider générations
     */
    updateGenerations(newGen) {
        this.maxGenerations = parseInt(newGen, 10); 
        const valBadge = document.getElementById('sankey-gen-val');
        if (valBadge) {
            const plural = this.maxGenerations > 1 ? 's' : '';
            valBadge.textContent = `${this.maxGenerations} génération${plural}`;
        }
        if (App.currentPerson) this.render(App.currentPerson);
    },

    /**
     * Génération de la légende cliquable
     */
    updateLegend(nodes) {
        const legendContainer = document.getElementById('sankey-legend');
        if (!legendContainer) return;
        legendContainer.innerHTML = '';

        const stats = {};
        nodes.forEach(n => {
            const label = (this.mode === 'name') ? 
                (n.surname || "Inconnu").toUpperCase() : 
                (n.place || "Lieu Inconnu");
                
            if (!stats[label]) {
                stats[label] = { count: 0, color: n.color };
            }
            stats[label].count++;
        });

        Object.entries(stats)
            .sort((a, b) => b[1].count - a[1].count)
            .forEach(([label, data]) => {
                const badge = document.createElement('div');
                badge.classList.add('legend-item');
                badge.setAttribute('data-value', label);
                badge.style = "display:flex; align-items:center; gap:6px; background:#f8fafc; padding:4px 10px; border-radius:12px; font-size:11px; border:1px solid #edf2f7; color:#4a5568; white-space:nowrap; cursor:pointer; transition: all 0.2s;";
                
                badge.innerHTML = `
                    <span style="width:8px; height:8px; background:${data.color}; border-radius:50%; flex-shrink:0;"></span> 
                    <span><strong>${label}</strong> <span style="color:#a0aec0; font-size:0.9em;">(${data.count})</span></span>
                `;
                legendContainer.appendChild(badge);
            });

        this.initLegendListener();
    },

    /**
     * Écouteur d'événement sur la légende
     */
    initLegendListener() {
        const legendContainer = document.getElementById('sankey-legend');
        if (!legendContainer || legendContainer.dataset.listenerActive) return;

        legendContainer.dataset.listenerActive = "true";
        legendContainer.addEventListener("click", (event) => {
            const clickedItem = event.target.closest(".legend-item");
            if (!clickedItem) return;

            const valueToHighlight = clickedItem.getAttribute('data-value');
            this.highlightByValue(valueToHighlight);
        });
    },

    /**
     * Application de la mise en évidence visuelle
     */
    highlightByValue(value) {
        if (!value) return;
        const valLower = value.trim().toLowerCase();

        // Système d'interrupteur (Toggle) : Un second clic réinitialise le graphique
        if (this.currentHighlightValue === valLower) {
            this.resetHighlight();
            return;
        }
        this.currentHighlightValue = valLower;

        // 1. MAJ visuelle de la légende
        document.querySelectorAll('#sankey-legend .legend-item').forEach(badge => {
            const badgeVal = badge.getAttribute('data-value').trim().toLowerCase();
            if (badgeVal === valLower) {
                badge.style.borderColor = "#e53e3e";
                badge.style.background = "#fff5f5";
                badge.style.opacity = "0.2";
            } else {
                badge.style.borderColor = "#edf2f7";
                badge.style.background = "#f8fafc";
                badge.style.opacity = "0.1";
            }
        });

        // Sécurisation de la correspondance (Vérification stricte de type pour éviter les objets vides)
        const isMatch = (d3Node) => {
            if (!d3Node || typeof d3Node !== 'object') return false;
            const matchName = d3Node.surname && d3Node.surname.trim().toLowerCase() === valLower;
            const matchPlace = d3Node.place && d3Node.place.trim().toLowerCase() === valLower;
            return !!(matchName || matchPlace);
        };

        // 2. HIGHLIGHT DES RUBANS -> Utilise la classe .sankey-link (Sécurisé)
        d3.select("#sankey-viz").selectAll(".sankey-link")
            .transition().duration(200)
            .attr("stroke", d => (d.source && (isMatch(d.source) || isMatch(d.target))) ? "#e53e3e" : (d.source ? d.source.color : "#ccc"))
            .attr("stroke-width", d => (d.source && (isMatch(d.source) || isMatch(d.target))) ? (Math.max(4, d.width) + 3) : Math.max(4, d.width))
            .attr("stroke-opacity", d => (d.source && (isMatch(d.source) || isMatch(d.target))) ? 0.2 : 0.05);

        // 3. HIGHLIGHT DES INDIVIDUS -> Utilise la classe .sankey-rect
        d3.select("#sankey-viz").selectAll(".sankey-rect")
            .transition().duration(200)
            .attr("stroke", d => isMatch(d) ? "#e53e3e" : "none")
            .attr("stroke-width", d => isMatch(d) ? "2px" : "0px")
            .style("opacity", d => isMatch(d) ? 1 : 0.15);

        // 4. HIGHLIGHT DES TEXTES -> Utilise la classe .sankey-text
        d3.select("#sankey-viz").selectAll(".sankey-text")
            .transition().duration(200)
            .style("fill", d => isMatch(d) ? "#e53e3e" : "#2d3748")
            .style("font-weight", d => isMatch(d) ? "bold" : "500")
            .style("opacity", d => isMatch(d) ? 1 : 0.2);
    },

    /**
     * RESTAURATION DES COULEURS ET OPACITÉS INITIALES
     */
    resetHighlight() {
        this.currentHighlightValue = null;

        // Remet la légende à l'état normal
        document.querySelectorAll('#sankey-legend .legend-item').forEach(badge => {
            badge.style.borderColor = "#edf2f7";
            badge.style.background = "#f8fafc";
            badge.style.opacity = "1";
        });
        
        // Remet les rubans (liens) à l'état initial via .sankey-link
        d3.select("#sankey-viz").selectAll(".sankey-link")
            .transition().duration(200)
            .attr("stroke", d => d.source ? d.source.color : "#ccc")
            .attr("stroke-width", d => Math.max(4, d.width))
            .attr("stroke-opacity", 0.6);

        // Remet les nœuds rect à l'état initial via .sankey-rect
        d3.select("#sankey-viz").selectAll(".sankey-rect")
            .transition().duration(200)
            .attr("stroke", "none")
            .style("opacity", 1.0);

        // Remet les textes à l'état initial via .sankey-text
        d3.select("#sankey-viz").selectAll(".sankey-text")
            .transition().duration(200)
            .style("fill", "#2d3748")
            .style("font-weight", "500")
            .style("opacity", 1.0);
    }
};