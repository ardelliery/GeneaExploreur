window.SearchModule = {
    allNodes: [],

    init(nodes) {
        console.log("[Search] Initialisation...");
        this.allNodes = nodes;
        const input = document.getElementById('mobile-search');
        const resultsContainer = document.getElementById('search-results');

        if (!input || !resultsContainer) {
            console.error("[Search] Éléments HTML introuvables");
            return;
        }

        input.addEventListener('input', (e) => {
            const query = e.target.value.toLowerCase().trim();
            if (query.length < 2) {
                resultsContainer.style.display = 'none';
                return;
            }
            this.search(query, resultsContainer);
        });
    },

    search(query, container) {
        const matches = this.allNodes.filter(n => {
            const fullName = `${n.firstname} ${n.surname}`.toLowerCase();
            return fullName.includes(query);
        }); // .slice(0, 10);

        if (matches.length === 0) {
            container.style.display = 'none';
            return;
        }

        container.innerHTML = '';
        matches.forEach(person => {
            const div = document.createElement('div');
            div.className = 'search-result-item';
            div.style.padding = '12px';
            div.style.borderBottom = '1px solid #eee';
            
            div.innerHTML = `
                <div style="font-weight: bold;">${person.firstname} ${person.surname.toUpperCase()} ( 📅 ${person.displayBirth} ${person.displayDeath ? person.displayDeath + ' ' : ''})</div>
                <div style="font-size: 0.85em; color: #666;">📍 ${person.place || 'Inconnu'}</div>
            `;

            // LE CLIC EST ICI
            div.onclick = (e) => {
                e.stopPropagation(); // Empêche les clics fantômes
                console.log("[Search] CLIC DÉTECTÉ sur :", person.id);

                // 1. On vérifie la source de données
                const links = (App.fullData && App.fullData.links) ? App.fullData.links : [];
                console.log("[Search] Liens trouvés pour le calcul :", links.length);

                // 2. Calcul de la lignée
                const lineageIds = window.getVerticalLineageIds(person.id, links);
                console.log("[Search] Lignée calculée (IDs) :", lineageIds);

                // 3. Application au MapModule
                if (window.MapModule) {
                    console.log("[Search] Envoi des IDs au MapModule...");
                    
                    // On définit la personne courante
                    App.currentPerson = person;

                    // Si on n'est pas sur la carte, on y va
                    if (App.currentView !== 'map') {
                        App.switchView('map');
                    }

                    // On lance le filtrage
                    window.MapModule.filterByLineage(lineageIds);
                    
                    // On centre et on ouvre
                    if (person.lat && person.lon) {
                        window.MapModule.map.setView([person.lat, person.lon], 12);
                    }
                    window.MapModule.openDetails(person);
                } else {
                    console.error("[Search] MapModule est introuvable au moment du clic !");
                }

                container.style.display = 'none';
            };

            container.appendChild(div);
        });

        container.style.display = 'block';
    }
};