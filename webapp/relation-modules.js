window.RelationModule = {
    selectedA: null,
    selectedB: null,

    init() {
        this.setupSearchB();
        
        // Fermer les résultats si on clique ailleurs
        document.addEventListener('mousedown', (e) => {
            const resB = document.getElementById('rel-results-b');
            if (resB && !e.target.closest('#rel-input-b')) {
                resB.style.display = 'none';
            }
        });
    },

    prepareView(sourcePerson) {
        // Appelé au changement d'onglet par App.js
        if (!sourcePerson) sourcePerson = App.currentPerson;
        
        if (sourcePerson) {
            this.selectedA = sourcePerson.id;
            const inputA = document.getElementById('rel-input-a');
            if (inputA) {
                inputA.value = `${sourcePerson.surname.toUpperCase()} ${sourcePerson.firstname} ( ${sourcePerson.displayBirth} ${sourcePerson.deceased ? sourcePerson.displayDeath : ''}) `;
            }
        }
    },

    setupSearchB() {
        const inputB = document.getElementById('rel-input-b');
        const resultsB = document.getElementById('rel-results-b');
        if (!inputB) return;

        inputB.addEventListener('input', (e) => {
            const query = e.target.value.toLowerCase().trim();
            if (query.length < 2) { resultsB.style.display = 'none'; return; }

            const matches = App.nodes.filter(n => 
                `${n.surname} ${n.firstname} ( ${n.displayBirth} ${n.deceased ? n.displayDeath : ''} )`.toLowerCase().includes(query)
            ).slice(0, 10);

            if (matches.length > 0) {
                resultsB.innerHTML = matches.map(n => `
                    <div style="padding: 12px; border-bottom: 1px solid #eee; cursor: pointer;"
                         onmousedown="RelationModule.selectPersonB('${n.id}', '${n.surname.toUpperCase()} ${n.firstname} ( ${n.displayBirth} ${n.deceased ? n.displayDeath : ''})  ')">
                        <strong>${n.surname.toUpperCase()}</strong> ${n.firstname} ( ${n.displayBirth} ${n.deceased ? n.displayDeath : ''} )
                    </div>
                `).join('');
                resultsB.style.display = 'block';
            } else {
                resultsB.style.display = 'none';
            }
        });
    },

    selectPersonB(id, fullName) {
        this.selectedB = id;
        const inputB = document.getElementById('rel-input-b');
        if (inputB) {
            inputB.value = fullName;
            document.getElementById('rel-results-b').style.display = 'none';
        }
    },

	resetPersonB() {
		console.log("[Relation] Réinitialisation de la cible B");
		
		// 1. On vide le champ texte
		const inputB = document.getElementById('rel-input-b');
		if (inputB) {
			inputB.value = "";
			inputB.focus(); // On redonne le focus pour une nouvelle saisie
		}

		// 2. On cache les résultats de recherche s'ils étaient ouverts
		const resultsB = document.getElementById('rel-results-b');
		if (resultsB) resultsB.style.display = 'none';

		// 3. On cache la zone de résultat du calcul précédent
		const resultZone = document.getElementById('relation-result-zone');
		if (resultZone) resultZone.style.display = 'none';

		// 4. IMPORTANT : On vide la variable interne qui stocke l'ID de la personne B
		// Selon comment tu as nommé ta variable interne (souvent selectionB ou personBId)
		this.selectedPersonB = null; 
	},

    executeSearch() {
        const zone = document.getElementById('relation-result-zone');
        const list = document.getElementById('path-list');

        // Sécurité contre l'erreur "style de null"
        if (!zone || !list) {
            alert("Erreur technique : les zones de résultat sont absentes du HTML.");
            return;
        }

        if (!this.selectedA || !this.selectedB) {
            alert("Veuillez sélectionner la personne B.");
            return;
        }

        const path = this.findShortestPath(this.selectedA, this.selectedB);
        
        zone.style.display = 'block';
        this.renderPath(path, list);
    },

    findShortestPath(startId, endId) {
        if (startId === endId) return [startId];
        let queue = [[startId]], visited = new Set([startId]);
        while (queue.length > 0) {
            let path = queue.shift();
            let node = path[path.length - 1];
            const neighbors = App.fullData.links
                .filter(l => l.source == node || l.target == node)
                .map(l => l.source == node ? l.target : l.source);
            for (let n of neighbors) {
                if (!visited.has(n)) {
                    if (n === endId) return [...path, n];
                    visited.add(n);
                    queue.push([...path, n]);
                }
            }
        }
        return null;
    },


	analyzeRelation(path) {
		if (!path || path.length < 2) return null;
		
		let hasSpouse = false;
		let upCount = 0;
		let downCount = 0;

		for (let i = 0; i < path.length - 1; i++) {
			const current = path[i];
			const next = path[i+1];
			
			// On cherche le lien exact entre ces deux personnes
			const link = App.fullData.links.find(l => 
				(l.source == current && l.target == next) || (l.source == next && l.target == current)
			);

			if (link) {
				// LOGIQUE DE PRIORITÉ : Si un seul lien est 'spouse', tout le trajet est 'alliance'
				if (link.type === 'spouse' || link.type === 'marriage') {
					hasSpouse = true;
				}
				if (link.type === 'parent') {
					if (link.target == next) downCount++; // On descend vers l'enfant
					else upCount++; // On monte vers le parent
				}
			}
		}

		// Détermination du titre et de la couleur
		let type = "Collatérale";
		let color = "#ed8936"; // Orange (Cousins, Oncles...)

		if (hasSpouse) {
			type = "Par alliance";
			color = "#ed64a6"; // Rose (Conjoint, Belle-famille)
		} else if (upCount > 0 && downCount === 0) {
			type = "Lignée directe (Ascendant)";
			color = "#48bb78"; // Vert (Parents, Grands-parents)
		} else if (downCount > 0 && upCount === 0) {
			type = "Lignée directe (Descendant)";
			color = "#4299e1"; // Bleu (Enfants, Petits-enfants)
		}

		console.log(`[Analysis] Up:${upCount}, Down:${downCount}, Alliance:${hasSpouse} -> Result: ${type}`);
		return { type, steps: path.length - 1, color };
	},


    renderPath(path, container) {
        if (!path) {
            container.innerHTML = "<div style='padding:20px; color:red; text-align:center;'>Aucun lien trouvé.</div>";
            return;
        }
		
		const analysis = this.analyzeRelation(path);
        
        // --- GÉNÉRATION DU HEADER D'ANALYSE ---
        let html = `
            <div style="background: ${analysis.color}; color: white; padding: 15px; border-radius: 12px; margin-bottom: 20px; text-align: center; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
                <div style="font-size: 10px; text-transform: uppercase; font-weight: bold; opacity: 0.9;">Type de relation</div>
                <div style="font-size: 18px; font-weight: 800; margin: 2px 0;">${analysis.type}</div>
                <div style="font-size: 12px;">Distance : <strong>${analysis.steps}</strong> génération(s) / étape(s)</div>
            </div>
        `;
		
        path.forEach((id, index) => {
            const p = App.nodes.find(n => n.id == id);
            let symbol = "●"; let color = "#2b6cb0";
            if (index > 0) {
                const prevId = path[index-1];
                const link = App.fullData.links.find(l => (l.source == prevId && l.target == id) || (l.source == id && l.target == prevId));
                if (link && link.type === "parent") {
                    symbol = (link.target == id) ? "▼" : "▲";
                    color = (symbol === "▲") ? "#4299e1" : "#48bb78";
                } else { symbol = "💍"; color = "#ed64a6"; }
            }
            html += `
                <div style="display:flex; align-items:center; background:#f8fafc; margin-bottom:10px; padding:10px; border-radius:8px; border-left:5px solid ${color};">
                    <div style="width:30px; font-size:18px; color:${color};">${symbol}</div>
                    <div>
                        <div style="font-size:14px; font-weight:bold;">${p.surname.toUpperCase()} ${p.firstname}</div>
                        <div style="font-size:12px; color:#666;">(${p.displayBirth || ''} ${p.deceased ? p.displayDeath : ''})</div>
                    </div>
                </div>`;
        });
        container.innerHTML = html;
        container.scrollIntoView({ behavior: 'smooth' });
    }
};