<script lang="ts">
	import { breadcrumbPath, selectedNode, navigateToNode } from '$lib/stores/app';
	import { TYPE_LABELS } from '$lib/config';
	import type { SummaNode } from '$lib/types';
	import type { SummaIndex } from '$lib/data';

	interface Props {
		index: SummaIndex | null;
	}

	let { index }: Props = $props();

	let pathNodes: SummaNode[] = $derived.by(() => {
		if (!index || !$selectedNode) return [];
		return index.getPath($selectedNode.id);
	});

	function getShortLabel(node: SummaNode): string {
		switch (node.type) {
			case 'part': return node.label;
			case 'question': return `Q${node.questionNum}`;
			case 'article': return `Art. ${node.articleNum}`;
			default: return node.label;
		}
	}

	function handleClick(node: SummaNode) {
		navigateToNode.set(node.id);
	}
</script>

{#if pathNodes.length > 0}
	<nav class="flex items-center gap-0 text-xs font-cinzel tracking-wider text-gold-dim">
		{#each pathNodes as node, i}
			<button
				class="hover:text-gold-bright transition-colors duration-300"
				onclick={() => handleClick(node)}
			>
				{getShortLabel(node)}
			</button>
			{#if i < pathNodes.length - 1}
				<span class="mx-2 opacity-40">›</span>
			{/if}
		{/each}
	</nav>
{/if}
