/**
 * TREE-MODULES.JS - Version DEBUG
 */
window.TreeModule = {
    svg: null,
    container: null,
    g: null,
	data: null,

	init(data) {
        console.log("[Tree] Initialisation avec données");
        this.data = data;
        this.container = document.getElementById('tree-viz');
        
        if (!this.container) {
            console.error("DEBUG ERROR: Conteneur #tree-viz introuvable dans le DOM !");
            return;
        }

        d3.select('#tree-viz').selectAll('*').remove();
        const svg = d3.select('#tree-viz')
            .append('svg')
            .attr('width', '100%')
            .attr('height', '100%');

        this.g = svg.append('g');
        console.log("DEBUG: SVG et Groupe principal (g) créés avec succès");

        const zoom = d3.zoom().on('zoom', (e) => this.g.attr('transform', e.transform));
        svg.call(zoom);
    },

    buildHierarchy(person, allData, direction) {
        if (!person) {
            console.warn(`DEBUG: buildHierarchy (${direction}) - Personne est null`);
            return null;
        }
        
        console.log(`DEBUG: Construction ${direction} pour ${person.firstname} (ID: ${person.id})`);

        const node = { ...person, children: [] };
        const links = allData.links || [];
        const nodes = allData.nodes || [];

        if (direction === 'children') {
            const childLinks = links.filter(l => l.source === person.id && l.type === 'parent');
            console.log(`DEBUG: ${childLinks.length} liens enfants trouvés pour ${person.id}`);
            
            const ids = childLinks.map(l => l.target);
            const children = nodes.filter(n => ids.includes(n.id));
            node.children = children.map(c => this.buildHierarchy(c, allData, direction));
        } else {
            const parentLinks = links.filter(l => l.target === person.id && l.type === 'parent');
            console.log(`DEBUG: ${parentLinks.length} liens parents trouvés pour ${person.id}`);
            
            const ids = parentLinks.map(l => l.source);
            const parents = nodes.filter(n => ids.includes(n.id));
            node.children = parents.map(p => this.buildHierarchy(p, allData, direction));
        }
        return node;
    },

	render(centerPerson) {
        // On récupère les données soit en interne, soit via App
        const fullData = this.data || App.fullData;

        if (!fullData || !fullData.nodes) {
            console.error("[Tree] Erreur : Données manquantes pour le rendu de l'ID", centerPerson);
            return;
        } else { 
			console.log("[Tree]: OK fulldata disponibles");
		}

        console.log("--- DÉBUT RENDU ARBRE ---");
        console.log("DEBUG: Personne centre :", centerPerson);
        console.log("DEBUG: Données complètes reçues :", fullData);

        if (!centerPerson) {
            console.error("DEBUG ERROR: centerPerson est undefined !");
            return;
        }
        if (!fullData || !fullData.links || !fullData.nodes) {
            console.error("DEBUG ERROR: Structure de fullData invalide (manque nodes ou links) !");
            return;
        }
		this.data = fullData;

        this.init();

        const w = this.container.clientWidth || window.innerWidth;
        const h = this.container.clientHeight || window.innerHeight;
        console.log(`DEBUG: Taille détectée - Largeur: ${w}, Hauteur: ${h}`);

        // 1. Build Data
        const ancestorsData = this.buildHierarchy(centerPerson, fullData, 'parents');
        const descendantsData = this.buildHierarchy(centerPerson, fullData, 'children');

        // 2. D3 Hierarchy
        console.log("DEBUG: Transformation en hiérarchie D3...");
        const rootAncestors = d3.hierarchy(ancestorsData);
        const rootDescendants = d3.hierarchy(descendantsData);

        // 3. Layout
        const treeLayout = d3.tree().nodeSize([190, 180]);
        treeLayout(rootAncestors);
        treeLayout(rootDescendants);

        // Inversion Y ancêtres
        rootAncestors.descendants().forEach(d => d.y = -d.y);

        // 4. Centrage
        const chartGroup = this.g.append('g')
            .attr('transform', `translate(${w / 2}, ${h / 2})`);
        console.log("DEBUG: chartGroup centré ajouté au SVG");

        // 5. Dessin des liens
        console.log("DEBUG: Dessin des liens...");
        this.drawLinks(chartGroup, rootAncestors, 'ancestor-link');
        this.drawLinks(chartGroup, rootDescendants, 'descendant-link');

        // 6. Dessin des noeuds
        console.log("DEBUG: Dessin des nœuds...");
        this.drawNodes(chartGroup, rootAncestors, 'anc');
        this.drawNodes(chartGroup, rootDescendants, 'des');

        console.log("--- FIN RENDU ARBRE ---");
    },

    drawLinks(group, root, className) {
        const links = group.selectAll('.' + className)
            .data(root.links())
            .enter()
            .append('path')
            .attr('class', className)
            .attr('d', d3.linkVertical().x(d => d.x).y(d => d.y))
            .attr('fill', 'none')
            .attr('stroke', '#cbd5e0')
            .attr('stroke-width', 2);
        console.log(`DEBUG: ${root.links().length} liens dessinés pour ${className}`);
    },

    drawNodes(group, root, type) {
		console.log(`DEBUG: drawnodes ${root.surname}`);
        const nodes = group.selectAll('.node-' + type)
            .data(root.descendants())
            .enter()
            .append('g')
            .attr('transform', d => `translate(${d.x},${d.y})`)
			.style("cursor", "pointer")
            .on("click", (e, d) => this.render(d.data, this.data));

        nodes.append('rect')
			.attr('class', d => d.depth === 0 ? 'tree-rect is-center' : 'tree-rect')
            //.attr('class', 'tree-rect')
			.attr('x', -90).attr('y', -25).attr('width', 180).attr('height', 55)
            .attr('rx', 8)
            //.attr('fill', d => d.depth === 0 ? '#2b6cb0' : 'white')
            .attr('stroke', '#2b6cb0');

        nodes.append('text')
			.attr('class', 'tree-surname')
            .attr('dy', -8).attr('text-anchor', 'middle')
            //.attr('fill', d => d.depth === 0 ? 'white' : '#2d3748')
			//.style("font-size", "14px")
			.text(d => (d.data && d.data.surname) ? d.data.surname.toUpperCase() : "XXXX")
            //.text(d => d.data.surname.toUpperCase());

        nodes.append('text')
			.attr('class', 'tree-firstname')
            .attr('dy', 10).attr('text-anchor', 'middle')
            //.attr('fill', d => d.depth === 0 ? 'white' : '#2d3748')
			//.style("font-size", "10px")
            .text(d => d.data.firstname);

		// Dans TreeModule.drawNodes(...)
		nodes.append('text')
			.attr('class', 'tree-dates')
			.attr('dy', 25) // Position sous le nom
			.attr('text-anchor', 'middle')
			.text(d => `${d.data.displayBirth} ${d.data.displayDeath}`);

        console.log(`DEBUG: ${root.descendants().length} nœuds dessinés pour ${type}`);
    }
};