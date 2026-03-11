/** Node types in the knowledge graph */
export type NodeType = 'part' | 'treatise' | 'question' | 'article' | 'objection' | 'sedcontra' | 'answer' | 'reply';

/** View modes for the graph */
export type ViewMode = 'hierarchical' | 'treatise' | 'density' | 'dependency' | 'conceptual' | 'search' | 'connections' | 'anatomy' | 'debate' | 'journey' | 'manuscript' | 'landscape' | 'mosaic';

/** Ordering modes */
export type OrderingMode = 'theological' | 'density';

/** A node in the flat index */
export interface SummaNode {
	id: string;
	type: NodeType;
	partId: string;
	label: string;
	treatise?: string;
	depth: number;
	questionNum?: number;
	articleNum?: number;
	itemNum?: number;
	// Counts (structural nodes)
	questionCount?: number;
	articleCount?: number;
	objectionCount?: number;
	replyCount?: number;
	hasAnswer?: boolean;
	hasSedContra?: boolean;
	// Text content (articles carry respondeo/sedContra inline)
	respondeo?: string;
	sedContra?: string;
	// Leaf text (loaded from text store)
	text?: string;
	// D3 simulation properties (added at runtime)
	x?: number;
	y?: number;
	fx?: number | null;
	fy?: number | null;
}

/** An edge in the graph */
export interface SummaEdge {
	source: string;
	target: string;
	type: 'contains' | 'raises' | 'counters' | 'answers' | 'replies' | 'addresses';
}

/** Treatise grouping */
export interface Treatise {
	partId: string;
	name: string;
	questions: number[];
}

/** Full structure data (loaded from summa_structure.json) */
export interface SummaStructure {
	nodes: SummaNode[];
	edges: SummaEdge[];
	treatises: Record<string, Treatise>;
	meta: {
		totalNodes: number;
		totalEdges: number;
		parts: number;
		questions: number;
		articles: number;
	};
}

/** Text store (loaded from summa_texts.json) */
export type TextStore = Record<string, string>;

/** Article cross-reference */
export interface ArticleRef {
	source: string;
	target: string;
	weight: number;
}

/** Refs data file */
export interface RefsData {
	articleRefs: ArticleRef[];
	meta: { totalCitations: number; resolvedRefs: number; uniqueArticleRefs: number };
}

/** Conceptual similarity edge */
export interface ConceptEdge {
	source: string;
	target: string;
	similarity: number;
}

/** Concepts data file */
export interface ConceptsData {
	conceptEdges: ConceptEdge[];
	meta: { method: string; features: number; articlesProcessed: number; topK: number; threshold: number; totalEdges: number };
}

/** Graph visual config per node type */
export interface NodeVisualConfig {
	fill: string;
	stroke: string;
	textColor: string;
	radius: number;
}
