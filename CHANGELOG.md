# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html). Note: this file is the *technical* changelog for contributors — the GitHub Releases page may show user-facing release notes that summarize the same release differently.

## [0.2.1] - 2026-05-15

Field-test patch from a comic-book speech-balloon renderer built against the v0.2.0 skill. No API changes — documentation only. Four gaps found in real-world R&D, all in the "measure-vs-render consistency" theme.

### Added
- **Gotcha #11 — Measure the EXACT String That Will Be Rendered.** Calls out `text-transform: uppercase`, `.toUpperCase()`, smart-quote substitution, and other post-measurement string ops as silent overflow sources. Uppercase letters can be 10–15% wider than mixed case
- **Gotcha #12 — Don't Measure With Pretext and Wrap With CSS.** Documents the silent-overflow bug when pretext measures break points but CSS (`<foreignObject>`, `max-width` containers) does the actual wrapping. Two correct paths: render per pretext break points, or let CSS own both measurement and rendering
- **New pattern: Rendering Per-Line in SVG** (`references/patterns.md`). Drawing pretext's wrapped lines as `<tspan>` elements with `x` reset and `dy` shift, with notes on `text-anchor` and baseline placement
- **New pattern: Iterative Width Search** (`references/patterns.md`). The "prepare once, layout many" shape shared by shrink-wrap balanced, auto-fit, and Knuth-Plass — plus the explicit anti-pattern of re-preparing inside the search loop (10× iterations × 5 containers can hang for ~60 seconds on long text)
- **Performance Notes warning** in `SKILL.md` — explicit "factor `prepare()` OUT of any iterative-width search" callout linking to the new pattern section
- Cross-link from Auto-Fit Font Size pattern to Iterative Width Search (same shape)
- Cross-link from Shrink-Wrap pattern to Rendering Per-Line in SVG

### Notes
- Editorial theme: gotchas #11, #12 and the iterative-search warning all share the shape "anything you do AFTER pretext returns its result invalidates the result" — the same family as the streaming-chat anti-pattern from v0.2.0. Closing note at the end of gotcha #12 surfaces this connection
- All patterns and gotchas remain consistent with `@chenglou/pretext` v0.0.7

## [0.2.0] - 2026-05-13

This release updates the skill to cover `@chenglou/pretext` v0.0.7 (published 2026-05-10), six upstream releases beyond what 0.1.0 documented. The skill now describes the full 18-function public surface (13 from the main entry + 5 from the new `@chenglou/pretext/rich-inline` subpath).

### Added
- **Rich Inline subpath documentation** — full coverage of `@chenglou/pretext/rich-inline` for mentions, chips, code spans with browser-like boundary whitespace collapse: `prepareRichInline`, `layoutNextRichInlineLineRange`, `walkRichInlineLineRanges`, `materializeRichInlineLineRange`, `measureRichInlineStats`, plus all rich-inline types
- **Four new core API sections**: `measureLineStats` (line-count + widest-line in one call, no allocations), `measureNaturalWidth` (widest forced line for intrinsic sizing), `layoutNextLineRange` (variable-width streaming without per-line string allocation), `materializeLineRange` (inflate a range into a full line on demand)
- **Extended `prepare`/`prepareWithSegments` options**: `wordBreak: 'keep-all'` for CJK/Hangul (upstream v0.0.5), `letterSpacing` as a CSS pixel number (upstream v0.0.6)
- **Three new gotchas** in SKILL.md:
  - Empty strings return `{ lineCount: 0, height: 0 }` — clamp with `Math.max(1, lineCount) * lineHeight` for browser-parity
  - `letterSpacing` is a CSS pixel number, not em/percent
  - Rich-inline `layoutNextRichInlineLineRange(prepared, maxWidth, start?)` has **swapped parameter order** vs core `layoutNextLine(prepared, start, maxWidth)`
- **New integration patterns**: rich inline text, shrink-wrap without string allocation, balanced/Knuth-Plass layout pointer
- **Honest streaming AI chat guidance** — replaces the previous rAF-every-token recipe with a tiered approach (rAF-coalesce for short bubbles, sentence-boundary debounce for long replies, DOM measurement above a length threshold). Documents that `prepare()` is O(input length) per call
- **Framework Integration Idiom section** — React/Vue/Svelte patterns for holding the opaque `PreparedText` handle in a non-reactive slot (refs/`shallowRef`/`$state.raw`) and recomputing `layout()` on resize via `ResizeObserver`
- **Obstacle Routing Without String Allocation** — variable-width manual layout that defers `materializeLineRange` until paint
- **Caveats & Quirks section** in api.md — canonical upstream caveat list (tab-size 8, soft-hyphen behavior, unmodeled `font-feature-settings`/`font-optical-sizing`/`font-variation-settings`, hard-break semantics of `measureNaturalWidth`, `system-ui` macOS warning, streaming cost note)
- **Extended wrapper module** variant supporting `wordBreak` and `letterSpacing` for CJK or spaced-out type
- `compatibility`-style notes on Intl.Segmenter and Canvas 2D runtime requirements (Gotcha #6)
- Cross-API decision tree above the "Which API Do I Need?" table

### Changed
- **Skill version** 0.1.0 → 0.2.0; `license` lifted from `metadata.license` to top-level frontmatter per Anthropic's portable schema (`metadata.author`/`metadata.version` remain nested as canonical placement)
- **SKILL.md description** rewritten to add symptom-language triggers ("measuring text height without triggering DOM reflow"), the `@chenglou/pretext/rich-inline` subpath import string, and explicit anti-triggers for CSS shrink-to-fit collisions. Drops low-yield API-name triggers
- **Vendoring section** reframed: modern bundlers handle pretext natively (proper ESM exports, `sideEffects: false`, subpath exports for `./rich-inline`); the bundler-free recipe is now opt-in. Explicit ESM-only callout (no CJS build); documents the two-subpath exports map limit (no deep imports into `dist/`)
- **Esbuild recipe path** corrected: `dist/layout.js` (the actual v0.0.7 entry), not the stale `src/index.ts`
- **Shrink-wrap chat bubbles** pattern now uses `measureLineStats` (single-call, no callback) instead of `walkLineRanges`
- **`setLocale` signature** corrected to `setLocale(locale?: string)` with documented `clearCache()` side-effect
- **Language Support** softened on Arabic: pretext does RTL line breaking, not glyph x-coord reconstruction. `segLevels` documented as internal/typed-away
- **Creative Demos** list refreshed to point at the in-package demos that now ship under `pages/demos/` (accordion, bubbles, masonry, editorial-engine, dynamic-layout, justification-comparison, markdown-chat, rich-note, variable-typographic-ascii) — versioned with the package and always reflect the current API
- **References** standardized on relative-markdown-link form throughout SKILL.md, enabling progressive disclosure (the model follows links contextually rather than always reading the full reference file)
- **Plugin manifest descriptions** (`pretext/.claude-plugin/plugin.json`, `.cursor-plugin/plugin.json`) and root README updated to drop stale "15KB TypeScript library" claim and the stale "8 exported functions" count
- "Which API Do I Need?" table expanded from 6 to 11 rows with horizontal-rule separator between Core and Manual/rich-layout groups

### Removed
- **Stale doc reference to `profilePrepare`** — this function was never exported by any published version of `@chenglou/pretext` (verified against all .d.ts files from v0.0.0 through v0.0.7). The api.md entry was a doc bug from the initial skill draft; removed entirely

### Notes
- Current `@chenglou/pretext` exported surface: 13 functions from the main entry + 5 from `/rich-inline` = 18 public functions
- API documented reflects v0.0.7; for newer entries check the upstream [CHANGELOG](https://github.com/chenglou/pretext/blob/main/CHANGELOG.md). Cheng Lou has been releasing roughly every 1–2 weeks

## [0.1.0] - 2026-04-01

### Added
- Initial release of the Pretext AI skill
- Complete API reference for `@chenglou/pretext` v0.0.3+
- Integration patterns: wrapper module, auto-fit font size, height estimation, text around obstacles
- Creative demo patterns: ASCII art, editorial layout, shrink-wrap bubbles, 3D text wrapping, streaming AI chat
- Critical gotchas documentation (lineHeight bug, argument order, font loading, etc.)
- Cross-platform support: Claude Code, Claude Desktop, Cursor, Manus, ChatGPT, Codex CLI
- Claude Code plugin marketplace support
- Cursor plugin support
- GitHub Release workflow for generic zip distribution
