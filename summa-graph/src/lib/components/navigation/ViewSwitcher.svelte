<script lang="ts">
	import { viewMode } from '$lib/stores/app';
	import type { ViewMode } from '$lib/types';

	let open = $state(false);

	type ViewDef = { id: ViewMode; label: string };
	type Group = { tier: string; views: ViewDef[] };

	const groups: Group[] = [
		{
			tier: 'Read',
			views: [
				{ id: 'journey', label: 'Journey' },
				{ id: 'debate', label: 'Debate' },
				{ id: 'manuscript', label: 'Manuscript' },
			],
		},
		{
			tier: 'Visualize',
			views: [
				{ id: 'anatomy', label: 'Anatomy' },
				{ id: 'landscape', label: 'Landscape' },
				{ id: 'mosaic', label: 'Mosaic' },
			],
		},
		{
			tier: 'Explore',
			views: [
				{ id: 'hierarchical', label: 'Structure' },
				{ id: 'connections', label: 'Connections' },
			],
		},
		{
			tier: 'Deep Dive',
			views: [
				{ id: 'dependency', label: 'Citations' },
				{ id: 'conceptual', label: 'Conceptual' },
			],
		},
	];

	const allViews = groups.flatMap(g => g.views);
	let currentLabel = $derived(allViews.find(v => v.id === $viewMode)?.label || 'Journey');

	function select(id: ViewMode) {
		viewMode.set(id);
		open = false;
	}

	function handleClickOutside(event: MouseEvent) {
		const target = event.target as HTMLElement;
		if (!target.closest('.view-switcher')) open = false;
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') open = false;
	}
</script>

<svelte:window onclick={handleClickOutside} onkeydown={handleKeydown} />

<div class="view-switcher relative">
	<!-- Current view button + search -->
	<div class="flex items-center gap-2">
		<button
			class="flex items-center gap-2 px-3.5 py-1.5 text-xs font-cinzel tracking-wider border transition-all
				bg-gold/10 border-gold-dim text-gold hover:bg-gold/15"
			onclick={() => open = !open}
		>
			{currentLabel}
			<svg class="w-3 h-3 transition-transform {open ? 'rotate-180' : ''}" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5">
				<path d="M3 5l3 3 3-3" />
			</svg>
		</button>

		<button
			class="px-2.5 py-1.5 text-xs font-cinzel tracking-wider border transition-all
				{$viewMode === 'search'
					? 'bg-gold/15 border-gold-dim text-gold'
					: 'bg-gold/5 border-gold/20 text-parchment-300 hover:bg-gold/10 hover:text-gold hover:border-gold-dim'
				}"
			onclick={() => select('search')}
		>
			Search
		</button>
	</div>

	<!-- Dropdown -->
	{#if open}
		<div class="absolute top-full right-0 mt-1.5 w-56 bg-bg-panel border border-gold/20 z-50 shadow-xl shadow-black/40">
			{#each groups as group, gi}
				{#if gi > 0}
					<div class="h-px bg-gold/8"></div>
				{/if}
				<div class="px-3 pt-2.5 pb-1">
					<div class="font-cinzel text-[9px] tracking-[2px] text-gold-dim/40 uppercase">{group.tier}</div>
				</div>
				{#each group.views as view}
					<button
						class="block w-full text-left px-3 py-2 text-[13px] transition-colors
							{$viewMode === view.id
								? 'text-gold bg-gold/8'
								: 'text-parchment-300 hover:text-gold hover:bg-gold/5'
							}"
						onclick={() => select(view.id)}
					>
						<span class="font-cinzel text-xs tracking-wider">{view.label}</span>
					</button>
				{/each}
			{/each}
		</div>
	{/if}
</div>
