<script lang="ts">
	import { selectedNode } from '$lib/stores/app';
	import type { SummaIndex } from '$lib/data';

	interface Props { index: SummaIndex | null; }
	let { index }: Props = $props();

	let searchQuery = $state('');
	let selectedQId = $state<string | null>(null);
	let selectedArtIdx = $state(0);
	let loading = $state(false);

	type DebateData = {
		title: string; qNum: number; artNum: number; artTitle: string;
		objections: { num: number; text: string }[];
		sedContra: string; respondeo: string;
		replies: { num: number; text: string }[];
	};
	let debate = $state<DebateData | null>(null);
	let articles = $state<{ id: string; num: number; title: string }[]>([]);
	let searchResults = $state<{ id: string; qNum: number; label: string; treatise: string }[]>([]);

	const TC: Record<string, string> = {"Sacred Doctrine":"#cb964d","One God":"#ddb063","Trinity":"#e2aa36","Creation":"#d4b86c","Angels":"#d6b541","Genesis":"#e7ce59","Man":"#cbba4d","Providence":"#ddd363","Beatitude":"#4dcb8c","Human Acts":"#63ddae","Passions":"#36e2b2","Habits & Virtues":"#6cd4c3","Vices & Sins":"#41d6ce","Law":"#59dfe7","Grace":"#4db6cb","Faith":"#8c4dcb","Hope":"#ac63dd","Charity":"#ad36e2","Prudence":"#be6cd4","Justice":"#c541d6","Fortitude":"#e459e7","Temperance":"#cb4dc2","Charisms & States":"#dd63c9","Incarnation":"#cb6c4d","Life of Christ":"#dd9663","Sacraments":"#e29a36","Penance":"#4d8ccb","Unction & Orders":"#638cdd","Matrimony":"#3652e2","Eschatology":"#6c6cd4"};

	type FeaturedDebate = { qId: string; artNum: number; hook: string; question: string; treatise: string; tag: string };
	const featured: FeaturedDebate[] = [
		{ qId: 'q:I:2', artNum: 3, hook: 'Can we prove God exists?', question: 'THE EXISTENCE OF GOD', treatise: 'One God', tag: 'The Five Ways' },
		{ qId: 'q:I:25', artNum: 3, hook: 'Can God do the impossible?', question: 'THE POWER OF GOD', treatise: 'One God', tag: 'Omnipotence' },
		{ qId: 'q:I:48', artNum: 1, hook: 'Is evil a real thing?', question: 'THE DISTINCTION OF THINGS IN PARTICULAR', treatise: 'Creation', tag: 'Problem of Evil' },
		{ qId: 'q:I-II:94', artNum: 2, hook: 'Is there a universal moral law?', question: 'OF THE NATURAL LAW', treatise: 'Law', tag: 'Natural Law' },
		{ qId: 'q:II-II:64', artNum: 7, hook: 'Is it ever lawful to kill?', question: 'OF MURDER', treatise: 'Justice', tag: 'Self-Defense' },
		{ qId: 'q:II-II:40', artNum: 1, hook: 'Can war be justified?', question: 'OF WAR', treatise: 'Charity', tag: 'Just War' },
		{ qId: 'q:II-II:66', artNum: 7, hook: 'Is it a sin to steal when starving?', question: 'OF THEFT AND ROBBERY', treatise: 'Justice', tag: 'Property Rights' },
		{ qId: 'q:II-II:110', artNum: 3, hook: 'Is every lie a sin?', question: 'OF THE VICES OPPOSED TO TRUTH', treatise: 'Justice', tag: 'Lying' },
		{ qId: 'q:I:83', artNum: 1, hook: 'Do humans have free will?', question: 'OF FREE-WILL', treatise: 'Man', tag: 'Freedom' },
		{ qId: 'q:I-II:2', artNum: 8, hook: 'Does wealth make you happy?', question: 'OF THOSE THINGS IN WHICH MAN\'S HAPPINESS CONSISTS', treatise: 'Beatitude', tag: 'Wealth' },
		{ qId: 'q:II-II:11', artNum: 3, hook: 'Should heretics be tolerated?', question: 'OF HERESY', treatise: 'Faith', tag: 'Tolerance' },
		{ qId: 'q:I:75', artNum: 2, hook: 'Can the soul exist without the body?', question: 'OF MAN', treatise: 'Man', tag: 'Soul & Body' },
		{ qId: 'q:I:46', artNum: 2, hook: 'Did the world have a beginning?', question: 'OF THE BEGINNING OF THE DURATION OF CREATURES', treatise: 'Creation', tag: 'Eternity' },
		{ qId: 'q:II-II:78', artNum: 1, hook: 'Is charging interest a sin?', question: 'OF THE SIN OF USURY', treatise: 'Justice', tag: 'Usury' },
		{ qId: 'q:I-II:19', artNum: 6, hook: 'Can a good intention justify a bad action?', question: 'OF THE GOODNESS AND MALICE OF THE INTERIOR ACT OF THE WILL', treatise: 'Human Acts', tag: 'Ends & Means' },
		{ qId: 'q:I:23', artNum: 3, hook: 'Does God choose who is saved?', question: 'OF PREDESTINATION', treatise: 'One God', tag: 'Predestination' },
	];

	$effect(() => {
		if (!index) return;
		const q = searchQuery.toLowerCase().trim();
		if (q.length < 2) { searchResults = []; return; }
		const nodes = index.searchByTitle(q).filter(n => n.type === 'question').slice(0, 8);
		searchResults = nodes.map(n => ({ id: n.id, qNum: n.questionNum || 0, label: n.label, treatise: n.treatise || '' }));
	});

	function selectQuestion(qId: string, artNum?: number) {
		if (!index) return;
		selectedQId = qId;
		searchQuery = ''; searchResults = [];
		const children = index.getChildren(qId).filter(c => c.type === 'article');
		articles = children.sort((a, b) => (a.articleNum || 0) - (b.articleNum || 0)).map(a => ({ id: a.id, num: a.articleNum || 0, title: a.label }));
		const targetIdx = artNum ? articles.findIndex(a => a.num === artNum) : 0;
		selectedArtIdx = targetIdx >= 0 ? targetIdx : 0;
		if (articles.length > 0) loadArticle(articles[selectedArtIdx].id);
	}

	async function loadArticle(artId: string) {
		if (!index) return;
		loading = true;
		const art = articles.find(a => a.id === artId);
		const q = index.get(selectedQId!);
		if (!art || !q) return;

		await index.loadTexts();
		const children = index.getChildren(artId);
		const objections: { num: number; text: string }[] = [];
		const replies: { num: number; text: string }[] = [];
		let sedContra = '', respondeo = '';

		await Promise.all(children.map(async c => {
			const text = (await index!.getText(c.id)).replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim();
			if (c.type === 'objection') objections.push({ num: c.itemNum || 0, text });
			else if (c.type === 'reply') replies.push({ num: c.itemNum || 0, text });
			else if (c.type === 'sedcontra') sedContra = text;
			else if (c.type === 'answer') respondeo = text;
		}));

		if (!respondeo) respondeo = (await index.getRespondeo(artId)).replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim();
		if (!sedContra) sedContra = (await index.getSedContra(artId)).replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim();

		debate = {
			title: q.label, qNum: q.questionNum || 0,
			artNum: art.num, artTitle: art.title,
			objections: objections.sort((a, b) => a.num - b.num),
			sedContra, respondeo,
			replies: replies.sort((a, b) => a.num - b.num),
		};
		loading = false;
	}

	function goHome() { selectedQId = null; debate = null; articles = []; }
</script>

<div class="absolute inset-0 overflow-y-auto">
	<div class="max-w-6xl mx-auto px-8 pt-24 pb-16">
		<h2 class="font-cinzel text-3xl text-gold tracking-[4px] text-center mb-2">THE DEBATE</h2>
		<p class="text-center text-parchment-300 italic text-sm mb-8">See the dialectical structure of any article — objections, authority, answer, replies</p>

		<!-- Search -->
		<div class="max-w-md mx-auto mb-10 relative">
			<input bind:value={searchQuery} type="text" placeholder="Search for any question…"
				class="w-full bg-bg-panel border border-gold/20 text-parchment-100 text-sm px-4 py-2.5 font-cormorant placeholder:text-parchment-400 focus:outline-none focus:border-gold-dim" />
			{#if searchResults.length > 0}
				<div class="absolute top-full left-0 right-0 bg-bg-panel border border-gold/20 border-t-0 max-h-64 overflow-y-auto z-50">
					{#each searchResults as r}
						<button class="block w-full text-left px-4 py-2.5 hover:bg-gold/10 transition-colors border-b border-gold/5"
							onclick={() => selectQuestion(r.id)}>
							<span class="text-gold-dim font-cinzel text-[10px] mr-2">Q{r.qNum}</span>
							<span class="text-parchment-200 text-[13px]">{r.label.substring(0, 60)}</span>
						</button>
					{/each}
				</div>
			{/if}
		</div>

		{#if !debate && !loading && !selectedQId}
			<!-- ═══ Featured debates ═══ -->
			<div class="mb-6">
				<div class="text-center mb-8">
					<div class="w-16 h-px bg-gold/15 mx-auto mb-4"></div>
					<p class="text-parchment-400 text-sm">Or pick a famous argument</p>
				</div>

				<div class="grid grid-cols-2 gap-3">
					{#each featured as f}
						<button class="text-left p-4 border border-gold/8 hover:border-gold/25 bg-gold/2 hover:bg-gold/5 transition-all group"
							onclick={() => selectQuestion(f.qId, f.artNum)}>
							<div class="flex items-start gap-3">
								<div class="w-2 h-2 rounded-full mt-1.5 shrink-0" style="background:{TC[f.treatise] || '#c9a84c'}"></div>
								<div class="flex-1 min-w-0">
									<div class="text-gold font-cinzel text-[15px] leading-snug group-hover:text-gold-bright transition-colors">{f.hook}</div>
									<div class="text-parchment-400 text-[11px] mt-1 flex items-center gap-2">
										<span>{f.treatise}</span>
										<span class="text-parchment-400/30">·</span>
										<span class="text-parchment-400/60 italic">{f.tag}</span>
									</div>
								</div>
							</div>
						</button>
					{/each}
				</div>
			</div>
		{/if}

		{#if debate}
			<!-- Back button -->
			<button class="text-xs font-cinzel text-parchment-400 hover:text-gold transition-colors mb-6 tracking-wider" onclick={goHome}>← ALL DEBATES</button>

			<!-- Question + Article selector -->
			<div class="text-center mb-8">
				<div class="font-cinzel text-gold-dim text-xs tracking-[2px] mb-1">QUESTION {debate.qNum}</div>
				<h3 class="font-cinzel text-xl text-gold mb-4">{debate.title}</h3>
				<div class="flex gap-2 justify-center flex-wrap">
					{#each articles as art, i}
						<button class="px-3 py-1 text-xs font-cinzel border transition-all
							{i === selectedArtIdx ? 'bg-gold/15 border-gold-dim text-gold' : 'border-gold/15 text-parchment-400 hover:text-gold'}"
							onclick={() => { selectedArtIdx = i; loadArticle(art.id); }}>Art. {art.num}</button>
					{/each}
				</div>
				<div class="text-parchment-200 text-sm mt-3 italic">{debate.artTitle}</div>
			</div>

			{#if loading}
				<div class="text-center text-parchment-400 italic">Loading…</div>
			{:else}
				<!-- Dialectic layout -->
				<div class="grid grid-cols-[1fr_auto_1fr] gap-6 items-start">
					<!-- Left: Objections -->
					<div class="space-y-4">
						<div class="font-cinzel text-[10px] tracking-[2px] text-parchment-400 text-center uppercase mb-3">Objections</div>
						{#each debate.objections as obj}
							<div class="border-l-2 border-parchment-400/20 pl-4 py-2 bg-gold/3">
								<div class="font-cinzel text-[10px] text-parchment-400 mb-1">Obj. {obj.num}</div>
								<p class="text-parchment-300 text-[13px] leading-relaxed">{obj.text.substring(0, 400)}{obj.text.length > 400 ? '…' : ''}</p>
							</div>
						{/each}
						{#if debate.objections.length === 0}
							<p class="text-parchment-400/50 italic text-sm text-center">No objections found</p>
						{/if}
					</div>

					<!-- Center: Sed Contra + Respondeo -->
					<div class="w-80 space-y-6">
						{#if debate.sedContra}
							<div class="border border-gold-dim/20 p-5 bg-gold/3">
								<div class="font-cinzel text-[10px] tracking-[2px] text-gold-dim/60 uppercase mb-2">Sed Contra</div>
								<p class="text-parchment-200 text-[13.5px] leading-relaxed italic">{debate.sedContra.substring(0, 400)}{debate.sedContra.length > 400 ? '…' : ''}</p>
							</div>
						{/if}
						<div class="border-2 border-gold/20 p-5 bg-gold/5">
							<div class="font-cinzel text-[10px] tracking-[2px] text-gold-dim uppercase mb-2">Respondeo</div>
							<p class="text-[#e8e0d0] text-[14px] leading-[1.8]">{debate.respondeo.substring(0, 600)}{debate.respondeo.length > 600 ? '…' : ''}</p>
						</div>
					</div>

					<!-- Right: Replies -->
					<div class="space-y-4">
						<div class="font-cinzel text-[10px] tracking-[2px] text-gold-dim/60 text-center uppercase mb-3">Replies</div>
						{#each debate.replies as rep}
							<div class="border-l-2 border-gold/20 pl-4 py-2 bg-gold/3">
								<div class="font-cinzel text-[10px] text-gold-dim mb-1">Reply {rep.num}</div>
								<p class="text-[#e8e0d0] text-[13px] leading-relaxed">{rep.text.substring(0, 400)}{rep.text.length > 400 ? '…' : ''}</p>
							</div>
						{/each}
						{#if debate.replies.length === 0}
							<p class="text-parchment-400/50 italic text-sm text-center">No replies found</p>
						{/if}
					</div>
				</div>
			{/if}
		{/if}
	</div>
</div>
