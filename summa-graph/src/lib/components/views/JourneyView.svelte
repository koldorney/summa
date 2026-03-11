<script lang="ts">
	import { onMount } from 'svelte';
	import type { SummaIndex } from '$lib/data';

	interface Props { index: SummaIndex | null; }
	let { index }: Props = $props();

	let bundleData = $state<any>(null);
	let loading = $state(true);
	let selectedJourney = $state<string | null>(null);

	type JourneyCard = { id: string; qNum: number; title: string; treatise: string; partId: string; excerpt: string; artCount: number; objCount: number };
	let cards = $state<JourneyCard[]>([]);
	let loadingCards = $state(false);

	let expandedQId = $state<string | null>(null);
	type ArticleReading = { id: string; num: number; title: string; respondeo: string; objections: { num: number; text: string }[]; sedContra: string; replies: { num: number; text: string }[]; loaded: boolean };
	let articles = $state<ArticleReading[]>([]);
	let loadingArticles = $state(false);
	let expandedSections = $state<Set<string>>(new Set());

	const TC: Record<string, string> = {"Sacred Doctrine":"#cb964d","One God":"#ddb063","Trinity":"#e2aa36","Creation":"#d4b86c","Angels":"#d6b541","Genesis":"#e7ce59","Man":"#cbba4d","Providence":"#ddd363","Beatitude":"#4dcb8c","Human Acts":"#63ddae","Passions":"#36e2b2","Habits & Virtues":"#6cd4c3","Vices & Sins":"#41d6ce","Law":"#59dfe7","Grace":"#4db6cb","Faith":"#8c4dcb","Hope":"#ac63dd","Charity":"#ad36e2","Prudence":"#be6cd4","Justice":"#c541d6","Fortitude":"#e459e7","Temperance":"#cb4dc2","Charisms & States":"#dd63c9","Incarnation":"#cb6c4d","Life of Christ":"#dd9663","Sacraments":"#e29a36","Penance":"#4d8ccb","Unction & Orders":"#638cdd","Matrimony":"#3652e2","Eschatology":"#6c6cd4"};

	const levelMeta: Record<string, { label: string; desc: string }> = {
		beginner: { label: 'Start Here', desc: 'Big questions, short paths — no background needed' },
		intermediate: { label: 'Go Deeper', desc: 'Thematic arcs through major topics' },
		advanced: { label: 'Advanced', desc: 'Technical theology and philosophy' },
		expert: { label: 'Expert', desc: 'Cross-cutting research themes for serious study' },
	};
	const levels = ['beginner', 'intermediate', 'advanced', 'expert'];

	function clean(t: string): string { return t.replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim(); }

	onMount(() => { fetch('/summa_bundle.json').then(r => r.json()).then(d => { bundleData = d; loading = false; }); });

	async function selectPath(journeyId: string) {
		if (!index || !bundleData) return;
		selectedJourney = journeyId; loadingCards = true; expandedQId = null; expandedSections = new Set();
		await index.loadTexts();
		const journey = bundleData.journeys.find((j: any) => j.id === journeyId);
		if (!journey) return;
		const result: JourneyCard[] = [];
		for (const qId of journey.questions) {
			const node = index.get(qId); if (!node) continue;
			const arts = index.getChildren(qId).filter(c => c.type === 'article');
			let excerpt = '';
			if (arts.length > 0) { const text = await index.getRespondeo(arts[0].id); excerpt = clean(text).substring(0, 200) + '…'; }
			result.push({ id: qId, qNum: node.questionNum || 0, title: node.label, treatise: node.treatise || '', partId: node.partId || '', excerpt, artCount: node.articleCount || 0, objCount: node.objectionCount || 0 });
		}
		cards = result; loadingCards = false;
	}

	async function toggleQuestion(qId: string) {
		if (expandedQId === qId) { expandedQId = null; return; }
		expandedQId = qId; expandedSections = new Set(); loadingArticles = true;
		if (!index) return;
		const artNodes = index.getChildren(qId).filter(c => c.type === 'article').sort((a, b) => (a.articleNum || 0) - (b.articleNum || 0));
		const result: ArticleReading[] = [];
		for (const art of artNodes) {
			const resp = clean(await index.getRespondeo(art.id));
			result.push({ id: art.id, num: art.articleNum || 0, title: art.label, respondeo: resp, objections: [], sedContra: '', replies: [], loaded: false });
		}
		articles = result; loadingArticles = false;
	}

	async function loadDialectic(artId: string) {
		if (!index) return;
		const art = articles.find(a => a.id === artId);
		if (!art || art.loaded) return;
		const children = index.getChildren(artId);
		const objs: { num: number; text: string }[] = [];
		const reps: { num: number; text: string }[] = [];
		let sc = '';
		await Promise.all(children.map(async c => {
			const text = clean(await index!.getText(c.id));
			if (c.type === 'objection') objs.push({ num: c.itemNum || 0, text });
			else if (c.type === 'reply') reps.push({ num: c.itemNum || 0, text });
			else if (c.type === 'sedcontra') sc = text;
		}));
		if (!sc) sc = clean(await index.getSedContra(artId));
		art.objections = objs.sort((a, b) => a.num - b.num);
		art.replies = reps.sort((a, b) => a.num - b.num);
		art.sedContra = sc; art.loaded = true;
		articles = [...articles];
	}

	function toggleSection(key: string) {
		const s = new Set(expandedSections);
		if (s.has(key)) s.delete(key); else { s.add(key); const artId = key.split(':').slice(0, -1).join(':'); const art = articles.find(a => a.id === artId); if (art && !art.loaded) loadDialectic(artId); }
		expandedSections = s;
	}

	function goBack() { selectedJourney = null; cards = []; expandedQId = null; }
</script>

<div class="absolute inset-0 overflow-y-auto">
	<div class="max-w-4xl mx-auto px-8 pt-24 pb-16">
		<h2 class="font-cinzel text-3xl text-gold tracking-[4px] text-center mb-2">JOURNEYS</h2>
		<p class="text-center text-parchment-300 italic text-sm mb-14">Guided reading paths through the Summa Theologiae — from first encounter to deep study</p>

		{#if loading}
			<div class="flex justify-center mt-20"><div class="w-10 h-10 border-2 border-gold-dim border-t-gold rounded-full animate-spin"></div></div>

		{:else if !selectedJourney && bundleData?.journeys}
			<!-- ═══ Journey catalogue by level ═══ -->
			{#each levels as level}
				{@const meta = levelMeta[level]}
				{@const paths = bundleData.journeys.filter((j: any) => j.level === level)}
				{#if paths.length > 0}
					<div class="mb-12">
						<div class="flex items-baseline gap-3 mb-1">
							<h3 class="font-cinzel text-lg text-gold tracking-wider">{meta.label}</h3>
							<span class="text-parchment-400/40 text-[11px] italic">{meta.desc}</span>
						</div>
						<div class="w-16 h-px bg-gold/15 mb-5"></div>

						<div class="grid grid-cols-2 gap-4">
							{#each paths as j}
								<button class="text-left p-5 border border-gold/8 hover:border-gold/25 bg-gold/2 hover:bg-gold/4 transition-all group" onclick={() => selectPath(j.id)}>
									<div class="flex items-start justify-between gap-3">
										<div class="flex-1 min-w-0">
											<h4 class="font-cinzel text-[15px] text-gold group-hover:text-gold-bright transition-colors mb-1 leading-snug">{j.title}</h4>
											<p class="text-parchment-300 text-[12.5px] italic leading-snug">{j.subtitle}</p>
										</div>
										<div class="shrink-0 flex gap-1 mt-1">
											{#each j.questions as _}
												<div class="w-1.5 h-1.5 rounded-full bg-gold/25 group-hover:bg-gold/50 transition-colors"></div>
											{/each}
										</div>
									</div>
									<div class="text-parchment-400/40 text-[10px] mt-2">{j.questions.length} stops</div>
								</button>
							{/each}
						</div>
					</div>
				{/if}
			{/each}

		{:else if selectedJourney}
			{@const j = bundleData?.journeys?.find((x: any) => x.id === selectedJourney)}
			<button class="text-xs font-cinzel text-parchment-400 hover:text-gold transition-colors mb-6 tracking-wider" onclick={goBack}>← ALL JOURNEYS</button>
			{#if j}
				<div class="flex items-baseline gap-3 mb-1">
					<h3 class="font-cinzel text-2xl text-gold">{j.title}</h3>
					<span class="text-[10px] font-cinzel tracking-wider px-2 py-0.5 border border-gold/15 text-parchment-400">{levelMeta[j.level]?.label || j.level}</span>
				</div>
				<p class="text-parchment-300 italic mb-8">{j.subtitle}</p>
			{/if}

			{#if loadingCards}
				<div class="text-parchment-400 italic text-center mt-10">Loading journey…</div>
			{:else}
				<div class="relative">
					<div class="absolute left-6 top-0 bottom-0 w-px bg-gold/15"></div>
					{#each cards as card, i}
						{@const isExpanded = expandedQId === card.id}
						<div class="relative pl-16 pb-8">
							<div class="absolute left-4 top-1 w-5 h-5 rounded-full border-2 flex items-center justify-center" style="border-color:{TC[card.treatise] || '#c9a84c'}; background:{TC[card.treatise] || '#c9a84c'}20;">
								<div class="w-2 h-2 rounded-full" style="background:{TC[card.treatise] || '#c9a84c'}"></div>
							</div>
							<div class="font-cinzel text-[10px] tracking-[2px] text-parchment-400 mb-1">STOP {i + 1} of {cards.length}</div>

							<button class="w-full text-left border p-5 transition-all {isExpanded ? 'border-gold/25 bg-gold/5' : 'border-gold/10 bg-gold/3 hover:border-gold/20'}" onclick={() => toggleQuestion(card.id)}>
								<div class="flex items-baseline gap-2 mb-1">
									<span class="font-cinzel text-gold-dim text-xs">Q{card.qNum}</span>
									<span class="text-parchment-400 text-xs">{card.treatise}</span>
									<span class="ml-auto text-parchment-400/50 text-xs">{card.artCount} art.</span>
									<span class="text-parchment-400 text-xs">{isExpanded ? '▾' : '▸'}</span>
								</div>
								<h4 class="font-cinzel text-lg text-gold leading-snug">{card.title}</h4>
								{#if !isExpanded && card.excerpt}
									<p class="text-parchment-300 text-[13px] mt-2 italic leading-relaxed">"{card.excerpt}"</p>
								{/if}
							</button>

							{#if isExpanded}
								<div class="mt-3 ml-2 space-y-1">
									{#if loadingArticles}
										<p class="text-parchment-400 italic text-sm py-3">Loading articles…</p>
									{:else}
										{#each articles as art}
											{@const respKey = `${art.id}:respondeo`}
											{@const objKey = `${art.id}:objections`}
											{@const scKey = `${art.id}:sedcontra`}
											{@const repKey = `${art.id}:replies`}

											<div class="border-l-2 border-gold/10 pl-4 py-2">
												<div class="font-cinzel text-[11px] text-gold-dim mb-1">Article {art.num}</div>
												<div class="text-parchment-200 text-[13.5px] mb-2">{art.title}</div>

												{#if art.respondeo}
													<div class="mb-3">
														<button class="text-[10px] font-cinzel tracking-wider text-gold-dim/60 hover:text-gold-dim mb-1 flex items-center gap-1" onclick={() => toggleSection(respKey)}>
															<span class="{expandedSections.has(respKey) ? 'rotate-90' : ''} inline-block transition-transform">▸</span> Respondeo
														</button>
														{#if expandedSections.has(respKey)}
															<div class="border-l-2 border-gold/20 pl-4">
																{#each art.respondeo.split(/(?<=\.)\s+(?=[A-Z])/).reduce((acc, s) => { const last = acc[acc.length - 1]; if (last && last.length + s.length < 400) { acc[acc.length - 1] = last + ' ' + s; } else { acc.push(s); } return acc; }, [] as string[]) as para}
																	<p class="text-[#e8e0d0] text-[15px] leading-[1.9] mb-3">{para}</p>
																{/each}
															</div>
														{/if}
													</div>
												{/if}

												{#if art.loaded && art.objections.length > 0}
													<button class="text-[10px] font-cinzel tracking-wider text-parchment-400/60 hover:text-parchment-300 mb-1 flex items-center gap-1" onclick={() => toggleSection(objKey)}>
														<span class="{expandedSections.has(objKey) ? 'rotate-90' : ''} inline-block transition-transform">▸</span> Objections ({art.objections.length})
													</button>
													{#if expandedSections.has(objKey)}
														<div class="mb-3 space-y-2">
															{#each art.objections as obj}
																<div class="border-l-2 border-parchment-400/15 pl-4">
																	<div class="font-cinzel text-[9px] text-parchment-400 mb-0.5">Objection {obj.num}</div>
																	<p class="text-parchment-300 text-[14px] leading-[1.75]">{obj.text}</p>
																</div>
															{/each}
														</div>
													{/if}
												{/if}

												{#if art.loaded && art.sedContra}
													<button class="text-[10px] font-cinzel tracking-wider text-gold-dim/50 hover:text-gold-dim mb-1 flex items-center gap-1" onclick={() => toggleSection(scKey)}>
														<span class="{expandedSections.has(scKey) ? 'rotate-90' : ''} inline-block transition-transform">▸</span> Sed Contra
													</button>
													{#if expandedSections.has(scKey)}
														<div class="border-l-2 border-gold-dim/20 pl-4 mb-3">
															<p class="text-parchment-200 text-[14.5px] leading-[1.8] italic">{art.sedContra}</p>
														</div>
													{/if}
												{/if}

												{#if art.loaded && art.replies.length > 0}
													<button class="text-[10px] font-cinzel tracking-wider text-gold-dim/50 hover:text-gold-dim mb-1 flex items-center gap-1" onclick={() => toggleSection(repKey)}>
														<span class="{expandedSections.has(repKey) ? 'rotate-90' : ''} inline-block transition-transform">▸</span> Replies ({art.replies.length})
													</button>
													{#if expandedSections.has(repKey)}
														<div class="mb-3 space-y-2">
															{#each art.replies as rep}
																<div class="border-l-2 border-gold/15 pl-4">
																	<div class="font-cinzel text-[9px] text-gold-dim mb-0.5">Reply {rep.num}</div>
																	<p class="text-[#e8e0d0] text-[14px] leading-[1.75]">{rep.text}</p>
																</div>
															{/each}
														</div>
													{/if}
												{/if}

												{#if !art.loaded}
													<button class="text-[11px] text-parchment-400 italic hover:text-gold-dim transition-colors" onclick={() => loadDialectic(art.id)}>Load objections & replies…</button>
												{/if}
											</div>
										{/each}
									{/if}
								</div>
							{/if}
						</div>
					{/each}
				</div>
			{/if}
		{/if}
	</div>
</div>
