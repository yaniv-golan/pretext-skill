---
name: pretext
description: >-
  Help developers use @chenglou/pretext, a small TypeScript text measurement
  library that computes exact text metrics without DOM reflows. Use when users
  mention pretext, @chenglou/pretext, @chenglou/pretext/rich-inline, measuring
  text height without triggering DOM reflow, measuring text height or line
  count in JS, auto-fitting font size to a container, flowing text around
  obstacles or images, laying out text per-line with variable widths, computing
  the natural/widest line width of a paragraph, rich inline runs with chips or
  mentions, layoutNextLine, or layoutNextLineRange. Covers API usage,
  integration patterns, and gotchas (lineHeight must be CSS pixels, font
  loading timing, system-ui caveats, ESM-only packaging). Do NOT use for
  CSS-only text layout questions, generic typography advice, or unrelated
  "shrink-to-fit" CSS questions.
license: MIT
metadata:
  author: Yaniv Golan
  version: "0.2.1"
---

# Pretext Integration Guide

You are helping a developer use **@chenglou/pretext** — a small, tree-shakable TypeScript library by Cheng Lou that computes exact text metrics using pure math (no DOM reflows). It uses `CanvasRenderingContext2D.measureText` internally, segments text, measures once, caches, then does arithmetic for all subsequent layouts. The package ships proper ESM with subpath exports (`.` for core, `./rich-inline` for inline rich text) and is `sideEffects: false` — modern bundlers tree-shake unused entrypoints.

## When Pretext Is the Right Tool

Use Pretext when the developer needs to:
- **Know text dimensions before rendering** — virtual scrolling, masonry layouts, card height estimation
- **Auto-fit text to a container** — find the largest font size that keeps text within N lines (CSS has no equivalent)
- **Flow text around obstacles** — magazine-style layouts where text wraps around shapes, images, or interactive elements
- **Measure text in canvas/SVG/WebGL** — Pretext's measurements are exact for `fillText`
- **Render rich inline text** — mentions, chips, code spans with browser-like boundary whitespace collapse, via the `@chenglou/pretext/rich-inline` subpath
- **Measure many text items fast** — each `layout()` call is ~0.0002ms after the first `prepare()` per font

## When NOT to Use Pretext

- **CSS float/flex already handles it** — don't reimplement text flow that CSS does natively
- **Content is HTML, not plain text** — Pretext measures plain text strings. Tables, code blocks, nested elements need DOM measurement
- **TanStack Virtual + Pretext height estimation** — this integration is fragile. Height errors compound over many items, and `measureElement` correction loops cause desyncing. For <500 items, just render all and use CSS transitions. For 1000+, use Pretext estimates as seeds but rely on DOM correction
- **Accordion content height** — if content has HTML structure, use off-screen DOM measurement (`visibility: hidden; position: absolute`)

## Quick Start

```bash
npm install @chenglou/pretext
```

```js
import { prepare, layout } from '@chenglou/pretext';

// 1. Prepare a text+font pair (measures & caches internally)
const prepared = prepare('Hello world', '16px Inter');

// 2. Layout at any width — returns height and line count
const result = layout(prepared, 400, 24); // maxWidth=400, lineHeight=24px
// → { lineCount: 1, height: 24 }

// Reuse for different widths (instant — pure arithmetic)
const narrow = layout(prepared, 120, 24); // → more lines, taller
```

## Critical Gotchas

These are the bugs that will waste your time if you don't know about them. Read this section before writing any Pretext code.

### 1. lineHeight Must Be in Absolute Pixels

`layout()` expects lineHeight in **CSS pixels**, not a multiplier. This is the #1 integration bug.

```js
// WRONG — will compute heights ~14x too small (silent error)
layout(prepared, 500, 1.5);

// CORRECT — convert multiplier to pixels
const fontSize = 14;
const lineHeightPx = fontSize * 1.5; // = 21
layout(prepared, 500, lineHeightPx);
```

The error is silent — Pretext happily computes with `lineHeight: 1.5` pixels, producing plausible-looking `lineCount` values but tiny `height` values.

### 2. prepare() Takes Text First, Font Second

```js
// WRONG — arguments swapped
prepare('16px Georgia', 'Hello world');

// CORRECT
prepare('Hello world', '16px Georgia');
```

### 3. Each Text+Font Pair Needs Its Own prepare()

You cannot cache a single `prepare()` token and reuse it for different text. The library caches segment metrics per font string internally, so repeated calls with the same font are fast.

### 4. Fonts Must Be Loaded First

Pretext measures using currently loaded fonts. If you measure before web fonts load, you get fallback font metrics. Either await `document.fonts.ready` or accept slight inaccuracy.

### 5. system-ui Is Unreliable

On macOS, Canvas resolves `system-ui` to a different optical variant than DOM rendering. Use explicit font names for guaranteed accuracy.

### 6. No Canvas + No Intl.Segmenter = No Pretext

Pretext requires both `CanvasRenderingContext2D.measureText` AND `Intl.Segmenter` at runtime. It works in all modern browsers (2021+) and `OffscreenCanvas` workers. Node 16+ has `Intl.Segmenter` but no native Canvas 2D — `node-canvas` works for measurement but accuracy is not guaranteed across fonts. Server-side rendering is on the upstream roadmap but not shipped yet.

### 7. Border in Height Estimates

When computing DOM element heights, don't forget `border-width`. A 1px border adds 2px total (top + bottom). Easy to miss, causes cumulative drift in layouts.

### 8. Empty String Returns `{ lineCount: 0, height: 0 }`

`layout()` with an empty string returns zero height. Browsers still size an empty block to one `line-height`, so if you want browser-parity behavior, clamp it:

```js
const { lineCount, height } = layout(prepared, width, lineHeightPx);
const browserHeight = Math.max(1, lineCount) * lineHeightPx;
```

This catches you on empty placeholders, optimistic UI before content loads, and textarea auto-grow.

### 9. letterSpacing Is a CSS Pixel Number, Not em/Percent

When you pass `{ letterSpacing: n }` to `prepare()` / `prepareWithSegments()`, `n` is treated as a CSS pixel value. CSS itself allows `letter-spacing: 0.05em` or `letter-spacing: 5%`, but Pretext only takes numeric pixels. Convert before passing:

```js
// CSS: letter-spacing: 0.05em on 16px font
const letterSpacingPx = 16 * 0.05; // = 0.8
prepare(text, '16px Inter', { letterSpacing: letterSpacingPx });
```

If you pass an em or percent value as a number, measurements drift silently.

### 10. Rich-Inline Parameter Order Is Swapped vs Core

`layoutNextRichInlineLineRange` has its `start` cursor and `maxWidth` in the **opposite order** from `layoutNextLine`. A developer who copies the core call into the rich-inline path will silently misalign arguments. See [Rich Inline API](references/api.md#rich-inline) for the side-by-side signatures.

### 11. Measure the EXACT String That Will Be Rendered

Pretext doesn't know about CSS transforms or post-measurement string ops. If your render pipeline applies any of these BEFORE drawing, apply them BEFORE `prepare()`:

- `text-transform: uppercase` / `lowercase` / `capitalize` (uppercase letters are noticeably wider — ~10–15% in most fonts)
- `.toUpperCase()` / `.toLowerCase()` / `.normalize()` in JS
- Smart-quote or ligature substitution
- Number/symbol mapping (e.g. fraction characters)

```js
// WRONG — measures mixed-case, will render uppercase, overflow
const prepared = prepare(text, font);
const r = layout(prepared, w, lh);
ctx.fillText(text.toUpperCase(), 0, 0);  // ← rendered is wider than r predicts

// CORRECT — measure what you'll render
const renderText = text.toUpperCase();
const prepared = prepare(renderText, font);
const r = layout(prepared, w, lh);
ctx.fillText(renderText, 0, 0);
```

Common case: comic lettering (all dialogue uppercase), display headlines, button labels with caps transforms. Symptom: containers sized "tightly" overflow at corners.

### 12. Don't Measure With Pretext and Wrap With CSS

If pretext measures `text` at `maxWidth` and reports `lineCount: 3`, then you render the text in a `<div style="max-width: ...">` or SVG `<foreignObject>` and let CSS do the wrapping, the CSS may break to 3 lines OR to 4 — the rules differ on hyphenation, soft-hyphens, kerning thresholds, and fallback-font width.

Either:

1. **Render per pretext's break points.** Use `prepareWithSegments` + `layoutWithLines` (or `layoutNextLine`) to get the actual line strings, render each line as its own element (`<tspan>`, `<div>`, `<text>` per line). Pixel-perfect match. See [Rendering Per-Line in SVG](references/patterns.md#rendering-per-line-in-svg).
2. **Don't use pretext for wrap.** Let CSS handle measurement AND rendering (use `getBoundingClientRect` after the DOM lays out).

Mixing measurement modes is the silent-overflow bug. Symptom: a balloon/box sized correctly for 3 lines actually renders 4, last line sticks out the bottom.

Gotchas #11 and #12 share a theme with the streaming-chat anti-pattern: **anything you do AFTER pretext returns its result invalidates the result.** Keep the measured input and the rendered output identical.

## Which API Do I Need?

Start here. Match the developer's goal to the right API path — this avoids the most common mistake (using `prepare` when `prepareWithSegments` is needed, or vice versa).

**Decision tree:** Need per-line text content (the actual strings)? → Manual / rich layout rows. Need only geometry (height, widths, line counts)? → Core layout rows. Need mentions/chips/code spans inline? → Rich Inline row.

| Developer wants to... | prepare variant | layout function |
|---|---|---|
| **Core layout** | | |
| Get text height/line count at a given width | `prepare` | `layout` |
| Auto-fit font size (binary search over sizes) | `prepare` (in a loop) | `layout` |
| Auto-height a textarea | `prepare` with `{ whiteSpace: 'pre-wrap' }` | `layout` |
| ─────────────── | | |
| **Manual / rich layout** | | |
| Get per-line text content (render, animate) | `prepareWithSegments` | `layoutWithLines` |
| Find widest line (shrink-wrap containers) | `prepareWithSegments` | `measureLineStats` or `walkLineRanges` |
| Get line count + widest in one call, no strings | `prepareWithSegments` | `measureLineStats` |
| Flow text around obstacles (variable width/line) | `prepareWithSegments` | `layoutNextLine` in a loop |
| Variable widths, no string allocation (virtualization) | `prepareWithSegments` | `layoutNextLineRange` + lazy `materializeLineRange` |
| Get intrinsic/widest forced line (hard breaks only) | `prepareWithSegments` | `measureNaturalWidth` |
| Render mentions, chips, code spans inline | `prepareRichInline` (from `/rich-inline`) | `walkRichInlineLineRanges` / `layoutNextRichInlineLineRange` |

**The key decision is `prepare` vs `prepareWithSegments` vs `prepareRichInline`:**
- `prepare` → only gives you `layout()` (height + line count). Fastest path.
- `prepareWithSegments` → gives you ALL core layout functions including `layout()`. Use this the moment you need per-line data, variable widths, or geometry without strings. There is no reason to call both for the same text.
- `prepareRichInline` (from `@chenglou/pretext/rich-inline`) → its own prepare path for arrays of mixed-font items. Not interchangeable with the core handles.

`prepare` and `prepareWithSegments` both accept `{ whiteSpace, wordBreak, letterSpacing }` as a third argument. `wordBreak: 'keep-all'` is the CSS-equivalent for CJK/Hangul. `letterSpacing` is a CSS pixel number (see gotcha #9). `prepareRichInline` is different — it takes only the items array; per-item `letterSpacing` and `break` live inside each item.

Common API selection mistakes:
- Using `prepare` then calling `layoutWithLines` → crashes at runtime (no `.segments`)
- Using `layoutWithLines` when only widths are needed → `walkLineRanges` or `measureLineStats` is cheaper (no string allocation)
- Using `layoutWithLines` when width varies per line → must use `layoutNextLine` (or `layoutNextLineRange`) instead
- Using `measureNaturalWidth` for shrink-wrap of soft-wrapping text → it returns the widest **forced** line (hard breaks only); use `measureLineStats` / `walkLineRanges` for soft-wrap shrink-wrap
- Re-calling `prepare` on container resize → just call `layout` again with the new width (it's pure arithmetic)

For full signatures, types, and examples, see the [API Reference](references/api.md). For rich inline specifically, jump to [Rich Inline](references/api.md#rich-inline).

## Integration Patterns

For detailed code examples of each pattern, see the [Patterns Reference](references/patterns.md). Here's when to reach for each:

### Wrapper Module (Recommended First Step)
Create a thin wrapper that converts lineHeight from CSS multiplier to pixels and returns `null` on failure. This prevents the critical lineHeight bug and enables progressive enhancement. An [extended variant](references/patterns.md#wrapper-module) supports `wordBreak`/`letterSpacing` for CJK or spaced-out type.

### Auto-Fit Font Size
Binary search for the largest font that keeps text within N lines. **This is Pretext's killer feature** — CSS has no equivalent. Use for hero headlines, card titles, quote displays. Shares its prepare-once-layout-many shape with all [iterative width searches](references/patterns.md#iterative-width-search) — re-preparing inside the loop is the most common performance bug.

### Height Estimation for Card Layouts
Measure variable text parts with Pretext, add fixed parts (padding, border, gaps) manually. Good for simple cards. When you only need lineCount or widest-line numbers (not actual height in px), `measureLineStats` is cheaper than `layoutWithLines`. Remember: this is inherently approximate — don't use for pixel-perfect virtualization.

### Text Around Obstacles (layoutNextLine / layoutNextLineRange)
The creative powerhouse. Feed a different `maxWidth` per line based on obstacle position. This enables magazine layouts, text flowing around images, and all the impressive community demos. For virtualization or hit-testing where you don't need the rendered text yet, `layoutNextLineRange` + lazy `materializeLineRange` avoids the per-line string allocation.

### Rich Inline Text (Mentions, Chips, Code Spans)
Use the `@chenglou/pretext/rich-inline` subpath when items have mixed fonts AND some items must stay atomic (chip pills with rounded chrome that can't break mid-name). Pretext handles browser-like boundary whitespace collapse so your `@maya` mention sits flush against surrounding text the way CSS inline rendering would. See the [Rich Inline pattern](references/patterns.md#rich-inline-text).

### Shrink-Wrap Without String Allocation
For chat bubbles, balloon containers, or any "tightest box around this text" UI, use `measureLineStats` (single call returning `{ lineCount, maxLineWidth }`) instead of running `layoutWithLines` and inspecting strings. Pretext skips the string-construction step entirely.

### Rendering Per-Line in SVG
When the surface is SVG (speech balloons, badges, posters) and you want pixel-perfect alignment between what was measured and what's drawn, render each line as its own `<tspan>` with explicit `x` reset and a `dy` shift — don't rely on `<foreignObject>` + CSS wrap (see gotcha #12). See the [SVG per-line pattern](references/patterns.md#rendering-per-line-in-svg).

### Balanced / Justified Layout (Knuth-Plass)
The upstream package ships a `justification-comparison` demo showing Knuth-Plass-style paragraph layout next to greedy hyphenation and native CSS justification. Use the same line-walking primitives (`walkLineRanges` / `layoutNextLineRange`) plus a width-balancing pass for paragraphs that need even raggedness or proper justification. See the [Balanced layout pattern](references/patterns.md#balanced-layout).

### Progressive Enhancement
Always load Pretext as enhancement — the page should work without it. Use `type="module"` as a natural feature gate.

### Vendoring (No Build Step)
Modern bundlers handle Pretext natively — proper ESM exports, `sideEffects: false`, subpath exports. Reach for the [vendoring recipe](references/patterns.md#vendoring-without-a-bundler) only when you can't run a bundler at all.

## Creative Demos & Advanced Patterns

The npm package now ships its own demos under `pages/demos/` — clone the repo and run `bun start` to play with them locally. They are the canonical reference for the patterns below, and they're versioned with the package so they always reflect the current API:

- **`accordion`** — Pretext-predicted heights for smooth expand/collapse with no layout thrashing
- **`bubbles`** — multiline chat bubbles that shrink-wrap to their longest line
- **`masonry`** — virtualized masonry using exact pre-measured heights
- **`dynamic-layout`** — variable-width manual layout (live obstacle routing)
- **`editorial-engine`** — accessible magazine-style multi-column spread with obstacle-aware title routing
- **`justification-comparison`** — Knuth-Plass paragraph layout side-by-side with greedy hyphenation and native CSS justification
- **`markdown-chat`** — virtualized chat with rich-inline + Markdown parsing (canonical streaming-chat reference)
- **`rich-note`** — rich inline notes with mentions and chips
- **`variable-typographic-ascii`** — particle-driven ASCII art using proportional glyph measurements

The community showcase has 70+ more creative uses (fluid simulations, 3D text, games, dragon-shaped reflows). All use the same core API — the difference is how creatively you compute widths and route lines.

See the [Patterns Reference](references/patterns.md) for code-level walkthroughs of the recurring idioms.

## Performance Notes

The two functions have very different cost profiles. Confusing them is the root cause of the streaming-chat anti-pattern.

- **`prepare()` is O(N) in the input text length.** Each call re-runs the Unicode segmenter and walks every segment. First call per font also measures character widths (~1–5ms). Subsequent calls with the **same font** reuse the per-font segment-width cache, but the segmentation work still scales with the text. **Don't re-prepare the same growing text every frame.**
- **Factor `prepare()` OUT of any iterative-width search.** Patterns like balanced shrink-wrap, auto-fit, and balanced-paragraph layout binary-search the maxWidth (or font size, or target line count). Each iteration must call `layout()` / `measureLineStats` / `walkLineRanges` on an already-prepared handle — NOT call `prepare()` again. Re-preparing inside the loop multiplies cost by the iteration count and produces visible UI hangs on long text. See [Iterative Width Search](references/patterns.md#iterative-width-search) for the correct shape.
- **`layout()` is ~0.0002ms.** Pure arithmetic over a prepared handle. This is what's safe to call in `requestAnimationFrame`, scroll handlers, and workers — call it on every resize tick, not `prepare()`.
- Typical batch cost: 500 different texts in the same font ≈ 19ms total prepare, 0.09ms per layout.
- For streaming AI chat (text that grows token-by-token), see the tiered guidance at [Streaming AI Chat](references/patterns.md#streaming-ai-chat) — re-preparing every token is O(N²) across the stream and burns CPU on long messages.

## Key Resources

- GitHub: https://github.com/chenglou/pretext
- Official demos: https://chenglou.me/pretext/ — also ship inside the npm package under `pages/demos/` (clone + `bun start`)
- Community showcase (70+ projects): https://pretextwall.xyz/
- Curated collection: https://www.pretext.cool/
- Additional community demos: https://somnai-dreams.github.io/pretext-demos/
