---
name: pretext
description: >-
  Help developers use @chenglou/pretext 1.0+, which measures and lays out
  multiline text without DOM reflow. Use for pretext, /rich-inline,
  layoutNextLine, upgrading from 0.0.x, text height, line count, shrink-wrap,
  auto-fit font size, line clamp, inline chips, mentions or images computed in
  JS; text around obstacles, even sprites or masks moving every frame; and
  canvas text whose letters move on their own: particles, game pieces, kinetic
  type, ASCII art. Also for its errors: "font must be a font string Canvas
  takes", "Text measurement requires OffscreenCanvas", or a layoutNextLine loop
  that never ends. Do NOT use for CSS-only layout, generic typography, or CSS
  shrink-to-fit questions.
compatibility: Written for @chenglou/pretext 1.0.0 or later. Pre-1.0 projects need references/migration.md first.
license: MIT
metadata:
  author: Yaniv Golan
  version: "0.3.0"
---

# Pretext Integration Guide

You are helping a developer use **@chenglou/pretext**, a TypeScript library by Cheng Lou that predicts the browser's line breaks and heights from canvas measurements, using ports of each browser's line breaker. `prepare()` segments the text and measures it once with `CanvasRenderingContext2D.measureText`; `layout()` is then arithmetic at any width, with no DOM reads. It is ESM: `@chenglou/pretext` is the core, and `@chenglou/pretext/rich-inline` handles mixed-font inline text.

## Check the Version First

Read the project's `package.json` (or run `npm ls @chenglou/pretext`) before writing any code. This skill covers 1.0.0 and later. Below 1.0.0, read [migration.md](references/migration.md) before writing code: a caret range on a 0.0.x version never reaches 1.0 by itself, and several signatures changed. Don't write signatures from memory; take them from the references.

## When Pretext Is the Right Tool

- **Know text height before rendering**: virtual lists, masonry, cards, accordions.
- **Auto-fit font size** to N lines, which CSS can't do.
- **Truncate to N lines with an ellipsis** when you need the clamped strings, as for Canvas or SVG.
- **Flow text around obstacles**: a different width for each line.
- **Lines and widths for painting with `fillText`** in canvas, SVG or WebGL. Paint each line's text through `paintableText`, a helper recipe in patterns-flow.md (not a library export), so soft-hyphen breaks draw the hyphen that was measured.
- **Rich inline text**: mentions, chips, code spans and inline images, via `/rich-inline`.
- **Shrink-wrap**: the tightest width for a chat bubble or label.
- **Letters that move on their own** (particles, game pieces, ASCII art): Pretext breaks the lines; per-character positions come from canvas. See [patterns-glyphs.md](references/patterns-glyphs.md).

## When NOT to Use Pretext

- **CSS already handles it**: don't reimplement floats, flex or plain wrapping.
- **Content is HTML, not text**: tables, code blocks and nested elements need DOM measurement.
- **Virtualizers with mixed content** (images of unknown size, embeds, HTML): these need DOM measuring. When all content is Pretext-measured, Pretext heights work in a virtualizer such as TanStack Virtual with no `measureElement` loop.
- **Accordion content with HTML structure**: measure it off-screen in the DOM.
- **Letters on a fixed grid with nothing to wrap** (a game board, a terminal view): use the cell size. Pretext adds nothing until text has to wrap or fit its measured width.

## Quick Start

```bash
npm install @chenglou/pretext
```

```js
import { prepare, layout } from '@chenglou/pretext';

const prepared = prepare('Hello world', '16px Inter'); // text first, then a canvas font
const result = layout(prepared, 400, 24); // maxWidth 400px, lineHeight 24px
// → { lineCount: number, height: number }

const narrow = layout(prepared, 120, 24); // on resize, lay out again; never prepare again
```

## Critical Gotchas

Read these before writing any Pretext code.

### 1. lineHeight Must Be in Absolute Pixels

`layout()` takes line height in CSS px, not a multiplier. Passing `1.5` gives a plausible `lineCount` and a tiny `height`, with no error.

```js
const prepared = prepare(text, '14px Inter');
const lineHeightPx = 14 * 1.5; // CSS: font-size 14px, line-height 1.5
layout(prepared, 500, lineHeightPx); // not layout(prepared, 500, 1.5)
```

### 2. prepare() Takes Text First, and a Bad Font Throws

`prepare(text, font)`. Swapped arguments throw a `RangeError`, unless the swapped text happens to be a valid font string, and then the numbers are silently wrong.

- `getComputedStyle(el).font` can be an empty string (an unmounted element, or a longhand such as `font-variant-numeric`), which throws.
- Which other strings throw varies by browser, such as `'1.5em Arial'` or `'caption'`: see [accuracy.md](references/accuracy.md#fonts). The safe form is a px size and a named family, `'600 16px Inter'`.
- `document.fonts.load()` rejects a malformed string with a `SyntaxError` first, so that is the error you see.

### 3. Each Text+Font Pair Needs Its Own prepare()

A handle is for one text, font and options. Prepare each string. Pretext caches segment widths per font, so many strings in one font are cheap.

### 4. Load Fonts Before prepare()

Before a web font loads, Canvas measures the fallback font. Await `document.fonts.load(font, text)`, which also loads the `unicode-range` parts the text needs, and handle its rejection. If text was prepared before its font arrived, call `clearCache()` and prepare it again.

```js
async function prepareLoaded(text, font) {
  await document.fonts.load(font, text); // rejects for a malformed font string
  return prepare(text, font);
}
```

### 5. system-ui Is Unreliable

On macOS, Canvas resolves `system-ui` and `-apple-system` to a different font from the one the page paints. Use a named font: see [accuracy.md](references/accuracy.md#fonts).

### 6. No Canvas, No Pretext

Without a Canvas 2D context or a global `OffscreenCanvas`, `prepare()` throws `Text measurement requires OffscreenCanvas or a DOM canvas context.` Node and server rendering throw; upstream says Bun, jsdom and happy-dom do too. Call it only on the client, or see [patterns-integration.md](references/patterns-integration.md#outside-the-browser) for a shim. `Intl.Segmenter` is needed only for Southeast Asian scripts such as Thai.

### 7. Border in Height Estimates

When you add fixed parts to a text height, include `border-width`: a 1px border adds 2px to the box. It is easy to miss and adds up across a list.

### 8. Empty Text Is Zero Lines, but a Textarea Isn't

`layout()` of `''` gives 0 lines and a height of 0. That matches the browser, where an empty block is 0 tall, so don't clamp it. A `<textarea>` shows one more line than `layout()` counts when its value is empty or ends in `\n`, because it keeps a line for the caret. Add it when you size one.

### 9. letterSpacing Is a Finite CSS Pixel Number

`{ letterSpacing }` is CSS px. Convert `em` or `%` first: `0.05em` on a 16px font is `0.8`. A non-finite value such as `NaN` throws a `RangeError`.

### 10. layoutNextLine Takes the Width Before the Cursor

Since 1.0.0 the order is `(prepared, maxWidth, start?)`, for `layoutNextLine` and `layoutNextLineRange`. Before 1.0 the cursor came second. A call in the old order still runs in JavaScript but never returns `null`, so the loop hangs. Omit the cursor or pass `undefined` for the first line, never `null`, which throws.

```js
const prepared = prepareWithSegments(longText, '16px Inter');
let cursor; // undefined: start at the beginning
for (let y = 0; ; y += 20) {
  const line = layoutNextLine(prepared, getWidthAroundObstacle(y), cursor);
  if (line === null) break;
  renderLine(line.text, y);
  cursor = line.end;
}
```

### 11. Measure the EXACT String That Will Be Rendered

Pretext measures the characters you give it. Apply `text-transform`, `.toUpperCase()`, `.normalize()`, smart quotes or number formatting before `prepare()`, then paint that same string. Capitals are wider, so a box sized for mixed case overflows. Example: [accuracy.md](references/accuracy.md#painting).

### 12. Paint With What You Measured

Paint each paragraph as one element with the same `font`, the same `line-height` in px, the `width` you passed to `layout()`, and `overflow-wrap: break-word`. The browser then wraps it to the same lines in nearly all cases; check the painted height in your browser once. Paint per line only where the browser can't wrap for you: Canvas, SVG `<text>`, varying widths, and rich inline text with mixed fonts or padded pieces. For CSS that Pretext doesn't model, such as `text-wrap: balance` or `hyphens: auto`, see [accuracy.md](references/accuracy.md#css-pretext-does-not-model).

Gotchas #11 and #12 share a theme: **a mismatch comes from changing the inputs after measuring.** Paint the string, font, width and CSS you measured.

### 13. Handles Are Opaque and Version-Bound

A handle belongs to the Pretext version that made it, and another version's handle throws a `TypeError`. Store the text, font and options, and prepare again rather than persisting handles across versions (IndexedDB, a worker on another bundle). Don't read internals the types don't expose. A handle holds a typed array: a shallow `Object.freeze`, or Immer's `freeze` and `produce`, work, but a hand-written recursive freeze throws, so don't write one.

## Which API Do I Need?

| Developer wants to... | prepare variant | layout function |
|---|---|---|
| Text height or line count at a width | `prepare` | `layout` |
| Auto-fit font size | `prepare` per size tried | `layout` in a binary search |
| Auto-height a textarea | `prepare` with `{ whiteSpace: 'pre-wrap' }` | `layout`, plus one line when empty or ending in `\n` (gotcha #8) |
| Widest line (shrink-wrap) | `prepare` | `measureLineStats` or `walkLineRanges` |
| Line count plus widest line | `prepare` | `measureLineStats` |
| Intrinsic width (widest forced line) | `prepare` | `measureNaturalWidth` |
| Variable widths without strings | `prepare` | `layoutNextLineRange` |
| Truncate with an ellipsis | `prepare` to test; `prepareWithSegments` for the strings | `layout`; the [clamp recipe](references/patterns-sizing.md#truncating-with-an-ellipsis) |
| Per-line text (canvas, SVG, animation) | `prepareWithSegments` | `layoutWithLines`, painted via [`paintableText`](references/patterns-flow.md#painting-a-lines-text) |
| Flow text around obstacles | `prepareWithSegments` | `layoutNextLine` in a loop ([recipes](references/patterns-flow.md#text-around-obstacles)) |
| Text in several slots per band (both sides of an obstacle, a mask) | `prepareWithSegments` | `layoutNextLine` per slot, [`layoutInBands`](references/patterns-flow.md#text-on-both-sides-and-in-shapes) |
| Per-character positions (particles, games) | `prepareWithSegments` | `layoutWithLines`, then [`glyphPositions`](references/patterns-glyphs.md#per-character-positions) |
| Variable widths, text only for painted lines | `prepareWithSegments` | `layoutNextLineRange` + `materializeLineRange` |
| Mentions, chips, code spans inline | `prepareRichInline` (`/rich-inline`) | `walkRichInlineLineRanges` / `layoutNextRichInlineLineRange` |
| Inline images or emoji | `prepareRichInline` with a `{ width }` box | the same ([boxes](references/rich-inline.md#boxes)) |

**Choosing the prepare call:**

- Use `prepare` unless a function must return text. Its handle works with `layout`, `layoutNextLineRange`, `walkLineRanges`, `measureLineStats` and `measureNaturalWidth`.
- `prepareWithSegments` is for `layoutWithLines`, `layoutNextLine` and `materializeLineRange`, and for reading `segments`, `kinds` and `widths`. `widths` is typed `ArrayLike<number>`: copy it with `Array.from` before using array methods.
- `prepareRichInline` is for mixed fonts, padded pieces, atomic items and boxes. It takes an items array, and `{ whiteSpace, wordBreak }` as its second argument; `letterSpacing`, `break` and `extraWidth` go on each item. Its handle doesn't work with the core functions.

`prepare` and `prepareWithSegments` take `{ whiteSpace, wordBreak, letterSpacing }` third. `wordBreak: 'keep-all'` is CSS `word-break: keep-all`, for CJK and Hangul.

Common mistakes:
- `prepare` then `layoutWithLines` (or `layoutNextLine`, `materializeLineRange`) throws a `TypeError`.
- `.map(prepareRichInline)` passes the index as options. Write `.map(items => prepareRichInline(items))`.
- `layoutWithLines` when the width varies per line: use `layoutNextLine` or `layoutNextLineRange`.
- `measureNaturalWidth` to shrink-wrap soft-wrapped text: it gives the widest forced line. Use `measureLineStats`.
- Calling `prepare` again on resize: call `layout` again instead.

## Where to Read More

| File | What's in it | Read when |
|---|---|---|
| [api.md](references/api.md) | The 12 core functions, types and handle fields | Exact signatures or types for the main entry |
| [rich-inline.md](references/rich-inline.md) | The 5 `/rich-inline` functions, items and boxes, painting fragments, recipes | Mixed fonts, chips, mentions, code spans, inline images |
| [patterns-sizing.md](references/patterns-sizing.md) | Wrapper, auto-fit, cards, shrink-wrap, iterative search, truncation, live-edited text, virtualized lists, streaming | Heights, widths, line counts, fitting or clamping |
| [patterns-flow.md](references/patterns-flow.md) | `paintableText`, obstacles, both-side slots, masks, SVG per line, balanced layout, editorial, 3D, animation | Placing lines yourself: variable widths, canvas, SVG |
| [patterns-glyphs.md](references/patterns-glyphs.md) | Per-character positions, ink bounds, proportional ASCII | Letters that move on their own: particles, games, ASCII art |
| [patterns-integration.md](references/patterns-integration.md) | Frameworks and SSR, progressive enhancement, vendoring, outside the browser | Wiring into an app, a build, a server or a worker |
| [accuracy.md](references/accuracy.md) | Painting, fonts, language, widths, CSS it doesn't model, runtimes, engines, bundle size | Results differ from what the page shows |
| [migration.md](references/migration.md) | 0.0.x to 1.0.0: finding old usage, breaking and silent changes | The project is below 1.0.0, or old code is pasted |
| Upstream [markdown-chat.md](https://github.com/chenglou/pretext/blob/v1.0.0/pages/demos/markdown-chat.md) | The Markdown chat demo's patterns, and when to skip each | Chats and other long lists |
| Upstream [README Caveats](https://github.com/chenglou/pretext/blob/v1.0.0/README.md#caveats) | Upstream's own accuracy notes | Anything `accuracy.md` doesn't cover |

## Demos

Live at https://chenglou.me/pretext/. In the repository: clone, `bun install`, `bun start`.

- `accordion`: expand and collapse with predicted heights
- `bubbles`: chat bubbles shrink-wrapped to their widest line
- `dynamic-layout`: text routed around moving obstacles
- `editorial-engine`: a magazine spread with columns and obstacles
- `ellipsis`: line clamp with an ellipsis, and a path cut in its middle
- `justification-comparison`: Knuth-Plass, greedy and CSS justification
- `markdown-chat`: virtualized Markdown chat; the virtualization reference
- `masonry`: masonry from predicted heights
- `rich-note`: notes with mentions and chips
- `variable-typographic-ascii`: ASCII art from glyph widths; [patterns-glyphs.md](references/patterns-glyphs.md#proportional-ascii-art) has a fixed-grid recipe

Community demos (pretext.cool, awesome-pretext) mostly predate 1.0: they pass `layoutNextLine` its cursor second, and some read handle internals. Use them for ideas, and take signatures from the references ([migration.md](references/migration.md#code-from-community-demos)).

## Performance

- `prepare()` walks the whole text and measures new segments. `layout()` and the other line functions are arithmetic over the handle, safe for resize handlers and animation frames.
- **Don't re-prepare.** Keep handles, and prepare again only when the text, font, options or language change.
- **Hoist `prepare()` out of searches** over width or line count, such as balanced shrink-wrap: every iteration lays out the same handle. An auto-fit search prepares once per font size it tries, never per width.
- **Streaming text:** prepare only the block that changed, not the whole message per token.
- When you need no strings, `measureLineStats` or `walkLineRanges` on a `prepare` handle is cheaper than `layoutWithLines`.

## Resources

- Repository: https://github.com/chenglou/pretext
- README for 1.0.0: https://github.com/chenglou/pretext/blob/v1.0.0/README.md
- CHANGELOG: https://github.com/chenglou/pretext/blob/v1.0.0/CHANGELOG.md
- Live demos: https://chenglou.me/pretext/
