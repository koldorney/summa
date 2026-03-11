import type { NodeType, NodeVisualConfig } from '$lib/types';

export const NODE_VISUALS: Record<NodeType, NodeVisualConfig> = {
	part:      { fill: '#c9a84c', stroke: '#e8c860', textColor: '#0e0c08', radius: 38 },
	treatise:  { fill: '#a08530', stroke: '#c9a84c', textColor: '#f0e6d0', radius: 26 },
	question:  { fill: '#f0e6d0', stroke: '#a89a80', textColor: '#1a170f', radius: 14 },
	article:   { fill: '#d4c9a8', stroke: '#8a7a5a', textColor: '#1a170f', radius: 10 },
	answer:    { fill: '#c9a84c', stroke: '#e8c860', textColor: '#0e0c08', radius: 9 },
	sedcontra: { fill: '#8a7235', stroke: '#c9a84c', textColor: '#f0e6d0', radius: 7 },
	objection: { fill: '#1c1c1c', stroke: '#666',    textColor: '#ccc',    radius: 7 },
	reply:     { fill: '#c9a84c', stroke: '#e8c860', textColor: '#0e0c08', radius: 7 },
};

export const TYPE_LABELS: Record<NodeType, string> = {
	part: 'Part',
	treatise: 'Treatise',
	question: 'Question',
	article: 'Article',
	objection: 'Objection',
	answer: 'Respondeo',
	reply: 'Reply to Objection',
	sedcontra: 'Sed Contra',
};
