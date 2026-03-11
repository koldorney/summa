<script lang="ts">
	import { onMount } from 'svelte';
	import type { SummaIndex } from '$lib/data';

	interface Props { index: SummaIndex | null; }
	let { index }: Props = $props();

	let loading = $state(true);
	let bundleData = $state<any>(null);
	let currentPage = $state(0);
	let pageLoading = $state(false);
	let showToc = $state(false);

	type ArticleContent = { num: number; title: string; respondeo: string; objections: { num: number; text: string }[]; sedContra: string; replies: { num: number; text: string }[] };
	type PageDef =
		| { type: 'title' }
		| { type: 'part'; partId: string; name: string; qCount: number; treatiseCount: number }
		| { type: 'treatise'; partId: string; name: string; qCount: number }
		| { type: 'question'; id: string; qNum: number; partId: string; treatise: string; title: string; artCount: number; objCount: number };

	let pages = $state<PageDef[]>([]);
	let loadedArticles = $state<Map<string, ArticleContent[]>>(new Map());

	const PC: Record<string, string> = { 'I': '#c9a84c', 'I-II': '#7ab8a8', 'II-II': '#b07aaf', 'III': '#cf7c5e', 'Suppl': '#8a9abf' };
	const PN: Record<string, string> = { 'I': 'Prima Pars', 'I-II': 'Prima Secundae', 'II-II': 'Secunda Secundae', 'III': 'Tertia Pars', 'Suppl': 'Supplementum' };
	const TC: Record<string, string> = {"Sacred Doctrine":"#cb964d","One God":"#ddb063","Trinity":"#e2aa36","Creation":"#d4b86c","Angels":"#d6b541","Genesis":"#e7ce59","Man":"#cbba4d","Providence":"#ddd363","Beatitude":"#4dcb8c","Human Acts":"#63ddae","Passions":"#36e2b2","Habits & Virtues":"#6cd4c3","Vices & Sins":"#41d6ce","Law":"#59dfe7","Grace":"#4db6cb","Faith":"#8c4dcb","Hope":"#ac63dd","Charity":"#ad36e2","Prudence":"#be6cd4","Justice":"#c541d6","Fortitude":"#e459e7","Temperance":"#cb4dc2","Charisms & States":"#dd63c9","Incarnation":"#cb6c4d","Life of Christ":"#dd9663","Sacraments":"#e29a36","Penance":"#4d8ccb","Unction & Orders":"#638cdd","Matrimony":"#3652e2","Eschatology":"#6c6cd4"};

	function clean(t: string): string { return t.replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim(); }

	function splitParagraphs(text: string): string[] {
		// Split at sentence boundaries to create readable paragraphs (~300 chars each)
		const sentences = text.split(/(?<=\.)\s+(?=[A-Z])/);
		const paras: string[] = [];
		let current = '';
		for (const s of sentences) {
			if (current && current.length + s.length > 350) { paras.push(current); current = s; }
			else { current = current ? current + ' ' + s : s; }
		}
		if (current) paras.push(current);
		return paras;
	}

	onMount(() => {
		fetch('/summa_bundle.json').then(r => r.json()).then(data => {
			bundleData = data;
			buildPageIndex(data);
			loading = false;
		});

		// Keyboard nav
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); nextPage(); }
			if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); prevPage(); }
		};
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	});

	function buildPageIndex(data: any) {
		const result: PageDef[] = [{ type: 'title' }];
		const h = data.hierarchy;

		for (const part of h.children || []) {
			const pid = part.id?.replace('part:', '') || '';
			const treatises = part.children || [];
			const qCount = treatises.reduce((s: number, t: any) => s + (t.children?.length || 0), 0);
			result.push({ type: 'part', partId: pid, name: PN[pid] || part.name, qCount, treatiseCount: treatises.length });

			for (const treatise of treatises) {
				const qs = treatise.children || [];
				result.push({ type: 'treatise', partId: pid, name: treatise.name, qCount: qs.length });

				for (const q of qs) {
					result.push({
						type: 'question', id: q.id, qNum: q.questionNum, partId: pid,
						treatise: q.treatise || treatise.name, title: q.label || q.name,
						artCount: q.articleCount || 0, objCount: q.objectionCount || 0,
					});
				}
			}
		}
		pages = result;
	}

	async function loadQuestion(qId: string) {
		if (loadedArticles.has(qId) || !index) return;
		pageLoading = true;
		await index.loadTexts();

		const artNodes = index.getChildren(qId).filter(c => c.type === 'article').sort((a, b) => (a.articleNum || 0) - (b.articleNum || 0));
		const articles: ArticleContent[] = [];

		for (const art of artNodes) {
			const resp = clean(await index.getRespondeo(art.id));
			const children = index.getChildren(art.id);
			const objs: { num: number; text: string }[] = [];
			const reps: { num: number; text: string }[] = [];
			let sc = '';

			await Promise.all(children.map(async c => {
				const text = clean(await index!.getText(c.id));
				if (c.type === 'objection') objs.push({ num: c.itemNum || 0, text });
				else if (c.type === 'reply') reps.push({ num: c.itemNum || 0, text });
				else if (c.type === 'sedcontra') sc = text;
			}));
			if (!sc) sc = clean(await index.getSedContra(art.id));

			articles.push({
				num: art.articleNum || 0, title: art.label, respondeo: resp,
				objections: objs.sort((a, b) => a.num - b.num),
				sedContra: sc, replies: reps.sort((a, b) => a.num - b.num),
			});
		}

		loadedArticles = new Map(loadedArticles).set(qId, articles);
		pageLoading = false;
	}

	$effect(() => {
		const p = pages[currentPage];
		if (p?.type === 'question') loadQuestion(p.id);
	});

	let scrollEl: HTMLDivElement;
	function goTo(n: number) { currentPage = n; showToc = false; scrollEl?.scrollTo({ top: 0, behavior: 'instant' }); }
	function nextPage() { if (currentPage < pages.length - 1) { currentPage++; scrollEl?.scrollTo({ top: 0, behavior: 'instant' }); } }
	function prevPage() { if (currentPage > 0) { currentPage--; scrollEl?.scrollTo({ top: 0, behavior: 'instant' }); } }

	// TOC: build part/treatise/question nav
	type TocEntry = { pageIdx: number; type: string; label: string; partId: string; indent: number };
	let tocEntries = $derived<TocEntry[]>(
		pages.map((p, i) => {
			if (p.type === 'part') return { pageIdx: i, type: 'part', label: p.name, partId: p.partId, indent: 0 };
			if (p.type === 'treatise') return { pageIdx: i, type: 'treatise', label: p.name, partId: p.partId, indent: 1 };
			if (p.type === 'question') return { pageIdx: i, type: 'question', label: `Q${p.qNum}`, partId: p.partId, indent: 2 };
			return null;
		}).filter(Boolean) as TocEntry[]
	);
</script>

<div class="absolute inset-0 flex" style="background: radial-gradient(ellipse at center, #1a170f 0%, #0e0c08 100%);">
	<!-- TOC sidebar -->
	{#if showToc}
		<div class="w-72 border-r border-gold/10 overflow-y-auto bg-bg-panel/80 shrink-0 pt-20 pb-10">
			<div class="px-4 mb-4">
				<div class="font-cinzel text-[10px] tracking-[2px] text-gold-dim/60 uppercase mb-2">Table of Contents</div>
			</div>
			<div class="space-y-0">
				{#each tocEntries as entry}
					<button class="block w-full text-left px-4 py-1 transition-colors hover:bg-gold/5 {entry.pageIdx === currentPage ? 'bg-gold/8' : ''}"
						style="padding-left:{16 + entry.indent * 14}px"
						onclick={() => goTo(entry.pageIdx)}>
						{#if entry.type === 'part'}
							<span class="font-cinzel text-[11px] tracking-wider" style="color:{PC[entry.partId]}">{entry.label}</span>
						{:else if entry.type === 'treatise'}
							<span class="text-[12px]" style="color:{TC[entry.label] || '#a89a80'}">{entry.label}</span>
						{:else}
							<span class="text-parchment-400 text-[11px]">{entry.label}</span>
						{/if}
					</button>
				{/each}
			</div>
		</div>
	{/if}

	<!-- Main content -->
	<div class="flex-1 overflow-y-auto" bind:this={scrollEl}>
		{#if loading}
			<div class="flex flex-col items-center justify-center h-full gap-4">
				<div class="w-10 h-10 border-2 border-gold-dim border-t-gold rounded-full animate-spin"></div>
				<p class="text-parchment-300 italic text-sm">Preparing manuscript…</p>
			</div>
		{:else}
			{@const page = pages[currentPage]}
			<div class="max-w-3xl mx-auto px-14 pt-20 pb-24 min-h-screen flex flex-col">

				{#if page.type === 'title'}
					<div class="flex-1 flex flex-col items-center justify-center text-center">
						<div class="flex items-center gap-3 mb-10">
							<div class="w-16 h-px bg-gradient-to-r from-transparent to-gold/30"></div>
							<div class="w-2.5 h-2.5 rotate-45 border border-gold/50 bg-gold/10"></div>
							<div class="w-16 h-px bg-gradient-to-l from-transparent to-gold/30"></div>
						</div>
						<div class="text-parchment-400 text-[11px] tracking-[8px] uppercase mb-8">Sancti Thomae de Aquino</div>
						<h1 class="font-cinzel text-6xl text-gold tracking-[10px] mb-1" style="text-shadow: 0 0 60px rgba(201,168,76,0.12);">SUMMA</h1>
						<h1 class="font-cinzel text-6xl text-gold tracking-[10px] mb-12" style="text-shadow: 0 0 60px rgba(201,168,76,0.12);">THEOLOGIAE</h1>
						<div class="font-cormorant text-parchment-300 italic text-xl leading-relaxed max-w-lg mx-auto mb-10">
							The complete text of the greatest work of Christian theology
						</div>
						<div class="flex gap-10 mb-10">
							{#each [[5, 'Parts'], [30, 'Treatises'], [610, 'Questions'], ['2,497', 'Articles']] as [val, label]}
								<div class="text-center"><div class="font-cinzel text-xl text-gold/70">{val}</div><div class="text-[9px] tracking-[2px] text-parchment-400/50 uppercase">{label}</div></div>
							{/each}
						</div>
						<div class="flex items-center gap-3">
							<div class="w-16 h-px bg-gradient-to-r from-transparent to-gold/30"></div>
							<div class="w-2.5 h-2.5 rotate-45 border border-gold/50 bg-gold/10"></div>
							<div class="w-16 h-px bg-gradient-to-l from-transparent to-gold/30"></div>
						</div>
						<p class="text-parchment-400/40 italic text-sm mt-10">Use arrow keys or buttons to navigate · Press Contents to browse</p>
					</div>

				{:else if page.type === 'part'}
					<div class="flex-1 flex flex-col items-center justify-center text-center">
						<div class="flex items-center gap-6 mb-6">
							<div class="w-24 h-px" style="background: linear-gradient(to right, transparent, {PC[page.partId]}50);"></div>
							<div class="w-3 h-3 rotate-45 border" style="border-color:{PC[page.partId]}60"></div>
							<div class="w-24 h-px" style="background: linear-gradient(to left, transparent, {PC[page.partId]}50);"></div>
						</div>
						<h2 class="font-cinzel text-4xl tracking-[8px] mb-4" style="color:{PC[page.partId]}; text-shadow: 0 0 40px {PC[page.partId]}20;">{page.name.toUpperCase()}</h2>
						<div class="text-parchment-400/50 text-sm">{page.treatiseCount} treatises · {page.qCount} questions</div>
						<div class="flex items-center gap-6 mt-6">
							<div class="w-24 h-px" style="background: linear-gradient(to right, transparent, {PC[page.partId]}50);"></div>
							<div class="w-3 h-3 rotate-45 border" style="border-color:{PC[page.partId]}60"></div>
							<div class="w-24 h-px" style="background: linear-gradient(to left, transparent, {PC[page.partId]}50);"></div>
						</div>
					</div>

				{:else if page.type === 'treatise'}
					<div class="flex-1 flex flex-col items-center justify-center text-center">
						<div class="w-2 h-2 rounded-full mb-4" style="background:{TC[page.name] || PC[page.partId]}"></div>
						<h3 class="font-cinzel text-2xl tracking-[4px] mb-3" style="color:{TC[page.name] || PC[page.partId]}">{page.name}</h3>
						<div class="text-parchment-400/50 text-sm">{page.qCount} questions</div>
						<div class="w-16 h-px mt-4" style="background:{TC[page.name] || PC[page.partId]}; opacity:0.2;"></div>
					</div>

				{:else if page.type === 'question'}
					<!-- Question header -->
					<div class="mb-2 mt-4">
						<div class="flex items-baseline gap-3 mb-2">
							<span class="text-[10px] tracking-[2px] uppercase" style="color:{TC[page.treatise] || PC[page.partId]}; opacity:0.5;">{page.treatise}</span>
							<span class="text-parchment-400/20">·</span>
							<span class="text-parchment-400/40 text-[10px]">{PN[page.partId]}</span>
						</div>
						<div class="font-cinzel text-xs tracking-wider mb-1" style="color:{PC[page.partId]}; opacity:0.5;">Question {page.qNum}</div>
						<h3 class="font-cinzel text-2xl leading-snug mb-1" style="color:{PC[page.partId]}">{page.title}</h3>
						<div class="text-parchment-400/40 text-[11px] mb-6">{page.artCount} articles · {page.objCount} objections</div>
						<div class="w-20 h-px mb-8" style="background:{PC[page.partId]}; opacity:0.15;"></div>
					</div>

					{#if pageLoading && !loadedArticles.has(page.id)}
						<p class="text-parchment-400 italic text-sm">Loading text…</p>
					{:else if loadedArticles.has(page.id)}
						{#each loadedArticles.get(page.id) || [] as art, ai}
							<div class="mb-12">
								<div class="flex items-baseline gap-3 mb-4">
									<span class="font-cinzel text-[11px] tracking-wider" style="color:{PC[page.partId]}; opacity:0.4;">Article {art.num}</span>
									<span class="text-parchment-300 text-[14px] italic">{art.title}</span>
								</div>

								<!-- Objections -->
								{#if art.objections.length > 0}
									<div class="mb-6">
										<div class="font-cinzel text-[9px] tracking-[2px] text-parchment-400/40 uppercase mb-3">Objections</div>
										{#each art.objections as obj}
											<div class="border-l border-parchment-400/10 pl-4 mb-3">
												<span class="font-cinzel text-[9px] text-parchment-400/40">Obj. {obj.num}.</span>
												<span class="text-parchment-300/80 text-[14px] leading-[1.8] font-cormorant"> {obj.text}</span>
											</div>
										{/each}
									</div>
								{/if}

								<!-- Sed Contra -->
								{#if art.sedContra}
									<div class="mb-6">
										<div class="font-cinzel text-[9px] tracking-[2px] text-gold-dim/30 uppercase mb-2">Sed Contra</div>
										<div class="border-l border-gold-dim/15 pl-4">
											<p class="text-parchment-200/80 text-[14.5px] leading-[1.85] font-cormorant italic">{art.sedContra}</p>
										</div>
									</div>
								{/if}

								<!-- Respondeo -->
								{#if art.respondeo}
									<div class="mb-6">
										<div class="font-cinzel text-[9px] tracking-[2px] text-gold-dim/40 uppercase mb-2">Respondeo</div>
										<div class="border-l-2 border-gold/15 pl-5">
											{#if ai === 0}
												<span class="font-cinzel text-5xl float-left mr-3 mt-0.5 leading-none" style="color:{PC[page.partId]}; opacity:0.3;">{art.respondeo.charAt(0)}</span>
											{/if}
											{#each splitParagraphs(ai === 0 ? art.respondeo.substring(1) : art.respondeo) as para}
												<p class="text-[#e8e0d0] text-[15.5px] leading-[2] font-cormorant mb-4">{para}</p>
											{/each}
										</div>
									</div>
								{/if}

								<!-- Replies -->
								{#if art.replies.length > 0}
									<div class="mb-4">
										<div class="font-cinzel text-[9px] tracking-[2px] text-gold-dim/30 uppercase mb-3">Replies</div>
										{#each art.replies as rep}
											<div class="border-l border-gold/10 pl-4 mb-3">
												<span class="font-cinzel text-[9px] text-gold-dim/40">Reply {rep.num}.</span>
												<span class="text-[#e8e0d0]/85 text-[14px] leading-[1.8] font-cormorant"> {rep.text}</span>
											</div>
										{/each}
									</div>
								{/if}

								{#if ai < (loadedArticles.get(page.id)?.length || 0) - 1}
									<div class="flex justify-center my-8"><div class="w-8 h-px bg-gold/10"></div></div>
								{/if}
							</div>
						{/each}
					{/if}
				{/if}

				<!-- Navigation -->
				<div class="mt-auto pt-8 flex items-center justify-between">
					<button class="px-4 py-2 text-xs font-cinzel tracking-wider border border-gold/15 text-parchment-400 hover:text-gold hover:border-gold-dim transition-all disabled:opacity-20"
						onclick={prevPage} disabled={currentPage === 0}>← Previous</button>

					<div class="flex items-center gap-4">
						<button class="text-[10px] font-cinzel tracking-wider text-parchment-400 hover:text-gold transition-colors" onclick={() => showToc = !showToc}>
							{showToc ? 'Hide' : 'Contents'}
						</button>
						<span class="text-parchment-400/25 text-[10px] font-cinzel tracking-wider">{currentPage + 1} / {pages.length}</span>
					</div>

					<button class="px-4 py-2 text-xs font-cinzel tracking-wider border border-gold/15 text-parchment-400 hover:text-gold hover:border-gold-dim transition-all disabled:opacity-20"
						onclick={nextPage} disabled={currentPage >= pages.length - 1}>Next →</button>
				</div>
			</div>
		{/if}
	</div>
</div>
