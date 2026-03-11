<script lang="ts">
	import { onMount } from 'svelte';
	import * as d3 from 'd3';

	let container: HTMLDivElement;
	let svgEl: SVGSVGElement;
	let width = $state(0);
	let height = $state(0);
	let loading = $state(true);

	let ttVisible = $state(false);
	let ttX = $state(0);
	let ttY = $state(0);
	let ttContent = $state('');

	const TC: Record<string, string> = {"Sacred Doctrine":"#cb964d","One God":"#ddb063","Trinity":"#e2aa36","Creation":"#d4b86c","Angels":"#d6b541","Genesis":"#e7ce59","Man":"#cbba4d","Providence":"#ddd363","Beatitude":"#4dcb8c","Human Acts":"#63ddae","Passions":"#36e2b2","Habits & Virtues":"#6cd4c3","Vices & Sins":"#41d6ce","Law":"#59dfe7","Grace":"#4db6cb","Faith":"#8c4dcb","Hope":"#ac63dd","Charity":"#ad36e2","Prudence":"#be6cd4","Justice":"#c541d6","Fortitude":"#e459e7","Temperance":"#cb4dc2","Charisms & States":"#dd63c9","Incarnation":"#cb6c4d","Life of Christ":"#dd9663","Sacraments":"#e29a36","Penance":"#4d8ccb","Unction & Orders":"#638cdd","Matrimony":"#3652e2","Eschatology":"#6c6cd4"};

	onMount(() => {
		if (!container) return;
		width = container.clientWidth; height = container.clientHeight;
		const ro = new ResizeObserver(entries => { for (const e of entries) { width = e.contentRect.width; height = e.contentRect.height; } });
		ro.observe(container);
		loading = true;
		fetch('/summa_bundle.json').then(r => r.json()).then(data => { buildChord(data); loading = false; });
		return () => ro.disconnect();
	});

	function buildChord(data: any) {
		if (!svgEl || !width) return;
		const svg = d3.select(svgEl);
		svg.selectAll('*').remove();

		const matrix = data.chordMatrix;
		const names = data.chordOrder as string[];
		const n = names.length;
		const outerRadius = Math.min(width, height) * 0.42;
		const innerRadius = outerRadius - 20;

		svg.attr('viewBox', `${-width/2} ${-height/2} ${width} ${height}`).attr('width', width).attr('height', height);

		const chord = d3.chord().padAngle(0.04).sortSubgroups(d3.descending)(matrix);
		const arc = d3.arc<d3.ChordGroup>().innerRadius(innerRadius).outerRadius(outerRadius);
		const ribbon = d3.ribbon<any, d3.ChordSubgroup>().radius(innerRadius - 2);

		const g = svg.append('g');

		// Ribbons
		g.append('g').attr('fill-opacity', 0.5)
			.selectAll('path')
			.data(chord)
			.join('path')
			.attr('d', ribbon as any)
			.attr('fill', d => TC[names[d.source.index]] || '#c9a84c')
			.attr('stroke', 'none')
			.style('mix-blend-mode', 'screen')
			.on('mouseenter', (event, d) => {
				const s = names[d.source.index], t = names[d.target.index];
				const w = matrix[d.source.index][d.target.index];
				ttContent = `${s} → ${t}: ${w} citations`;
				ttX = event.clientX + 16; ttY = event.clientY - 10; ttVisible = true;
				d3.select(event.currentTarget).attr('fill-opacity', 0.85);
			})
			.on('mousemove', e => { ttX = e.clientX + 16; ttY = e.clientY - 10; })
			.on('mouseleave', (event) => { ttVisible = false; d3.select(event.currentTarget).attr('fill-opacity', 0.5); });

		// Arcs
		const group = g.append('g')
			.selectAll('g')
			.data(chord.groups)
			.join('g');

		group.append('path')
			.attr('d', arc as any)
			.attr('fill', d => TC[names[d.index]] || '#c9a84c')
			.attr('stroke', d => TC[names[d.index]] || '#c9a84c')
			.attr('stroke-opacity', 0.3)
			.on('mouseenter', (event, d) => {
				const total = d3.sum(matrix[d.index]);
				ttContent = `${names[d.index]}: ${total} total cross-citations`;
				ttX = event.clientX + 16; ttY = event.clientY - 10; ttVisible = true;
			})
			.on('mousemove', e => { ttX = e.clientX + 16; ttY = e.clientY - 10; })
			.on('mouseleave', () => { ttVisible = false; });

		// Labels
		group.append('text')
			.each(d => { (d as any).angle = (d.startAngle + d.endAngle) / 2; })
			.attr('dy', '0.35em')
			.attr('transform', d => {
				const a = ((d as any).angle * 180 / Math.PI - 90);
				return `rotate(${a}) translate(${outerRadius + 8}) ${a > 90 ? 'rotate(180)' : ''}`;
			})
			.attr('text-anchor', d => (d as any).angle > Math.PI ? 'end' : 'start')
			.attr('fill', d => TC[names[d.index]] || '#c9a84c')
			.attr('opacity', 0.8)
			.style('font-family', 'Cinzel, serif')
			.style('font-size', '9px')
			.style('font-weight', '600')
			.style('letter-spacing', '0.5px')
			.text(d => names[d.index]);
	}
</script>

<div class="absolute inset-0" bind:this={container}>
	{#if loading}
		<div class="absolute inset-0 flex flex-col items-center justify-center z-20">
			<div class="w-10 h-10 border-2 border-gold-dim border-t-gold rounded-full animate-spin mb-5"></div>
		</div>
	{/if}
	<svg bind:this={svgEl} class="absolute inset-0"></svg>
	{#if ttVisible}
		<div class="fixed pointer-events-none z-50 bg-bg-panel/95 border border-gold/30 px-4 py-2.5" style="left:{ttX}px;top:{ttY}px;">
			<div class="text-parchment-100 text-[13px]">{ttContent}</div>
		</div>
	{/if}
	<div class="absolute bottom-5 left-7 text-[11px] text-parchment-400/50 pointer-events-none">
		Hover ribbons to see citation flows between treatises
	</div>
</div>
