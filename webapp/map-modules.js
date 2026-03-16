/**
 * MAP-MODULE.JS
 * Gestion de la cartographie Leaflet, des clusters et du filtrage
 */
window.MapModule = {
    map: null,
    clusters: null,
    allNodes: [],

    init(nodes) {
        console.log("[Map] Initialisation du module avec", nodes.length, "personnes.");
        this.allNodes = nodes;
        
        this.map = L.map('map').setView([46.6, 2.2], 6);

        // 2. Préparation de la couche GeoJSON (vide au début)
        // Elle est ajoutée en PREMIER pour être en dessous des marqueurs
        this.geoLayer = L.geoJSON(null, {
            style: {
                color: "#afb5bc",
                weight: 1,
                fillColor: "#f8fafc",
                fillOpacity: 0.1 // Très discret si OSM fonctionne
            }
        }).addTo(this.map);

        // --- C'EST ICI QUE L'ON PLACE LE CODE ---
        
        // On définit la couche OpenStreetMap sans l'ajouter tout de suite
        const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap'
        });

        // On écoute l'erreur : si les tuiles ne chargent pas (pas d'internet)
        osm.on('tileerror', () => {
            console.error("[Map] Erreur OSM (Hors-ligne ?) -> Affichage du fond GeoJSON");
            // On rend le GeoJSON bien visible pour qu'il serve de fond
            this.geoLayer.setStyle({ 
                fillOpacity: 0.9, 
                weight: 2,
                fillColor: "#e2e8f0" 
            });
        });

        // Enfin, on ajoute OSM à la carte
        osm.addTo(this.map);

        // --- FIN DU BLOC ---

        // Charger vos fichiers GeoJSON locaux
        this.loadGeoJSONData();

        if (typeof L.markerClusterGroup === 'function') {
            this.clusters = L.markerClusterGroup({
                showCoverageOnHover: false,
                zoomToBoundsOnClick: true,
                spiderfyOnMaxZoom: true
            });
        } else {
            console.error("[Map] Plugin MarkerCluster non trouvé.");
            this.clusters = L.layerGroup();
        }

        this.renderMarkers(this.allNodes);
        this.map.addLayer(this.clusters);
    },

    async loadGeoJSONData() {
        const files = ['departements-version-simplifiee.geojson', 'ch-districts.geojson']; 
        for (const file of files) {
            try {
                const response = await fetch(file);
                if (!response.ok) continue;
                const data = await response.json();
                this.geoLayer.addData(data);
                console.log(`[Map] ${file} chargé.`);
            } catch (e) {
                console.warn(`[Map] Impossible de charger ${file} (normal si absent).`);
            }
        }
    },

    renderMarkers(nodesToRender) {
        this.clusters.clearLayers();
        nodesToRender.forEach(person => {
            if (person.lat && person.lon) {
                const customIcon = L.divIcon({
                    className: 'custom-div-icon',
                    html: `<div class="map-marker-dot"></div>`,
                    iconSize: [12, 12]
                });

                const marker = L.marker([person.lat, person.lon], { icon: customIcon });
                marker.personData = person;

                marker.on('click', () => {
                    const coLocatedPeople = this.allNodes.filter(n => 
                        n.lat === person.lat && n.lon === person.lon
                    );
                    if (coLocatedPeople.length > 1) {
                        this.openClusterCarousel(coLocatedPeople);
                    } else {
                        this.openDetails(person);
                    }
                });
                this.clusters.addLayer(marker);
            }
        });
    },

	filterByLineage(allowedIds) {
        console.log("[Map] filterByLineage reçu :", allowedIds ? allowedIds.size : "RESET");
        
        const btn = document.getElementById('btn-reset-filter');

        if (!allowedIds) {
            this.renderMarkers(this.allNodes);
            if (btn) btn.style.display = 'none'; // On cache le bouton HTML
            return;
        }

        const filtered = this.allNodes.filter(n => allowedIds.has(n.id));
        
        if (this.clusters) {
            this.clusters.clearLayers();
            this.renderMarkers(filtered); 
            
            // On affiche le bouton HTML
            if (btn) {
                btn.style.display = 'block';
				btn.onclick = () => App.resetAllFilters();
                //btn.onclick = () => this.filterByLineage(null);
            }
        }
    },

    showResetButton() {
        if (document.getElementById('btn-reset-filter')) return;
        const btn = document.createElement('button');
        btn.id = 'btn-reset-filter';
        btn.className = 'btn-reset-filter';
        btn.innerHTML = "❌ Voir toute la famille";
        btn.onclick = () => this.filterByLineage(null);
        document.body.appendChild(btn);
    },

    openClusterCarousel(persons) {
        const infoZone = document.getElementById('sheet-info-zone');
        const nameElem = document.getElementById('sheet-name');
        const dateElem = document.getElementById('sheet-dates');
        const mainBtn = document.getElementById('btn-view-tree');

        nameElem.textContent = "Groupe de personnes";
        dateElem.textContent = `${persons.length} personnes ici`;
        if (mainBtn) mainBtn.parentElement.style.display = 'none';

        let html = `<div id="carousel-container" style="display: flex; overflow-x: auto; scroll-snap-type: x mandatory; gap: 15px; padding: 15px 5px; -webkit-overflow-scrolling: touch;">`;
        persons.forEach(p => {
            html += `
                <div style="min-width: 85%; scroll-snap-align: center; background: #f8fafc; padding: 15px; border-radius: 12px; border: 1px solid #e2e8f0; flex-shrink: 0; box-shadow: 0 2px 5px rgba(0,0,0,0.1); box-sizing: border-box;">
                    <div style="font-weight: bold; font-size: 1.1em; color: #2d3748; margin-bottom: 5px;">${p.firstname} ${p.surname.toUpperCase()}</div>
                    <div style="font-size: 0.9em; color: #718096; margin-bottom: 10px;">📅 ${p.displayBirth} ${p.displayDeath ? p.displayDeath + ' ' : ''}</div>
                    <div style="font-size: 0.8em; color: #4a5568; margin-bottom: 15px;">📍 ${p.place || 'Inconnu'}</div>
                    <button onclick="window.MapModule.selectAndGo('${p.id}')" style="width: 100%; padding: 12px; background: #2b6cb0; color: white; border: none; border-radius: 6px; font-weight: bold; cursor: pointer;">Voir l'arbre</button>
                </div>`;
        });
        html += `</div><p style="text-align: center; font-size: 0.75em; color: #a0aec0; margin-top: 5px;">← Glissez pour défiler →</p>`;

        if (infoZone) { infoZone.innerHTML = html; infoZone.style.display = 'block'; }
        this.showSheet();
    },

    openDetails(person) {
        App.currentPerson = person;
        document.getElementById('sheet-name').textContent = `${person.firstname} ${person.surname.toUpperCase()}`;
        document.getElementById('sheet-dates').textContent = `📅 ${person.displayBirth} ${person.displayDeath ? person.displayDeath + ' ' : ''}`;
        const infoZone = document.getElementById('sheet-info-zone');
        if (infoZone) {
            infoZone.innerHTML = `<p style="margin: 15px 0;">📍 ${person.place || 'Inconnu'}</p>`;
        }
        const mainBtn = document.getElementById('btn-view-tree');
        if (mainBtn) mainBtn.parentElement.style.display = 'block';
        this.showSheet();
    },

    selectAndGo(personId) {
            const person = this.allNodes.find(n => n.id === personId);
            if (person) {
                console.log("[Map] Sélection via carrousel :", person.firstname);
                
                // 1. Mettre à jour la personne courante dans l'App
                App.currentPerson = person;

                // 2. Récupérer les liens et calculer la lignée
                const links = App.fullData ? App.fullData.links : [];
                const lineageIds = window.getVerticalLineageIds(person.id, links);

                // 3. Appliquer le filtre sur la carte immédiatement
                this.filterByLineage(lineageIds);

                // 4. Fermer le carrousel/bottom sheet pour voir le résultat sur la carte
                closeBottomSheet();

                // 5. Optionnel : Si vous voulez que le carrousel RESTE sur la carte
                // au lieu d'aller sur l'arbre, commentez la ligne suivante :
                // App.viewTreeFromSelected(); 
                
                // Si vous préférez rester sur la carte, on centre juste la vue :
                if (person.lat && person.lon) {
                    this.map.setView([person.lat, person.lon], 12);
                }
            }
        },

    showSheet() {
        const sheet = document.getElementById('bottom-sheet');
        const overlay = document.getElementById('sheet-overlay');
        if (sheet) sheet.classList.remove('sheet-hidden');
        if (overlay) overlay.style.display = 'block';
    },

    refresh() {
        if (this.map) {
            setTimeout(() => this.map.invalidateSize(), 100);
        }
    }
};