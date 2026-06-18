/**
 * SANKEY-MODULES.JS 
 * Version Haute-Précision : Matrice de couleurs bivariée (RGB Géographique)
 * Fix : Highlighting autonome par isolation chirurgicale des classes graphiques (Anti-conflit Axe X)
 * Fix : Aperçu et application universelle de la luminosité via d3.hsl()
 * Fix : Duplication anti-consanguinité + stylisation en pointillés (stroke-dasharray) pour les branches dupliquées
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
                  
                    scaleA = d3.scaleLinear()
                      .domain([this.geoBounds.minLng, this.geoBounds.maxLng])
                      .range([-70, 70]); // Ouest -> Est (Vert vers Rouge)

                    scaleB = d3.scaleLinear()
                      .domain([this.geoBounds.minLat, this.geoBounds.maxLat])
                      .range([-70, 70]); // Sud -> Nord (Bleu vers Jaune)
                    
                    a = scaleA(lng);
                    b = scaleB(lat);
                    
                    lightness = 70;
                    console.log(`[Sankey Diagnostic] couleur : ${lat} ${lng} | lightness,a,b : ${lightness},${a},${b}`);
                    this.colorCache.locations[loc] = this.labToRgb(lightness, a, b);
                    
                    // Normalisation de la position de la ville entre 0.0 et 1.0 dans la zone familiale
                    //const rangeLat = this.geoBounds.maxLat - this.geoBounds.minLat || 1;
                    //const rangeLng = this.geoBounds.maxLng - this.geoBounds.minLng || 1;
                    
                    //const pctLat = (lat - this.geoBounds.minLat) / rangeLat;
                    //const pctLng = (lng - this.geoBounds.minLng) / rangeLng;

                    // FORMULE RGB BIVARIÉE
                    //const R = Math.round(60 + pctLng * 195);
                    //const B = Math.round(60 + pctLat * 195);
                    //const G = Math.round(140 + ((pctLat + pctLng) / 2) * 60);

                    //this.colorCache.locations[loc] = `rgb(${R}, ${G}, ${B})`;
                } else {
                    this.colorCache.locations[loc] = this.generateTextHashColor(loc, 60, 55);
                }
            }
        });
    },

    /**
     * Convertit des coordonnées LAB pures en chaîne "rgb(r,g,b)" standard
     * Formule physique de conversion standard (CIE XYZ vers sRGB)
     */
    labToRgb(l, a, b) {
        let y = (l + 16) / 116;
        let x = a / 500 + y;
        let z = y - b / 200;

        const fn = (v) => (v * v * v > 0.008856 ? v * v * v : (v - 16 / 116) / 7.787);
        x = 0.95047 * fn(x);
        y = 1.00000 * fn(y);
        z = 1.08883 * fn(z);

        // Matrice de transformation XYZ vers sRGB
        let r = x * 3.2406 + y * -1.5372 + z * -0.4986;
        let g = x * -0.9689 + y * 1.8758 + z * 0.0415;
        let bC = x * 0.0557 + y * -0.2040 + z * 1.0570;

        const adjust = (c) => Math.round(255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055));
        
        // On bride entre 0 et 255 pour éviter les bugs CSS
        return `rgb(${Math.max(0, Math.min(255, adjust(r)))}, ${Math.max(0, Math.min(255, adjust(g)))}, ${Math.max(0, Math.min(255, adjust(bC)))})`;
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

    /**
     * CORRECTION FIX : Clone de manière étanche les individus consanguins
     * Associe une métadonnée 'isConsanguineous' pour le rendu graphique ultérieur.
     */
/**
     * Version de diagnostic avec Logs Ultra-Précis
     * Permet de comprendre pourquoi le graphe ne change pas et de pister l'arbre généalogique.
     */
    prepareData(targetId) {
        console.log("%c[Sankey Diagnostic] --- DÉBUT DE PREPAREDATA ---", "background: #2b6cb0; color: white; padding: 4px; font-weight: bold;");
        console.log(`[Sankey Diagnostic] Individu cible : ${targetId} | Max Générations configurées : ${this.maxGenerations}`);
        
        let nodes = [];
        let links = [];
        let vus = new Set(); // Traque les ID réels de la base de données

        const traverse = (id, gen, forceConsanguineous = false) => {
            const indent = "  ".repeat(gen); // Pour une jolie lecture en arbre dans la console
            
            if (gen > this.maxGenerations) {
                console.log(`%c${indent}└─ [Stop] Génération ${gen} dépasse la limite (${this.maxGenerations})`, "color: #a0aec0;");
                return undefined;
            }
            
            const p = App.nodes.find(n => n.id === id);
            if (!p) {
                console.error(`${indent}X Individu introuvable dans App.nodes pour l'ID : ${id}`);
                return undefined;
            }

            // Détection : est-ce que cet ID réel a déjà été vu ailleurs dans l'arbre ?
            const dejavu = vus.has(id);
            if (dejavu) {
                console.log(`%c${indent}► [CONSAINGUINITÉ DÉTECTÉE] L'ID ${id} (${p.firstname} ${p.surname}) a déjà été croisé dans une autre branche !`, "background: #fff5f5; color: #c53030; font-weight: bold; border: 1px solid #fed7d7;");
            } else {
                vus.add(id);
            }

            // Un nœud est consanguin s'il a déjà été vu OU si son enfant direct l'était (cascade)
            const nodeIsConsanguineous = dejavu || forceConsanguineous;

            if (forceConsanguineous && !dejavu) {
                console.log(`%c${indent}↳ [CASCADE] ${p.firstname} ${p.surname} (ID: ${id}) est forcé en pointillé car c'est un ancêtre de la branche consanguine.`, "color: #dd6b20; font-style: italic;");
            }

            // Masse du flux stable pour éviter que le ruban ne s'amincisse
            const epaisseurFlux = 10 * Math.pow(2, this.maxGenerations - gen);

            // Génération d'une clé de graphe 100% unique pour D3
            const idUniqueGraphe = `${id}_gen${gen}_u${Math.random().toString(36).substr(2, 5)}`;

            const currentClone = {
                ...p,
                id_unique_graphe: idUniqueGraphe,
                id_original: id,
                name: `${p.firstname} ${p.surname.charAt(0)}.`,
                year: p.birth || p.computedBirth || 1900,
                color: this.getPersonColor(p),
                gen: gen,
                value: epaisseurFlux,
                isConsanguineous: nodeIsConsanguineous
            };

            nodes.push(currentClone);
            console.log(`${indent}✔ Création du nœud clone [${currentClone.name}] | Gen: ${gen} | ID Unique Graphe: ${idUniqueGraphe} | Pointillé: ${nodeIsConsanguineous}`);

            const parents = App.fullData.links.filter(l => l.target === id && l.type === "parent");
            console.log(`${indent}  Found ${parents.length} parents pour ${p.firstname}`);

            parents.forEach((l, index) => {
                console.log(`${indent}  Remontée vers le parent ${index + 1}/${parents.length} (ID Source: ${l.source})`);
                
                // TRANSMISSION EN CASCADE
                const parentClone = traverse(l.source, gen + 1, nodeIsConsanguineous);
                
                if (parentClone !== undefined) {
                    const valeurLien = 10 * Math.pow(2, this.maxGenerations - (gen + 1));
                    
                    links.push({
                        source: parentClone.id_unique_graphe,
                        target: currentClone.id_unique_graphe,
                        value: valeurLien,
                        isConsanguineous: nodeIsConsanguineous
                    });
                    
                    console.log(`%c${indent}  + Lien créé : [${parentClone.name}] (Gen ${gen+1}) ===> [${currentClone.name}] (Gen ${gen}) | Ruban Pointillé: ${nodeIsConsanguineous}`, "color: #319795;");
                }
            });
            
            return currentClone;
        };

        // Lancement de l'arbre
        traverse(targetId, 0, false);
        
        console.log("%c[Sankey Diagnostic] --- BILAN DES DONNÉES GÉNÉRÉES ---", "background: #2b6cb0; color: white; padding: 4px; font-weight: bold;");
        console.log(`[Sankey Diagnostic] Total Nœuds Clones : ${nodes.length}`);
        console.log(`[Sankey Diagnostic] Total Liens créés  : ${links.length}`);
        console.log("[Sankey Diagnostic] Liste complète des Nœuds :", nodes);
        console.log("[Sankey Diagnostic] Liste complète des Liens :", links);
        console.log("%c----------------------------------------------------", "color: #2b6cb0; font-weight: bold;");
        
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

        // Configuration D3-Sankey : On spécifie l'ID unique généré pour lier correctement les clones
        const sankey = d3.sankey()
            .nodeId(d => d.id_unique_graphe)
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
            .attr("stroke-opacity", d => d.isConsanguineous ? 0.35 : 0.6) // Un peu plus discret si consanguin
            // APPLICATION DU STYLE POINTILLÉ SUR LE RUBAN CONSAINGUIN
            .attr("stroke-dasharray", d => d.isConsanguineous ? "4,4" : "none");

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
            .attr("rx", 3)
            // APPLICATION DE LA BORDURE EN POINTILLÉ SUR LE BLOC CONSAINGUIN DUPLIQUÉ
            .attr("stroke", d => d.isConsanguineous ? "#4a5568" : "none")
            .attr("stroke-width", d => d.isConsanguineous ? "1.5px" : "0px")
            .attr("stroke-dasharray", d => d.isConsanguineous ? "3,3" : "none")
            .attr("stroke-opacity", d => d.isConsanguineous ? 0.8 : 1);

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
            .attr("stroke-opacity", d => (d.source && (isMatch(d.source) || isMatch(d.target))) ? 0.8 : (d.isConsanguineous ? 0.03 : 0.05)); // Gère le fondu si consanguin

        d3.select("#sankey-viz").selectAll(".sankey-rect")
            .transition().duration(200)
            .attr("stroke", d => isMatch(d) ? "#e53e3e" : (d.isConsanguineous ? "#4a5568" : "none"))
            .attr("stroke-width", d => isMatch(d) ? "2px" : (d.isConsanguineous ? "1.5px" : "0px"))
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
            .attr("stroke-opacity", d => d.isConsanguineous ? 0.35 : 0.6);

        d3.select("#sankey-viz").selectAll(".sankey-rect")
            .transition().duration(200)
            .attr("stroke", d => d.isConsanguineous ? "#4a5568" : "none")
            .attr("stroke-width", d => d.isConsanguineous ? "1.5px" : "0px")
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
                let hsl = d3.hsl(c); 
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
                let hsl = d3.hsl(c); 
                hsl.l = lightnessMod / 100;
                return hsl.toString();
            });

        d3.select("#sankey-viz").selectAll(".sankey-link")
            .style("stroke", d => {
                if (!d.source || !d.source.color) return "#ccc";
                let c = d3.color(d.source.color);
                if (!c) return d.source.color;
                let hsl = d3.hsl(c); 
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
     * Génère un SVG Haute Définition autonome avec correction universelle de la luminosité et inclusion des pointillés
     */
    processHighResExport() {
        if (!App.currentPerson) return alert("Aucune personne sélectionnée pour l'export.");
        console.log("{Sankey processHighResExport} Rendu du Sankey pour :", App.currentPerson ? `${App.currentPerson.firstname} ${App.currentPerson.surname}` : "Aucune personne cible");

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
        let minFontSize = 9;   

        if (format === 'A3') { exportWidth = 4960; exportHeight = 3508; maxFontSize = 36; }
        if (format === 'A2') { exportWidth = 7016; exportHeight = 4960; maxFontSize = 52; }
        if (format === 'A1') { exportWidth = 9933; exportHeight = 7016; maxFontSize = 74; }

        const exportMargin = { top: exportHeight * 0.05, right: exportWidth * 0.21, bottom: exportHeight * 0.16, left: exportWidth * 0.03 };
        const innerWidth = exportWidth - exportMargin.left - exportMargin.right;
        const innerHeight = exportHeight - exportMargin.top - exportMargin.bottom;

        const originalMaxGen = this.maxGenerations;
        this.maxGenerations = targetGen;
        const data = this.prepareData(App.currentPerson.id);
        console.log("{Sankey processHighResExport} Data preparees du Sankey  :", data );

        this.maxGenerations = originalMaxGen; 

        if (data.nodes.length === 0) return alert("Pas de données pour cette sélection.");

        data.nodes.forEach(n => {
            let c = d3.color(n.color);
            if (c) {
                let hsl = d3.hsl(c); 
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
            .nodeId(d => d.id_unique_graphe) // Appliqué également à la fonction d'exportation
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
            .attr("stroke-opacity", d => d.isConsanguineous ? 0.25 : 0.45)
            // STYLE EN POINTILLÉ POUR L'EXPORT HIGH-RES DU RUBAN
            .attr("stroke-dasharray", d => d.isConsanguineous ? "12,12" : "none"); // Valeurs plus grandes car résolution supérieure

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
            .attr("rx", 3)
            // STYLISATION DES BLOCS DUPLIQUÉS POUR L'EXPORT HIGH-RES
            .attr("stroke", d => d.isConsanguineous ? "#4a5568" : "none")
            .attr("stroke-width", d => d.isConsanguineous ? "3px" : "0px")
            .attr("stroke-dasharray", d => d.isConsanguineous ? "8,8" : "none");

        const textNode = g.append("g")
            .selectAll("g")
            .data(nodes)
            .join("g");

        textNode.each(function(d) {
            const currentG = d3.select(this);
            const nodeHeight = d.y1 - d.y0; // Hauteur totale du rectangle
            const nodeWidth = d.x1 - d.x0;   // Largeur (épaisseur) du rectangle

            if (d.gen === 0) {
                // =========================================================
                // CONFIGURATION POUR LA PERSONNE SÉLECTIONNÉE (3 LIGNES)
                // =========================================================
                const line1 = d.surname.toUpperCase();
                const line2 = d.firstname;
                const line3 = `(${d.year})`;

                // 1. DÉCALAGE HORIZONTAL OPTIMISÉ : Largeur du bloc + 10px de marge
                const safetyMarginX = nodeWidth + (maxFontSize * 2.5);
                const posX = d.x1 + safetyMarginX;
                const posY = (d.y1 + d.y0) / 2;

                // 2. LOGIQUE DE POLICE MAXIMALE : On cherche le nombre maximum de caractères parmi les 3 lignes
                const maxChars = Math.max(line1.length, line2.length, line3.length);
                
                // En SVG vertical (pivoté à -90°), la hauteur du bloc fait office de longueur pour le texte.
                // On estime qu'un caractère standard a un ratio d'aspect d'environ 0.55 à 0.6 fois sa hauteur.
                // On prend 98% (0.98) de la hauteur du bloc pour l'occuper au maximum sans aucune perte d'espace.
                const sizeBasedOnHeight = (nodeHeight * 0.98) / (maxChars * 0.58);
                
                // Sécurité : On peut brider la taille maximale pour éviter un texte disproportionné si le bloc est gigantesque
                const optimalSize = Math.min(maxFontSize * 2.5 , sizeBasedOnHeight);

                // Création du conteneur de texte avec son point d'ancrage décalé et sa rotation
                const textBlock = currentG.append("text")
                    .attr("x", posX)
                    .attr("y", posY)
                    .style("font-family", "system-ui, sans-serif")
                    .style("font-weight", "500") // Ultra-gras pour un effet design fort
                    .style("fill", "#1a202c")
                    .style("font-size", `${optimalSize}px`)
                    .style("text-anchor", "middle") // Centrage sur la hauteur grâce à la rotation
                    .attr("transform", `rotate(-90, ${posX}, ${posY})`);

                // Affichage de la Ligne 1 : NOM (Ligne de référence centrale)
                textBlock.append("tspan")
                    .text(line1)
                    .attr("x", posX)
                    .attr("dy", "-0.4em") // Légèrement décalée vers la gauche pour faire de la place aux autres
                    .style("font-weight", "900"); // <--- UNIQUEMENT LE NOM EN ULTRA-GRAS

                // Affichage de la Ligne 2 : Prénom
                textBlock.append("tspan")
                    .text(line2)
                    .attr("x", posX)
                    .style("font-style", "italic")
                    .attr("dy", "1.05em"); // Saut de ligne vers la droite

                // Affichage de la Ligne 3 : Date de naissance
                textBlock.append("tspan")
                    .text(line3)
                    .attr("x", posX)
                    .attr("dy", "1.05em"); // Deuxième saut de ligne vers la droite

            } else {
                // =========================================================
                // CONFIGURATION CLASSIQUE POUR LES AUTRES PERSONNES (1 LIGNE)
                // =========================================================
                const optimalSize = Math.min(maxFontSize, Math.max(minFontSize, nodeHeight * 1.2));
                
                currentG.append("text")
                    .attr("x", d.x1 + 10)
                    .attr("y", (d.y1 + d.y0) / 2)
                    .attr("dy", "0.35em")
                    .text(`${d.firstname} ${d.surname.toUpperCase()} (${d.year})`)
                    .style("font-family", "system-ui, sans-serif")
                    .style("font-weight", "600")
                    .style("fill", "#1a202c")
                    .style("font-size", `${optimalSize}px`)
                    .style("text-anchor", "start");
            }
        });            
        
        // =================================================================
        // LÉGENDE CARTOGRAPHIQUE VIA CHARGEMENT DE VRAIS GEOJSON (HD)
        // =================================================================
        
        // 1. Dimensions et positionnement du module de légende
        const mapBoxWidth = exportWidth * 0.18;   // Légèrement plus large pour le confort visuel
        const mapBoxHeight = exportWidth * 0.15;  
        const mapX = exportWidth - mapBoxWidth - (exportWidth * 0.02);
        const mapY = exportHeight - mapBoxHeight - (exportHeight * 0.07);

        const mapGroup = virtualSvg.append("g")
            .attr("id", "carto-legende")
            .attr("transform", `translate(${mapX}, ${mapY})`);

        // Cadre extérieur
        mapGroup.append("rect")
            .attr("width", mapBoxWidth)
            .attr("height", mapBoxHeight)
//            .attr("fill", "#ffffff")
            .attr("fill", "none")
//            .attr("stroke", "#cbd5e0")
            .attr("stroke", "none")
            .attr("stroke-width", "3px")
            .attr("rx", 14);

        // Titre de l'index
        mapGroup.append("text")
            .attr("x", mapBoxWidth / 2)
            .attr("y", maxFontSize * 0.8)
            .attr("text-anchor", "middle")
            .text("Origine Géographique")
            .style("font-family", "system-ui, sans-serif")
            .style("font-weight", "800")
            .style("font-size", `${maxFontSize * 0.55}px`)
            .style("fill", "#1a202c");

        // Zone d'affichage interne pour la carte (en laissant des marges pour le titre)
        const innerMapWidth = mapBoxWidth * 0.92;
        const innerMapHeight = mapBoxHeight - (maxFontSize * 1.4) - 20;
        
        const innerMapGroup = mapGroup.append("g")
            .attr("transform", `translate(${mapBoxWidth * 0.04}, ${maxFontSize * 1.2})`);

        // CHARGEMENT ET CORRÉLATION DES GEOJSON
        // Ajustez ici les chemins d'accès réels à vos fichiers localement
        const geojsonFranceUrl = "departements-version-simplifiee.geojson";
        const geojsonSuisseUrl = "ch-districts.geojson";

        // Comme le processus d'export d'origine attend un rendu synchrone pour le Canvas, 
        // nous encapsulons le chargement. Idéalement, pré-chargez ces fichiers ou traitez-les en Promise.
        Promise.all([
            d3.json(geojsonFranceUrl),
            d3.json(geojsonSuisseUrl)
        ]).then(([franceData, suisseData]) => {
            
            // Fusion temporaire des features pour calculer le cadrage global idéal de la projection
            const combinedFeatures = [...franceData.features, ...suisseData.features];
            const featureCollection = { type: "FeatureCollection", features: combinedFeatures };

            // Configuration de la projection Mercator calée précisément sur notre boîte SVG
            const projection = d3.geoMercator()
                .fitSize([innerMapWidth, innerMapHeight], featureCollection);

            // Générateur de chemins D3
            const geoPath = d3.geoPath().projection(projection);

            // Dessin des départements Français
            innerMapGroup.append("g")
                .attr("class", "france-layers")
                .selectAll("path")
                .data(franceData.features)
                .join("path")
                .attr("d", geoPath)
                .attr("fill", "#f8fafc")
//                .attr("fill", "none")
                .attr("stroke", "#cbd5e0")
                .attr("stroke-width", "0.5px") // Très fin pour ne pas saturer le dessin
                .attr("stroke-linejoin", "round");

            // Dessin des districts Suisses (avec une teinte de fond subtilement différente pour l'identification)
            innerMapGroup.append("g")
                .attr("class", "suisse-layers")
                .selectAll("path")
                .data(suisseData.features)
                .join("path")
                .attr("d", geoPath)
//                .attr("fill", "#f1f5f9")
                .attr("fill", "none")
                .attr("stroke", "#94a3b8")
                .attr("stroke-width", "0.5px")
                .attr("stroke-linejoin", "round");

            // Rajout d'une ligne de frontière nationale plus épaisse pour bien démarquer la France et la Suisse
            // D3 s'occupe de tout recalculer de manière transparente
            innerMapGroup.append("path")
                .datum(franceData)
                .attr("d", geoPath)
                .attr("fill", "none")
                .attr("stroke", "#475569")
                .attr("stroke-width", "2px");

            innerMapGroup.append("path")
                .datum(suisseData)
                .attr("d", geoPath)
                .attr("fill", "none")
                .attr("stroke", "#334155")
                .attr("stroke-width", "2px")
                .attr("stroke-dasharray", "4,3");

            // PLACEMENT DES PASTILLES ISSUES DU SANKEY
            const lieuxTraites = new Set();

            nodes.forEach(n => {
                const lat = n.lat || n.latitude || n.lieu_lat || n.lieu_latitude;
                const lng = n.lng || n.lon || n.longitude || n.lieu_lng || n.lieu_longitude;

                if (lat !== undefined && lng !== undefined && lat !== null && lng !== null) {
                    const parsedLat = parseFloat(lat);
                    const parsedLng = parseFloat(lng);

                    if (!isNaN(parsedLat) && !isNaN(parsedLng) && parsedLat !== 0) {
                        const cleUniqueLieu = `${parsedLat.toFixed(4)}_${parsedLng.toFixed(4)}_${n.color}`;
                        
                        if (!lieuxTraites.has(cleUniqueLieu)) {
                            lieuxTraites.add(cleUniqueLieu);

                            // La projection de D3 convertit instantanément [lng, lat] terrestres en pixels [X, Y]
                            // ATTENTION : D3 prend [Longitude, Latitude] dans cet ordre précis !
                            const coordsPixels = projection([parsedLng, parsedLat]);

                            if (coordsPixels) {
                                const [xPx, yPx] = coordsPixels;

                                // Sécurité pour s'assurer que le point projeté est bien dans les limites visibles
                                if (xPx >= 0 && xPx <= innerMapWidth && yPx >= 0 && yPx <= innerMapHeight) {
                                    
                                    // Taille idéale pour l'affichage en Haute Définition
                                    const pointRadius = Math.max(15, exportWidth * 0.002);

                                    // Création de la pastille de couleur avec liseré d'isolation blanc
                                    innerMapGroup.append("circle")
                                        .attr("cx", xPx)
                                        .attr("cy", yPx)
                                        .attr("r", pointRadius)
                                        .attr("fill", n.color)
                                        .attr("stroke", "#ffffff") 
                                        .attr("stroke-width", "1.5px");

                                    // Contour externe sombre pour détacher la couleur
                                    //innerMapGroup.append("circle")
                                    //    .attr("cx", xPx)
                                    //    .attr("cy", yPx)
                                    //    .attr("r", pointRadius + 1)
                                    //    .attr("fill", "none")
                                    //    .attr("stroke", "#1e293b") 
                                    //    .attr("stroke-width", "1px")
                                    //    .attr("opacity", 0.95);
                                }
                            }
                        }
                    }
                }
            });

            // Déclencher la suite de la génération de l'image (Canvas -> PDF) une fois que les GeoJSON sont dessinés
            continuePdfGeneration();

        }).catch(err => {
            console.error("Erreur lors du chargement des fichiers GeoJSON : ", err);
            // Secours : si les fichiers échouent, on génère le PDF sans la légende pour ne pas bloquer l'utilisateur
            continuePdfGeneration();
        });

        // Pour gérer l'asynchronisme des GeoJSON, isolez la fin de votre fonction originale dans cette sous-fonction :
        function continuePdfGeneration() {
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
                // Si la fonction closeExportModal existe dans votre classe
                if(typeof this.closeExportModal === "function") this.closeExportModal();
            };
        }
        
        return; // Stoppe l'exécution linéaire pour laisser le relais à continuePdfGeneration() après le traitement asynchrone

        // =================================================================
        // FIN DE LA LÉGENDE CARTOGRAPHIQUE
        // =================================================================

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