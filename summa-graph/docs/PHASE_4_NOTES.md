# Phase 4: Search & Browse View

## What Changed
- **New: SearchView.svelte** — Full search/browse interface replacing graph when in search mode
- **data/index.ts** — Added `searchByTitle()` and `searchFullText()` methods
- **+page.svelte** — Conditionally renders GraphCanvas or SearchView based on viewMode
- **package.json** — Version bump to 4.0.0

## New Features

### Title Search
- Instant search across all 610 question titles and 2,497 article titles
- Ranked results: exact prefix matches score highest, then substring matches
- Questions ranked above articles for same relevance
- 150ms debounce for responsive typing
- Results show: type badge, title, ancestor path (Part › Question), treatise name, objection count

### Full-Text Search
- Searches across all 26,000 text entries (objections, replies, respondeos, sed contras)
- Lazy-loads the 15.4MB text store on first full-text search
- Shows text snippet with surrounding context (~200 chars around match)
- Results labeled with full path (e.g., "I › Q46 › Art. 1 › Objection 3")
- 400ms debounce (heavier operation)

### Filters
- **Part filter**: All Parts, Prima Pars, Prima Secundae, etc.
- **Type filter**: All Types, Questions only, Articles only (title search)
- **Search mode toggle**: Titles vs Full Text

### Browse Mode
- When search field is empty, shows all 610 questions grouped by Part
- Each question shows objection count
- Part filter applies to browse mode too

### Navigation
- Click any search result → switches to Hierarchical view → graph expands ancestor chain → pans to the node
- 200ms delay between view switch and navigation to let GraphCanvas mount and initialize

## Architecture Notes
- SearchView is a completely separate component from GraphCanvas — no D3 in search view
- `searchByTitle()` runs synchronously against in-memory node map — instant for 3,000 nodes
- `searchFullText()` is async — triggers text store load on first use, then searches in-memory
- Text snippets extracted with ±100 char window around first match position
- View switching unmounts/remounts GraphCanvas cleanly (initialized flag resets)

## Setup Instructions
Same as before — `npm install && npm run dev`
