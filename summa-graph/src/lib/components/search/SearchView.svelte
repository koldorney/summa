<script lang="ts">
	import { viewMode, navigateToNode } from '$lib/stores/app';
	import { TYPE_LABELS } from '$lib/config';
	import type { SummaIndex } from '$lib/data';
	import type { SummaNode } from '$lib/types';

	interface Props {
		index: SummaIndex | null;
	}

	let { index }: Props = $props();

	let query = $state('');
	let filterPart = $state('');
	let filterType = $state('');
	let searchMode = $state<'title' | 'fulltext'>('title');
	let titleResults = $state<SummaNode[]>([]);
	let fullTextResults = $state<{ nodeId: string; node: SummaNode | undefined; snippet: string }[]>([]);
	let isSearching = $state(false);
	let textsLoaded = $state(false);
	let debounceTimer: ReturnType<typeof setTimeout>;
	let inputEl: HTMLInputElement;

	const partOptions = [
		{ id: '', label: 'All Parts' },
		{ id: 'I', label: 'Prima Pars (I)' },
		{ id: 'I-II', label: 'Prima Secundae (I-II)' },
		{ id: 'II-II', label: 'Secunda Secundae (II-II)' },
		{ id: 'III', label: 'Tertia Pars (III)' },
		{ id: 'Suppl', label: 'Supplement' },
	];

	const typeOptions = [
		{ id: '', label: 'All Types' },
		{ id: 'question', label: 'Questions' },
		{ id: 'article', label: 'Articles' },
	];

	// Auto-focus search input when view activates
	$effect(() => {
		if (inputEl) {
			setTimeout(() => inputEl.focus(), 100);
		}
	});

	// Debounced search
	$effect(() => {
		const q = query;
		const part = filterPart;
		const type = filterType;
		const mode = searchMode;

		clearTimeout(debounceTimer);
		if (!q.trim() || !index) {
			titleResults = [];
			fullTextResults = [];
			return;
		}

		debounceTimer = setTimeout(() => {
			doSearch(q, part, type, mode);
		}, mode === 'fulltext' ? 400 : 150);
	});

	async function doSearch(q: string, part: string, type: string, mode: 'title' | 'fulltext') {
		if (!index) return;

		if (mode === 'title') {
			titleResults = index.searchByTitle(q, {
				partId: part || undefined,
				type: type || undefined,
			});
			fullTextResults = [];
		} else {
			isSearching = true;
			if (!textsLoaded) {
				await index.loadTexts();
				textsLoaded = true;
			}
			fullTextResults = await index.searchFullText(q);
			titleResults = [];
			isSearching = false;
		}
	}

	function goToNode(nodeId: string) {
		// Switch to hierarchical view and navigate
		viewMode.set('hierarchical');
		// Small delay so the graph has time to rebuild
		setTimeout(() => {
			navigateToNode.set(nodeId);
		}, 200);
	}

	function getAncestorPath(node: SummaNode): string {
		if (!index) return '';
		const path = index.getPath(node.id);
		return path
			.filter(n => n.type === 'part' || n.type === 'question')
			.map(n => n.type === 'part' ? n.label : `Q${n.questionNum}`)
			.join(' › ');
	}

	function getFullTextAncestor(nodeId: string): string {
		if (!index) return '';
		// Parse the node id to build a path description
		// Format: obj:I:46:1:3 or rep:I-II:5:2:1
		const parts = nodeId.split(':');
		if (parts.length < 4) return nodeId;
		const nodeType = parts[0];
		const partId = parts[1];
		const qNum = parts[2];
		const artNum = parts[3];
		const itemNum = parts[4] || '';

		const typeLabel = nodeType === 'obj' ? 'Objection' : nodeType === 'rep' ? 'Reply' : nodeType === 'resp' ? 'Respondeo' : nodeType === 'sc' ? 'Sed Contra' : nodeType;
		let desc = `${partId} › Q${qNum} › Art. ${artNum}`;
		if (itemNum) desc += ` › ${typeLabel} ${itemNum}`;
		else desc += ` › ${typeLabel}`;
		return desc;
	}

	// Browse mode: show all questions grouped by part when search is empty
	function getBrowseQuestions(): { partName: string; partId: string; questions: SummaNode[] }[] {
		if (!index) return [];
		const partOrder = ['I', 'I-II', 'II-II', 'III', 'Suppl'];
		const partNames: Record<string, string> = {
			'I': 'Prima Pars', 'I-II': 'Prima Secundae',
			'II-II': 'Secunda Secundae', 'III': 'Tertia Pars', 'Suppl': 'Supplement'
		};

		return partOrder
			.filter(pid => !filterPart || pid === filterPart)
			.map(pid => ({
				partId: pid,
				partName: partNames[pid],
				questions: index!.getQuestions(pid).sort((a, b) => (a.questionNum || 0) - (b.questionNum || 0)),
			}));
	}

	let browseData = $derived(query.trim() === '' ? getBrowseQuestions() : []);
	let hasResults = $derived(titleResults.length > 0 || fullTextResults.length > 0);
	let showBrowse = $derived(query.trim() === '' && !hasResults);
</script>

<div class="absolute inset-0 pt-20 pb-4 overflow-y-auto">
	<div class="max-w-3xl mx-auto px-8">

		<!-- Search bar -->
		<div class="mb-8">
			<div class="relative">
				<input
					bind:this={inputEl}
					bind:value={query}
					type="text"
					placeholder="Search questions, articles, or full text…"
					class="w-full bg-bg-panel border border-gold/20 text-parchment-100 text-lg px-5 py-3.5 pr-12 font-cormorant placeholder:text-parchment-400 focus:outline-none focus:border-gold-dim transition-colors"
				/>
				{#if query}
					<button
						class="absolute right-4 top-1/2 -translate-y-1/2 text-parchment-400 hover:text-gold transition-colors"
						onclick={() => { query = ''; }}
					>✕</button>
				{/if}
			</div>

			<!-- Filters row -->
			<div class="flex items-center gap-3 mt-3 flex-wrap">
				<!-- Search mode toggle -->
				<div class="flex border border-gold/20 overflow-hidden">
					<button
						class="px-3 py-1.5 text-[11px] font-cinzel tracking-wider transition-all
							{searchMode === 'title' ? 'bg-gold/15 text-gold' : 'bg-transparent text-parchment-300 hover:text-gold'}"
						onclick={() => searchMode = 'title'}
					>Titles</button>
					<button
						class="px-3 py-1.5 text-[11px] font-cinzel tracking-wider transition-all border-l border-gold/20
							{searchMode === 'fulltext' ? 'bg-gold/15 text-gold' : 'bg-transparent text-parchment-300 hover:text-gold'}"
						onclick={() => searchMode = 'fulltext'}
					>Full Text</button>
				</div>

				<select
					bind:value={filterPart}
					class="bg-bg-panel border border-gold/20 text-parchment-300 text-[11px] font-cinzel tracking-wider px-2 py-1.5 focus:outline-none focus:border-gold-dim"
				>
					{#each partOptions as opt}
						<option value={opt.id}>{opt.label}</option>
					{/each}
				</select>

				{#if searchMode === 'title'}
					<select
						bind:value={filterType}
						class="bg-bg-panel border border-gold/20 text-parchment-300 text-[11px] font-cinzel tracking-wider px-2 py-1.5 focus:outline-none focus:border-gold-dim"
					>
						{#each typeOptions as opt}
							<option value={opt.id}>{opt.label}</option>
						{/each}
					</select>
				{/if}

				{#if isSearching}
					<span class="text-parchment-400 text-xs italic">Searching…</span>
				{/if}

				{#if hasResults}
					<span class="text-parchment-400 text-xs ml-auto">
						{titleResults.length || fullTextResults.length} results
					</span>
				{/if}
			</div>
		</div>

		<!-- Title search results -->
		{#if titleResults.length > 0}
			<div class="space-y-1">
				{#each titleResults as node}
					<button
						class="block w-full text-left px-4 py-3.5 border-b border-gold/5 hover:bg-gold/5 transition-colors group"
						onclick={() => goToNode(node.id)}
					>
						<div class="flex items-baseline gap-2">
							<span class="font-cinzel text-[10px] tracking-[2px] uppercase text-gold-dim shrink-0">
								{node.type === 'question' ? `Q${node.questionNum}` : `Art. ${node.articleNum}`}
							</span>
							<span class="text-[15px] text-parchment-200 group-hover:text-parchment-100 leading-snug">
								{node.label}
							</span>
						</div>
						<div class="text-[11px] text-parchment-400 mt-1.5 flex items-center gap-3">
							<span>{getAncestorPath(node)}</span>
							{#if node.treatise}
								<span class="text-gold-dim/60">·</span>
								<span class="italic">{node.treatise}</span>
							{/if}
							{#if node.objectionCount}
								<span class="text-gold-dim/60">·</span>
								<span>{node.objectionCount} objections</span>
							{/if}
						</div>
					</button>
				{/each}
			</div>
		{/if}

		<!-- Full text results -->
		{#if fullTextResults.length > 0}
			<div class="space-y-1">
				{#each fullTextResults as result}
					<button
						class="block w-full text-left px-4 py-3.5 border-b border-gold/5 hover:bg-gold/5 transition-colors group"
						onclick={() => goToNode(result.nodeId)}
					>
						<div class="text-[11px] font-cinzel tracking-wider text-gold-dim mb-1.5">
							{getFullTextAncestor(result.nodeId)}
						</div>
						<div class="text-[14px] text-parchment-300 leading-relaxed">
							{result.snippet}
						</div>
					</button>
				{/each}
			</div>
		{/if}

		<!-- No results -->
		{#if query.trim() && !hasResults && !isSearching}
			<div class="text-center py-16">
				<p class="text-parchment-400 italic">No results for "{query}"</p>
				{#if searchMode === 'title'}
					<p class="text-parchment-400/60 text-sm mt-2">Try switching to Full Text search</p>
				{/if}
			</div>
		{/if}

		<!-- Browse mode (empty search) -->
		{#if showBrowse}
			<div>
				<h3 class="font-cinzel text-sm tracking-[2px] text-gold-dim/60 uppercase mb-6">
					Browse All Questions
				</h3>
				{#each browseData as group}
					<div class="mb-8">
						<h4 class="font-cinzel text-[13px] tracking-wider text-gold mb-3 pb-2 border-b border-gold/10">
							{group.partName}
						</h4>
						<div class="space-y-0.5">
							{#each group.questions as q}
								<button
									class="block w-full text-left px-3 py-2 hover:bg-gold/5 transition-colors rounded-sm group"
									onclick={() => goToNode(q.id)}
								>
									<span class="text-gold-dim font-cinzel text-xs mr-2">Q{q.questionNum}</span>
									<span class="text-parchment-200 text-[14px] group-hover:text-parchment-100">
										{q.label}
									</span>
									{#if q.objectionCount}
										<span class="text-parchment-400/50 text-[11px] ml-2">{q.objectionCount} obj</span>
									{/if}
								</button>
							{/each}
						</div>
					</div>
				{/each}
			</div>
		{/if}

	</div>
</div>
