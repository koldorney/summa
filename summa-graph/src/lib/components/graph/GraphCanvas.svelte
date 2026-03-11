<script lang="ts">
	import { onMount } from 'svelte';
	import * as d3 from 'd3';
	import { selectedNode, expandedNodes, breadcrumbPath, navigateToNode, viewMode, orderingMode } from '$lib/stores/app';
	import { NODE_VISUALS, TYPE_LABELS } from '$lib/config';
	import type { SummaIndex } from '$lib/data';
	import type { SummaNode, NodeType, ViewMode, OrderingMode } from '$lib/types';

	interface Props { index: SummaIndex | null; }
	let { index }: Props = $props();

	let container: HTMLDivElement;
	let svgElement: SVGSVGElement;
	let width = $state(0);
	let height = $state(0);

	let svg: d3.Selection<SVGSVGElement, unknown, null, undefined>;
	let g: d3.Selection<SVGGElement, unknown, null, undefined>;
	let labelGroup: d3.Selection<SVGGElement, unknown, null, undefined>;
	let linkGroup: d3.Selection<SVGGElement, unknown, null, undefined>;
	let nodeGroup: d3.Selection<SVGGElement, unknown, null, undefined>;
	let simulation: d3.Simulation<GNode, GLink>;
	let zoomBehavior: d3.ZoomBehavior<SVGSVGElement, unknown>;

	let graphNodes: GNode[] = [];
	let graphLinks: GLink[] = [];
	let expanded = new Set<string>();
	let selectedId = '';
	let initialized = false;
	let currentView: ViewMode = 'hierarchical';
	let currentOrdering: OrderingMode = 'theological';

	let ttVisible = $state(false);
	let ttX = $state(0);
	let ttY = $state(0);
	let ttNode: SummaNode | null = $state(null);

	interface GNode extends d3.SimulationNodeDatum {
		id: string;
		data: SummaNode;
		type: NodeType;
		// Density view: scaled radius
		_radius?: number;
	}
	interface GLink extends d3.SimulationLinkDatum<GNode> {
		source: GNode | string;
		target: GNode | string;
		_similarity?: number;
	}

	// ═══ Lifecycle ═══════════════════════════════════════════

	onMount(() => {
		if (!svgElement || !container) return;
		width = container.clientWidth;
		height = container.clientHeight;
		const ro = new ResizeObserver((entries) => {
			for (const e of entries) {
				width = e.contentRect.width;
				height = e.contentRect.height;
				simulation?.force('center', d3.forceCenter(width / 2, height / 2));
				simulation?.alpha(0.1).restart();
			}
		});
		ro.observe(container);
		return () => { ro.disconnect(); simulation?.stop(); };
	});

	$effect(() => {
		if (index && svgElement && width > 0 && !initialized) {
			initialized = true;
			initD3();
			rebuildForView($viewMode, $orderingMode);
		}
	});

	// View / ordering changes → full rebuild
	$effect(() => {
		const vm = $viewMode;
		const om = $orderingMode;
		if (!initialized || !index) return;
		if (vm !== currentView || om !== currentOrdering) {
			currentView = vm;
			currentOrdering = om;
			rebuildForView(vm, om);
		}
	});

	$effect(() => {
		const target = $navigateToNode;
		if (!target || !index || !initialized) return;
		setTimeout(() => navigateToNode.set(null), 0);
		doNavigate(target);
	});

	$effect(() => {
		const newId = $selectedNode?.id ?? '';
		if (newId !== selectedId) { selectedId = newId; updateHighlight(); }
	});

	// ═══ D3 Init ═════════════════════════════════════════════

	function initD3() {
		svg = d3.select(svgElement).attr('width', width).attr('height', height);
		const defs = svg.append('defs');
		const glow = defs.append('filter').attr('id', 'glow')
			.attr('x', '-50%').attr('y', '-50%').attr('width', '200%').attr('height', '200%');
		glow.append('feGaussianBlur').attr('stdDeviation', '3').attr('result', 'blur');
		const mg = glow.append('feMerge');
		mg.append('feMergeNode').attr('in', 'blur');
		mg.append('feMergeNode').attr('in', 'SourceGraphic');

		g = svg.append('g');
		labelGroup = g.append('g').attr('class', 'cluster-labels');
		linkGroup = g.append('g');
		nodeGroup = g.append('g');

		zoomBehavior = d3.zoom<SVGSVGElement, unknown>()
			.scaleExtent([0.03, 8])
			.on('zoom', (e) => g.attr('transform', e.transform));
		svg.call(zoomBehavior);
		svg.on('click', (e: MouseEvent) => { if (e.target === svgElement) selectedNode.set(null); });

		simulation = d3.forceSimulation<GNode, GLink>(graphNodes)
			.force('link', d3.forceLink<GNode, GLink>(graphLinks).id(d => d.id))
			.force('charge', d3.forceManyBody<GNode>())
			.force('center', d3.forceCenter(width / 2, height / 2))
			.force('collision', d3.forceCollide<GNode>())
			.alphaDecay(0.025)
			.on('tick', ticked);
	}

	/** Reconfigure simulation forces for the current view */
	function configureForces(view: ViewMode) {
		if (!simulation) return;
		const linkForce = simulation.force('link') as d3.ForceLink<GNode, GLink>;
		const chargeForce = simulation.force('charge') as d3.ForceManyBody<GNode>;
		const collisionForce = simulation.force('collision') as d3.ForceCollide<GNode>;

		if (view === 'hierarchical') {
			linkForce
				.distance(d => { const t = (d.target as GNode).type; return t === 'question' ? 130 : t === 'article' ? 70 : 45; })
				.strength(d => (d.target as GNode).type === 'question' ? 0.25 : 0.5);
			chargeForce.strength(d => {
				switch (d.type) { case 'part': return -1000; case 'question': return -100; case 'article': return -50; default: return -25; }
			});
			collisionForce.radius(d => NODE_VISUALS[d.type].radius + 3);
		} else if (view === 'treatise') {
			linkForce
				.distance(d => { const t = (d.target as GNode).type; return t === 'treatise' ? 160 : t === 'question' ? 80 : t === 'article' ? 55 : 40; })
				.strength(d => { const t = (d.target as GNode).type; return t === 'treatise' ? 0.2 : t === 'question' ? 0.35 : 0.5; });
			chargeForce.strength(d => {
				switch (d.type) { case 'part': return -1200; case 'treatise': return -400; case 'question': return -80; case 'article': return -40; default: return -20; }
			});
			collisionForce.radius(d => (d._radius || NODE_VISUALS[d.type].radius) + 3);
		} else if (view === 'density') {
			linkForce.distance(50).strength(0.4);
			chargeForce.strength(d => -(d._radius || 10) * 8);
			collisionForce.radius(d => (d._radius || 10) + 4);
		}
	}

	// ═══ View Builders ═══════════════════════════════════════

	function rebuildForView(view: ViewMode, ordering: OrderingMode) {
		graphNodes.length = 0;
		graphLinks.length = 0;
		expanded.clear();
		selectedNode.set(null);
		breadcrumbPath.set([]);
		labelGroup?.selectAll('*').remove();
		linkGroup?.selectAll('*').remove();

		if (view === 'hierarchical') buildParts();
		else if (view === 'treatise') buildTreatiseView(ordering);
		else if (view === 'density') buildDensityView();

		configureForces(view);
		render();
		if (svg && zoomBehavior) svg.transition().duration(400).call(zoomBehavior.transform, d3.zoomIdentity);
	}

	function buildParts() {
		if (!index) return;
		const parts = index.getParts();
		parts.forEach((p, i) => {
			const a = (i / parts.length) * 2 * Math.PI;
			graphNodes.push({ id: p.id, data: p, type: p.type, x: width/2 + Math.cos(a)*180, y: height/2 + Math.sin(a)*180 });
		});
	}

	function buildTreatiseView(ordering: OrderingMode) {
		if (!index) return;
		const allTreatises = index.getAllTreatises();

		// Sort treatises
		let sorted = ordering === 'density'
			? [...allTreatises].sort((a, b) => b.objectionCount - a.objectionCount)
			: allTreatises; // already in theological order from the data

		// Part order for theological grouping
		const partOrder = ['I', 'I-II', 'II-II', 'III', 'Suppl'];
		const partNames: Record<string, string> = { 'I': 'Prima Pars', 'I-II': 'Prima Secundae', 'II-II': 'Secunda Secundae', 'III': 'Tertia Pars', 'Suppl': 'Supplement' };

		// Layout: arrange treatises in a large circle
		const n = sorted.length;
		sorted.forEach((t, i) => {
			const angle = (i / n) * 2 * Math.PI - Math.PI / 2;
			const radius = 350;
			const virtualNode: SummaNode = {
				id: `treatise:${t.key}`,
				type: 'treatise',
				partId: t.partId,
				label: t.name,
				treatise: t.name,
				depth: 1,
				questionCount: t.questions.length,
				articleCount: t.articleCount,
				objectionCount: t.objectionCount,
			};
			graphNodes.push({
				id: virtualNode.id,
				data: virtualNode,
				type: 'treatise',
				x: width/2 + Math.cos(angle) * radius,
				y: height/2 + Math.sin(angle) * radius,
			});
		});
	}

	function buildDensityView() {
		if (!index) return;
		const topArticles = index.getTopArticlesByDensity(80);
		const maxObjs = topArticles[0]?.objectionCount || 1;

		topArticles.forEach((art, i) => {
			const cols = 10;
			const row = Math.floor(i / cols);
			const col = i % cols;
			const r = 8 + ((art.objectionCount || 1) / maxObjs) * 30;
			graphNodes.push({
				id: art.id,
				data: art,
				type: art.type,
				_radius: r,
				x: width/2 + (col - cols/2) * 80,
				y: height/2 + (row - 3) * 80,
			});
		});
	}

	async function buildDependencyView() {
		if (!index) return;
		const topArticles = await index.getMostReferencedArticles(50);
		const allRefs = await index.getArticleRefs();
		const maxRefs = topArticles[0]?.incomingCount || 1;

		// Build node set
		const nodeIds = new Set(topArticles.map(a => a.node.id));

		topArticles.forEach((item, i) => {
			const angle = (i / topArticles.length) * 2 * Math.PI - Math.PI / 2;
			const radius = 300;
			const r = 8 + (item.incomingCount / maxRefs) * 25;
			const art = item.node;
			graphNodes.push({
				id: art.id,
				data: { ...art, objectionCount: item.incomingCount, replyCount: item.outgoingCount },
				type: art.type,
				_radius: r,
				x: width/2 + Math.cos(angle) * radius,
				y: height/2 + Math.sin(angle) * radius,
			});
		});

		// Add only refs between visible nodes
		for (const ref of allRefs) {
			if (nodeIds.has(ref.source) && nodeIds.has(ref.target) && ref.source !== ref.target) {
				graphLinks.push({ source: ref.source, target: ref.target });
			}
		}
	}

	// Part color palette for conceptual view clusters
	const PART_COLORS: Record<string, string> = {
		'I': '#c9a84c',     // gold
		'I-II': '#7ab8a8',  // teal
		'II-II': '#b07aaf', // mauve
		'III': '#cf7c5e',   // copper
		'Suppl': '#8a9abf', // steel blue
	};

	async function buildConceptualView() {
		if (!index) return;
		const hubs = await index.getConceptualHubs(60, 0.18);
		const allEdges = await index.getConceptEdges();
		const maxConn = hubs[0]?.connectionCount || 1;

		const nodeIds = new Set(hubs.map(h => h.node.id));

		hubs.forEach((item, i) => {
			const angle = (i / hubs.length) * 2 * Math.PI - Math.PI / 2;
			const r = 8 + (item.connectionCount / maxConn) * 22;
			const art = item.node;
			graphNodes.push({
				id: art.id,
				data: { ...art, objectionCount: item.connectionCount },
				type: art.type,
				_radius: r,
				x: width/2 + Math.cos(angle) * 320,
				y: height/2 + Math.sin(angle) * 320,
			});
		});

		// Add edges between visible nodes with similarity above threshold
		for (const e of allEdges) {
			if (nodeIds.has(e.source) && nodeIds.has(e.target) && e.similarity >= 0.18) {
				graphLinks.push({ source: e.source, target: e.target, _similarity: e.similarity });
			}
		}
	}

	// ═══ Expand / Collapse ═══════════════════════════════════

	function expandNodeSilent(nodeId: string) {
		if (!index || expanded.has(nodeId)) return;
		const parent = graphNodes.find(n => n.id === nodeId);
		if (!parent) return;
		expanded.add(nodeId);

		// Treatise virtual nodes: expand into their questions
		if (parent.type === 'treatise') {
			const partId = parent.data.partId;
			const treatiseName = parent.data.treatise || parent.data.label;
			const questions = index.getTreatiseQuestions(partId, treatiseName);
			questions.forEach((q, i) => {
				if (graphNodes.some(n => n.id === q.id)) return;
				const a = (i / questions.length) * 2 * Math.PI - Math.PI/2;
				graphNodes.push({
					id: q.id, data: q, type: q.type,
					x: (parent.x || 0) + Math.cos(a) * 80,
					y: (parent.y || 0) + Math.sin(a) * 80,
				});
				graphLinks.push({ source: nodeId, target: q.id });
			});
			return;
		}

		// Standard index-based expansion
		const children = index.getChildren(nodeId);
		children.forEach((child, i) => {
			if (graphNodes.some(n => n.id === child.id)) return;
			const a = (i / children.length) * 2 * Math.PI - Math.PI/2;
			const dist = child.type === 'question' ? 120 : child.type === 'article' ? 60 : 40;
			graphNodes.push({
				id: child.id, data: child, type: child.type,
				x: (parent.x || width/2) + Math.cos(a)*dist,
				y: (parent.y || height/2) + Math.sin(a)*dist,
			});
			graphLinks.push({ source: nodeId, target: child.id });
		});
	}

	function collapseNodeSilent(nodeId: string) {
		if (!index) return;
		const toRemove = new Set<string>();
		function collect(nid: string) {
			// For treatise nodes, children aren't in the index — check graph links
			const linkedChildren = graphLinks
				.filter(l => {
					const s = typeof l.source === 'string' ? l.source : (l.source as GNode).id;
					return s === nid;
				})
				.map(l => typeof l.target === 'string' ? l.target : (l.target as GNode).id);

			const indexChildren = index!.childrenOf.get(nid) || [];
			const allChildren = [...new Set([...linkedChildren, ...indexChildren])];

			for (const cid of allChildren) {
				if (graphNodes.some(n => n.id === cid)) {
					toRemove.add(cid);
					expanded.delete(cid);
					collect(cid);
				}
			}
		}
		collect(nodeId);
		expanded.delete(nodeId);
		for (let i = graphNodes.length - 1; i >= 0; i--) if (toRemove.has(graphNodes[i].id)) graphNodes.splice(i, 1);
		for (let i = graphLinks.length - 1; i >= 0; i--) {
			const s = typeof graphLinks[i].source === 'string' ? graphLinks[i].source as string : (graphLinks[i].source as GNode).id;
			const t = typeof graphLinks[i].target === 'string' ? graphLinks[i].target as string : (graphLinks[i].target as GNode).id;
			if (toRemove.has(s) || toRemove.has(t)) graphLinks.splice(i, 1);
		}
	}

	function commitAndRender() { expandedNodes.set(new Set(expanded)); render(); }

	// ═══ Click / Select / Navigate ═══════════════════════════

	function handleClick(d: GNode) {
		selectNode(d.data);
		if (d.type === 'objection' || d.type === 'answer' || d.type === 'reply' || d.type === 'sedcontra') return;
		if (expanded.has(d.id)) collapseNodeSilent(d.id);
		else expandNodeSilent(d.id);
		commitAndRender();
	}

	function selectNode(data: SummaNode) {
		selectedNode.set(data);
		if (index) breadcrumbPath.set(index.getPath(data.id).map(n => n.id));
	}

	function doNavigate(targetId: string) {
		if (!index) return;

		// If target is a treatise virtual node, just find it in graph
		if (targetId.startsWith('treatise:')) {
			const gn = graphNodes.find(n => n.id === targetId);
			if (gn) { selectNode(gn.data); if (!expanded.has(gn.id)) { expandNodeSilent(gn.id); commitAndRender(); } panToNode(targetId); }
			return;
		}

		const path = index.getPath(targetId);
		if (path.length === 0) return;

		// In treatise view, the first expansion target is the treatise node, not the part
		if (currentView === 'treatise') {
			const targetData = index.get(targetId);
			if (targetData?.treatise) {
				const treatiseKey = `${targetData.partId}:${targetData.treatise}`;
				const treatiseNodeId = `treatise:${treatiseKey}`;
				const treatiseGN = graphNodes.find(n => n.id === treatiseNodeId);
				if (treatiseGN && !expanded.has(treatiseNodeId)) {
					expandNodeSilent(treatiseNodeId);
				}
			}
		}

		for (let i = 0; i < path.length; i++) {
			const node = path[i];
			const isStructural = node.type === 'part' || node.type === 'question' || node.type === 'article';
			if (!graphNodes.some(n => n.id === node.id) && i > 0) expandNodeSilent(path[i - 1].id);
			if (isStructural && !expanded.has(node.id)) expandNodeSilent(node.id);
		}

		commitAndRender();
		const targetData = index.get(targetId);
		if (targetData) selectNode(targetData);
		requestAnimationFrame(() => setTimeout(() => panToNode(targetId), 350));
	}

	function panToNode(nodeId: string) {
		const gn = graphNodes.find(n => n.id === nodeId);
		if (!gn || gn.x == null || gn.y == null || !svg || !zoomBehavior) return;
		const scale = Math.max(d3.zoomTransform(svgElement).k, 0.8);
		svg.transition().duration(600).call(
			zoomBehavior.transform,
			d3.zoomIdentity.translate(width/2 - gn.x * scale, height/2 - gn.y * scale).scale(scale)
		);
	}

	// ═══ D3 Render ═══════════════════════════════════════════

	function nodeRadius(d: GNode): number {
		return d._radius || NODE_VISUALS[d.type].radius;
	}

	function render() {
		if (!linkGroup || !nodeGroup || !simulation) return;
		const isDep = currentView === 'dependency';
		const isConcept = currentView === 'conceptual';
		const isArcView = isDep || isConcept;

		// Links — use path elements (straight for most views, arcs for dependency/conceptual)
		linkGroup.selectAll('line').remove();
		const lk = linkGroup.selectAll<SVGPathElement, GLink>('path').data(graphLinks, d => {
			const s = typeof d.source === 'string' ? d.source : (d.source as GNode).id;
			const t = typeof d.target === 'string' ? d.target : (d.target as GNode).id;
			return s + '→' + t;
		});
		lk.exit().transition().duration(200).attr('opacity', 0).remove();
		lk.enter().append('path')
			.attr('fill', 'none')
			.attr('stroke', d => {
				if (isConcept) {
					const sim = (d as GLink)._similarity || 0.15;
					// Color by similarity: dimmer for weak, brighter for strong
					const alpha = 0.08 + sim * 0.6;
					return `rgba(201,168,76,${alpha})`;
				}
				if (isDep) return 'rgba(201,168,76,0.18)';
				const tgt = typeof d.target === 'string' ? graphNodes.find(n => n.id === d.target) : d.target as GNode;
				if (!tgt) return 'rgba(201,168,76,0.12)';
				const ty = tgt.type;
				if (ty === 'answer' || ty === 'reply' || ty === 'sedcontra') return 'rgba(201,168,76,0.35)';
				if (ty === 'objection') return 'rgba(100,90,70,0.25)';
				if (ty === 'treatise') return 'rgba(201,168,76,0.2)';
				return 'rgba(201,168,76,0.12)';
			})
			.attr('stroke-width', d => {
				if (isConcept) return 0.5 + ((d as GLink)._similarity || 0.15) * 3;
				if (isDep) return 0.6;
				const tgt = typeof d.target === 'string' ? graphNodes.find(n => n.id === d.target) : d.target as GNode;
				return tgt && (tgt.type === 'question' || tgt.type === 'treatise') ? 1.2 : 0.7;
			})
			.attr('opacity', 0).transition().duration(350).attr('opacity', 1);

		// Nodes
		const nd = nodeGroup.selectAll<SVGGElement, GNode>('.node').data(graphNodes, d => d.id);
		nd.exit().transition().duration(200).attr('opacity', 0).remove();

		const enter = nd.enter().append('g')
			.attr('class', 'node').attr('opacity', 0).style('cursor', 'pointer')
			.call(d3.drag<SVGGElement, GNode>()
				.on('start', (e, d) => { if (!e.active) simulation.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
				.on('drag', (e, d) => { d.fx = e.x; d.fy = e.y; })
				.on('end', (e, d) => { if (!e.active) simulation.alphaTarget(0); d.fx = null; d.fy = null; })
			)
			.on('click', (e: MouseEvent, d: GNode) => { e.stopPropagation(); handleClick(d); })
			.on('mouseenter', (e: MouseEvent, d: GNode) => { ttNode = d.data; ttX = e.clientX+16; ttY = e.clientY-10; ttVisible = true; })
			.on('mousemove', (e: MouseEvent) => { ttX = e.clientX+16; ttY = e.clientY-10; })
			.on('mouseleave', () => { ttVisible = false; ttNode = null; });

		enter.append('circle').attr('class', 'select-ring')
			.attr('r', d => nodeRadius(d) + 4).attr('fill', 'none')
			.attr('stroke', '#e8c860').attr('stroke-width', 2).attr('opacity', 0);

		enter.append('circle').attr('class', 'main-circle')
			.attr('r', d => nodeRadius(d))
			.attr('fill', d => isConcept ? (PART_COLORS[d.data.partId] || NODE_VISUALS[d.type].fill) : NODE_VISUALS[d.type].fill)
			.attr('stroke', d => isConcept ? (PART_COLORS[d.data.partId] || NODE_VISUALS[d.type].stroke) : NODE_VISUALS[d.type].stroke)
			.attr('stroke-width', d => (d.type === 'part' || d.type === 'treatise') ? 2 : 1)
			.attr('stroke-opacity', d => isConcept ? 0.5 : 1)
			.attr('filter', d => (d.type === 'part' || d.type === 'answer' || d.type === 'treatise') ? 'url(#glow)' : (isConcept ? 'url(#glow)' : null));

		// Inner label: parts show partId, treatises show abbreviation
		enter.filter(d => d.type === 'part')
			.append('text').attr('text-anchor', 'middle').attr('dy', '0.35em')
			.attr('fill', NODE_VISUALS.part.textColor)
			.attr('font-family', 'Cinzel, serif').attr('font-size', '11px').attr('font-weight', '700').attr('letter-spacing', '1px')
			.text(d => d.data.partId || '');

		// Below label
		enter.append('text').attr('class', 'below-label').attr('text-anchor', 'middle')
			.attr('dy', d => nodeRadius(d) + 14)
			.attr('fill', d => {
				if (d.type === 'part') return '#c9a84c';
				if (d.type === 'treatise') return '#c9a84c';
				if (d.type === 'question') return '#a89a80';
				if (d.type === 'article' && (currentView === 'density' || currentView === 'dependency' || currentView === 'conceptual')) return '#a89a80';
				return 'transparent';
			})
			.attr('font-family', 'Cinzel, serif')
			.attr('font-size', d => (d.type === 'part' || d.type === 'treatise') ? '11px' : '9px')
			.attr('letter-spacing', '0.5px')
			.text(d => {
				if (d.type === 'part') return d.data.label;
				if (d.type === 'treatise') return d.data.label;
				if (d.type === 'question') return `Q${d.data.questionNum}`;
				if (d.type === 'article' && currentView === 'dependency') return `${d.data.objectionCount} refs`;
				if (d.type === 'article' && currentView === 'conceptual') return `${d.data.objectionCount} similar`;
				if (d.type === 'article' && currentView === 'density') return `${d.data.objectionCount} obj`;
				return '';
			});

		// Expand icon
		enter.filter(d => d.type === 'part' || d.type === 'treatise' || d.type === 'question' || d.type === 'article')
			.append('text').attr('class', 'expand-icon').attr('text-anchor', 'middle')
			.attr('dy', d => (d.type === 'part' || d.type === 'treatise') ? 10 : d.type === 'question' ? 5 : 4)
			.attr('fill', d => NODE_VISUALS[d.type].textColor)
			.attr('font-size', d => (d.type === 'part' || d.type === 'treatise') ? '10px' : '8px')
			.attr('opacity', 0.5)
			.text(d => expanded.has(d.id) ? '−' : '+');

		enter.transition().duration(400).attr('opacity', 1);

		nodeGroup.selectAll<SVGTextElement, GNode>('.expand-icon').text(d => expanded.has(d.id) ? '−' : '+');
		updateHighlight();

		simulation.nodes(graphNodes);
		(simulation.force('link') as d3.ForceLink<GNode, GLink>).links(graphLinks);
		simulation.alpha(0.6).restart();
	}

	function updateHighlight() {
		nodeGroup?.selectAll<SVGCircleElement, GNode>('.select-ring')
			.attr('opacity', d => d.id === selectedId ? 0.8 : 0);
	}

	function ticked() {
		const isArcView = currentView === 'dependency' || currentView === 'conceptual';
		linkGroup?.selectAll<SVGPathElement, GLink>('path')
			.attr('d', d => {
				const sx = (d.source as GNode).x || 0;
				const sy = (d.source as GNode).y || 0;
				const tx = (d.target as GNode).x || 0;
				const ty = (d.target as GNode).y || 0;
				if (isArcView) {
					const dx = tx - sx, dy = ty - sy;
					const dist = Math.sqrt(dx * dx + dy * dy);
					if (dist < 1) return `M${sx},${sy} L${tx},${ty}`;
					const offset = Math.min(dist * 0.25, 50);
					const mx = (sx + tx) / 2 - dy * offset / dist;
					const my = (sy + ty) / 2 + dx * offset / dist;
					return `M${sx},${sy} Q${mx},${my} ${tx},${ty}`;
				}
				return `M${sx},${sy} L${tx},${ty}`;
			});
		nodeGroup?.selectAll<SVGGElement, GNode>('.node')
			.attr('transform', d => `translate(${d.x||0},${d.y||0})`);
	}

	export function resetGraph() {
		if (!index) return;
		rebuildForView(currentView, currentOrdering);
	}

	function ttStats(n: SummaNode): string {
		if (n.type === 'part') return `${n.questionCount??0} questions · ${n.articleCount??0} articles`;
		if (n.type === 'treatise') return `${n.questionCount??0} questions · ${n.articleCount??0} articles · ${n.objectionCount??0} objections`;
		if (n.type === 'question') return `${n.objectionCount??0} objections`;
		if (n.type === 'article' && currentView === 'dependency')
			return `${n.objectionCount??0} incoming refs · ${n.replyCount??0} outgoing refs`;
		if (n.type === 'article' && currentView === 'conceptual')
			return `${n.objectionCount??0} similar articles · ${n.treatise || ''}`;
		if (n.type === 'article') return `${n.objectionCount??0} objections · ${n.replyCount??0} replies`;
		return '';
	}
</script>

<div class="graph-container absolute inset-0" bind:this={container}>
	{#if !index}
		<div class="absolute inset-0 flex flex-col items-center justify-center">
			<div class="w-10 h-10 border-2 border-gold-dim border-t-gold rounded-full animate-spin mb-5"></div>
			<h2 class="font-cinzel text-2xl text-gold tracking-wider mb-3">Summa Theologiae</h2>
			<p class="text-parchment-300 italic">Constructing the knowledge graph…</p>
		</div>
	{/if}
	<svg bind:this={svgElement} class="w-full h-full"></svg>
	{#if ttVisible && ttNode}
		<div class="fixed pointer-events-none z-50 bg-bg-panel/95 border border-gold/30 px-3.5 py-2 max-w-xs"
			style="left:{ttX}px;top:{ttY}px;">
			<div class="font-cinzel text-[10px] tracking-[2px] uppercase text-gold-dim">{TYPE_LABELS[ttNode.type]}</div>
			<div class="text-parchment-100 text-sm leading-snug mt-0.5">{ttNode.label}</div>
			{#if ttStats(ttNode)}
				<div class="text-parchment-300 text-[11px] mt-1">{ttStats(ttNode)}</div>
			{/if}
		</div>
	{/if}
</div>
