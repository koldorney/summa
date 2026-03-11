# Phase 2: Hierarchical Graph View

## What Changed
- **GraphCanvas.svelte**: Complete rewrite with full D3.js force-directed graph
- **+page.svelte**: Wired reset button to graph component via `bind:this`

## New Features
- **Force-directed graph**: 5 Part nodes rendered on load, click to expand progressively
- **Progressive disclosure**: Part → Questions → Articles → Objections/Answers/Replies
- **Zoom & pan**: Scroll to zoom, drag background to pan (D3 zoom behavior)
- **Drag nodes**: Drag any node to reposition; simulation resettles
- **Click to expand/collapse**: Click structural nodes (Part/Question/Article) to toggle children
- **Click leaf nodes**: Click objections, answers, replies, sed contra to view text in info panel
- **Tooltips**: Hover any node for type label, title, and stats
- **Glow effects**: Parts and answer nodes have a gold glow filter
- **Color coding**: White/cream = questions, Gold = answers/replies, Black = objections
- **Expand indicators**: +/− symbols show expand state on structural nodes
- **Animated transitions**: Nodes and links fade in/out on expand/collapse
- **Reset button**: Returns to initial 5-part view and resets zoom
- **Info panel**: Shows full Aquinas text (lazy-loaded from summa_texts.json on first click)
- **Breadcrumb**: Shows path from root to selected node

## Architecture Notes
- D3 manages SVG imperatively; Svelte manages tooltip, panel, and stores reactively
- Graph arrays mutated in-place (D3 needs stable references)
- `$effect()` bridges Svelte 5 reactivity → D3 initialization
- Text content loaded lazily via `SummaIndex.loadTexts()` on first leaf node click

## Setup Instructions
```bash
npm install
npm run dev
```
Same as Phase 1, no new dependencies or env vars.

## What's Next (Phase 3)
- Treatise view: group questions by theological topic with cluster layout
- Toggle between theological ordering and density ordering
- Treatise → Question → Article hierarchy in graph
