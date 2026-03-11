import type { SummaStructure, SummaNode, SummaEdge, TextStore, ArticleRef, RefsData, ConceptEdge, ConceptsData } from '$lib/types';

/** Indexed data — fast lookups by ID, type, parent, treatise */
export class SummaIndex {
	nodes: Map<string, SummaNode> = new Map();
	childrenOf: Map<string, string[]> = new Map();
	parentOf: Map<string, string> = new Map();
	edgesBySource: Map<string, SummaEdge[]> = new Map();
	edgesByTarget: Map<string, SummaEdge[]> = new Map();
	nodesByType: Map<string, SummaNode[]> = new Map();
	nodesByTreatise: Map<string, SummaNode[]> = new Map();
	treatises: SummaStructure['treatises'] = {};
	meta: SummaStructure['meta'] = { totalNodes: 0, totalEdges: 0, parts: 0, questions: 0, articles: 0 };

	private textStore: TextStore | null = null;
	private textLoadPromise: Promise<TextStore> | null = null;
	private refsData: RefsData | null = null;
	private refsLoadPromise: Promise<RefsData> | null = null;
	private conceptsData: ConceptsData | null = null;
	private conceptsLoadPromise: Promise<ConceptsData> | null = null;

	constructor(structure: SummaStructure) {
		this.treatises = structure.treatises;
		this.meta = structure.meta;

		// Index nodes
		for (const node of structure.nodes) {
			this.nodes.set(node.id, node);

			// By type
			const typeList = this.nodesByType.get(node.type) || [];
			typeList.push(node);
			this.nodesByType.set(node.type, typeList);

			// By treatise
			if (node.treatise) {
				const treatiseKey = `${node.partId}:${node.treatise}`;
				const tList = this.nodesByTreatise.get(treatiseKey) || [];
				tList.push(node);
				this.nodesByTreatise.set(treatiseKey, tList);
			}
		}

		// Index edges
		for (const edge of structure.edges) {
			// Source → children
			const srcEdges = this.edgesBySource.get(edge.source) || [];
			srcEdges.push(edge);
			this.edgesBySource.set(edge.source, srcEdges);

			// Target → parents
			const tgtEdges = this.edgesByTarget.get(edge.target) || [];
			tgtEdges.push(edge);
			this.edgesByTarget.set(edge.target, tgtEdges);

			// Parent-child mapping (for 'contains' edges)
			if (edge.type === 'contains' || edge.type === 'raises' || edge.type === 'counters' || edge.type === 'answers' || edge.type === 'replies') {
				const children = this.childrenOf.get(edge.source) || [];
				children.push(edge.target);
				this.childrenOf.set(edge.source, children);
				this.parentOf.set(edge.target, edge.source);
			}
		}
	}

	/** Get a node by ID */
	get(id: string): SummaNode | undefined {
		return this.nodes.get(id);
	}

	/** Get children of a node */
	getChildren(id: string): SummaNode[] {
		const childIds = this.childrenOf.get(id) || [];
		return childIds.map((cid) => this.nodes.get(cid)).filter(Boolean) as SummaNode[];
	}

	/** Get parent of a node */
	getParent(id: string): SummaNode | undefined {
		const parentId = this.parentOf.get(id);
		return parentId ? this.nodes.get(parentId) : undefined;
	}

	/** Build breadcrumb path from root to a node */
	getPath(id: string): SummaNode[] {
		const path: SummaNode[] = [];
		let current = this.nodes.get(id);
		while (current) {
			path.unshift(current);
			const parentId = this.parentOf.get(current.id);
			current = parentId ? this.nodes.get(parentId) : undefined;
		}
		return path;
	}

	/** Get all nodes of a type */
	getByType(type: string): SummaNode[] {
		return this.nodesByType.get(type) || [];
	}

	/** Get parts (root nodes) */
	getParts(): SummaNode[] {
		return this.getByType('part');
	}

	/** Get questions for a part, optionally grouped by treatise */
	getQuestions(partId: string): SummaNode[] {
		return this.getByType('question').filter((n) => n.partId === partId);
	}

	/** Get articles sorted by objection count (for density view) */
	getArticlesByDensity(): SummaNode[] {
		return this.getByType('article').sort((a, b) => (b.objectionCount || 0) - (a.objectionCount || 0));
	}

	/** Get unique treatise names for a part */
	getTreatisesForPart(partId: string): string[] {
		const seen = new Set<string>();
		const result: string[] = [];
		for (const [key, treatise] of Object.entries(this.treatises)) {
			if (treatise.partId === partId && !seen.has(treatise.name)) {
				seen.add(treatise.name);
				result.push(treatise.name);
			}
		}
		return result;
	}

	/** Get all treatises as flat list with stats */
	getAllTreatises(): { partId: string; name: string; key: string; questions: SummaNode[]; articleCount: number; objectionCount: number }[] {
		const result: { partId: string; name: string; key: string; questions: SummaNode[]; articleCount: number; objectionCount: number }[] = [];
		for (const [key, t] of Object.entries(this.treatises)) {
			const questions = this.getByType('question').filter(
				(n) => n.partId === t.partId && n.treatise === t.name
			);
			const articleCount = questions.reduce((s, q) => s + (this.childrenOf.get(q.id)?.length || 0), 0);
			const objectionCount = questions.reduce((s, q) => {
				const arts = this.getChildren(q.id);
				return s + arts.reduce((s2, a) => s2 + (a.objectionCount || 0), 0);
			}, 0);
			result.push({ partId: t.partId, name: t.name, key, questions, articleCount, objectionCount });
		}
		return result;
	}

	/** Get questions for a specific treatise */
	getTreatiseQuestions(partId: string, treatiseName: string): SummaNode[] {
		return this.getByType('question').filter(
			(n) => n.partId === partId && n.treatise === treatiseName
		);
	}

	/** Get top N articles by objection count */
	getTopArticlesByDensity(n: number = 60): SummaNode[] {
		return [...this.getByType('article')]
			.sort((a, b) => (b.objectionCount || 0) - (a.objectionCount || 0))
			.slice(0, n);
	}

	/** Load text content on demand */
	async loadTexts(): Promise<TextStore> {
		if (this.textStore) return this.textStore;
		if (this.textLoadPromise) return this.textLoadPromise;

		this.textLoadPromise = fetch('/summa_texts.json')
			.then((r) => r.json())
			.then((texts: TextStore) => {
				this.textStore = texts;
				return texts;
			});

		return this.textLoadPromise;
	}

	/** Get text for a specific node (lazy loads if needed) */
	async getText(nodeId: string): Promise<string> {
		const texts = await this.loadTexts();
		return texts[nodeId] || '';
	}

	/** Get respondeo text for an article node */
	async getRespondeo(articleId: string): Promise<string> {
		const texts = await this.loadTexts();
		return texts[articleId + ':respondeo'] || '';
	}

	/** Get sed contra text for an article node */
	async getSedContra(articleId: string): Promise<string> {
		const texts = await this.loadTexts();
		return texts[articleId + ':sedContra'] || '';
	}

	/** Search structural nodes (questions + articles) by title */
	searchByTitle(query: string, filters?: { partId?: string; type?: string }): SummaNode[] {
		const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
		if (terms.length === 0) return [];

		const searchable = ['question', 'article'];
		const results: { node: SummaNode; score: number }[] = [];

		for (const [, node] of this.nodes) {
			if (!searchable.includes(node.type)) continue;
			if (filters?.partId && node.partId !== filters.partId) continue;
			if (filters?.type && node.type !== filters.type) continue;

			const label = node.label.toLowerCase();
			const treatise = (node.treatise || '').toLowerCase();

			let score = 0;
			let allMatch = true;
			for (const term of terms) {
				if (label.includes(term)) {
					score += 10;
					if (label.startsWith(term)) score += 5;
				} else if (treatise.includes(term)) {
					score += 3;
				} else {
					allMatch = false;
				}
			}

			if (allMatch && score > 0) {
				// Boost questions over articles
				if (node.type === 'question') score += 2;
				results.push({ node, score });
			}
		}

		return results
			.sort((a, b) => b.score - a.score)
			.slice(0, 100)
			.map(r => r.node);
	}

	/** Full-text search across all text content (requires texts loaded) */
	async searchFullText(query: string, maxResults: number = 50): Promise<{ nodeId: string; node: SummaNode | undefined; snippet: string }[]> {
		const texts = await this.loadTexts();
		const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
		if (terms.length === 0) return [];

		const results: { nodeId: string; node: SummaNode | undefined; snippet: string; score: number }[] = [];

		for (const [key, text] of Object.entries(texts)) {
			// Skip article-level duplicates
			if (key.includes(':respondeo') || key.includes(':sedContra')) continue;

			const lower = text.toLowerCase();
			let score = 0;
			let matchPos = -1;
			for (const term of terms) {
				const idx = lower.indexOf(term);
				if (idx >= 0) {
					score += 10;
					if (matchPos < 0) matchPos = idx;
				} else {
					score = 0;
					break;
				}
			}

			if (score > 0 && matchPos >= 0) {
				const start = Math.max(0, matchPos - 40);
				const end = Math.min(text.length, matchPos + 160);
				const snippet = (start > 0 ? '…' : '') + text.slice(start, end).replace(/\n/g, ' ').trim() + (end < text.length ? '…' : '');
				results.push({ nodeId: key, node: this.nodes.get(key), snippet, score });
			}
		}

		return results
			.sort((a, b) => b.score - a.score)
			.slice(0, maxResults);
	}

	/** Load cross-reference data */
	async loadRefs(): Promise<RefsData> {
		if (this.refsData) return this.refsData;
		if (this.refsLoadPromise) return this.refsLoadPromise;
		this.refsLoadPromise = fetch('/summa_refs.json')
			.then(r => r.json())
			.then((data: RefsData) => { this.refsData = data; return data; });
		return this.refsLoadPromise;
	}

	/** Get all article refs where this article is source or target */
	async getRefsForArticle(articleId: string): Promise<{ outgoing: ArticleRef[]; incoming: ArticleRef[] }> {
		const data = await this.loadRefs();
		return {
			outgoing: data.articleRefs.filter(r => r.source === articleId),
			incoming: data.articleRefs.filter(r => r.target === articleId),
		};
	}

	/** Get the top N most-referenced articles */
	async getMostReferencedArticles(n: number = 40): Promise<{ node: SummaNode; incomingCount: number; outgoingCount: number }[]> {
		const data = await this.loadRefs();
		const inCounts: Record<string, number> = {};
		const outCounts: Record<string, number> = {};
		for (const ref of data.articleRefs) {
			inCounts[ref.target] = (inCounts[ref.target] || 0) + ref.weight;
			outCounts[ref.source] = (outCounts[ref.source] || 0) + ref.weight;
		}
		// Rank by incoming references
		const ranked = Object.entries(inCounts)
			.map(([id, count]) => ({ node: this.nodes.get(id)!, incomingCount: count, outgoingCount: outCounts[id] || 0 }))
			.filter(r => r.node)
			.sort((a, b) => b.incomingCount - a.incomingCount)
			.slice(0, n);
		return ranked;
	}

	/** Get article-level refs for building the dependency graph */
	async getArticleRefs(): Promise<ArticleRef[]> {
		const data = await this.loadRefs();
		return data.articleRefs;
	}

	/** Load conceptual similarity data */
	async loadConcepts(): Promise<ConceptsData> {
		if (this.conceptsData) return this.conceptsData;
		if (this.conceptsLoadPromise) return this.conceptsLoadPromise;
		this.conceptsLoadPromise = fetch('/summa_concepts.json')
			.then(r => r.json())
			.then((data: ConceptsData) => { this.conceptsData = data; return data; });
		return this.conceptsLoadPromise;
	}

	/** Get all concept edges */
	async getConceptEdges(): Promise<ConceptEdge[]> {
		const data = await this.loadConcepts();
		return data.conceptEdges;
	}

	/** Get top conceptual hub articles (most connections above threshold) */
	async getConceptualHubs(n: number = 50, minSimilarity: number = 0.20): Promise<{ node: SummaNode; connectionCount: number }[]> {
		const data = await this.loadConcepts();
		const counts: Record<string, number> = {};
		for (const e of data.conceptEdges) {
			if (e.similarity >= minSimilarity) {
				counts[e.source] = (counts[e.source] || 0) + 1;
				counts[e.target] = (counts[e.target] || 0) + 1;
			}
		}
		return Object.entries(counts)
			.map(([id, count]) => ({ node: this.nodes.get(id)!, connectionCount: count }))
			.filter(r => r.node)
			.sort((a, b) => b.connectionCount - a.connectionCount)
			.slice(0, n);
	}
}

/** Load structure data and create index */
export async function loadSummaData(): Promise<SummaIndex> {
	const response = await fetch('/summa_structure.json');
	const structure: SummaStructure = await response.json();
	return new SummaIndex(structure);
}
