# Pretext API Reference

Complete API reference for `@chenglou/pretext`. API reflects v0.0.7 (published 2026-05-10). For newer entries, check the upstream [CHANGELOG](https://github.com/chenglou/pretext/blob/main/CHANGELOG.md).

The package exports 13 functions from the main entry plus 5 from `@chenglou/pretext/rich-inline` (18 total).

## Table of Contents

### Core layout (main entry)

1. [prepare](#prepare)
2. [layout](#layout)
3. [prepareWithSegments](#preparewithsegments)
4. [layoutWithLines](#layoutwithlines)
5. [layoutNextLine](#layoutnextline)
6. [layoutNextLineRange](#layoutnextlinerange)
7. [materializeLineRange](#materializelinerange)
8. [walkLineRanges](#walklineranges)
9. [measureLineStats](#measurelinestats)
10. [measureNaturalWidth](#measurenaturalwidth)
11. [clearCache](#clearcache)
12. [setLocale](#setlocale)

### Rich Inline (`@chenglou/pretext/rich-inline`)

13. [Rich Inline](#rich-inline) — `prepareRichInline`, `layoutNextRichInlineLineRange`, `walkRichInlineLineRanges`, `materializeRichInlineLineRange`, `measureRichInlineStats`

### Reference

14. [Types](#types)
15. [Language Support](#language-support)
16. [Caveats & Quirks](#caveats--quirks)

---

## prepare

```typescript
prepare(text: string, font: string, options?: PrepareOptions): PreparedText
```

Segments text using `Intl.Segmenter` following Unicode line-break rules, measures each segment's glyph width via Canvas `measureText()`, and caches results.

**Arguments:**
- `text` (string) — the text to measure. **TEXT IS THE FIRST ARGUMENT.**
- `font` (string) — CSS font shorthand: `"14px Georgia, serif"`, `"bold 16px Inter"`, etc. Must match the CSS `font` shorthand you'd assign to the element being measured.
- `options` (optional):
  - `whiteSpace`: `'normal'` (default) or `'pre-wrap'`. `'pre-wrap'` preserves ordinary spaces, tabs (`\t`), and hard breaks (`\n`) — use for textareas.
  - `wordBreak`: `'normal'` (default) or `'keep-all'`. `'keep-all'` matches CSS `word-break: keep-all` for CJK/Hangul and mixed Latin/numeric/CJK runs without spaces.
  - `letterSpacing`: number — CSS pixel value matching your CSS `letter-spacing`. **Pixels only, not em or percent** (see SKILL.md gotcha #9).

**Returns:** An opaque `PreparedText` token (branded type). Cannot be inspected — pass it to `layout()`.

**Caching behavior:** Segment metrics are cached per font string. Repeated `prepare()` calls with the same font reuse the cache, so measuring 100 different texts in the same font is fast after the first call. The cost of a single `prepare()` call still scales with the input text length (it re-runs the Unicode segmenter and walks all segments) — re-preparing a growing token stream every frame is O(N²). See patterns.md for the streaming-chat idiom.

```js
import { prepare } from '@chenglou/pretext';

const p1 = prepare('Hello world', '16px Inter');
const p2 = prepare('Different text', '16px Inter'); // reuses font cache
const p3 = prepare('Bold text', 'bold 16px Inter'); // different font = new cache entry

// Textarea auto-height with pre-wrap
const taPrepared = prepare(textareaValue, '14px Inter', { whiteSpace: 'pre-wrap' });

// CJK keep-all
const cjkPrepared = prepare('春天到了', '16px Inter', { wordBreak: 'keep-all' });

// Tracking-adjusted display text
const tightPrepared = prepare('SHIPPING', '16px Inter', { letterSpacing: 1.5 });
```

---

## layout

```typescript
layout(prepared: PreparedText, maxWidth: number, lineHeight: number): LayoutResult
```

Computes line breaks and total height using pure arithmetic — no DOM access.

**Arguments:**
- `prepared` — token from `prepare()`
- `maxWidth` (number) — available width in CSS pixels
- `lineHeight` (number) — **ABSOLUTE CSS PIXELS, NOT A MULTIPLIER.** If your CSS says `line-height: 1.5` on a 14px font, pass `21` (= 14 × 1.5)

**Returns:**
```typescript
{ lineCount: number, height: number }
```

**Performance:** ~0.0002ms per call. Safe to call every animation frame.

**Empty-string behavior:** `layout(prepared, w, lh)` for empty text returns `{ lineCount: 0, height: 0 }`. Browsers still size an empty block to one `line-height` worth of space, so clamp if you need browser parity (see SKILL.md gotcha #8):

```js
const { lineCount, height } = layout(prepared, width, lineHeightPx);
const browserHeight = Math.max(1, lineCount) * lineHeightPx;
```

```js
import { prepare, layout } from '@chenglou/pretext';

const prepared = prepare('Some text content here', '14px Georgia');
const fontSize = 14;
const lineHeightMultiplier = 1.5;
const lineHeightPx = fontSize * lineHeightMultiplier; // = 21

const result = layout(prepared, 500, lineHeightPx);
// → { lineCount: 1, height: 21 }

// Instant re-layout at different widths
const narrow = layout(prepared, 100, lineHeightPx);
// → { lineCount: 3, height: 63 }
```

---

## prepareWithSegments

```typescript
prepareWithSegments(
  text: string,
  font: string,
  options?: PrepareOptions
): PreparedTextWithSegments
```

Like `prepare()`, but returns a richer structure that includes segment information. Accepts the same `PrepareOptions` (`whiteSpace`, `wordBreak`, `letterSpacing`). Required for `layoutWithLines()`, `layoutNextLine()`, `layoutNextLineRange()`, `materializeLineRange()`, `walkLineRanges()`, `measureLineStats()`, and `measureNaturalWidth()`.

```js
import { prepareWithSegments, layoutWithLines } from '@chenglou/pretext';

const prepared = prepareWithSegments('Hello world, this is a test.', '16px Inter');
// Use with any of the manual-layout functions
```

The richer handle also internally carries `segLevels` (an `Int8Array | null`) for bidi-aware rendering. It's typed away by the public brand, so consumers can't read it through the supported API — it's there for custom RTL renderers that reach into the handle's internal shape. **The line-breaking APIs do not read it.**

---

## layoutWithLines

```typescript
layoutWithLines(
  prepared: PreparedTextWithSegments,
  maxWidth: number,
  lineHeight: number
): LayoutLinesResult
```

Returns per-line text content and widths — useful for character-level animation, syntax highlighting per line, or custom rendering.

**Returns:**
```typescript
{
  height: number,
  lineCount: number,
  lines: LayoutLine[]
}
```

Each `LayoutLine`:
```typescript
{
  text: string,    // full text content of the line
  width: number,   // measured pixel width
  start: LayoutCursor,  // inclusive start position
  end: LayoutCursor     // exclusive end position
}
```

```js
import { prepareWithSegments, layoutWithLines } from '@chenglou/pretext';

const prepared = prepareWithSegments(
  'The quick brown fox jumps over the lazy dog.',
  '16px Georgia'
);
const result = layoutWithLines(prepared, 200, 24);

result.lines.forEach((line, i) => {
  console.log(`Line ${i}: "${line.text}" (${line.width}px)`);
});
// Line 0: "The quick brown fox " (162px)
// Line 1: "jumps over the lazy " (158px)
// Line 2: "dog." (38px)
```

---

## layoutNextLine

```typescript
layoutNextLine(
  prepared: PreparedTextWithSegments,
  start: LayoutCursor,
  maxWidth: number
): LayoutLine | null
```

Routes text one line at a time with a potentially different `maxWidth` each call. **This is the key API for obstacle-aware text flow** — text wrapping around shapes, images, or interactive elements.

Returns `null` when all text has been laid out.

**Arguments:**
- `prepared` — from `prepareWithSegments()`
- `start` — cursor position to start from. First call: `{ segmentIndex: 0, graphemeIndex: 0 }`
- `maxWidth` — available width for THIS specific line (can vary per line)

```js
import { prepareWithSegments, layoutNextLine } from '@chenglou/pretext';

const prepared = prepareWithSegments(longText, '14px Georgia');

// Text flowing around a circular obstacle
let cursor = { segmentIndex: 0, graphemeIndex: 0 };
let y = 0;
const lineHeight = 21;

while (true) {
  // Calculate available width based on obstacle position
  const availableWidth = getWidthAroundObstacle(y, circleX, circleY, circleRadius);

  const line = layoutNextLine(prepared, cursor, availableWidth);
  if (!line) break;

  renderLine(line.text, y);
  cursor = line.end;       // advance cursor to start of next line
  y += lineHeight;
}
```

---

## layoutNextLineRange

```typescript
layoutNextLineRange(
  prepared: PreparedTextWithSegments,
  start: LayoutCursor,
  maxWidth: number
): LayoutLineRange | null
```

Same as `layoutNextLine`, but returns a `LayoutLineRange` (no `.text` field) instead of a `LayoutLine`. Use this when you want variable-width routing AND you don't need every line's string up front — e.g., virtualization, hit-testing, occlusion culling, paint-on-demand renderers.

Pair with `materializeLineRange` to inflate a range into a full line on demand.

```js
import { prepareWithSegments, layoutNextLineRange, materializeLineRange } from '@chenglou/pretext';

const prepared = prepareWithSegments(article, BODY_FONT);
let cursor = { segmentIndex: 0, graphemeIndex: 0 };
let y = 0;
const visibleRanges = [];

while (true) {
  const width = y < image.bottom ? columnWidth - image.width : columnWidth;
  const range = layoutNextLineRange(prepared, cursor, width);
  if (!range) break;

  if (isVisible(y)) visibleRanges.push({ range, y }); // only keep ranges that need rendering
  cursor = range.end;
  y += lineHeight;
}

// Later, only materialize the lines we actually paint
for (const { range, y } of visibleRanges) {
  const line = materializeLineRange(prepared, range);
  ctx.fillText(line.text, 0, y);
}
```

---

## materializeLineRange

```typescript
materializeLineRange(
  prepared: PreparedTextWithSegments,
  line: LayoutLineRange
): LayoutLine
```

Turns a `LayoutLineRange` from `layoutNextLineRange()` or `walkLineRanges()` into a `LayoutLine` with the resolved `.text` string.

```js
import { materializeLineRange } from '@chenglou/pretext';

const line = materializeLineRange(prepared, range);
// → { text: "hello world", width: 87.5, start: {...}, end: {...} }
```

If a soft hyphen won the break, the materialized text includes a trailing `-`.

---

## walkLineRanges

```typescript
walkLineRanges(
  prepared: PreparedTextWithSegments,
  maxWidth: number,
  onLine: (line: LayoutLineRange) => void
): number
```

Low-level line iteration — calls a callback for each line without building text strings. More efficient than `layoutWithLines` when you only need widths and positions, not the actual text. For "give me line count + widest in one call," prefer [`measureLineStats`](#measurelinestats) — it's a single call with no callback.

**Returns:** total line count.

Each `LayoutLineRange`:
```typescript
{
  width: number,
  start: LayoutCursor,  // inclusive
  end: LayoutCursor     // exclusive
}
```

```js
import { prepareWithSegments, walkLineRanges } from '@chenglou/pretext';

const prepared = prepareWithSegments(text, font);

// Find the widest line (for shrink-wrap containers)
let maxLineWidth = 0;
const lineCount = walkLineRanges(prepared, containerWidth, (line) => {
  maxLineWidth = Math.max(maxLineWidth, line.width);
});
// maxLineWidth is now the pixel width of the widest line
```

---

## measureLineStats

```typescript
measureLineStats(
  prepared: PreparedTextWithSegments,
  maxWidth: number
): LineStats
```

Returns `{ lineCount, maxLineWidth }` in a single call, without allocating any line objects or strings. This is the cheapest way to ask "how does this text wrap?" — use it for shrink-wrap balloons, balanced-text width searches, and any UI that resizes containers to fit content.

```js
import { prepareWithSegments, measureLineStats } from '@chenglou/pretext';

const prepared = prepareWithSegments('Hello world, this is a chat message.', '14px Inter');
const { lineCount, maxLineWidth } = measureLineStats(prepared, 280);
// Set bubble width to the longest line, not the container — feels tighter
bubble.style.width = Math.ceil(maxLineWidth) + paddingX * 2 + 'px';
```

Cheaper than `walkLineRanges` when you only need the aggregates, because the callback-free path avoids per-line object allocation.

---

## measureNaturalWidth

```typescript
measureNaturalWidth(
  prepared: PreparedTextWithSegments
): number
```

Returns the widest **forced** line in the text — i.e., the widest line you get when the only line breaks are hard breaks (`\n` in `pre-wrap` mode) and there's no soft wrap. Useful for intrinsic sizing: "how wide would this paragraph want to be if you gave it infinite horizontal space?"

```js
import { prepareWithSegments, measureNaturalWidth } from '@chenglou/pretext';

const prepared = prepareWithSegments('First line\nSecond, longer line', '16px Inter', { whiteSpace: 'pre-wrap' });
const intrinsic = measureNaturalWidth(prepared);
// intrinsic ≈ width of "Second, longer line"
```

**Important: this is NOT the right tool for shrink-wrap of soft-wrapping text.** If your text has no hard breaks, `measureNaturalWidth` will return the width of the entire string as a single line. For soft-wrap shrink-wrap (chat bubbles, balanced text within a max width), use [`measureLineStats`](#measurelinestats) or [`walkLineRanges`](#walklineranges).

---

## clearCache

```typescript
clearCache(): void
```

Clears internal measurement caches. Rarely needed — the cache is small and improves performance for repeated measurements with the same font.

Use if you're dynamically loading many different fonts and want to free memory.

---

## setLocale

```typescript
setLocale(locale?: string): void
```

Sets the locale for `Intl.Segmenter`, which affects how text is segmented for line breaking. Default behavior uses the runtime's locale.

- Call with a locale string (`'ja'`, `'ko'`, `'th'`, etc.) to override.
- Call with no argument (`setLocale()`) or `setLocale(undefined)` to reset to the runtime locale.
- **Internally calls `clearCache()`** — any previously prepared handles still work (no mutation), but new `prepare()` calls re-measure from scratch under the new locale.

```js
import { setLocale } from '@chenglou/pretext';
setLocale('ja');      // Japanese segmentation rules; clears caches
setLocale();          // Reset to runtime default; clears caches again
```

---

## Types

### LayoutCursor
```typescript
{
  segmentIndex: number,    // position in the segment stream
  graphemeIndex: number     // grapheme position within segment (0 at boundaries)
}
```

Initial cursor for `layoutNextLine` / `layoutNextLineRange`: `{ segmentIndex: 0, graphemeIndex: 0 }`.

### LayoutLine
```typescript
{
  text: string,
  width: number,
  start: LayoutCursor,  // inclusive
  end: LayoutCursor     // exclusive
}
```

### LayoutLineRange
```typescript
{
  width: number,
  start: LayoutCursor,  // inclusive
  end: LayoutCursor     // exclusive
}
```

### LineStats
```typescript
{
  lineCount: number,        // total wrapped lines
  maxLineWidth: number       // widest wrapped line in CSS px
}
```

### LayoutLinesResult
```typescript
{
  height: number,
  lineCount: number,
  lines: LayoutLine[]
}
```

### PrepareOptions
```typescript
{
  whiteSpace?: 'normal' | 'pre-wrap',
  wordBreak?: 'normal' | 'keep-all',
  letterSpacing?: number    // CSS pixel value; not em/percent
}
```

---

## Rich Inline

The `@chenglou/pretext/rich-inline` subpath is a narrow helper for inline-only rich text — mentions, chips, code spans, links — with browser-like boundary whitespace collapse. **Intentionally scoped:** raw inline text only, `white-space: normal` only, no nested markup trees, no general CSS inline formatting engine. For block-level layout, stay with the core module.

Items are an array of `{ text, font, letterSpacing?, break?, extraWidth? }`. Each item carries its own font; `break: 'never'` keeps an item atomic (the chip won't split across lines); `extraWidth` is caller-owned chrome (chip padding/border) that the layout reserves for you.

### Side-by-side parameter order vs core

This is a real footgun (see SKILL.md gotcha #10):

```ts
// Core path:
layoutNextLine(prepared, start, maxWidth)
// signature:  (prepared, start: LayoutCursor, maxWidth: number) → LayoutLine | null

// Rich-inline path:
layoutNextRichInlineLineRange(prepared, maxWidth, start?)
// signature:  (prepared, maxWidth: number, start?: RichInlineCursor) → RichInlineLineRange | null
```

`start` and `maxWidth` are **in different positions**. `start` is also **optional** in the rich-inline path (first call can omit it; subsequent calls pass the previous line's `end`).

### Functions

```typescript
prepareRichInline(items: RichInlineItem[]): PreparedRichInline
```

One-time compile: normalizes cross-item collapsed whitespace, measures each item's natural width, returns an opaque handle. Like `prepare()`, this re-runs segment work over the full input on every call — don't re-call it per token in streaming.

```typescript
layoutNextRichInlineLineRange(
  prepared: PreparedRichInline,
  maxWidth: number,
  start?: RichInlineCursor
): RichInlineLineRange | null
```

Stream one line at a time at variable widths without building fragment text strings. Returns `null` when exhausted. First call: omit `start`; subsequent calls: pass the previous range's `end`.

```typescript
materializeRichInlineLineRange(
  prepared: PreparedRichInline,
  line: RichInlineLineRange
): RichInlineLine
```

Turns a non-materialized range into a full line with fragment text. Pair with `layoutNextRichInlineLineRange` for paint-on-demand renderers.

```typescript
walkRichInlineLineRanges(
  prepared: PreparedRichInline,
  maxWidth: number,
  onLine: (line: RichInlineLineRange) => void
): number
```

Non-materializing line walker — calls the callback once per line with width + cursors, no fragment text. Use for shrink-wrap, stats, or visibility tests.

```typescript
measureRichInlineStats(
  prepared: PreparedRichInline,
  maxWidth: number
): RichInlineStats
```

Single-call `{ lineCount, maxLineWidth }` — same shape as `measureLineStats`, no allocations.

### Worked example: chat bubble with @mention chip and code span

```ts
import {
  prepareRichInline,
  walkRichInlineLineRanges,
  materializeRichInlineLineRange,
} from '@chenglou/pretext/rich-inline';

const items = [
  { text: 'Ship ',                font: '500 17px Inter' },
  { text: '@maya',                font: '700 12px Inter', break: 'never', extraWidth: 22 }, // pill chrome
  { text: "'s rich-note via ",    font: '500 17px Inter' },
  { text: 'git push',             font: '500 15px "JetBrains Mono"', break: 'never' },      // code span
  { text: ' before standup.',     font: '500 17px Inter' },
];

const prepared = prepareRichInline(items);

walkRichInlineLineRanges(prepared, 320, (range) => {
  const line = materializeRichInlineLineRange(prepared, range);
  for (const fragment of line.fragments) {
    const item = items[fragment.itemIndex];
    // render fragment.text at x = (running x + fragment.gapBefore), using item.font + item chrome
  }
});
```

### Rich-inline types

```typescript
type RichInlineItem = {
  text: string,                       // raw author text, including leading/trailing collapsible spaces
  font: string,                       // canvas font shorthand
  letterSpacing?: number,             // CSS pixel value; not em/percent
  break?: 'normal' | 'never',         // 'never' = atomic item (chip, code span)
  extraWidth?: number                 // caller-owned chrome (padding + border) in px
};

type RichInlineCursor = {
  itemIndex: number,                  // which RichInlineItem we're in
  segmentIndex: number,               // segment within that item
  graphemeIndex: number                // grapheme within that segment
};

type RichInlineFragment = {
  itemIndex: number,
  text: string,
  gapBefore: number,                  // collapsed boundary gap paid before this fragment
  occupiedWidth: number,              // text width + extraWidth
  start: LayoutCursor,                // within the item's prepared text
  end: LayoutCursor
};

type RichInlineFragmentRange = {       // same as RichInlineFragment without .text
  itemIndex: number,
  gapBefore: number,
  occupiedWidth: number,
  start: LayoutCursor,
  end: LayoutCursor
};

type RichInlineLine = {
  fragments: RichInlineFragment[],
  width: number,                      // line width incl. gapBefore + extraWidth
  end: RichInlineCursor
};

type RichInlineLineRange = {
  fragments: RichInlineFragmentRange[],
  width: number,
  end: RichInlineCursor
};

type RichInlineStats = {
  lineCount: number,
  maxLineWidth: number
};
```

---

## Language Support

Pretext handles these script families correctly via `Intl.Segmenter`:

- **Latin, Greek, Cyrillic** — word-level breaking at spaces
- **CJK (Chinese, Japanese, Korean)** — character-level breaking; `wordBreak: 'keep-all'` matches CSS `word-break: keep-all`
- **Thai** — segmented at word boundaries despite no spaces
- **Arabic, Hebrew** — RTL line breaking. Pretext ships its own bidi module (`dist/bidi.js`) with generated Unicode bidi data. Segment widths are browser-canvas widths used for line breaking — **not exact glyph x-coordinates for custom Arabic or mixed-direction reconstruction.** The richer handle exposes `segLevels` internally for custom RTL renderers, but no supported public API reads it
- **Hindi, other Indic scripts** — proper grapheme clustering
- **Emoji** — width correction for cross-platform consistency (though some platform-specific quirks remain)
- **Soft hyphens** — respected as break opportunities; chosen breaks render a trailing `-` in materialized line text
- **Punctuation merging** — `word.`, `$100`, `5%`, `°C`, opening punctuation like `¡` `¿` German low quotes — all stay attached to their adjacent word the way browsers do

---

## Caveats & Quirks

Things to know that aren't bugs but will surprise you. These are lifted verbatim from the upstream README and cross-referenced to SKILL.md gotchas where applicable.

- **Empty string returns `{ lineCount: 0, height: 0 }`** — browsers size empty blocks to one `line-height` of space. Clamp with `Math.max(1, lineCount) * lineHeight` for parity. See SKILL.md gotcha #8.
- **Tabs default to `tab-size: 8`** — Pretext doesn't read any other CSS tab-size value. If your CSS overrides this, measurements diverge.
- **`overflow-wrap: break-word` is built in** — very narrow widths break inside words, but only at grapheme boundaries (no mid-grapheme breaks).
- **Soft hyphens are manual** — Pretext does NOT auto-hyphenate. Insert U+00AD into your text before `prepare()`; Pretext treats them as optional break points. If a soft hyphen wins the break, materialized line text includes a visible trailing `-`. For mixed-language or user-generated text, prefer conservative locale-aware insertion over aggressive pattern hyphenation.
- **`font-feature-settings`, `font-optical-sizing`, and standalone `font-variation-settings` are not modeled** — they don't appear in the canvas `font` shorthand, so Pretext can't see them. If your CSS uses ligatures or stylistic alternates, measurements may drift slightly.
- **Variable-font axes only honored if reflected in the canvas `font` shorthand** — weight axis works (you put it in the shorthand: `'500 16px Inter'`). Custom axes like `wght` declared via `font-variation-settings` are invisible to Pretext.
- **`system-ui` is unsafe on macOS** — Canvas resolves it to a different optical variant than DOM rendering. Use a named font for guaranteed accuracy. See SKILL.md gotcha #5.
- **Hard-break paths (`measureNaturalWidth`)** — returns the widest forced line; for soft-wrap shrink-wrap of text without hard breaks, use `measureLineStats` or `walkLineRanges`. See SKILL.md "Common API selection mistakes."
- **`prepare()` cost is O(input length)** — re-running `prepare()` on a growing token stream every frame is O(N²) across the stream. For streaming chat, debounce on sentence/punctuation boundaries or switch to DOM measurement above a length threshold. See patterns.md "Streaming AI Chat." For iterative width searches (auto-fit, shrink-wrap balanced, Knuth-Plass), hoist `prepare()` outside the loop — see patterns.md "Iterative Width Search."
- **Post-measurement string ops invalidate measurements** — CSS `text-transform: uppercase` and JS `.toUpperCase()` / smart-quote / ligature substitutions all change rendered widths (uppercase letters can be 10–15% wider). Apply the transform BEFORE `prepare()`. See SKILL.md gotcha #11.
- **CSS-driven wrap on a pretext-measured box silently drifts** — if pretext measures break points and CSS (`<foreignObject>`, `max-width` container) does the actual wrapping, the line counts can disagree at corners. Either render per pretext break points (per-line `<tspan>` / `<div>`) or use CSS for both measurement and rendering. See SKILL.md gotcha #12 and patterns.md "Rendering Per-Line in SVG."
