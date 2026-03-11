<script lang="ts">
	import { onMount } from 'svelte';
	import * as d3 from 'd3';

	let data = $state<any>(null);
	let loading = $state(true);
	let sortBy = $state<'objections' | 'articles' | 'questions'>('objections');

	const TC: Record<string, string> = {"Sacred Doctrine":"#cb964d","One God":"#ddb063","Trinity":"#e2aa36","Creation":"#d4b86c","Angels":"#d6b541","Genesis":"#e7ce59","Man":"#cbba4d","Providence":"#ddd363","Beatitude":"#4dcb8c","Human Acts":"#63ddae","Passions":"#36e2b2","Habits & Virtues":"#6cd4c3","Vices & Sins":"#41d6ce","Law":"#59dfe7","Grace":"#4db6cb","Faith":"#8c4dcb","Hope":"#ac63dd","Charity":"#ad36e2","Prudence":"#be6cd4","Justice":"#c541d6","Fortitude":"#e459e7","Temperance":"#cb4dc2","Charisms & States":"#dd63c9","Incarnation":"#cb6c4d","Life of Christ":"#dd9663","Sacraments":"#e29a36","Penance":"#4d8ccb","Unction & Orders":"#638cdd","Matrimony":"#3652e2","Eschatology":"#6c6cd4"};

	onMount(() => { fetch('/summa_bundle.json').then(r => r.json()).then(d => { data = d; loading = false; }); });

	let sortedTreatises = $derived(
		data ? [...data.treatiseData].sort((a: any, b: any) => b[sortBy] - a[sortBy]) : []
	);
	let maxVal = $derived(sortedTreatises.length ? Math.max(...sortedTreatises.map((t: any) => t[sortBy])) : 1);
</script>

<div class="absolute inset-0 overflow-y-auto">
	{#if loading}
		<div class="flex items-center justify-center h-full">
			<div class="w-10 h-10 border-2 border-gold-dim border-t-gold rounded-full animate-spin"></div>
		</div>
	{:else if data}
		<div class="max-w-5xl mx-auto px-8 pt-24 pb-16">
			<!-- Hero stats -->
			<h2 class="font-cinzel text-3xl text-gold tracking-[4px] text-center mb-2">ANATOMY OF THE SUMMA</h2>
			<p class="text-center text-parchment-300 italic text-sm mb-10">A quantitative portrait of the Summa Theologiae</p>

			<div class="grid grid-cols-5 gap-4 mb-14">
				{#each [
					[data.anatomy.totalParts, 'Parts'],
					[data.anatomy.totalTreatises, 'Treatises'],
					[data.anatomy.totalQuestions, 'Questions'],
					[data.anatomy.totalArticles, 'Articles'],
					[data.anatomy.totalObjections, 'Objections'],
				] as [value, label]}
					<div class="text-center py-5 border border-gold/10 bg-gold/3">
						<div class="font-cinzel text-3xl font-bold text-gold-bright">{value.toLocaleString()}</div>
						<div class="text-[10px] uppercase tracking-[2px] text-parchment-300 mt-1">{label}</div>
					</div>
				{/each}
			</div>

			<!-- Bar chart: treatise sizes -->
			<div class="mb-14">
				<div class="flex items-baseline justify-between mb-5">
					<h3 class="font-cinzel text-lg text-gold tracking-wider">Treatise Breakdown</h3>
					<div class="flex gap-2">
						{#each [['objections', 'Objections'], ['articles', 'Articles'], ['questions', 'Questions']] as [key, label]}
							<button class="px-2.5 py-1 text-[10px] font-cinzel tracking-wider border transition-all
								{sortBy === key ? 'bg-gold/15 border-gold-dim text-gold' : 'border-gold/15 text-parchment-400 hover:text-gold'}"
								onclick={() => sortBy = key as any}>{label}</button>
						{/each}
					</div>
				</div>

				<div class="space-y-1.5">
					{#each sortedTreatises as t}
						<div class="flex items-center gap-3 group">
							<div class="w-36 text-right text-[12px] text-parchment-300 font-cormorant truncate shrink-0">{t.name}</div>
							<div class="flex-1 h-6 bg-gold/3 relative overflow-hidden">
								<div class="absolute inset-y-0 left-0 transition-all duration-500"
									style="width:{(t[sortBy] / maxVal * 100)}%; background:{TC[t.name] || '#c9a84c'}; opacity: 0.65;"></div>
								<span class="absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-parchment-200 font-cinzel">{t[sortBy]}</span>
							</div>
						</div>
					{/each}
				</div>
			</div>

			<!-- Controversy density -->
			<div class="mb-14">
				<h3 class="font-cinzel text-lg text-gold tracking-wider mb-2">Average Objections per Article</h3>
				<p class="text-parchment-400 text-sm italic mb-5">Higher = more contested theological territory</p>
				<div class="space-y-1.5">
					{#each [...data.treatiseData].sort((a, b) => b.avgObjPerArt - a.avgObjPerArt) as t}
						<div class="flex items-center gap-3">
							<div class="w-36 text-right text-[12px] text-parchment-300 font-cormorant truncate shrink-0">{t.name}</div>
							<div class="flex-1 h-5 bg-gold/3 relative overflow-hidden">
								<div class="absolute inset-y-0 left-0" style="width:{(t.avgObjPerArt / 5 * 100)}%; background:{TC[t.name]}; opacity:0.55;"></div>
								<span class="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-parchment-200">{t.avgObjPerArt}</span>
							</div>
						</div>
					{/each}
				</div>
			</div>

			<!-- Most debated questions -->
			<div>
				<h3 class="font-cinzel text-lg text-gold tracking-wider mb-2">Most Debated Questions</h3>
				<p class="text-parchment-400 text-sm italic mb-5">Questions with the highest objection counts</p>
				<div class="space-y-2">
					{#each data.topDebated as q, i}
						<div class="flex items-center gap-4 py-2.5 px-4 border-b border-gold/5">
							<span class="font-cinzel text-gold-dim text-sm w-6 shrink-0">{i + 1}.</span>
							<div class="w-3 h-3 rounded-full shrink-0" style="background:{TC[q.treatise]}"></div>
							<div class="flex-1 min-w-0">
								<div class="text-parchment-100 text-[14px] leading-snug truncate">Q{q.qNum}: {q.title}</div>
								<div class="text-parchment-400 text-[11px]">{q.treatise} · {q.articles} articles</div>
							</div>
							<div class="text-right shrink-0">
								<span class="font-cinzel text-gold text-lg">{q.objections}</span>
								<span class="text-parchment-400 text-[10px] block">objections</span>
							</div>
						</div>
					{/each}
				</div>
			</div>
		</div>
	{/if}
</div>
