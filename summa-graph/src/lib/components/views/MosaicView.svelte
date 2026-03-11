<script lang="ts">
	import { onMount } from 'svelte';
	import * as d3 from 'd3';
	import { voronoiTreemap } from 'd3-voronoi-treemap';
	import { selectedNode, breadcrumbPath } from '$lib/stores/app';
	import type { SummaIndex } from '$lib/data';

	interface Props { index: SummaIndex | null; }
	let { index }: Props = $props();

	let container: HTMLDivElement;
	let canvasEl: HTMLCanvasElement;
	let width = $state(0);
	let height = $state(0);
	let loading = $state(true);
	let computing = $state(false);

	let ttVisible = $state(false);
	let ttX = $state(0);
	let ttY = $state(0);
	let ttName = $state('');
	let ttDetail = $state('');

	let hoveredId = $state<string | null>(null);

	const TC: Record<string, string> = {"Sacred Doctrine":"#cb964d","One God":"#ddb063","Trinity":"#e2aa36","Creation":"#d4b86c","Angels":"#d6b541","Genesis":"#e7ce59","Man":"#cbba4d","Providence":"#ddd363","Beatitude":"#4dcb8c","Human Acts":"#63ddae","Passions":"#36e2b2","Habits & Virtues":"#6cd4c3","Vices & Sins":"#41d6ce","Law":"#59dfe7","Grace":"#4db6cb","Faith":"#8c4dcb","Hope":"#ac63dd","Charity":"#ad36e2","Prudence":"#be6cd4","Justice":"#c541d6","Fortitude":"#e459e7","Temperance":"#cb4dc2","Charisms & States":"#dd63c9","Incarnation":"#cb6c4d","Life of Christ":"#dd9663","Sacraments":"#e29a36","Penance":"#4d8ccb","Unction & Orders":"#638cdd","Matrimony":"#3652e2","Eschatology":"#6c6cd4"};
	const PC: Record<string, string> = { 'I': '#c9a84c', 'I-II': '#7ab8a8', 'II-II': '#b07aaf', 'III': '#cf7c5e', 'Suppl': '#8a9abf' };
	const PN: Record<string, string> = { 'I': 'Prima Pars', 'I-II': 'Prima Secundae', 'II-II': 'Secunda Secundae', 'III': 'Tertia Pars', 'Suppl': 'Supplement' };

	type CellData = {
		polygon: [number, number][];
		id: string; qNum: number; title: string; treatise: string; partId: string;
		artCount: number; objCount: number; depth: number;
		centroid: [number, number];
	};
	let cells = $state<CellData[]>([]);
	let groupCells = $state<{ polygon: [number, number][]; name: string; partId: string; depth: number; centroid: [number, number] }[]>([]);

	onMount(() => {
		if (!container) return;
		width = container.clientWidth; height = container.clientHeight;
		const ro = new ResizeObserver(entries => { for (const e of entries) { width = e.contentRect.width; height = e.contentRect.height; } if (cells.length) render(); });
		ro.observe(container);
		fetch('/summa_bundle.json').then(r => r.json()).then(data => {
			loading = false; computing = true;
			// Defer computation to not block UI
			setTimeout(() => { computeVoronoi(data); computing = false; }, 50);
		});
		return () => ro.disconnect();
	});

	function computeVoronoi(data: any) {
		const margin = 20;
		const w = width - margin * 2;
		const h = height - margin * 2;

		// Clip polygon (rectangle with slight rounding via extra points)
		const clip: [number, number][] = [
			[0, 0], [w * 0.25, 0], [w * 0.5, 0], [w * 0.75, 0], [w, 0],
			[w, h * 0.25], [w, h * 0.5], [w, h * 0.75], [w, h],
			[w * 0.75, h], [w * 0.5, h], [w * 0.25, h], [0, h],
			[0, h * 0.75], [0, h * 0.5], [0, h * 0.25],
		];

		const root = d3.hierarchy(data.hierarchy)
			.sum(d => (!d.children || d.children.length === 0) ? Math.max(d.objectionCount || d.articleCount || 1, 1) : 0)
			.sort((a, b) => (b.value || 0) - (a.value || 0));

		const layout = voronoiTreemap()
			.clip(clip)
			.convergenceRatio(0.01)
			.maxIterationCount(50)
			.minWeightRatio(0.01);

		layout(root);

		// Extract cells
		const leafCells: CellData[] = [];
		const groups: typeof groupCells = [];

		root.each((node: any) => {
			if (!node.polygon) return;
			const poly = node.polygon.map((p: any) => [p[0] + margin, p[1] + margin] as [number, number]);
			const cx = d3.mean(poly, p => p[0]) || 0;
			const cy = d3.mean(poly, p => p[1]) || 0;

			if (!node.children || node.children.length === 0) {
				// Leaf = question
				leafCells.push({
					polygon: poly, id: node.data.id || '', qNum: node.data.questionNum || 0,
					title: node.data.label || node.data.name || '', treatise: node.data.treatise || '',
					partId: node.data.partId || '', artCount: node.data.articleCount || 0,
					objCount: node.data.objectionCount || 0, depth: node.depth,
					centroid: [cx, cy],
				});
			} else if (node.depth > 0) {
				// Group = treatise or part
				groups.push({
					polygon: poly, name: node.data.name || '',
					partId: node.data.id?.replace('part:', '') || node.data.partId || '',
					depth: node.depth, centroid: [cx, cy],
				});
			}
		});

		cells = leafCells;
		groupCells = groups;
		render();
	}

	function render() {
		if (!canvasEl || !width || cells.length === 0) return;
		const dpr = window.devicePixelRatio || 1;
		canvasEl.width = width * dpr; canvasEl.height = height * dpr;
		canvasEl.style.width = width + 'px'; canvasEl.style.height = height + 'px';
		const ctx = canvasEl.getContext('2d')!;
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		ctx.clearRect(0, 0, width, height);

		const hid = hoveredId;

		// Draw group outlines first (treatise and part boundaries)
		for (const g of groupCells) {
			if (g.depth > 2) continue; // only parts and treatises
			const color = g.depth === 1 ? (PC[g.partId] || '#c9a84c') : (TC[g.name] || '#c9a84c');
			ctx.strokeStyle = color;
			ctx.lineWidth = g.depth === 1 ? 2.5 : 1.2;
			ctx.globalAlpha = g.depth === 1 ? 0.3 : 0.15;
			ctx.beginPath();
			for (let i = 0; i < g.polygon.length; i++) {
				if (i === 0) ctx.moveTo(g.polygon[i][0], g.polygon[i][1]);
				else ctx.lineTo(g.polygon[i][0], g.polygon[i][1]);
			}
			ctx.closePath();
			ctx.stroke();
		}

		// Draw leaf cells
		for (const cell of cells) {
			const color = TC[cell.treatise] || '#c9a84c';
			const isHov = hid === cell.id;
			const dimmed = hid && !isHov;

			ctx.beginPath();
			for (let i = 0; i < cell.polygon.length; i++) {
				if (i === 0) ctx.moveTo(cell.polygon[i][0], cell.polygon[i][1]);
				else ctx.lineTo(cell.polygon[i][0], cell.polygon[i][1]);
			}
			ctx.closePath();

			// Fill
			ctx.globalAlpha = dimmed ? 0.12 : (isHov ? 0.9 : 0.65);
			ctx.fillStyle = color;
			ctx.fill();

			// Border
			ctx.globalAlpha = dimmed ? 0.03 : (isHov ? 0.7 : 0.12);
			ctx.strokeStyle = isHov ? '#f0e6d0' : '#0e0c08';
			ctx.lineWidth = isHov ? 2 : 0.8;
			ctx.stroke();

			// Glow for hovered
			if (isHov) {
				ctx.globalAlpha = 0.2;
				ctx.strokeStyle = color;
				ctx.lineWidth = 4;
				ctx.stroke();
			}
		}

		// Group labels
		ctx.globalAlpha = 1;
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		for (const g of groupCells) {
			if (g.depth !== 2) continue; // treatise level only
			const color = TC[g.name] || '#c9a84c';
			// Estimate area to determine font size
			const area = polygonArea(g.polygon);
			const fontSize = Math.max(7, Math.min(Math.sqrt(area) * 0.08, 14));
			if (fontSize < 7) continue;

			ctx.font = `600 ${fontSize}px Cinzel, serif`;
			ctx.fillStyle = '#f0e6d0';
			ctx.globalAlpha = hid ? 0.15 : 0.5;
			ctx.save();
			ctx.shadowColor = 'rgba(14,12,8,0.9)';
			ctx.shadowBlur = 4;
			ctx.fillText(g.name, g.centroid[0], g.centroid[1]);
			ctx.restore();
		}

		ctx.globalAlpha = 1;
	}

	function polygonArea(polygon: [number, number][]): number {
		let area = 0;
		for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
			area += polygon[j][0] * polygon[i][1];
			area -= polygon[i][0] * polygon[j][1];
		}
		return Math.abs(area / 2);
	}

	function pointInPolygon(x: number, y: number, polygon: [number, number][]): boolean {
		let inside = false;
		for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
			const xi = polygon[i][0], yi = polygon[i][1];
			const xj = polygon[j][0], yj = polygon[j][1];
			if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
				inside = !inside;
			}
		}
		return inside;
	}

	function findCellAt(mx: number, my: number): CellData | null {
		for (const cell of cells) {
			if (pointInPolygon(mx, my, cell.polygon)) return cell;
		}
		return null;
	}

	function onMouseMove(event: MouseEvent) {
		const rect = canvasEl.getBoundingClientRect();
		const mx = event.clientX - rect.left, my = event.clientY - rect.top;
		const cell = findCellAt(mx, my);

		if (cell) {
			hoveredId = cell.id;
			ttName = `Q${cell.qNum}: ${cell.title}`;
			ttDetail = `${cell.treatise} · ${PN[cell.partId] || cell.partId} · ${cell.artCount} articles · ${cell.objCount} objections`;
			ttX = event.clientX + 16; ttY = event.clientY - 10;
			ttVisible = true;
			canvasEl.style.cursor = 'pointer';
		} else {
			if (hoveredId) { hoveredId = null; }
			ttVisible = false;
			canvasEl.style.cursor = 'default';
		}
		render();
	}

	function onClick(event: MouseEvent) {
		const rect = canvasEl.getBoundingClientRect();
		const cell = findCellAt(event.clientX - rect.left, event.clientY - rect.top);
		if (cell && index) {
			const node = index.get(cell.id);
			if (node) {
				selectedNode.set(node);
				breadcrumbPath.set(index.getPath(cell.id).map(x => x.id));
			}
		}
	}
</script>

<div class="absolute inset-0" bind:this={container}>
	{#if loading || computing}
		<div class="absolute inset-0 flex flex-col items-center justify-center z-20">
			<div class="w-10 h-10 border-2 border-gold-dim border-t-gold rounded-full animate-spin mb-5"></div>
			<p class="text-parchment-300 italic text-sm">{computing ? 'Computing voronoi cells…' : 'Loading data…'}</p>
		</div>
	{/if}

	<canvas bind:this={canvasEl} class="absolute inset-0"
		onmousemove={onMouseMove} onclick={onClick}></canvas>

	{#if ttVisible}
		<div class="fixed pointer-events-none z-50 bg-bg-panel/95 border border-gold/30 px-4 py-2.5 max-w-sm" style="left:{ttX}px;top:{ttY}px;">
			<div class="text-parchment-100 text-[14px] leading-snug">{ttName}</div>
			<div class="text-parchment-300 text-[11px] mt-1">{ttDetail}</div>
		</div>
	{/if}

	{#if !loading && !computing && cells.length > 0}
		<div class="absolute top-16 left-12 pointer-events-none">
			<div class="font-cinzel text-xs text-gold/40 tracking-[3px] uppercase">Mosaic</div>
			<div class="text-parchment-400/40 text-[11px] italic mt-1">Every question sized by complexity — hover to explore, click to read</div>
		</div>
	{/if}
</div>
