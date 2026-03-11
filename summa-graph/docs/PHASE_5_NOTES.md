# Phase 5: Dependency View (Cross-References)

## What Changed
- **New: summa_refs.json** (239KB) — 4,186 article-level cross-references extracted from Aquinas's internal citations
- **GraphCanvas.svelte** — Added dependency view with arc-link rendering, async view building
- **data/index.ts** — Added ref loading (`loadRefs`), `getMostReferencedArticles()`, `getRefsForArticle()`, `getArticleRefs()`
- **types.ts** — Added `dependency` to ViewMode, added `ArticleRef` and `RefsData` types
- **config.ts** — (no change, articles use existing config)
- **ViewSwitcher.svelte** — Added Dependencies tab

## Data Extraction

### Method
Regex-based extraction from all 26,000 parsed text entries. Three patterns:
1. **"Question N, Article M, ad N"** → resolves to specific reply node (most specific)
2. **"Question N, Article M"** → cross-question reference to an article
3. **"(Article N)"** → relative reference within the same question

### Results
- **6,080** total citation patterns found in the text
- **4,932** resolved to specific node IDs
- **4,186** unique article-level cross-references (deduplicated, self-refs removed)
- **599** unresolved (ambiguous or external-part references)

### Most Referenced Articles (theological load-bearing pillars)
- "Whether the will is moved by the intellect" (I-II Q9 A1) — 20 incoming refs
- "Whether charity is friendship" (II-II Q23 A1) — 19 refs
- "Whether the predestined are chosen by God" (I Q23 A4) — 17 refs
- "Whether essence and existence are the same in God" (I Q3 A4) — 14 refs
- "Whether whatever God wills He wills necessarily" (I Q19 A3) — 13 refs

## Dependency View Features
- Top 50 most-referenced articles displayed in a circular layout
- Node size proportional to incoming reference count
- **Curved arc links** between articles showing citation relationships (quadratic bezier)
- Hover shows incoming/outgoing ref counts
- Label shows "N refs" below each node
- Click to select → info panel shows article details
- Weaker link forces (0.08 strength) so the web of references spreads out visually
- Links render as arcs in dependency view, straight lines in all other views

## Architecture Notes
- `summa_refs.json` loaded lazily on first dependency view access (239KB, instant)
- `rebuildForView()` is now async to support the ref data loading
- Link rendering switched from `<line>` to `<path>` elements globally — straight `M…L` for normal views, quadratic `M…Q` bezier for dependency arcs
- Arc offset calculated perpendicular to the link direction: `offset = min(dist * 0.3, 60px)`

## Setup Instructions
Same as before — `npm install && npm run dev`
