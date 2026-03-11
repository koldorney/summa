<script lang="ts">
	import { onMount } from 'svelte';
	import * as d3 from 'd3';
	import { selectedNode, breadcrumbPath } from '$lib/stores/app';
	import type { SummaIndex } from '$lib/data';

	interface Props { index: SummaIndex | null; mode: 'hierarchical' | 'treatise' | 'citations' | 'conceptual'; }
	let { index, mode }: Props = $props();

	let container: HTMLDivElement;
	let canvasEl: HTMLCanvasElement;
	let width = $state(0);
	let height = $state(0);
	let loading = $state(true);
	let currentMode = '';

	let searchQuery = $state('');
	let searchResults = $state<LeafData[]>([]);
	let egoNodeId = $state<string | null>(null);
	let egoBreadcrumb = $state<{ id: string; label: string }[]>([]);
	let hoveredId = $state<string | null>(null);

	let ttVisible = $state(false);
	let ttX = $state(0);
	let ttY = $state(0);
	let ttName = $state('');
	let ttDetail = $state('');

	interface BundleData {
		hierarchy: any;
		citationLinks: { source: string; target: string; weight: number }[];
		conceptLinks: { source: string; target: string; similarity: number }[];
		structuralLinks: { source: string; target: string; weight: number }[];
	}
	let bundleData: BundleData | null = null;

	const TC: Record<string, string> = {"Sacred Doctrine":"#cb964d","One God":"#ddb063","Trinity":"#e2aa36","Creation":"#d4b86c","Angels":"#d6b541","Genesis":"#e7ce59","Man":"#cbba4d","Providence":"#ddd363","Beatitude":"#4dcb8c","Human Acts":"#63ddae","Passions":"#36e2b2","Habits & Virtues":"#6cd4c3","Vices & Sins":"#41d6ce","Law":"#59dfe7","Grace":"#4db6cb","Faith":"#8c4dcb","Hope":"#ac63dd","Charity":"#ad36e2","Prudence":"#be6cd4","Justice":"#c541d6","Fortitude":"#e459e7","Temperance":"#cb4dc2","Charisms & States":"#dd63c9","Incarnation":"#cb6c4d","Life of Christ":"#dd9663","Sacraments":"#e29a36","Penance":"#4d8ccb","Unction & Orders":"#638cdd","Matrimony":"#3652e2","Eschatology":"#6c6cd4"};
	const PN: Record<string, string> = { 'I': 'Prima Pars', 'I-II': 'Prima Secundae', 'II-II': 'Secunda Secundae', 'III': 'Tertia Pars', 'Suppl': 'Supplement' };

	type LeafData = { id: string; label: string; qNum: number; partId: string; treatise: string; objCount: number };
	let allLeaves: LeafData[] = [];
	let leafById = $state(new Map<string, LeafData>());
	let connectionsOf = new Map<string, Set<string>>();
	let connectionStrength = new Map<string, number>();
	let maxStr = 1;

	let sim: d3.Simulation<SimNode, SimLink> | null = null;
	let simNodes: SimNode[] = [];
	let simLinks: SimLink[] = [];
	let transform = d3.zoomIdentity;

	interface SimNode extends d3.SimulationNodeDatum { id: string; leaf: LeafData; degree: number; strength: number; radius: number; }
	interface SimLink extends d3.SimulationLinkDatum<SimNode> { strength: number; }

	function col(leaf: LeafData): string { return TC[leaf.treatise] || '#c9a84c'; }

	onMount(() => {
		if (!container) return;
		width = container.clientWidth; height = container.clientHeight;
		const ro = new ResizeObserver(entries => { for (const e of entries) { width = e.contentRect.width; height = e.contentRect.height; } if (bundleData) rebuild(); });
		ro.observe(container);
		return () => { ro.disconnect(); sim?.stop(); };
	});

	$effect(() => {
		const m = mode;
		if (canvasEl && width > 0 && index) {
			if (!bundleData) {
				loading = true;
				fetch('/summa_bundle.json').then(r => r.json()).then((d: BundleData) => { bundleData = d; currentMode = m; indexData(m); rebuild(); loading = false; });
			} else if (m !== currentMode) { currentMode = m; indexData(m); egoNodeId = null; egoBreadcrumb = []; hoveredId = null; rebuild(); }
		}
	});

	$effect(() => { const eid = egoNodeId; if (bundleData && canvasEl && width > 0) rebuild(); });

	$effect(() => {
		const q = searchQuery.toLowerCase().trim();
		if (!q || q.length < 2) { searchResults = []; return; }
		searchResults = allLeaves.filter(l => l.label.toLowerCase().includes(q) || `q${l.qNum}`.includes(q) || l.treatise.toLowerCase().includes(q)).slice(0, 10);
	});

	function indexData(m: string) {
		if (!bundleData) return;
		allLeaves = []; leafById = new Map();
		(function walk(n: any) { if (!n.children?.length) { if (n.id && n.questionNum != null) { const l: LeafData = { id: n.id, label: n.label || n.name, qNum: n.questionNum, partId: n.partId || '', treatise: n.treatise || '', objCount: n.objectionCount || 0 }; allLeaves.push(l); leafById.set(l.id, l); } return; } for (const c of n.children) walk(c); })(bundleData.hierarchy);
		const raw = m === 'citations' ? bundleData.citationLinks : bundleData.conceptLinks;
		maxStr = Math.max(...raw.map(e => (e as any).weight || (e as any).similarity || 0.15), 0.01);
		connectionsOf = new Map(); connectionStrength = new Map();
		for (const e of raw) { const s = e.source, t = e.target, str = (e as any).weight || (e as any).similarity || 0.15; if (!connectionsOf.has(s)) connectionsOf.set(s, new Set()); if (!connectionsOf.has(t)) connectionsOf.set(t, new Set()); connectionsOf.get(s)!.add(t); connectionsOf.get(t)!.add(s); const key = [s, t].sort().join('|'); connectionStrength.set(key, Math.max(connectionStrength.get(key) || 0, str)); }
	}

	function rebuild() { sim?.stop(); if (egoNodeId) buildEgo(egoNodeId); else buildOverview(); }

	function setupCanvas() { const dpr = window.devicePixelRatio || 1; canvasEl.width = width * dpr; canvasEl.height = height * dpr; canvasEl.style.width = width + 'px'; canvasEl.style.height = height + 'px'; }

	function buildOverview() {
		if (!bundleData || !canvasEl) return;
		setupCanvas();
		simNodes = allLeaves.map(l => { const conns = connectionsOf.get(l.id)?.size || 0; return { id: l.id, leaf: l, degree: 0, strength: 0, radius: 2.5 + Math.min(conns / 8, 5), x: width / 2 + (Math.random() - 0.5) * 400, y: height / 2 + (Math.random() - 0.5) * 400 }; });
		const nodeIds = new Set(simNodes.map(n => n.id));
		const raw = mode === 'citations' ? bundleData.citationLinks : bundleData.conceptLinks;
		const sorted = [...raw].sort((a, b) => ((b as any).weight || (b as any).similarity) - ((a as any).weight || (a as any).similarity)).slice(0, 800);
		simLinks = [];
		for (const e of sorted) { if (nodeIds.has(e.source) && nodeIds.has(e.target)) simLinks.push({ source: e.source, target: e.target, strength: (e as any).weight || (e as any).similarity || 0.15 }); }

		sim = d3.forceSimulation<SimNode, SimLink>(simNodes)
			.force('link', d3.forceLink<SimNode, SimLink>(simLinks).id(d => d.id).distance(40).strength(0.15))
			.force('charge', d3.forceManyBody<SimNode>().strength(-12).distanceMax(300))
			.force('center', d3.forceCenter(width / 2, height / 2))
			.force('collision', d3.forceCollide<SimNode>().radius(4))
			.alphaDecay(0.03).on('tick', render);
		transform = d3.zoomIdentity;
		d3.select(canvasEl).call(d3.zoom<HTMLCanvasElement, unknown>().scaleExtent([0.2, 8]).on('zoom', e => { transform = e.transform; render(); }));
		d3.select(canvasEl).on('mousemove', onMouseMove).on('click', onClick);
	}

	function buildEgo(centerId: string) {
		const center = leafById.get(centerId);
		if (!center || !canvasEl) return;
		setupCanvas();
		const direct = connectionsOf.get(centerId) || new Set();
		const secondCounts = new Map<string, number>();
		for (const d1 of direct) { for (const d2 of (connectionsOf.get(d1) || [])) { if (d2 !== centerId && !direct.has(d2)) secondCounts.set(d2, (secondCounts.get(d2) || 0) + 1); } }
		const topSecond = new Set([...secondCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20).map(e => e[0]));
		const topStr = Math.max(...[...direct].map(d => { const k = [centerId, d].sort().join('|'); return connectionStrength.get(k) || 0; }), 0.01);

		simNodes = [];
		const cn: SimNode = { id: centerId, leaf: center, degree: 0, strength: topStr, radius: 14, x: width / 2, y: height / 2, fx: width / 2, fy: height / 2 };
		simNodes.push(cn);
		for (const did of direct) { const l = leafById.get(did); if (!l) continue; const k = [centerId, did].sort().join('|'); const str = connectionStrength.get(k) || 0; simNodes.push({ id: did, leaf: l, degree: 1, strength: str, radius: 4 + str / topStr * 7 }); }
		for (const sid of topSecond) { const l = leafById.get(sid); if (!l) continue; simNodes.push({ id: sid, leaf: l, degree: 2, strength: 0, radius: 2.5 }); }
		const egoIds = new Set(simNodes.map(n => n.id));
		simLinks = [];
		for (const n of simNodes) { for (const cid of (connectionsOf.get(n.id) || [])) { if (egoIds.has(cid) && n.id < cid) { const k = [n.id, cid].sort().join('|'); simLinks.push({ source: n.id, target: cid, strength: connectionStrength.get(k) || 0 }); } } }

		sim = d3.forceSimulation<SimNode, SimLink>(simNodes)
			.force('link', d3.forceLink<SimNode, SimLink>(simLinks).id(d => d.id).distance(d => { const s = d.source as SimNode, t = d.target as SimNode; if (s.degree === 0 || t.degree === 0) return 50 + (1 - Math.max(s.strength, t.strength) / topStr) * 200; return 100; }).strength(d => { const s = d.source as SimNode, t = d.target as SimNode; if (s.degree === 0 || t.degree === 0) return 0.4; if (s.degree === 2 || t.degree === 2) return 0.04; return 0.06; }))
			.force('charge', d3.forceManyBody<SimNode>().strength(d => d.degree === 0 ? -300 : d.degree === 1 ? -60 : -20))
			.force('center', d3.forceCenter(width / 2, height / 2).strength(0.02))
			.force('collision', d3.forceCollide<SimNode>().radius(d => d.radius + 5))
			.alphaDecay(0.02).on('tick', render);
		transform = d3.zoomIdentity;
		d3.select(canvasEl).call(d3.zoom<HTMLCanvasElement, unknown>().scaleExtent([0.3, 6]).on('zoom', e => { transform = e.transform; render(); }));
		d3.select(canvasEl).on('mousemove', onMouseMove).on('click', onClick);
	}

	function render() {
		const dpr = window.devicePixelRatio || 1; const ctx = canvasEl.getContext('2d')!;
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, width, height);
		ctx.save(); ctx.translate(transform.x, transform.y); ctx.scale(transform.k, transform.k);
		const hid = hoveredId; const isEgo = !!egoNodeId;

		for (const link of simLinks) {
			const s = link.source as SimNode, t = link.target as SimNode;
			if (s.x == null || t.x == null) continue;
			const norm = link.strength / maxStr;
			const isCenter = isEgo && (s.degree === 0 || t.degree === 0);
			const is2nd = s.degree === 2 || t.degree === 2;
			if (hid && s.id !== hid && t.id !== hid) { ctx.globalAlpha = 0.015; ctx.strokeStyle = '#444'; ctx.lineWidth = 0.15; }
			else if (hid && (s.id === hid || t.id === hid)) { const o = s.id === hid ? t : s; ctx.globalAlpha = 0.5 + norm * 0.5; ctx.strokeStyle = col(o.leaf); ctx.lineWidth = 1 + norm * 3; }
			else if (isCenter) { const o = s.degree === 0 ? t : s; ctx.globalAlpha = 0.12 + norm * 0.5; ctx.strokeStyle = col(o.leaf); ctx.lineWidth = 0.6 + norm * 3; }
			else if (is2nd) { ctx.globalAlpha = 0.04; ctx.strokeStyle = '#665'; ctx.lineWidth = 0.3; }
			else { ctx.globalAlpha = 0.03 + norm * 0.12; ctx.strokeStyle = '#a89a80'; ctx.lineWidth = 0.2 + norm * 0.8; }
			ctx.beginPath(); ctx.moveTo(s.x!, s.y!); ctx.lineTo(t.x!, t.y!); ctx.stroke();
			if (isCenter && norm > 0.4 && !hid) { const o = s.degree === 0 ? t : s; ctx.globalAlpha = norm * 0.06; ctx.strokeStyle = col(o.leaf); ctx.lineWidth = norm * 8; ctx.beginPath(); ctx.moveTo(s.x!, s.y!); ctx.lineTo(t.x!, t.y!); ctx.stroke(); }
		}

		for (const node of simNodes) {
			if (node.x == null) continue;
			const c = col(node.leaf); const isHov = hid === node.id;
			const isConn = hid ? (connectionsOf.get(hid)?.has(node.id) || false) : false;
			const dimmed = hid && !isHov && !isConn;
			const r = isHov ? node.radius * 1.4 : node.radius;
			if (!dimmed && (isHov || (isEgo && node.degree <= 1) || (!isEgo && r > 4))) {
				const glowR = r * (isHov ? 4 : node.degree === 0 ? 3.5 : 2.2);
				const grad = ctx.createRadialGradient(node.x!, node.y!, r * 0.3, node.x!, node.y!, glowR);
				grad.addColorStop(0, c + (isHov ? '50' : '25')); grad.addColorStop(1, c + '00');
				ctx.globalAlpha = 1; ctx.fillStyle = grad;
				ctx.beginPath(); ctx.arc(node.x!, node.y!, glowR, 0, Math.PI * 2); ctx.fill();
			}
			ctx.globalAlpha = dimmed ? 0.08 : (isHov ? 1 : node.degree === 2 ? 0.2 : 0.65);
			ctx.fillStyle = c; ctx.beginPath(); ctx.arc(node.x!, node.y!, r, 0, Math.PI * 2); ctx.fill();
			if (isEgo && node.degree === 0) { ctx.strokeStyle = '#e8c860'; ctx.lineWidth = 1.5; ctx.globalAlpha = 0.5; ctx.beginPath(); ctx.arc(node.x!, node.y!, r, 0, Math.PI * 2); ctx.stroke(); }
		}
		ctx.globalAlpha = 1; ctx.restore();
	}

	function findNodeAt(mx: number, my: number): SimNode | null {
		const pt = transform.invert([mx, my]);
		let closest: SimNode | null = null; let minDist = 20;
		for (const n of simNodes) { if (n.x == null) continue; const dx = pt[0] - n.x!, dy = pt[1] - n.y!; const d = Math.sqrt(dx * dx + dy * dy); if (d < minDist) { minDist = d; closest = n; } }
		return closest;
	}

	function onMouseMove(event: MouseEvent) {
		const rect = canvasEl.getBoundingClientRect();
		const node = findNodeAt(event.clientX - rect.left, event.clientY - rect.top);
		if (node) {
			hoveredId = node.id;
			ttName = `Q${node.leaf.qNum}: ${node.leaf.label}`;
			ttDetail = `${node.leaf.treatise} · ${PN[node.leaf.partId] || ''} · ${connectionsOf.get(node.id)?.size || 0} connections`;
			ttX = event.clientX + 16; ttY = event.clientY - 10; ttVisible = true;
			canvasEl.style.cursor = 'pointer';
		} else { if (hoveredId) hoveredId = null; ttVisible = false; canvasEl.style.cursor = 'grab'; }
		render();
	}

	function onClick(event: MouseEvent) {
		const rect = canvasEl.getBoundingClientRect();
		const node = findNodeAt(event.clientX - rect.left, event.clientY - rect.top);
		if (node) { if (egoNodeId && node.degree === 0) return; enterEgo(node.id); }
	}

	function enterEgo(id: string) {
		const leaf = leafById.get(id); if (!leaf) return;
		if (egoNodeId) { const cur = leafById.get(egoNodeId); if (cur) egoBreadcrumb = [...egoBreadcrumb, { id: egoNodeId, label: `Q${cur.qNum}` }]; }
		egoNodeId = id; hoveredId = null; searchQuery = ''; searchResults = [];
		if (index) { const n = index.get(id); if (n) { selectedNode.set(n); breadcrumbPath.set(index.getPath(id).map(x => x.id)); } }
	}

	function goBack() {
		hoveredId = null;
		if (egoBreadcrumb.length) { const prev = egoBreadcrumb.pop()!; egoBreadcrumb = [...egoBreadcrumb]; egoNodeId = prev.id; }
		else { egoNodeId = null; }
	}

	function jumpTo(id: string) { hoveredId = null; const idx = egoBreadcrumb.findIndex(b => b.id === id); if (idx >= 0) { egoBreadcrumb = egoBreadcrumb.slice(0, idx); egoNodeId = id; } }
</script>

<div class="absolute inset-0" bind:this={container}>
	{#if loading}
		<div class="absolute inset-0 flex flex-col items-center justify-center z-20">
			<div class="w-10 h-10 border-2 border-gold-dim border-t-gold rounded-full animate-spin mb-5"></div>
			<p class="text-parchment-300 italic text-sm">Building graph…</p>
		</div>
	{/if}
	<canvas bind:this={canvasEl} class="absolute inset-0"></canvas>
	{#if !loading}
		<div class="absolute top-16 left-7 z-30 flex items-center gap-2 flex-wrap">
			{#if egoNodeId}
				<button class="px-2.5 py-1 text-xs font-cinzel tracking-wider bg-gold/10 border border-gold/25 text-parchment-300 hover:text-gold hover:bg-gold/15 transition-all" onclick={goBack}>← {egoBreadcrumb.length ? 'Back' : 'Overview'}</button>
				{#each egoBreadcrumb as crumb}
					<button class="text-xs font-cinzel text-parchment-400 hover:text-gold transition-colors" onclick={() => jumpTo(crumb.id)}>{crumb.label}</button>
					<span class="text-parchment-400/30 text-xs">›</span>
				{/each}
				<span class="text-xs font-cinzel text-gold">Q{leafById.get(egoNodeId)?.qNum}</span>
			{/if}
			<div class="relative {egoNodeId ? 'ml-3' : ''}">
				<input bind:value={searchQuery} type="text" placeholder="Search questions or treatises…" class="w-60 bg-bg-panel/90 border border-gold/20 text-parchment-100 text-sm px-3 py-1.5 font-cormorant placeholder:text-parchment-400 focus:outline-none focus:border-gold-dim" />
				{#if searchResults.length > 0}
					<div class="absolute top-full left-0 right-0 bg-bg-panel border border-gold/20 border-t-0 max-h-64 overflow-y-auto z-50">
						{#each searchResults as r}
							<button class="block w-full text-left px-3 py-2 hover:bg-gold/10 transition-colors border-b border-gold/5" onclick={() => enterEgo(r.id)}>
								<span class="inline-block w-2 h-2 rounded-full mr-2" style="background:{TC[r.treatise] || '#c9a84c'}"></span>
								<span class="text-gold-dim font-cinzel text-[10px] mr-1">Q{r.qNum}</span>
								<span class="text-parchment-200 text-[13px]">{r.label.substring(0, 45)}</span>
							</button>
						{/each}
					</div>
				{/if}
			</div>
		</div>
	{/if}
	{#if ttVisible}
		<div class="fixed pointer-events-none z-50 bg-bg-panel/95 border border-gold/30 px-4 py-2.5 max-w-md" style="left:{ttX}px;top:{ttY}px;">
			<div class="text-parchment-100 text-[14px] leading-snug">{ttName}</div>
			<div class="text-parchment-300 text-[11px] mt-1">{ttDetail}</div>
		</div>
	{/if}
	{#if !loading && !egoNodeId}
		<div class="absolute bottom-5 left-7 text-[11px] text-parchment-400/50 pointer-events-none">Click any node to explore · Scroll to zoom · Drag to pan</div>
	{/if}
</div>
