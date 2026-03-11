# Phase 1: Skeleton

## What Changed
- Initial project scaffolding
- SvelteKit + Tailwind + TypeScript configured
- Dark medieval aesthetic (Cinzel + Cormorant Garamond fonts, gold/parchment/charcoal palette)
- Flat indexed data model: `summa_structure.json` (5.9MB, graph structure) + `summa_texts.json` (15.9MB, loaded on demand)
- Core stores: viewMode, orderingMode, selectedNode, expandedNodes, breadcrumbPath
- `SummaIndex` class with fast lookups: by ID, type, parent/child, treatise, density sorting
- Component shells: GraphCanvas, InfoPanel, ViewSwitcher, Breadcrumb

## New Files
- `src/lib/types.ts` — TypeScript types for nodes, edges, views
- `src/lib/config.ts` — Visual config (colors, sizes) and type labels
- `src/lib/stores/app.ts` — Svelte stores for app state
- `src/lib/data/index.ts` — SummaIndex class, data loading
- `src/lib/components/graph/GraphCanvas.svelte` — Graph container (D3 in Phase 2)
- `src/lib/components/panels/InfoPanel.svelte` — Side panel with text reader
- `src/lib/components/navigation/ViewSwitcher.svelte` — View mode + ordering toggle
- `src/lib/components/navigation/Breadcrumb.svelte` — Path navigation
- `src/routes/+layout.svelte` — Root layout
- `src/routes/+page.svelte` — Main page composing all components
- `static/summa_structure.json` — Flat indexed graph data (no text)
- `static/summa_texts.json` — Full text content, loaded lazily

## Data Architecture
Flat indexed format with 24,197 nodes and 32,056 edges:
- **Nodes**: part (5), question (610), article (2,497), objection (8,294), sedcontra (2,445), answer (2,482), reply (7,864)
- **Edges**: contains, raises, counters, answers, replies, addresses (objection↔reply pairs)
- **Treatise groupings**: 30 treatises mapped to Aquinas's theological structure
- **Two-file split**: Structure loads fast for graph; text loads on demand when user clicks a node

## Setup Instructions
```bash
npm install
npm run dev
```
No environment variables needed. Data files are in `static/`.

## What's Next (Phase 2)
- D3 force graph rendering in GraphCanvas
- Progressive disclosure (expand/collapse nodes)
- Zoom/pan
- Click-to-select with info panel integration
- Breadcrumb wiring
