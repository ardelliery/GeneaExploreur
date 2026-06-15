/**
 * SANKEY-MODULES.JS 
 * Version Haute-Précision : Matrice de couleurs bivariée (RGB Géographique)
 * Fix : Highlighting autonome par isolation chirurgicale des classes graphiques (Anti-conflit Axe X)
 * Fix : Aperçu et application universelle de la luminosité via d3.hsl()
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
    modalTopColorsBase: [], // Stockage temporaire des couleurs initiales pour l'aperçu

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
                nodes.push({
                    ...p, 
                    name: `${p.firstname} ${p.surname.charAt(0)}.`,
                    year: p.birth || p.computedBirth || 1900,
                    color: this.getPersonColor(p),
                    gen: gen
                });
            }

            const parents = App.fullData.links.filter(l => l.target === id && l.type === "parent");
            parents.forEach(l => {
                const sourceIdx = traverse(l.source, gen + 1);
                if (sourceIdx !== undefined) {
                    links.push({
                        source: sourceIdx,
                        target: nodeMap.get(id),
                        value: 10 * Math.pow(2, this.maxGenerations - gen)
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
        
        this.currentHighlightValue = null; 

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

        let currentHeight = container.clientHeight;
        if (currentHeight <= 50) {
            const rect = container.getBoundingClientRect();
            const spaceLeftOnScreen = window.innerHeight - rect.top - 250; 
            currentHeight = spaceLeftOnScreen > 300 ? spaceLeftOnScreen : 500; 
        }
        const height = currentHeight - this.margin.top - this.margin.bottom;

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

        // Liens (Rubans)
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

        // Rectangles
        node.append("rect")
            .attr("class", "sankey-rect")
            .attr("x", d => d.x0)
            .attr("y", d => d.y0)
            .attr("height", d => Math.max(6, d.y1 - d.y0)) 
            .attr("width", d => d.x1 - d.x0)
            .attr("fill", d => d.color)
            .attr("rx", 3);

        // Textes
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

    updateGenerations(newGen) {
        this.maxGenerations = parseInt(newGen, 10); 
        const valBadge = document.getElementById('sankey-gen-val');
        if (valBadge) {
            const plural = this.maxGenerations > 1 ? 's' : '';
            valBadge.textContent = `${this.maxGenerations} génération${plural}`;
        }
        if (App.currentPerson) this.render(App.currentPerson);
    },

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

    highlightByValue(value) {
        if (!value) return;
        const valLower = value.trim().toLowerCase();

        if (this.currentHighlightValue === valLower) {
            this.resetHighlight();
            return;
        }
        this.currentHighlightValue = valLower;

        document.querySelectorAll('#sankey-legend .legend-item').forEach(badge => {
            const badgeVal = badge.getAttribute('data-value').trim().toLowerCase();
            if (badgeVal === valLower) {
                badge.style.borderColor = "#e53e3e";
                badge.style.background = "#fff5f5";
                badge.style.opacity = "1.0";
            } else {
                badge.style.borderColor = "#edf2f7";
                badge.style.background = "#f8fafc";
                badge.style.opacity = "0.2";
            }
        });

        const isMatch = (d3Node) => {
            if (!d3Node || typeof d3Node !== 'object') return false;
            const matchName = d3Node.surname && d3Node.surname.trim().toLowerCase() === valLower;
            const matchPlace = d3Node.place && d3Node.place.trim().toLowerCase() === valLower;
            return !!(matchName || matchPlace);
        };

        d3.select("#sankey-viz").selectAll(".sankey-link")
            .transition().duration(200)
            .attr("stroke", d => (d.source && (isMatch(d.source) || isMatch(d.target))) ? "#e53e3e" : (d.source ? d.source.color : "#ccc"))
            .attr("stroke-width", d => (d.source && (isMatch(d.source) || isMatch(d.target))) ? (Math.max(4, d.width) + 3) : Math.max(4, d.width))
            .attr("stroke-opacity", d => (d.source && (isMatch(d.source) || isMatch(d.target))) ? 0.8 : 0.05);

        d3.select("#sankey-viz").selectAll(".sankey-rect")
            .transition().duration(200)
            .attr("stroke", d => isMatch(d) ? "#e53e3e" : "none")
            .attr("stroke-width", d => isMatch(d) ? "2px" : "0px")
            .style("opacity", d => isMatch(d) ? 1 : 0.15);

        d3.select("#sankey-viz").selectAll(".sankey-text")
            .transition().duration(200)
            .style("fill", d => isMatch(d) ? "#e53e3e" : "#2d3748")
            .style("font-weight", d => isMatch(d) ? "bold" : "500")
            .style("opacity", d => isMatch(d) ? 1 : 0.2);
    },

    resetHighlight() {
        this.currentHighlightValue = null;

        document.querySelectorAll('#sankey-legend .legend-item').forEach(badge => {
            badge.style.borderColor = "#edf2f7";
            badge.style.background = "#f8fafc";
            badge.style.opacity = "1";
        });
        
        d3.select("#sankey-viz").selectAll(".sankey-link")
            .transition().duration(200)
            .attr("stroke", d => d.source ? d.source.color : "#ccc")
            .attr("stroke-width", d => Math.max(4, d.width))
            .attr("stroke-opacity", 0.6);

        d3.select("#sankey-viz").selectAll(".sankey-rect")
            .transition().duration(200)
            .attr("stroke", "none")
            .style("opacity", 1.0);

        d3.select("#sankey-viz").selectAll(".sankey-text")
            .transition().duration(200)
            .style("fill", "#2d3748")
            .style("font-weight", "500")
            .style("opacity", 1.0);
    },

    /**
     * Ouvre la modale d'export, pré-calcule le Top 10 et initialise l'aperçu dynamique
     */
    openExportModal() {
        const modal = document.getElementById('sankey-export-modal');
        if (!modal) return;

        // 1. Extraction des couleurs actuellement affichées à l'écran
        const container = document.getElementById('sankey-viz');
        const currentNodes = d3.select(container).selectAll(".sankey-rect").data();
        
        const colorCounts = {};
        currentNodes.forEach(n => {
            if (n.color) colorCounts[n.color] = (colorCounts[n.color] || 0) + 1;
        });

        // Mise en cache des couleurs de base pour pouvoir recalculer l'aperçu à la volée
        this.modalTopColorsBase = Object.entries(colorCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(entry => entry[0]);

        // 2. Premier rendu des vignettes de la modale avec la valeur par défaut du slider
        this.updateModalPreview();

        // 3. Écoute dynamique en temps réel des mouvements du slider de luminosité
        const lightnessSlider = document.getElementById('export-lightness');
        if (lightnessSlider && !lightnessSlider.dataset.listenerActive) {
            lightnessSlider.dataset.listenerActive = "true";
            lightnessSlider.addEventListener('input', () => {
                this.updateModalPreview();
            });
        }

        modal.style.display = 'flex';
    },

    /**
     * Calcule et applique la luminosité en temps réel sur la modale ET sur le graphique principal
     */
    updateModalPreview() {
        const swatchContainer = document.getElementById('modal-top-colors');
        const lightnessSlider = document.getElementById('export-lightness');
        if (!swatchContainer || !lightnessSlider) return;

        const lightnessMod = parseInt(lightnessSlider.value, 10);

        const badge = document.getElementById('export-lightness-val');
        if (badge) badge.textContent = `${lightnessMod}%`;

        // 1. Mise à jour des vignettes de couleur dans la modale
        swatchContainer.innerHTML = '';
        this.modalTopColorsBase.forEach(baseColor => {
            let c = d3.color(baseColor);
            let targetColor = baseColor;
            if (c) {
                let hsl = d3.hsl(c); // CORRECTION : d3.hsl(c) au lieu de c.hsl()
                hsl.l = lightnessMod / 100; 
                targetColor = hsl.toString();
            }

            const swatch = document.createElement('div');
            swatch.className = 'color-swatch';
            swatch.style.backgroundColor = targetColor;
            swatch.style.width = '24px';
            swatch.style.height = '24px';
            swatch.style.borderRadius = '6px';
            swatch.style.border = '1px solid #cbd5e1';
            swatch.title = `Luminosité modifiée (${lightnessMod}%)`;
            swatchContainer.appendChild(swatch);
        });

        // 2. MISE À JOUR DE L'APERÇU VISUEL DIRECT (Sur le graphique principal derrière la modale)
        d3.select("#sankey-viz").selectAll(".sankey-rect")
            .style("fill", d => {
                let c = d3.color(d.color);
                if (!c) return d.color;
                let hsl = d3.hsl(c); // CORRECTION : d3.hsl(c) au lieu de c.hsl()
                hsl.l = lightnessMod / 100;
                return hsl.toString();
            });

        d3.select("#sankey-viz").selectAll(".sankey-link")
            .style("stroke", d => {
                if (!d.source || !d.source.color) return "#ccc";
                let c = d3.color(d.source.color);
                if (!c) return d.source.color;
                let hsl = d3.hsl(c); // CORRECTION : d3.hsl(c) au lieu de c.hsl()
                hsl.l = lightnessMod / 100;
                return hsl.toString();
            });
    },

    /**
     * Ferme la modale d'export et réinitialise l'aperçu graphique
     */
    closeExportModal() {
        const modal = document.getElementById('sankey-export-modal');
        if (modal) modal.style.display = 'none';
        
        if (App.currentPerson) this.render(App.currentPerson);
    },

    /**
     * Génère un SVG Haute Définition autonome avec correction universelle de la luminosité
     */
    processHighResExport() {
        if (!App.currentPerson) return alert("Aucune personne sélectionnée pour l'export.");

        if (!window.jspdf) {
            const script = document.createElement('script');
            script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
            script.onload = () => this.processHighResExport();
            document.head.appendChild(script);
            return;
        }

        const format = document.getElementById('export-format').value;
        const targetGen = parseInt(document.getElementById('export-generations').value, 10);
        const lightnessMod = parseInt(document.getElementById('export-lightness').value, 10);

        let exportWidth = 3508;  
        let exportHeight = 2480;
        let maxFontSize = 24;   

        if (format === 'A3') { exportWidth = 4960; exportHeight = 3508; maxFontSize = 36; }
        if (format === 'A2') { exportWidth = 7016; exportHeight = 4960; maxFontSize = 52; }
        if (format === 'A1') { exportWidth = 9933; exportHeight = 7016; maxFontSize = 74; }

        const exportMargin = { top: exportHeight * 0.05, right: exportWidth * 0.16, bottom: exportHeight * 0.06, left: exportWidth * 0.03 };
        const innerWidth = exportWidth - exportMargin.left - exportMargin.right;
        const innerHeight = exportHeight - exportMargin.top - exportMargin.bottom;

        const originalMaxGen = this.maxGenerations;
        this.maxGenerations = targetGen;
        const data = this.prepareData(App.currentPerson.id);
        this.maxGenerations = originalMaxGen; 

        if (data.nodes.length === 0) return alert("Pas de données pour cette sélection.");

        data.nodes.forEach(n => {
            let c = d3.color(n.color);
            if (c) {
                let hsl = d3.hsl(c); // CORRECTION : d3.hsl(c) au lieu de c.hsl()
                hsl.l = lightnessMod / 100; 
                n.color = hsl.toString();
            }
        });

        const nodesPerGen = {};
        data.nodes.forEach(n => { nodesPerGen[n.gen] = (nodesPerGen[n.gen] || 0) + 1; });
        const maxNodesInColumn = Math.max(...Object.values(nodesPerGen), 1);
        let dynamicPadding = (innerHeight * 0.25) / maxNodesInColumn;
        dynamicPadding = Math.max(3, Math.min(dynamicPadding, exportHeight * 0.015));

        const virtualSvg = d3.create("svg")
            .attr("xmlns", "http://www.w3.org/2000/svg")
            .attr("width", exportWidth)
            .attr("height", exportHeight)
            .style("background-color", "#ffffff");

        const g = virtualSvg.append("g")
            .attr("transform", `translate(${exportMargin.left},${exportMargin.top})`);

        const xScale = d3.scaleLinear()
            .domain([d3.min(data.nodes, d => d.year), d3.max(data.nodes, d => d.year)])
            .range([0, innerWidth]);

        const sankey = d3.sankey()
            .nodeWidth(exportWidth * 0.012) 
            .nodePadding(dynamicPadding) 
            .extent([[0, 0], [innerWidth, innerHeight]])
            .iterations(16); 

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

        nodes.forEach(n => { n.parents = []; });
        links.forEach(l => { l.target.parents.push(l.source); });

        const rootNode = nodes.find(n => n.gen === 0);
        if (!rootNode) return alert("Erreur de structure de l'arbre.");

        nodes.forEach(n => {
            n.parents.sort((a, b) => a.y0 - b.y0);
        });

        function calculateSubtreeHeight(node) {
            let baseH = node.y1 - node.y0;
            if (!node.parents || node.parents.length === 0) {
                node.subtreeHeight = baseH;
                return node.subtreeHeight;
            }
            
            let parentsHeightSum = 0;
            node.parents.forEach(p => {
                parentsHeightSum += calculateSubtreeHeight(p);
            });
            
            let totalPadding = dynamicPadding * (node.parents.length - 1);
            node.subtreeHeight = Math.max(baseH, parentsHeightSum + totalPadding);
            return node.subtreeHeight;
        }
        calculateSubtreeHeight(rootNode);

        function assignPositions(node, startY) {
            let nodeH = node.y1 - node.y0;
            let centerY = startY + node.subtreeHeight / 2;
            
            node.y0 = centerY - nodeH / 2;
            node.y1 = centerY + nodeH / 2;
            
            if (node.parents && node.parents.length === 1) {
                assignPositions(node.parents[0], startY + (node.subtreeHeight - node.parents[0].subtreeHeight) / 2);
            } else if (node.parents && node.parents.length > 1) {
                let totalParentsH = d3.sum(node.parents, p => p.subtreeHeight) + dynamicPadding * (node.parents.length - 1);
                let offset = (node.subtreeHeight - totalParentsH) / 2;
                let currentY = startY + offset;
                
                node.parents.forEach(p => {
                    assignPositions(p, currentY);
                    currentY += p.subtreeHeight + dynamicPadding;
                });
            }
        }
        
        assignPositions(rootNode, 0);

        let globalMinY = d3.min(nodes, d => d.y0);
        let globalMaxY = d3.max(nodes, d => d.y1);
        let totalTreeHeight = globalMaxY - globalMinY;
        let availableHeight = innerHeight * 0.94;
        let targetCenter = innerHeight / 2;

        if (totalTreeHeight > availableHeight) {
            let globalScaleY = availableHeight / totalTreeHeight;
            nodes.forEach(n => {
                n.y0 = targetCenter + (n.y0 - (globalMinY + globalMaxY) / 2) * globalScaleY;
                n.y1 = targetCenter + (n.y1 - (globalMinY + globalMaxY) / 2) * globalScaleY;
            });
            links.forEach(l => {
                l.width *= globalScaleY;
            });
        } else {
            let currentCenter = (globalMinY + globalMaxY) / 2;
            let shiftY = targetCenter - currentCenter;
            nodes.forEach(n => {
                n.y0 += shiftY;
                n.y1 += shiftY;
            });
        }

        sankey.update({ nodes, links });

        const xAxis = d3.axisBottom(xScale).ticks(6).tickFormat(d => d);
        g.append("g")
            .attr("transform", `translate(0, ${innerHeight + 20})`)
            .call(xAxis)
            .style("color", "#4a5568")
            .style("stroke-width", "2px")
            .selectAll("text")
            .style("font-size", `${maxFontSize * 0.6}px`)
            .style("font-family", "system-ui, sans-serif");

        g.append("g")
            .attr("fill", "none")
            .selectAll("path")
            .data(links)
            .join("path")
            .attr("d", d3.sankeyLinkHorizontal())
            .attr("stroke", d => d.source.color)
            .attr("stroke-width", d => Math.max(1.5, d.width))
            .attr("stroke-opacity", 0.45);

        const node = g.append("g")
            .selectAll("g")
            .data(nodes)
            .join("g");

        node.append("rect")
            .attr("x", d => d.x0)
            .attr("y", d => d.y0)
            .attr("height", d => Math.max(2, d.y1 - d.y0))
            .attr("width", d => d.x1 - d.x0)
            .attr("fill", d => d.color)
            .attr("rx", 3);

        node.append("text")
            .attr("x", d => d.x1 + 10)
            .attr("y", d => (d.y1 + d.y0) / 2)
            .attr("dy", "0.35em")
            .text(d => `${d.firstname} ${d.surname.toUpperCase()} (${d.year})`)
            .style("font-family", "system-ui, sans-serif")
            .style("font-weight", "600")
            .style("fill", "#1a202c")
            .style("font-size", d => {
                const nodeHeight = d.y1 - d.y0;
                const optimalSize = Math.min(maxFontSize, Math.max(10, nodeHeight * 1.2));
                return `${optimalSize}px`;
            })
            .style("display", d => (d.y1 - d.y0 < 6) ? "none" : "block");

        const svgString = virtualSvg.node().outerHTML;
        const svgBlob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
        const blobUrl = URL.createObjectURL(svgBlob);

        const img = new Image();
        img.src = blobUrl;
        img.onload = () => {
            const canvas = document.createElement("canvas");
            canvas.width = exportWidth;
            canvas.height = exportHeight;
            const ctx = canvas.getContext("2d");
            ctx.fillStyle = "#ffffff";
            ctx.fillRect(0, 0, exportWidth, exportHeight);
            ctx.drawImage(img, 0, 0);

            const imgData = canvas.toDataURL("image/png");

            const { jsPDF } = window.jspdf;
            const pdf = new jsPDF({
                orientation: "landscape",
                unit: "px",
                format: [exportWidth, exportHeight]
            });

            pdf.addImage(imgData, "PNG", 0, 0, exportWidth, exportHeight);
            pdf.save(`Arbre_Sankey_Topologique_${format}_${App.currentPerson.surname}.pdf`);

            URL.revokeObjectURL(blobUrl);
            this.closeExportModal();
        };
    }
};