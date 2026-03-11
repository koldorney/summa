<script lang="ts">
	import { onMount } from 'svelte';
	import { loadSummaData, type SummaIndex } from '$lib/data';
	import { dataLoaded, viewMode } from '$lib/stores/app';
	import ViewSwitcher from '$lib/components/navigation/ViewSwitcher.svelte';
	import CirclePacking from '$lib/components/graph/CirclePacking.svelte';
	import EdgeBundling from '$lib/components/graph/EdgeBundling.svelte';
	import ConnectionsView from '$lib/components/views/ConnectionsView.svelte';
	import AnatomyView from '$lib/components/views/AnatomyView.svelte';
	import DebateView from '$lib/components/views/DebateView.svelte';
	import JourneyView from '$lib/components/views/JourneyView.svelte';
	import LandscapeView from '$lib/components/views/LandscapeView.svelte';
	import MosaicView from '$lib/components/views/MosaicView.svelte';
	import ManuscriptView from '$lib/components/views/ManuscriptView.svelte';
	import InfoPanel from '$lib/components/panels/InfoPanel.svelte';
	import SearchView from '$lib/components/search/SearchView.svelte';

	let index: SummaIndex | null = $state(null);

	onMount(async () => {
		index = await loadSummaData();
		dataLoaded.set(true);
	});

	let graphMode = $derived<'citations' | 'conceptual'>(
		$viewMode === 'dependency' ? 'citations' : 'conceptual'
	);
</script>

<header class="fixed top-0 left-0 right-0 z-40 px-7 py-4 flex items-baseline gap-4 pointer-events-none"
	style="background: linear-gradient(to bottom, rgba(14,12,8,0.95) 0%, rgba(14,12,8,0.5) 70%, transparent 100%);">
	<h1 class="font-cinzel font-semibold text-xl text-gold tracking-[3px] uppercase">Summa Theologiae</h1>
	<span class="text-sm text-parchment-300 italic">A Tapestry of St. Thomas Aquinas' Seminal Work</span>
</header>

<div class="fixed top-4 right-7 z-40 pointer-events-auto">
	<ViewSwitcher />
</div>

{#if $viewMode === 'search'}
	<SearchView {index} />
{:else if $viewMode === 'hierarchical'}
	<CirclePacking {index} />
{:else if $viewMode === 'dependency' || $viewMode === 'conceptual'}
	<EdgeBundling {index} mode={graphMode} />
{:else if $viewMode === 'connections'}
	<ConnectionsView />
{:else if $viewMode === 'landscape'}
	<LandscapeView {index} />
{:else if $viewMode === 'mosaic'}
	<MosaicView {index} />
{:else if $viewMode === 'anatomy'}
	<AnatomyView />
{:else if $viewMode === 'debate'}
	<DebateView {index} />
{:else if $viewMode === 'journey'}
	<JourneyView {index} />
{:else if $viewMode === 'manuscript'}
	<ManuscriptView {index} />
{/if}

<InfoPanel {index} />
