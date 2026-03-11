# Phase 3: Treatise View, Density View, Ordering Toggle

## What Changed
- **GraphCanvas.svelte**: Complete rewrite supporting 3 view modes with dynamic force reconfiguration
- **InfoPanel.svelte**: Added treatise node support (stats, children list)
- **types.ts**: Added `treatise` to `NodeType`
- **config.ts**: Added treatise visual config (bronze/gold, r=26) and type label
- **data/index.ts**: Added `getAllTreatises()`, `getTreatiseQuestions()`, `getTopArticlesByDensity()`

## New Features

### Treatise View
- 30 theological topic nodes arranged in a circle: "The One God", "The Trinity", "The Angels", "Creation", "Man", "The Passions", "Law", "Faith", "Charity", "Justice", "The Incarnation", "The Sacraments", etc.
- Click a treatise → expands its questions as children
- From there, drill down into articles and dialectical nodes just like hierarchical view
- Panel shows treatise stats (questions, articles, objections) and lists all questions

### Density View
- Top 80 most-contested articles displayed as root nodes
- Node radius scaled proportionally to objection count (8-38px range)
- Labels show objection count
- Click to expand into the full dialectical structure
- Instantly surfaces the most debated points in the Summa

### Ordering Toggle
- **Theological Order**: Treatises arranged in Aquinas's own sequence (God → Creation → Man → Ethics → Sacraments)
- **By Objection Count**: Treatises sorted by total objections, most contested first
- Dropdown in the top-right view switcher bar

### View Switching
- Switching views fully rebuilds the graph (clears nodes, links, expansion state)
- Each view has its own force configuration (link distances, charge strengths, collision radii)
- Zoom resets on view change
- Simulation forces reconfigured dynamically per view

## Architecture Notes
- Treatise nodes are virtual (not in the flat index) — created on-the-fly as `GNode` objects with `type: 'treatise'`
- `configureForces()` dynamically reconfigures all simulation forces when switching views
- `rebuildForView()` is the single entry point for all view transitions
- Density view uses `_radius` field on GNode for per-node sizing
- Collapse logic updated to handle treatise virtual nodes (traverses graph links, not just index children)

## Setup Instructions
Same as Phase 2 — `npm install && npm run dev`

## What's Next (Phase 4)
- Full-text search view with filtering
- URL routing (`/question/42/article/3`)
- Keyboard navigation
