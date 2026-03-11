<script lang="ts">
	import { onMount } from 'svelte';
	import * as d3 from 'd3';
	import { selectedNode, breadcrumbPath } from '$lib/stores/app';
	import type { SummaIndex } from '$lib/data';

	interface Props { index: SummaIndex | null; }
	let { index }: Props = $props();

	let container: HTMLDivElement;
	let svgEl: SVGSVGElement;
	let width = $state(0);
	let height = $state(0);
	let loading = $state(true);

	let ttVisible = $state(false);
	let ttX = $state(0);
	let ttY = $state(0);
	let ttName = $state('');
	let ttDetail = $state('');

	let hoveredTreatise = $state<string | null>(null);
	let hoveredIdx = $state<number | null>(null);

	const TC: Record<string, string> = {"Sacred Doctrine":"#cb964d","One God":"#ddb063","Trinity":"#e2aa36","Creation":"#d4b86c","Angels":"#d6b541","Genesis":"#e7ce59","Man":"#cbba4d","Providence":"#ddd363","Beatitude":"#4dcb8c","Human Acts":"#63ddae","Passions":"#36e2b2","Habits & Virtues":"#6cd4c3","Vices & Sins":"#41d6ce","Law":"#59dfe7","Grace":"#4db6cb","Faith":"#8c4dcb","Hope":"#ac63dd","Charity":"#ad36e2","Prudence":"#be6cd4","Justice":"#c541d6","Fortitude":"#e459e7","Temperance":"#cb4dc2","Charisms & States":"#dd63c9","Incarnation":"#cb6c4d","Life of Christ":"#dd9663","Sacraments":"#e29a36","Penance":"#4d8ccb","Unction & Orders":"#638cdd","Matrimony":"#3652e2","Eschatology":"#6c6cd4"};
	const PN: Record<string, string> = { 'I': 'Prima Pars', 'I-II': 'Prima Secundae', 'II-II': 'Secunda Secundae', 'III': 'Tertia Pars', 'Suppl': 'Supplement' };

	let streamData: any[] = [];
	let treatises: string[] = [];

	onMount(() => {
		if (!container) return;
		width = container.clientWidth; height = container.clientHeight;
		const ro = new ResizeObserver(entries => { for (const e of entries) { width = e.contentRect.width; height = e.contentRect.height; } if (streamData.length) buildStream(); });
		ro.observe(container);
		fetch('/summa_bundle.json').then(r => r.json()).then(data => {
			streamData = data.streamData; treatises = data.streamTreatises; buildStream(); loading = false;
		});
		return () => ro.disconnect();
	});

	function buildStream() {
		if (!svgEl || !width || !streamData.length) return;
		const svg = d3.select(svgEl); svg.selectAll('*').remove();

		const margin = { top: 50, right: 30, bottom: 70, left: 50 };
		const w = width - margin.left - margin.right;
		const h = height - margin.top - margin.bottom;

		svg.attr('width', width).attr('height', height);
		const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

		// Stack
		const keys = treatises.map(t => `t:${t}`);
		const stack = d3.stack<any>().keys(keys).offset(d3.stackOffsetWiggle).order(d3.stackOrderInsideOut);
		const series = stack(streamData);

		// Scales
		const x = d3.scaleLinear().domain([0, streamData.length - 1]).range([0, w]);
		const yMin = d3.min(series, s => d3.min(s, d => d[0])) || 0;
		const yMax = d3.max(series, s => d3.max(s, d => d[1])) || 1;
		const y = d3.scaleLinear().domain([yMin, yMax]).range([h, 0]);

		// Area generator
		const area = d3.area<any>()
			.x((_, i) => x(i))
			.y0(d => y(d[0]))
			.y1(d => y(d[1]))
			.curve(d3.curveBasis);

		// Draw streams
		const paths = g.selectAll<SVGPathElement, d3.Series<any, string>>('path.stream')
			.data(series)
			.join('path')
			.attr('class', 'stream')
			.attr('d', area)
			.attr('fill', d => {
				const tName = d.key.replace('t:', '');
				return TC[tName] || '#c9a84c';
			})
			.attr('fill-opacity', 0.75)
			.attr('stroke', 'none')
			.style('cursor', 'pointer')
			.on('mouseenter', function(event, d) {
				const tName = d.key.replace('t:', '');
				hoveredTreatise = tName;
				paths.attr('fill-opacity', dd => dd.key === d.key ? 0.95 : 0.15);
				showTreatiseTip(event, tName);
			})
			.on('mousemove', function(event) {
				// Find which question we're over
				const [mx] = d3.pointer(event, g.node());
				const idx = Math.round(x.invert(mx));
				if (idx >= 0 && idx < streamData.length) {
					hoveredIdx = idx;
					const q = streamData[idx];
					if (hoveredTreatise && q.treatise === hoveredTreatise) {
						ttName = `Q${q.qNum}: ${q.title}`;
						ttDetail = `${q.treatise} · ${q.totalObjs} objections · ${q.artCount} articles`;
					}
				}
				ttX = event.clientX + 16; ttY = event.clientY - 10;
			})
			.on('mouseleave', function() {
				hoveredTreatise = null; hoveredIdx = null; ttVisible = false;
				paths.attr('fill-opacity', 0.75);
			})
			.on('click', function(event, d) {
				const [mx] = d3.pointer(event, g.node());
				const idx = Math.round(x.invert(mx));
				if (idx >= 0 && idx < streamData.length) {
					openQuestion(streamData[idx].qId);
				}
			});

		// ─── Part boundary markers ───
		let prevPart = '';
		const partBounds: { idx: number; partId: string }[] = [];
		for (let i = 0; i < streamData.length; i++) {
			if (streamData[i].partId !== prevPart) {
				partBounds.push({ idx: i, partId: streamData[i].partId });
				prevPart = streamData[i].partId;
			}
		}

		// Part labels at bottom
		for (let pi = 0; pi < partBounds.length; pi++) {
			const startIdx = partBounds[pi].idx;
			const endIdx = pi + 1 < partBounds.length ? partBounds[pi + 1].idx : streamData.length;
			const midIdx = (startIdx + endIdx) / 2;
			const pid = partBounds[pi].partId;

			// Vertical line at boundary
			if (pi > 0) {
				g.append('line')
					.attr('x1', x(startIdx)).attr('x2', x(startIdx))
					.attr('y1', 0).attr('y2', h)
					.attr('stroke', '#f0e6d0').attr('stroke-opacity', 0.08)
					.attr('stroke-dasharray', '4,4');
			}

			// Part label below
			g.append('text')
				.attr('x', x(midIdx)).attr('y', h + 28)
				.attr('text-anchor', 'middle')
				.attr('fill', '#f0e6d0').attr('opacity', 0.4)
				.style('font-family', 'Cinzel, serif')
				.style('font-size', '10px')
				.style('font-weight', '600')
				.style('letter-spacing', '1.5px')
				.text(PN[pid] || pid);
		}

		// ─── Hover scanline ───
		const scanline = g.append('line')
			.attr('y1', 0).attr('y2', h)
			.attr('stroke', '#f0e6d0').attr('stroke-opacity', 0)
			.attr('stroke-width', 1)
			.attr('pointer-events', 'none');

		g.append('rect')
			.attr('width', w).attr('height', h)
			.attr('fill', 'transparent')
			.style('cursor', 'crosshair')
			.on('mousemove', function(event) {
				const [mx] = d3.pointer(event);
				scanline.attr('x1', mx).attr('x2', mx).attr('stroke-opacity', 0.15);
				const idx = Math.round(x.invert(mx));
				if (idx >= 0 && idx < streamData.length) {
					const q = streamData[idx];
					ttName = `Q${q.qNum}: ${q.title}`;
					ttDetail = `${q.treatise} · ${PN[q.partId] || q.partId} · ${q.totalObjs} objections`;
					ttX = event.clientX + 16; ttY = event.clientY - 10;
					ttVisible = true;
				}
			})
			.on('mouseleave', () => { scanline.attr('stroke-opacity', 0); ttVisible = false; })
			.on('click', function(event) {
				const [mx] = d3.pointer(event);
				const idx = Math.round(x.invert(mx));
				if (idx >= 0 && idx < streamData.length) openQuestion(streamData[idx].qId);
			})
			.lower(); // put behind the stream paths

		// ─── Y axis label ───
		g.append('text')
			.attr('transform', 'rotate(-90)')
			.attr('x', -h / 2).attr('y', -35)
			.attr('text-anchor', 'middle')
			.attr('fill', '#a89a80').attr('opacity', 0.3)
			.style('font-family', 'Cinzel, serif')
			.style('font-size', '9px')
			.style('letter-spacing', '2px')
			.text('OBJECTION DENSITY');

		// ─── X axis: question number ticks ───
		const xAxis = d3.axisBottom(x)
			.tickValues(d3.range(0, streamData.length, 50))
			.tickFormat(i => `Q${streamData[i as number]?.qNum || ''}`);

		g.append('g')
			.attr('transform', `translate(0,${h})`)
			.call(xAxis)
			.call(g => g.select('.domain').remove())
			.call(g => g.selectAll('.tick line').attr('stroke', '#a89a80').attr('stroke-opacity', 0.15))
			.call(g => g.selectAll('.tick text').attr('fill', '#a89a80').attr('opacity', 0.3).style('font-family', 'Cinzel, serif').style('font-size', '8px'));
	}

	function showTreatiseTip(event: MouseEvent, treatise: string) {
		const qs = streamData.filter(d => d.treatise === treatise);
		const totalObjs = qs.reduce((s, q) => s + q.totalObjs, 0);
		ttName = treatise;
		ttDetail = `${qs.length} questions · ${totalObjs} total objections`;
		ttX = event.clientX + 16; ttY = event.clientY - 10;
		ttVisible = true;
	}

	function openQuestion(qId: string) {
		if (!index) return;
		const node = index.get(qId);
		if (node) {
			selectedNode.set(node);
			breadcrumbPath.set(index.getPath(qId).map(x => x.id));
		}
	}
</script>

<div class="absolute inset-0" bind:this={container}>
	{#if loading}
		<div class="absolute inset-0 flex flex-col items-center justify-center z-20">
			<div class="w-10 h-10 border-2 border-gold-dim border-t-gold rounded-full animate-spin mb-5"></div>
			<p class="text-parchment-300 italic text-sm">Building landscape…</p>
		</div>
	{/if}

	<svg bind:this={svgEl} class="absolute inset-0"></svg>

	{#if ttVisible}
		<div class="fixed pointer-events-none z-50 bg-bg-panel/95 border border-gold/30 px-4 py-2.5 max-w-sm" style="left:{ttX}px;top:{ttY}px;">
			<div class="text-parchment-100 text-[14px] leading-snug">{ttName}</div>
			<div class="text-parchment-300 text-[11px] mt-1">{ttDetail}</div>
		</div>
	{/if}

	{#if !loading}
		<div class="absolute top-16 left-12 pointer-events-none">
			<div class="font-cinzel text-xs text-gold/40 tracking-[3px] uppercase">Landscape</div>
			<div class="text-parchment-400/40 text-[11px] italic mt-1">Objection density across 610 questions — click any point to read</div>
		</div>
	{/if}
</div>
