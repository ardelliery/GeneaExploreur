/**
 * SANKEY-MODULES.JS 
 * Version Haute-Précision : Matrice de couleurs bivariée (RGB Géographique)
 */

window.SankeyModule = {
    mode: 'geo', // 'geo' ou 'name'
    colorCache: { names: {}, locations: {} },
    margin: { top: 15, right: 85, bottom: 30, left: 5 },
    maxGenerations: 3,
    
    // Bornes géographiques qui seront calculées dynamiquement
    geoBounds: { minLat: Infinity, maxLat: -Infinity, minLng: Infinity, maxLng: -Infinity },
    hasGeoData: false,

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
            // Prise en compte des différentes dénominations possibles dans vos objets
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

                    // FORMULE RGB BIVARIÉE (Calibrée pour rester lumineuse et éviter le sombre/noir)
                    // Longitude (Ouest -> Est) pilote le ROUGE (de 60 à 255)
                    const R = Math.round(60 + pctLng * 195);
                    // Latitude (Sud -> Nord) pilote le BLEU (de 60 à 255)
                    const B = Math.round(60 + pctLat * 195);
                    // Le VERT sert de liant pour illuminer le graphique et mélanger les deux axes
                    const G = Math.round(140 + ((pctLat + pctLng) / 2) * 60);

                    this.colorCache.locations[loc] = `rgb(${R}, ${G}, ${B})`;
                } else {
                    // Si la ville n'a pas de coordonnées GPS, on se replie proprement sur le hachage textuel
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
                nodes.push({
                    id: id,
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

        // Liens
        svg.append("g")
            .attr("fill", "none")
            .selectAll("path")
            .data(links)
            .join("path")
            .attr("d", d3.sankeyLinkHorizontal())
            .attr("stroke", d => d.source.color)
            .attr("stroke-width", d => Math.max(4, d.width)) 
            .attr("stroke-opacity", 0.6);

        // Nœuds
        const node = svg.append("g")
            .selectAll("g")
            .data(nodes)
            .join("g");

        node.append("rect")
            .attr("x", d => d.x0)
            .attr("y", d => d.y0)
            .attr("height", d => Math.max(6, d.y1 - d.y0)) 
            .attr("width", d => d.x1 - d.x0)
            .attr("fill", d => d.color)
            .attr("rx", 3);

        node.append("text")
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
     * Change le nombre de générations et rafraîchit le graphique
     * à partir du slider situé à côté du choix Mode
     */
    updateGenerations(newGen) {
        this.maxGenerations = parseInt(newGen, 10); 
        
        // On met à jour le texte à côté du curseur
        const valBadge = document.getElementById('sankey-gen-val');
        if (valBadge) {
            const plural = this.maxGenerations > 1 ? 's' : '';
            valBadge.textContent = `${this.maxGenerations} génération${plural}`;
        }
        
        // On redessine le Sankey sur ton conteneur d'origine
        if (App.currentPerson) {
            this.render(App.currentPerson);
        }
    },

    /**
     * Légende exhaustive
     */
    updateLegend(nodes) {
        const legendContainer = document.getElementById('sankey-legend');
        if (!legendContainer) return;
        legendContainer.innerHTML = '';

        const stats = {};
        nodes.forEach(n => {
            const person = App.nodes.find(p => p.id === n.id);
            if (!person) return;
            
            const label = (this.mode === 'name') ? 
                (person.surname || "INCONNU").toUpperCase() : 
                (person.place || "Lieu Inconnu");
                
            if (!stats[label]) {
                stats[label] = { count: 0, color: n.color };
            }
            stats[label].count++;
        });

        Object.entries(stats)
            .sort((a, b) => b[1].count - a[1].count)
            .forEach(([label, data]) => {
                const badge = document.createElement('div');
                badge.style = "display:flex; align-items:center; gap:6px; background:#f8fafc; padding:4px 10px; border-radius:12px; font-size:11px; border:1px solid #edf2f7; color:#4a5568; white-space:nowrap;";
                badge.innerHTML = `
                    <span style="width:8px; height:8px; background:${data.color}; border-radius:50%; flex-shrink:0;"></span> 
                    <span><strong>${label}</strong> <span style="color:#a0aec0; font-size:0.9em;">(${data.count})</span></span>
                `;
                legendContainer.appendChild(badge);
            });
    }
};