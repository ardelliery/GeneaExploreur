/**
 * APP.JS - Chef d'orchestre de la PWA Généalogie
 */
 
const App = {
    fullData: null,      // Objet complet {nodes, links}
    nodes: [],           // Liste simple des personnes
    currentPerson: null, // Personne actuellement sélectionnée

    async init() {
        console.log("Initialisation de l'application...");

        // 1. Astuce de Pro : Détection de mise à jour du Service Worker
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.addEventListener('controllerchange', () => {
                this.showToast("Mise à jour installée ! Actualisation...");
                setTimeout(() => window.location.reload(), 1500);
            });
        }

        // 2. Chargement des données JSON
		let response = null;
		let dataUrl = "data.json?v=" + new Date().getTime();
        try {
			response = await fetch(dataUrl);
			console.log("Response.ok = ", response.ok);
			if (!response.ok) {
				dataUrl = "data.json";
				response = await fetch(dataUrl);
				console.log("Response.ok = ", response.ok);
			}
			console.log("Données chargées avec succès depuis", dataUrl);
		} catch(err) {
			console.error("Erreur de chargement des données, tentative sans timestamp...");
			response = await fetch("data.json"); // Fallback immédiat
		}
		const rawData = await response.json();
		
		this.fullData = this.prepareFamilyData(rawData);
		this.nodes = this.fullData.nodes;

		// 3. Initialisation des modules
		MapModule.init(this.nodes);
		TreeModule.init(this.fullData); // PAS de données ici, juste l'initialisation du SVG
		RelationModule.init();
		SearchModule.init(this.nodes);
		console.log("Application prête !");
	//} catch (error) {
        //    this.showToast("Erreur de chargement des données.");
        //    console.error(error);
        //}
    },
	
	resetAllFilters() {
		console.log("[App] Réinitialisation globale des filtres");

		// 1. Vider le champ de recherche (tous les champs si vous en avez plusieurs)
		const searchInputs = document.querySelectorAll('#mobile-search');
		searchInputs.forEach(input => {
			input.value = '';
		});

		// 2. Réinitialiser la variable de personne courante
		this.currentPerson = null;

		// 3. Demander au MapModule de réafficher tout le monde
		if (window.MapModule) {
			window.MapModule.filterByLineage(null);
		}

		// 4. Si vous voulez aussi vider les résultats de recherche affichés
		const results = document.getElementById('search-results');
		if (results) results.style.display = 'none';

		this.showToast("Filtres réinitialisés");
	},
	
	prepareFamilyData(data) {
		// 1. Initialisation du calcul des dates (votre algo original)
		data.nodes.forEach(n => { 
			n.computedBirth = (n.birth > 0) ? n.birth : null; 
		});

		let changed = true; 
		let iterations = 0;
		while (changed && iterations < 10) {
			changed = false; 
			iterations++;
			data.links.forEach(link => {
				if (link.type !== "parent") return;
				const source = data.nodes.find(n => n.id === link.source);
				const target = data.nodes.find(n => n.id === link.target);
				if (!source || !target) return;

				if (source.computedBirth && !target.computedBirth) { 
					target.computedBirth = source.computedBirth + 30; 
					changed = true; 
				}
				else if (target.computedBirth && !source.computedBirth) { 
					source.computedBirth = target.computedBirth - 30; 
					changed = true; 
				}
			});
		}

		const avgBirth = d3.mean(data.nodes.filter(n => n.birth > 0), n => n.birth) || 1900;

		// 2. Génération des champs d'affichage définitifs
		data.nodes.forEach(n => {
			// Finalisation du computedBirth si toujours nul
			if (!n.computedBirth) n.computedBirth = Math.round(avgBirth);

			// A. Formatage Naissance (Ex: "1970" ou "~1940")
			if (n.birth > 0) {
				n.displayBirth = `${n.birth}`;
			} else {
				n.displayBirth = `~${Math.round(n.computedBirth)}`;
			}

			// B. Formatage Décès (Ex: "†" ou "† 1995")
			const isDead = (n.deceased === 1 || (n.death_year && n.death_year > 0));
			n.displayDeath = "";
			if (isDead) {
				n.displayDeath = "†"; // Caractère de la croix mortuaire
				if (n.death_year && n.death_year > 0) {
					n.displayDeath += ` ${n.death_year}`;
				}
			console.log(`DEBUG: ${n.surname} display : ${n.displayBirth} // ${n.displayDeath}`);
			}
		});
	    
		return data;
	},

    /**
     * Change de vue (Carte ou Arbre)
     */
	switchView(viewName) { 
		console.log("Tentative de passage à :", viewName); // Ligne 71 (exemple)

/* document.querySelectorAll('.app-view').forEach(s => s.style.display = 'none');
const target = document.getElementById(viewName + '-view');
if (target) {
    target.style.display = 'block';
    if (viewName === 'relation') RelationModule.prepareView(this.currentPerson);
}
 */
		this.currentView = viewName;
		console.log("[App] currentView est maintenant :", this.currentView);

		// On cache toutes les vues
		document.querySelectorAll('.app-view').forEach(view => {
			console.log("remove active :", view.classList); 
			view.classList.remove('active');
		});

		// On affiche la vue demandée
		const target = document.getElementById(viewName + '-view');
		if (target) {
			console.log("[App] Élément DOM activé :", `${viewName}-view`);
			target.classList.add('active');
		}

		// Initialisation spécifique selon la vue
		if (viewName === 'relation') {
			console.log("[App] Initialisation du module Relation pour :", this.currentPerson?.surname);
			// Au lieu de changer de vue, on ouvre la modale de parenté
			// On utilise la personne courante, ou la racine si vide
			RelationModule.prepareView(this.currentPerson);
			return; // On ne change pas l'onglet actif
		}
		
		if (viewName === 'map') {
			MapModule.refresh();
		} else if (viewName === 'tree') {
			console.log("[App] Initialisation du module Tree pour :", this.currentPerson?.surname);
			TreeModule.render(this.currentPerson);
		}
		
	},


    /**
     * Lance l'arbre généalogique à partir de la personne sélectionnée
     */
	viewTreeFromSelected() {
		if (this.currentPerson) {
			closeBottomSheet();
			// 1. On change de vue d'abord
			this.switchView('tree'); 
			
			// 2. On attend un tout petit peu que le navigateur affiche la section 
			// pour que clientWidth ne soit pas égal à 0
			setTimeout(() => {
				TreeModule.render(this.currentPerson, this.fullData);
			}, 100);
		}
	},
	
    /**
     * Affiche un message temporaire en bas de l'écran
     */
    showToast(message) {
        const toast = document.getElementById('toast');
        if (toast) {
            toast.innerText = message;
            toast.classList.add('show');
            setTimeout(() => toast.classList.remove('show'), 3000);
        }
    }
};

// Fermeture globale du Bottom Sheet (utilisée par les modules)
function closeBottomSheet() {
    const sheet = document.getElementById('bottom-sheet');
    const overlay = document.getElementById('sheet-overlay');
    if (sheet) sheet.classList.add('sheet-hidden');
    if (overlay) overlay.style.display = 'none';
}

window.getVerticalLineageIds = function(targetId, allLinks) {
    const familyIds = new Set();
    familyIds.add(targetId);

    if (!allLinks || allLinks.length === 0) {
        console.error("Aucun lien (links) trouvé pour calculer la lignée.");
        return familyIds;
    }

    // Remonter : l'enfant (target) donne le parent (source)
    function collectAncestors(id) {
        allLinks.forEach(l => {
            if (l.target === id && l.type === "parent") {
                if (!familyIds.has(l.source)) {
                    familyIds.add(l.source);
                    collectAncestors(l.source);
                }
            }
        });
    }

    // Descendre : le parent (source) donne l'enfant (target)
    function collectDescendants(id) {
        allLinks.forEach(l => {
            if (l.source === id && l.type === "parent") {
                if (!familyIds.has(l.target)) {
                    familyIds.add(l.target);
                    collectDescendants(l.target);
                }
            }
        });
    }

    collectAncestors(targetId);
    collectDescendants(targetId);
    
    console.log(`Lignée trouvée : ${familyIds.size} personnes`);
    return familyIds;
};

// Lancement au chargement de la page
window.onload = () => App.init();

let deferredPrompt;

window.addEventListener('beforeinstallprompt', (e) => {
  // Empêche Chrome d'afficher sa propre bannière
  e.preventDefault();
  // Garde l'événement pour l'utiliser plus tard
  deferredPrompt = e;
  
  // ICI : Fais apparaître un bouton "Installer" dans ton interface
  const installBtn = document.createElement('button');
  installBtn.innerText = "📲 Installer l'application";
  installBtn.style.position = "fixed";
  installBtn.style.bottom = "20px";
  installBtn.style.left = "20px";
  installBtn.style.zIndex = "9999";
  document.body.appendChild(installBtn);

  installBtn.addEventListener('click', async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        console.log('L\'utilisateur a installé l\'appli');
      }
      deferredPrompt = null;
      installBtn.remove();
    }
  });
});