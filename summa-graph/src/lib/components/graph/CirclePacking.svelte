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
	let ttExcerpt = $state('');

	let bundleData: any = null;
	let textsLoaded = false;

	const TC: Record<string, string> = {"Sacred Doctrine":"#cb964d","One God":"#ddb063","Trinity":"#e2aa36","Creation":"#d4b86c","Angels":"#d6b541","Genesis":"#e7ce59","Man":"#cbba4d","Providence":"#ddd363","Beatitude":"#4dcb8c","Human Acts":"#63ddae","Passions":"#36e2b2","Habits & Virtues":"#6cd4c3","Vices & Sins":"#41d6ce","Law":"#59dfe7","Grace":"#4db6cb","Faith":"#8c4dcb","Hope":"#ac63dd","Charity":"#ad36e2","Prudence":"#be6cd4","Justice":"#c541d6","Fortitude":"#e459e7","Temperance":"#cb4dc2","Charisms & States":"#dd63c9","Incarnation":"#cb6c4d","Life of Christ":"#dd9663","Sacraments":"#e29a36","Penance":"#4d8ccb","Unction & Orders":"#638cdd","Matrimony":"#3652e2","Eschatology":"#6c6cd4"};
	const PC: Record<string, string> = { 'I': '#c9a84c', 'I-II': '#7ab8a8', 'II-II': '#b07aaf', 'III': '#cf7c5e', 'Suppl': '#8a9abf' };
	const PN: Record<string, string> = { 'I': 'Prima Pars', 'I-II': 'Prima Secundae', 'II-II': 'Secunda Secundae', 'III': 'Tertia Pars', 'Suppl': 'Supplement' };

	let focus: d3.HierarchyCircularNode<any>;
	let view: [number, number, number];

	onMount(() => {
		if (!container) return;
		width = container.clientWidth; height = container.clientHeight;
		const ro = new ResizeObserver(entries => {
			for (const e of entries) { width = e.contentRect.width; height = e.contentRect.height; }
			if (bundleData) buildPacking();
		});
		ro.observe(container);
		return () => ro.disconnect();
	});

	$effect(() => {
		if (svgEl && width > 0 && index) {
			if (!bundleData) {
				loading = true;
				fetch('/summa_bundle.json').then(r => r.json()).then((d: any) => {
					bundleData = d; buildPacking(); loading = false;
					// Lazy-load texts for hover excerpts
					index!.loadTexts().then(() => { textsLoaded = true; });
				});
			} else { buildPacking(); }
		}
	});

	function getColor(d: d3.HierarchyCircularNode<any>): string {
		if (!d.children && d.data.treatise) return TC[d.data.treatise] || '#c9a84c';
		if (d.data.treatise && d.children) return TC[d.data.name] || TC[d.data.treatise] || '#c9a84c';
		const pid = d.data.id?.replace('part:', '') || d.data.partId || '';
		if (pid && PC[pid]) return PC[pid];
		return '#2a2520';
	}

	function wrapText(text: string, maxCharsPerLine: number): string[] {
		const words = text.split(/\s+/);
		const lines: string[] = [];
		let current = '';
		for (const word of words) {
			if (current && (current + ' ' + word).length > maxCharsPerLine) {
				lines.push(current);
				current = word;
			} else {
				current = current ? current + ' ' + word : word;
			}
		}
		if (current) lines.push(current);
		return lines;
	}

	function buildPacking() {
		if (!bundleData || !svgEl || !width) return;
		const svg = d3.select(svgEl);
		svg.selectAll('*').remove();

		const root = d3.hierarchy(bundleData.hierarchy)
			.sum(d => (!d.children || d.children.length === 0) ? Math.max(d.objectionCount || d.articleCount || 1, 1) : 0)
			.sort((a, b) => (b.value || 0) - (a.value || 0));

		const diameter = Math.min(width, height) * 0.92;
		const pack = d3.pack<any>().size([diameter, diameter]).padding(d => d.depth === 0 ? 20 : d.depth === 1 ? 12 : 4);
		const packed = pack(root) as d3.HierarchyCircularNode<any>;

		focus = packed;
		view = [packed.x, packed.y, packed.r * 2];

		svg.attr('viewBox', `-${diameter / 2} -${diameter / 2} ${diameter} ${diameter}`)
			.attr('width', width).attr('height', height)
			.style('cursor', 'pointer')
			.on('click', (event) => zoomTo(event, packed));

		const defs = svg.append('defs');
		// Glow filter
		const glow = defs.append('filter').attr('id', 'hover-glow').attr('x', '-30%').attr('y', '-30%').attr('width', '160%').attr('height', '160%');
		glow.append('feGaussianBlur').attr('stdDeviation', '4').attr('result', 'blur');
		const mg = glow.append('feMerge'); mg.append('feMergeNode').attr('in', 'blur'); mg.append('feMergeNode').attr('in', 'SourceGraphic');

		const g = svg.append('g');
		const allNodes = packed.descendants().slice(1);

		// ─── Circles ───
		const circle = g.selectAll<SVGCircleElement, d3.HierarchyCircularNode<any>>('circle')
			.data(allNodes)
			.join('circle')
			.attr('fill', d => {
				const c = getColor(d);
				if (d.children) {
					// Group: subtle fill
					return d3.color(c)!.copy({ opacity: 0.08 }).formatRgb();
				}
				// Leaf: solid but slightly transparent
				return d3.color(c)!.copy({ opacity: 0.75 }).formatRgb();
			})
			.attr('stroke', d => getColor(d))
			.attr('stroke-width', d => d.children ? (d.depth === 1 ? 1.5 : 1) : 0.5)
			.attr('stroke-opacity', d => d.children ? 0.25 : 0.15)
			.style('cursor', 'pointer')
			.style('transition', 'filter 0.2s, opacity 0.2s')
			.on('mouseenter', function(event, d) {
				d3.select(this).attr('filter', 'url(#hover-glow)').attr('stroke-opacity', 0.6).attr('stroke-width', d.children ? 2 : 1.5);
				showTooltip(event, d);
			})
			.on('mousemove', (event) => { ttX = event.clientX + 16; ttY = event.clientY - 10; })
			.on('mouseleave', function(event, d) {
				d3.select(this).attr('filter', null).attr('stroke-opacity', d.children ? 0.25 : 0.15).attr('stroke-width', d.children ? (d.depth === 1 ? 1.5 : 1) : 0.5);
				ttVisible = false;
			})
			.on('click', (event, d) => {
				event.stopPropagation();
				if (!d.children) { openQuestion(d); }
				else if (focus !== d) { zoomTo(event, d); }
				else { zoomTo(event, d.parent || packed); }
			});

		// ─── Labels ───
		const label = g.selectAll<SVGGElement, d3.HierarchyCircularNode<any>>('g.label')
			.data(allNodes)
			.join('g')
			.attr('class', 'label')
			.style('pointer-events', 'none')
			.style('fill-opacity', d => d.parent === packed ? 1 : 0)
			.style('display', d => d.parent === packed ? 'inline' : 'none');

		// Build label content
		label.each(function(d) {
			const el = d3.select(this);
			const c = getColor(d);

			if (d.children) {
				// ─── Group label: treatise or part ───
				const name = d.data.name || '';
				const lines = wrapText(name, 14);
				const fontSize = d.depth === 1 ? 0.08 : 0.12; // as fraction of radius

				el.selectAll('text').data([0]).join('text')
					.attr('text-anchor', 'middle')
					.attr('fill', '#f0e6d0')
					.attr('opacity', 0.9)
					.style('font-family', 'Cinzel, serif')
					.style('font-weight', '600')
					.style('letter-spacing', '1.5px')
					.style('paint-order', 'stroke')
					.style('stroke', 'rgba(14,12,8,0.7)')
					.style('stroke-width', '3px')
					.selectAll('tspan').data(lines).join('tspan')
					.attr('x', 0)
					.attr('dy', (_, i) => i === 0 ? `${-(lines.length - 1) * 0.5}em` : '1.15em')
					.text(t => t);
			} else {
				// ─── Leaf label: question title ───
				const title = (d.data.label || d.data.name || '').replace(/^OF\s+/i, '').replace(/^THE\s+/i, '');
				const qNum = d.data.questionNum || '';
				const lines = wrapText(title, 18);
				const maxLines = 4;
				const displayLines = lines.slice(0, maxLines);
				if (lines.length > maxLines) {
					displayLines[maxLines - 1] = displayLines[maxLines - 1].replace(/\s+\S*$/, '') + '…';
				}

				const group = el.selectAll('text').data([0]).join('text')
					.attr('text-anchor', 'middle')
					.attr('fill', '#f0e6d0')
					.style('paint-order', 'stroke')
					.style('stroke', 'rgba(14,12,8,0.8)')
					.style('stroke-width', '2.5px');

				// Q number at top
				group.selectAll('tspan').remove();
				group.append('tspan')
					.attr('x', 0)
					.attr('dy', `${-(displayLines.length) * 0.5}em`)
					.attr('fill', '#f0e6d0')
					.attr('opacity', 0.7)
					.style('font-family', 'Cinzel, serif')
					.style('font-weight', '700')
					.style('font-size', '0.85em')
					.text(`Q${qNum}`);

				for (let i = 0; i < displayLines.length; i++) {
					group.append('tspan')
						.attr('x', 0)
						.attr('dy', i === 0 ? '1.3em' : '1.15em')
						.attr('fill', '#f0e6d0')
						.attr('opacity', 1)
						.style('font-family', '"Cormorant Garamond", Georgia, serif')
						.style('font-weight', '500')
						.text(displayLines[i]);
				}
			}
		});

		// ─── Article dot indicators inside question circles ───
		const dotGroup = g.selectAll<SVGGElement, d3.HierarchyCircularNode<any>>('g.dots')
			.data(allNodes.filter(d => !d.children && d.data.articleCount > 0))
			.join('g')
			.attr('class', 'dots')
			.style('pointer-events', 'none')
			.style('opacity', d => d.parent === packed ? 0.4 : 0)
			.style('display', d => d.parent === packed ? 'inline' : 'none');

		dotGroup.each(function(d) {
			const el = d3.select(this);
			const count = Math.min(d.data.articleCount || 0, 16);
			const dotR = 0.022; // fraction of parent diameter
			// Arrange dots in a small arc at bottom of circle
			for (let i = 0; i < count; i++) {
				const angle = Math.PI * 0.6 + (Math.PI * 0.8) * (i / Math.max(count - 1, 1));
				const dr = 0.7; // fraction of circle radius
				el.append('circle')
					.attr('data-dx', Math.cos(angle) * dr)
					.attr('data-dy', Math.sin(angle) * dr)
					.attr('data-dr', dotR)
					.attr('fill', getColor(d))
					.attr('opacity', 0.5);
			}
		});

		// Initial position
		applyZoom(view);

		function applyZoom(v: [number, number, number]) {
			const k = diameter / v[2];
			view = v;

			circle.attr('transform', d => `translate(${(d.x - v[0]) * k},${(d.y - v[1]) * k})`)
				.attr('r', d => d.r * k);

			label.attr('transform', d => `translate(${(d.x - v[0]) * k},${(d.y - v[1]) * k})`)
				.each(function(d) {
					const r = d.r * k;
					d3.select(this).selectAll('text')
						.style('font-size', d.children
							? `${Math.max(8, Math.min(r * (d.depth === 1 ? 0.1 : 0.16), 20))}px`
							: `${Math.max(7, Math.min(r * 0.13, 16))}px`
						);
				});

			// Position article dots
			dotGroup.attr('transform', d => `translate(${(d.x - v[0]) * k},${(d.y - v[1]) * k})`)
				.each(function(d) {
					const r = d.r * k;
					d3.select(this).selectAll('circle').each(function() {
						const dot = d3.select(this);
						const dx = parseFloat(dot.attr('data-dx'));
						const dy = parseFloat(dot.attr('data-dy'));
						const dr = parseFloat(dot.attr('data-dr'));
						dot.attr('cx', dx * r).attr('cy', dy * r).attr('r', dr * diameter);
					});
				});
		}

		function zoomTo(event: any, d: d3.HierarchyCircularNode<any>) {
			focus = d;
			const target: [number, number, number] = [d.x, d.y, d.r * 2];

			const transition = svg.transition().duration(750).tween('zoom', () => {
				const i = d3.interpolateZoom(view, target);
				return (t: number) => applyZoom(i(t) as [number, number, number]);
			});

			// Show/hide labels
			label.filter(function(n) { return n.parent === d || (this as SVGGElement).style.display === 'inline'; })
				.transition(transition)
				.style('fill-opacity', n => n.parent === d ? 1 : 0)
				.on('start', function(n) { if (n.parent === d) (this as SVGGElement).style.display = 'inline'; })
				.on('end', function(n) { if (n.parent !== d) (this as SVGGElement).style.display = 'none'; });

			// Show/hide dots
			dotGroup.filter(function(n) { return n.parent === d || (this as SVGGElement).style.display === 'inline'; })
				.transition(transition)
				.style('opacity', n => n.parent === d ? 0.4 : 0)
				.on('start', function(n) { if (n.parent === d) (this as SVGGElement).style.display = 'inline'; })
				.on('end', function(n) { if (n.parent !== d) (this as SVGGElement).style.display = 'none'; });
		}
	}

	async function showTooltip(event: MouseEvent, d: d3.HierarchyCircularNode<any>) {
		ttExcerpt = '';

		if (!d.children) {
			const title = d.data.label || d.data.name || '';
			const treatise = d.data.treatise || '';
			const partId = d.data.partId || '';
			ttName = `Q${d.data.questionNum || ''}: ${title}`;
			ttDetail = `${treatise} · ${PN[partId] || partId} · ${d.data.articleCount || 0} articles · ${d.data.objectionCount || 0} objections`;

			// Load respondeo excerpt if texts available
			if (textsLoaded && index) {
				const artChildren = index.getChildren(d.data.id).filter(c => c.type === 'article');
				if (artChildren.length > 0) {
					const text = await index.getRespondeo(artChildren[0].id);
					if (text) {
						const clean = text.replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim();
						ttExcerpt = clean.substring(0, 120) + (clean.length > 120 ? '…' : '');
					}
				}
			}
		} else {
			const qCount = d.leaves().length;
			const artCount = d.leaves().reduce((s, l) => s + (l.data.articleCount || 0), 0);
			const objCount = d.leaves().reduce((s, l) => s + (l.data.objectionCount || 0), 0);

			if (d.depth >= 2) {
				ttName = d.data.name || '';
				ttDetail = `${qCount} questions · ${artCount} articles · ${objCount} objections`;
			} else {
				const pid = d.data.id?.replace('part:', '') || '';
				ttName = PN[pid] || d.data.name || '';
				ttDetail = `${qCount} questions · ${artCount} articles`;
			}
		}
		ttX = event.clientX + 16;
		ttY = event.clientY - 10;
		ttVisible = true;
	}

	function openQuestion(d: d3.HierarchyCircularNode<any>) {
		if (!index) return;
		const node = index.get(d.data.id);
		if (node) {
			selectedNode.set(node);
			breadcrumbPath.set(index.getPath(d.data.id).map(x => x.id));
		}
	}
</script>

<div class="absolute inset-0" bind:this={container}>
	{#if loading}
		<div class="absolute inset-0 flex flex-col items-center justify-center z-20">
			<div class="w-10 h-10 border-2 border-gold-dim border-t-gold rounded-full animate-spin mb-5"></div>
			<p class="text-parchment-300 italic text-sm">Building visualization…</p>
		</div>
	{/if}

	<svg bind:this={svgEl} class="absolute inset-0"></svg>

	{#if ttVisible}
		<div class="fixed pointer-events-none z-50 bg-bg-panel/95 border border-gold/30 px-4 py-2.5 max-w-sm"
			style="left:{ttX}px;top:{ttY}px;">
			<div class="text-parchment-100 text-[14px] leading-snug">{ttName}</div>
			<div class="text-parchment-300 text-[11px] mt-1">{ttDetail}</div>
			{#if ttExcerpt}
				<div class="text-parchment-200/70 text-[12px] mt-2 italic leading-relaxed border-t border-gold/10 pt-2">
					"{ttExcerpt}"
				</div>
			{/if}
		</div>
	{/if}

	{#if !loading}
		<div class="absolute bottom-5 left-7 text-[11px] text-parchment-400/50 pointer-events-none">
			Click to zoom in · Click background to zoom out · Click a question to read
		</div>
	{/if}
</div>
