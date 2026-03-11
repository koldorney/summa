<script lang="ts">
	import { selectedNode, navigateToNode, viewMode } from '$lib/stores/app';
	import { TYPE_LABELS } from '$lib/config';
	import type { SummaIndex } from '$lib/data';

	interface Props { index: SummaIndex | null; }
	let { index }: Props = $props();

	let panelEl: HTMLElement;

	// For leaf nodes selected directly
	let leafText = $state('');
	let leafLoading = $state(false);

	// For questions: article list with lazy-loaded sections
	type Section = { key: string; label: string; items: { num: number; text: string }[] | null; singleText: string | null; loading: boolean };
	type ArticleEntry = { id: string; num: number; title: string; expanded: boolean; sections: Section[]; loaded: boolean; loading: boolean };
	let articles = $state<ArticleEntry[]>([]);

	let isGraphView = $derived(
		$viewMode === 'dependency' || $viewMode === 'conceptual' ||
		$viewMode === 'hierarchical' || $viewMode === 'treatise' || $viewMode === 'density' ||
		$viewMode === 'landscape' || $viewMode === 'mosaic' || $viewMode === 'connections'
	);

	function cleanText(raw: string): string {
		if (!raw) return '';
		return raw.replace(/\r\n/g, '\n').replace(/\n{2,}/g, '¶¶').replace(/\n/g, ' ').replace(/¶¶/g, '\n\n').replace(/  +/g, ' ').trim();
	}

	$effect(() => {
		const node = $selectedNode;
		leafText = '';
		leafLoading = false;
		articles = [];

		if (!node || !index) return;
		if (panelEl) panelEl.scrollTop = 0;

		// Leaf nodes: load text directly
		if (node.type === 'objection' || node.type === 'reply' || node.type === 'answer' || node.type === 'sedcontra') {
			leafLoading = true;
			index.getText(node.id).then(t => {
				if ($selectedNode?.id === node.id) { leafText = cleanText(t); leafLoading = false; }
			});
		} else if (node.type === 'article') {
			leafLoading = true;
			index.getRespondeo(node.id).then(t => {
				if ($selectedNode?.id === node.id) { leafText = cleanText(t); leafLoading = false; }
			});
		} else if (node.type === 'question' && isGraphView) {
			// Build article list (collapsed, no content loaded yet)
			const artNodes = index.getChildren(node.id).filter(c => c.type === 'article');
			articles = artNodes
				.sort((a, b) => (a.articleNum || 0) - (b.articleNum || 0))
				.map(a => ({
					id: a.id, num: a.articleNum || 0, title: a.label,
					expanded: false, loaded: false, loading: false,
					sections: [],
				}));
		}
	});

	async function toggleArticle(art: ArticleEntry) {
		if (art.expanded) {
			art.expanded = false;
			articles = [...articles]; // trigger reactivity
			return;
		}

		// Load sections if not yet loaded
		if (!art.loaded && index) {
			art.loading = true;
			articles = [...articles];

			const children = index.getChildren(art.id);
			const objections: { num: number; text: string }[] = [];
			const replies: { num: number; text: string }[] = [];
			let sedContra = '';
			let respondeo = '';

			await Promise.all(children.map(async (child) => {
				const text = cleanText(await index!.getText(child.id));
				if (child.type === 'objection') objections.push({ num: child.itemNum || 0, text });
				else if (child.type === 'reply') replies.push({ num: child.itemNum || 0, text });
				else if (child.type === 'sedcontra') sedContra = text;
				else if (child.type === 'answer') respondeo = text;
			}));

			if (!sedContra) sedContra = cleanText(await index.getSedContra(art.id));
			if (!respondeo) respondeo = cleanText(await index.getRespondeo(art.id));

			objections.sort((a, b) => a.num - b.num);
			replies.sort((a, b) => a.num - b.num);

			art.sections = [
				{ key: 'objections', label: `Objections (${objections.length})`, items: objections, singleText: null, loading: false },
				{ key: 'sedcontra', label: 'Sed Contra', items: null, singleText: sedContra, loading: false },
				{ key: 'respondeo', label: 'Respondeo', items: null, singleText: respondeo, loading: false },
				{ key: 'replies', label: `Replies (${replies.length})`, items: replies, singleText: null, loading: false },
			];
			art.loaded = true;
			art.loading = false;
		}

		art.expanded = true;
		articles = [...articles];
	}

	// Section expand state: track by "artId:sectionKey"
	let expandedSections = $state<Set<string>>(new Set());

	function toggleSection(artId: string, sectionKey: string) {
		const key = `${artId}:${sectionKey}`;
		const s = new Set(expandedSections);
		if (s.has(key)) s.delete(key); else s.add(key);
		expandedSections = s;
	}

	function isSectionExpanded(artId: string, sectionKey: string): boolean {
		return expandedSections.has(`${artId}:${sectionKey}`);
	}

	function close() { selectedNode.set(null); }
	function navigate(childId: string) { navigateToNode.set(childId); }
</script>

<aside
	bind:this={panelEl}
	class="fixed right-0 top-0 bottom-0 w-[460px] bg-bg-panel border-l border-gold/15 z-50 overflow-y-auto transition-transform duration-400 ease-out
		{$selectedNode ? 'translate-x-0' : 'translate-x-full'}"
>
	<div class="px-8 pt-20 pb-10">
		<button class="absolute top-5 right-6 text-parchment-300 hover:text-gold text-2xl font-serif transition-colors" onclick={close}>×</button>

		{#if $selectedNode}
			<div class="font-cinzel text-[11px] tracking-[3px] uppercase text-gold-dim mb-2">
				{TYPE_LABELS[$selectedNode.type] || $selectedNode.type}
				{#if $selectedNode.itemNum} {$selectedNode.itemNum}{/if}
			</div>
			<h2 class="font-cinzel text-[22px] font-semibold text-gold leading-snug mb-3">{$selectedNode.label}</h2>
			{#if $selectedNode.treatise}
				<div class="text-parchment-300 text-sm italic mb-4">{$selectedNode.treatise}</div>
			{/if}

			<!-- Stats -->
			{#if $selectedNode.type === 'part' || $selectedNode.type === 'treatise' || $selectedNode.type === 'question' || $selectedNode.type === 'article'}
				<div class="flex gap-6 mb-6 pb-5 border-b border-gold/10">
					{#if $selectedNode.questionCount}
						<div class="text-center"><div class="font-cinzel text-2xl font-bold text-gold-bright">{$selectedNode.questionCount}</div><div class="text-[11px] uppercase tracking-wider text-parchment-300">Questions</div></div>
					{/if}
					{#if $selectedNode.articleCount}
						<div class="text-center"><div class="font-cinzel text-2xl font-bold text-gold-bright">{$selectedNode.articleCount}</div><div class="text-[11px] uppercase tracking-wider text-parchment-300">Articles</div></div>
					{/if}
					{#if $selectedNode.objectionCount}
						<div class="text-center"><div class="font-cinzel text-2xl font-bold text-gold-bright">{$selectedNode.objectionCount}</div><div class="text-[11px] uppercase tracking-wider text-parchment-300">Objections</div></div>
					{/if}
				</div>
			{/if}

			<!-- ════ Nested accordion: Articles → Sections → Content ════ -->
			{#if isGraphView && articles.length > 0}
				<div class="font-cinzel text-[10px] tracking-[2px] text-gold-dim/50 uppercase mb-3">Articles</div>
				<div class="space-y-0.5">
					{#each articles as art}
						<!-- Article title row -->
						<button
							class="w-full text-left py-3 px-3 -mx-1 rounded transition-all flex items-baseline gap-2 group
								{art.expanded ? 'bg-gold/6' : 'hover:bg-gold/4'}"
							onclick={() => toggleArticle(art)}
						>
							<span class="text-parchment-400 text-[11px] w-4 shrink-0 transition-transform {art.expanded ? 'rotate-90' : ''}" style="display:inline-block">▸</span>
							<span class="font-cinzel text-[11px] text-gold-dim shrink-0">Art. {art.num}</span>
							<span class="text-parchment-200 text-[14px] leading-snug group-hover:text-parchment-100">{art.title}</span>
							{#if art.loading}
								<span class="ml-auto text-parchment-400 text-[10px] italic shrink-0">loading…</span>
							{/if}
						</button>

						<!-- Expanded article: section headers -->
						{#if art.expanded && art.loaded}
							<div class="ml-6 mb-2 space-y-0.5">
								{#each art.sections as section}
									{@const secExpanded = isSectionExpanded(art.id, section.key)}
									{@const hasContent = (section.singleText && section.singleText.length > 0) || (section.items && section.items.length > 0)}

									{#if hasContent}
										<!-- Section header -->
										<button
											class="w-full text-left py-2 px-3 -mx-1 rounded transition-all flex items-center gap-2
												{secExpanded ? 'bg-gold/5' : 'hover:bg-gold/3'}"
											onclick={() => toggleSection(art.id, section.key)}
										>
											<span class="text-parchment-400 text-[10px] w-3 shrink-0 transition-transform {secExpanded ? 'rotate-90' : ''}" style="display:inline-block">▸</span>
											<span class="font-cinzel text-[10px] tracking-[1.5px] uppercase
												{section.key === 'respondeo' ? 'text-gold-dim' :
												 section.key === 'sedcontra' ? 'text-gold-dim/70' :
												 section.key === 'objections' ? 'text-parchment-400' :
												 'text-gold-dim/80'}">
												{section.label}
											</span>
										</button>

										<!-- Section content -->
										{#if secExpanded}
											<div class="ml-5 mb-3">
												{#if section.singleText}
													<!-- Single text block (respondeo, sed contra) -->
													<div class="border-l-2 {section.key === 'respondeo' ? 'border-gold/30' : section.key === 'sedcontra' ? 'border-gold-dim/30' : 'border-parchment-400/20'} pl-4 py-1">
														{#each section.singleText.split('\n\n') as paragraph}
															<p class="text-[#e8e0d0] text-[15px] leading-[1.85] mb-3 last:mb-0 tracking-[0.01em]
																{section.key === 'sedcontra' ? 'italic' : ''}">{paragraph}</p>
														{/each}
													</div>
												{:else if section.items}
													<!-- Numbered items (objections, replies) -->
													<div class="space-y-3">
														{#each section.items as item}
															<div class="border-l-2 {section.key === 'objections' ? 'border-parchment-400/20' : 'border-gold/20'} pl-4">
																<div class="font-cinzel text-[10px] {section.key === 'objections' ? 'text-parchment-400' : 'text-gold-dim'} mb-1">
																	{section.key === 'objections' ? 'Objection' : 'Reply'} {item.num}
																</div>
																{#each item.text.split('\n\n') as paragraph}
																	<p class="{section.key === 'objections' ? 'text-parchment-300' : 'text-[#e8e0d0]'} text-[14px] leading-[1.75] mb-2 last:mb-0">{paragraph}</p>
																{/each}
															</div>
														{/each}
													</div>
												{/if}
											</div>
										{/if}
									{/if}
								{/each}
							</div>
						{/if}
					{/each}
				</div>

			<!-- ════ Leaf text ════ -->
			{:else if leafLoading}
				<p class="text-parchment-300 italic">Loading text…</p>
			{:else if leafText}
				<div class="border-l-2 border-gold/30 pl-5 py-1 mb-6">
					<div class="font-cinzel text-[11px] tracking-[2px] text-gold-dim mb-3 uppercase">
						{TYPE_LABELS[$selectedNode.type]}{#if $selectedNode.itemNum} {$selectedNode.itemNum}{/if}
					</div>
					{#each leafText.split('\n\n') as paragraph}
						<p class="text-[#e8e0d0] text-[15.5px] leading-[1.85] mb-4 last:mb-0 tracking-[0.01em]">{paragraph}</p>
					{/each}
				</div>
			{/if}

			<!-- ════ Children (search view) ════ -->
			{#if !isGraphView && index && ($selectedNode.type === 'part' || $selectedNode.type === 'treatise' || $selectedNode.type === 'question' || $selectedNode.type === 'article')}
				{@const children = $selectedNode.type === 'treatise'
					? index.getTreatiseQuestions($selectedNode.partId, $selectedNode.treatise || $selectedNode.label)
					: index.getChildren($selectedNode.id)}
				<div class="mt-2">
					<div class="font-cinzel text-[10px] tracking-[2px] text-gold-dim/60 uppercase mb-3">
						{$selectedNode.type === 'part' || $selectedNode.type === 'treatise' ? 'Questions' : $selectedNode.type === 'question' ? 'Articles' : 'Dialectical Structure'}
					</div>
					{#each children as child}
						<button class="block w-full text-left py-2.5 px-3 -mx-1 border-b border-gold/5 text-parchment-200 hover:text-parchment-100 hover:bg-gold/5 text-[14px] leading-snug transition-colors rounded-sm"
							onclick={() => navigate(child.id)}>
							{#if child.type === 'question'}<span class="text-gold-dim font-cinzel text-xs mr-2">Q{child.questionNum}</span>
							{:else if child.type === 'article'}<span class="text-gold-dim font-cinzel text-xs mr-2">Art. {child.articleNum}</span>
							{:else if child.type === 'objection'}<span class="inline-block w-2.5 h-2.5 rounded-full bg-charcoal border border-parchment-400 mr-2.5 align-middle"></span>
							{:else if child.type === 'answer' || child.type === 'reply'}<span class="inline-block w-2.5 h-2.5 rounded-full bg-gold mr-2.5 align-middle"></span>
							{:else if child.type === 'sedcontra'}<span class="inline-block w-2.5 h-2.5 rounded-full bg-gold-dim mr-2.5 align-middle"></span>
							{/if}{child.label}
						</button>
					{/each}
				</div>
			{/if}
		{/if}
	</div>
</aside>
