import { writable, derived } from 'svelte/store';
import type { SummaNode, ViewMode, OrderingMode } from '$lib/types';

/** Current view mode */
export const viewMode = writable<ViewMode>('journey');

/** Ordering within views */
export const orderingMode = writable<OrderingMode>('theological');

/** Currently selected node (shown in info panel) */
export const selectedNode = writable<SummaNode | null>(null);

/** Set of expanded node IDs */
export const expandedNodes = writable<Set<string>>(new Set());

/** Breadcrumb path (array of node IDs from root to current) */
export const breadcrumbPath = writable<string[]>([]);

/** Whether the info panel is open */
export const panelOpen = derived(selectedNode, ($node) => $node !== null);

/** Search query (for search view) */
export const searchQuery = writable<string>('');

/** Loading state */
export const dataLoaded = writable<boolean>(false);

/** Navigation request — set this to a node ID and the graph will expand to it and pan */
export const navigateToNode = writable<string | null>(null);

/** Toggle a node's expanded state */
export function toggleExpanded(nodeId: string) {
	expandedNodes.update((set) => {
		const newSet = new Set(set);
		if (newSet.has(nodeId)) {
			newSet.delete(nodeId);
		} else {
			newSet.add(nodeId);
		}
		return newSet;
	});
}

/** Collapse all nodes */
export function collapseAll() {
	expandedNodes.set(new Set());
	selectedNode.set(null);
	breadcrumbPath.set([]);
}
