# Slide-deck library — component reference

Companion reference for the slide-deck library hosted on jsDelivr. The
source of truth lives at
`github.com/richard-myers/claude-utils/blob/main/library/slide-deck/README.md`
— this file is the subset a content-generation tool needs to know what
elements exist and how to use them.

## How to include the runtime

```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/richard-myers/public-resources@main/slide-decks/1/deck.css">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/richard-myers/public-resources@main/themes/mapofag/latest/theme.css">
<script src="https://cdn.jsdelivr.net/gh/richard-myers/public-resources@main/slide-decks/1/deck.js" defer></script>
```

- `/slide-decks/1/` — floating major; picks up non-breaking fixes
- `/slide-decks/1.1/` — floating minor; picks up patches only
- `/slide-decks/1.1.1/` — exact pin; never changes
- Themes: `mapofag`, `richard-myers`, `richard-myers-dark`

Themes are independent stylesheets — pick exactly one. `deck.css` ships
mapofag-equivalent defaults so a deck that omits the theme link still
renders sensibly.

SRI note: the floating URLs above intentionally ship without
`integrity`/`crossorigin` because the hash would invalidate on every
patch release and break the auto-update behaviour those tags are for.
Decks pinning to an exact version (`/slide-decks/1.1.1/…`) or shipping
the runtime inlined into the HTML may add SRI when they do — see the
library README for the rationale.

## Element cheat-sheet

| Element | Attributes | Purpose |
|---|---|---|
| `<deck-config>` | `theme`, `nav`, `print-layout`, `appendix-toggle`, `modes`, `brand`, `pdf-branding` | Writes theme + flags onto `<html>`/`<body>` |
| `<deck-slide>` | `id`, `variant`, `appendix`, `status`, `data-nav-label` | Slide host; auto-wraps content in `.slide-content` |
| `<deck-card>` | `accent`, `border`, `tone` | Bordered card; `<deck-card-title>` child for header |
| `<deck-callout>` | `variant` | Left-border tinted block |
| `<deck-panel>` | — | Neutral wrapper for embedded diagrams; `<deck-panel-title>` |
| `<deck-stat-grid>` | `cols` (2–5) | Grid wrapper; lays out `<deck-stat>` or any children |
| `<deck-stat>` | `tone` | Big-number cell; `<deck-stat-value>` + `<deck-stat-label>` |
| `<deck-section-emphasis>` | `label` | Bordered emphasis block with corner tab |
| `<deck-badge>` | `variant` | Pill label |
| `<deck-tag>` | `tone` | Smaller pill, reads as data |
| `<deck-mark>` | `tone`, `tip` | Inline tinted highlight with optional tooltip |
| `<deck-pullquote>` | — | Centred display quote; `<deck-pullquote-attribution>` child |
| `<deck-prompt>` | — | Centred italic discussion prompt |
| `<deck-timeline>` | — | Vertical timeline container |
| `<deck-timeline-item>` | `status` | Timeline entry; `<deck-timeline-date>` + `h4` + body |
| `<deck-flow>` | `direction`, `arrows` | Step flow; auto-inserts arrows between steps |
| `<deck-flow-step>` | `tone` | Tinted pill; `<deck-flow-sub>` child for caption |
| `<deck-step-row>` | `num`, `tone` | Numbered tab + body card |
| `<deck-compare>` | — | 2-col good/bad grid |
| `<deck-compare-good>`, `<deck-compare-bad>` | — | Slots for compare |
| `<deck-pros-cons>` | — | Strengths/weaknesses grid |
| `<deck-pros>`, `<deck-cons>` | `label` | Pros/cons column; `<li>`s auto-classed |
| `<deck-resolved-list>` | — | List of closed-out items |
| `<deck-resolved-item>` | — | Entry; `<deck-resolved-icon>` + body |
| `<deck-chart>` | `type`, `height` | Chart.js wrapper; JSON config as child `<script>` |
| `<deck-bar-row>` | `label`, `value`, `display`, `tone` | Horizontal bar with animated fill |
| `<deck-gauge>` | `value`, `display`, `label`, `tone` | Conic gauge ring |
| `<deck-raw>` | `fit` (`contain`/`flex`/`bleed`/`inline`) | Fixed-canvas wrapper for hand-authored HTML/SVG |

## Naming convention (locked)

- Canonical attribute values are **purpose-based**:
  `success | info | highlight | warning | muted | danger` for variants/tones,
  `active | in-progress | future | later` for statuses.
- Never use `color=` or colour-keyword attributes on any element. If a
  one-off colour is needed: `style="--accent-color: var(--info)"`.

## Hover details

Any card-like element can carry a hover-reveal block:

```html
<deck-card>
  <deck-card-title>Title</deck-card-title>
  <p>Body…</p>
  <div slot="detail">Extra context shown on hover (and printed in
  portrait-annotated mode).</div>
</deck-card>
```

The runtime auto-detects `[slot="detail"]` / `.hd` children, injects a
numbered superscript on the host, and routes the content to the shared
bottom overlay + print-notes block.

## Settings panel & dev flags

- `?` or `/` opens an in-page settings panel (theme, base font, hover,
  draft/hidden visibility, audience mode, canvas outline).
- `?dev=1` URL param enables the canvas outline at page load.
- `?print=landscape|portrait-annotated|portrait-2up` selects a print
  layout for the current load.
