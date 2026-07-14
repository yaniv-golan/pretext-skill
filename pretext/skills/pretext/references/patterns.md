# Pretext Integration & Creative Patterns

Proven patterns for using Pretext in real projects, from simple measurement to creative demos. Patterns reflect `@chenglou/pretext` v0.0.8 (API-identical to v0.0.7; v0.0.8 is a line-breaking-accuracy and tooling patch).

## Table of Contents

1. [Wrapper Module](#wrapper-module)
2. [Auto-Fit Font Size](#auto-fit-font-size)
3. [Height Estimation for Cards](#height-estimation-for-cards)
4. [Text Around Obstacles](#text-around-obstacles)
5. [Rich Inline Text](#rich-inline-text)
6. [Rendering Per-Line in SVG](#rendering-per-line-in-svg)
7. [Progressive Enhancement](#progressive-enhancement)
8. [Vendoring Without a Bundler](#vendoring-without-a-bundler)
9. [Animation Patterns](#animation-patterns)
10. [Streaming AI Chat](#streaming-ai-chat)
11. [Framework Integration Idiom](#framework-integration-idiom)
12. [Iterative Width Search](#iterative-width-search)
13. [Balanced Layout (Knuth-Plass)](#balanced-layout)
14. [Creative Demo Patterns](#creative-demo-patterns)

---

## Wrapper Module

Create this first. It prevents the lineHeight bug and enables graceful fallback.

```js
import { prepare, layout } from '@chenglou/pretext';

/**
 * Measure text dimensions. Returns null on failure for graceful fallback.
 * @param {string} text - The text to measure
 * @param {string} fontFamily - CSS font-family (without size), e.g. "Georgia, serif"
 * @param {number} fontSize - Font size in px
 * @param {number} maxWidth - Container width in px
 * @param {number} [lineHeight=1.5] - CSS line-height MULTIPLIER (not pixels!)
 * @returns {{ width: number, height: number, lines: number } | null}
 */
export function measureText(text, fontFamily, fontSize, maxWidth, lineHeight) {
  lineHeight = lineHeight || 1.5;
  const lineHeightPx = fontSize * lineHeight; // Convert to absolute px
  const cssFont = fontSize + 'px ' + fontFamily;
  try {
    const prepared = prepare(text, cssFont);
    const result = layout(prepared, maxWidth, lineHeightPx);
    return { width: maxWidth, height: result.height, lines: result.lineCount };
  } catch (e) {
    return null;
  }
}
```

The wrapper does two things: converts lineHeight from the CSS multiplier developers think in to the absolute pixels Pretext expects, and returns `null` on failure so callers can implement progressive enhancement.

### Extended wrapper (CJK / spaced-out type)

For text with CJK content or custom letter-spacing, extend the wrapper to forward `prepare()` options. Same null-on-failure contract.

```js
import { prepare, layout } from '@chenglou/pretext';

/**
 * @param {object} opts
 * @param {string} opts.text
 * @param {string} opts.fontFamily       - e.g. "Inter, sans-serif"
 * @param {number} opts.fontSize         - px
 * @param {number} opts.maxWidth         - px
 * @param {number} [opts.lineHeight=1.5] - CSS multiplier
 * @param {'normal'|'pre-wrap'} [opts.whiteSpace='normal']
 * @param {'normal'|'keep-all'} [opts.wordBreak='normal']
 * @param {number} [opts.letterSpacingEm]   - em multiplier (will be converted to px)
 */
export function measureTextExtended(opts) {
  const { text, fontFamily, fontSize, maxWidth } = opts;
  const lineHeight = opts.lineHeight ?? 1.5;
  const lineHeightPx = fontSize * lineHeight;
  const letterSpacingPx = opts.letterSpacingEm != null
    ? fontSize * opts.letterSpacingEm
    : undefined;
  const cssFont = fontSize + 'px ' + fontFamily;
  try {
    const prepared = prepare(text, cssFont, {
      whiteSpace: opts.whiteSpace,
      wordBreak: opts.wordBreak,
      letterSpacing: letterSpacingPx,
    });
    const result = layout(prepared, maxWidth, lineHeightPx);
    return { width: maxWidth, height: result.height, lines: result.lineCount };
  } catch (e) {
    return null;
  }
}
```

`letterSpacingEm` lets callers think in CSS em like they do in stylesheets; the wrapper converts to the pixel value Pretext expects (see SKILL.md gotcha #9).

---

## Auto-Fit Font Size

Binary search for the largest font size that keeps text within N lines. CSS has no equivalent — this is Pretext's killer feature.

```js
/**
 * Find the largest font size that keeps text within targetMaxLines.
 * @param {string} text
 * @param {string} fontFamily - e.g. "Georgia, serif"
 * @param {number} maxWidth - container width in px
 * @param {number} [lineHeight=1.5] - CSS multiplier
 * @param {number} [targetMaxLines=3]
 * @param {number} [minFont=14]
 * @param {number} [maxFont=34]
 * @returns {number | null} - best font size in px, or null on failure
 */
function autoFitFontSize(text, fontFamily, maxWidth, lineHeight, targetMaxLines, minFont, maxFont) {
  minFont = minFont || 14;
  maxFont = maxFont || 34;
  targetMaxLines = targetMaxLines || 3;
  lineHeight = lineHeight || 1.5;
  let lo = minFont, hi = maxFont, bestSize = minFont;

  for (let i = 0; i < 20; i++) {
    const mid = (lo + hi) / 2;
    const result = measureText(text, fontFamily, mid, maxWidth, lineHeight);
    if (!result) return null;

    if (result.lines <= targetMaxLines) {
      bestSize = mid;
      lo = mid;
    } else {
      hi = mid;
    }
  }
  return Math.round(bestSize * 10) / 10;
}
```

**Tuning tips:**
- `maxFont: 34` works well for serif body text in ~500px containers
- Above 40px looks comically large for most content
- Below 14px defeats the purpose
- `targetMaxLines: 3` is a good default for headlines
- Short text (<10 words) may hit maxFont and still be 1 line — that's fine
- 20 iterations gives sub-pixel precision; 10 is usually enough

**Use cases:** Hero headlines, card titles, quote displays, anywhere text length varies but visual block size should feel consistent.

---

## Height Estimation for Cards

Measure variable text with Pretext, sum fixed parts manually.

```js
function estimateCardHeight(cardData, containerWidth) {
  const PADDING_Y = 16 + 16;   // top + bottom padding
  const BORDER_Y = 1 + 1;      // top + bottom border (EASY TO FORGET)
  const GAP = 8;                // margin between internal elements
  const innerWidth = containerWidth - 36; // subtract horizontal padding

  // Variable part: measure with Pretext
  const textHeight = measureText(cardData.text, 'Georgia, serif', 14, innerWidth, 1.5);
  if (!textHeight) return null;

  // Fixed parts
  const headerHeight = 24;
  const footerHeight = cardData.hasFooter ? 28 : 0;

  return PADDING_Y + BORDER_Y + headerHeight + GAP + textHeight.height + GAP + footerHeight;
}
```

**Important caveats:**
- This is inherently approximate — wrapping content (tags, multi-line metadata) adds uncertainty
- Don't use for pixel-perfect virtualization of hundreds of items
- Works well for ~100 items where small errors don't compound visibly
- Always account for `border-width` — it's the most commonly forgotten component

**When you only need lineCount or widest line (not absolute height):** call `measureLineStats(prepared, maxWidth)` instead of `layout()` + manual line-height math. It returns `{ lineCount, maxLineWidth }` in one shot, no per-line allocations. Useful when you're sizing a container by line count rather than pixels.

---

## Text Around Obstacles

The creative powerhouse of Pretext. Use `layoutNextLine()` with a different `maxWidth` per line based on obstacle geometry.

### Basic Circle Obstacle

```js
import { prepareWithSegments, layoutNextLine } from '@chenglou/pretext';

function layoutAroundCircle(text, font, containerWidth, lineHeight, circle) {
  const prepared = prepareWithSegments(text, font);
  let cursor = { segmentIndex: 0, graphemeIndex: 0 };
  const lines = [];
  let y = 0;

  while (true) {
    // Calculate how much width the circle eats at this Y position
    const dy = y + lineHeight / 2 - circle.y; // distance from line center to circle center
    let availableWidth = containerWidth;

    if (Math.abs(dy) < circle.radius) {
      // Line intersects the circle — reduce available width
      const chordHalf = Math.sqrt(circle.radius * circle.radius - dy * dy);
      // Assuming circle is on the right side
      availableWidth = Math.max(50, circle.x - chordHalf);
    }

    const line = layoutNextLine(prepared, cursor, availableWidth);
    if (!line) break;

    lines.push({ text: line.text, width: line.width, y, maxWidth: availableWidth });
    cursor = line.end;
    y += lineHeight;
  }

  return lines;
}
```

### Animated Obstacle (60fps Reflow)

```js
function animate(timestamp) {
  // Move the obstacle
  circle.x = 300 + Math.sin(timestamp / 1000) * 100;
  circle.y = 200 + Math.cos(timestamp / 1000) * 80;

  // Re-layout text around new obstacle position
  // layout() is ~0.0002ms — safe to call every frame
  const lines = layoutAroundCircle(text, font, width, lineHeight, circle);
  renderLines(lines);

  requestAnimationFrame(animate);
}
requestAnimationFrame(animate);
```

### Multiple Obstacles

```js
function getAvailableWidth(y, lineHeight, obstacles, containerWidth) {
  let width = containerWidth;
  for (const obs of obstacles) {
    const dy = y + lineHeight / 2 - obs.y;
    if (Math.abs(dy) < obs.radius) {
      const chordHalf = Math.sqrt(obs.radius * obs.radius - dy * dy);
      // Adjust width based on obstacle position
      if (obs.side === 'right') {
        width = Math.min(width, obs.x - chordHalf);
      } else {
        // Left-side obstacle: shift start position
        // (would need to offset the text rendering, not just reduce width)
      }
    }
  }
  return Math.max(50, width);
}
```

### Obstacle Routing Without String Allocation

When your renderer doesn't need every line's text — e.g. virtualization, occlusion, hit-testing — use `layoutNextLineRange` instead of `layoutNextLine`. Materialize only the ranges you actually paint.

```js
import { prepareWithSegments, layoutNextLineRange, materializeLineRange } from '@chenglou/pretext';

const prepared = prepareWithSegments(longArticle, '16px Georgia');
let cursor = { segmentIndex: 0, graphemeIndex: 0 };
let y = 0;
const visibleRanges = [];

while (true) {
  const w = getAvailableWidth(y, lineHeight, obstacles, containerWidth);
  const range = layoutNextLineRange(prepared, cursor, w);
  if (!range) break;

  // Keep the range; defer string allocation until paint
  if (y >= viewportTop - lineHeight && y < viewportBottom) {
    visibleRanges.push({ range, y });
  }
  cursor = range.end;
  y += lineHeight;
}

// Paint pass: only the visible lines get materialized
for (const { range, y } of visibleRanges) {
  const line = materializeLineRange(prepared, range);
  ctx.fillText(line.text, 0, y);
}
```

For very long articles with most text scrolled offscreen, this is a meaningful win — you skip the per-line string construction for invisible lines.

---

## Rich Inline Text

Use `@chenglou/pretext/rich-inline` when items have mixed fonts AND some items must stay atomic — chat messages with `@mentions`, code spans, hashtag pills, anything with rounded chrome that shouldn't break mid-name.

```ts
import {
  prepareRichInline,
  walkRichInlineLineRanges,
  layoutNextRichInlineLineRange,
  materializeRichInlineLineRange,
} from '@chenglou/pretext/rich-inline';

const items = [
  { text: 'Heads-up ',                     font: '500 16px Inter' },
  { text: '@maya',                         font: '600 13px Inter', break: 'never', extraWidth: 18 },
  { text: ': the new ',                    font: '500 16px Inter' },
  { text: 'walkRichInlineLineRanges',      font: '500 14px "JetBrains Mono"', break: 'never' },
  { text: ' helper just landed.',          font: '500 16px Inter' },
];

const prepared = prepareRichInline(items);
let widest = 0;

walkRichInlineLineRanges(prepared, 320, (range) => {
  widest = Math.max(widest, range.width);
});

// Bubble shrink-wraps to the widest line, not to maxWidth
bubble.style.width = Math.ceil(widest) + paddingX * 2 + 'px';

// Paint pass — only now materialize fragments
let cursor;
while (true) {
  const range = (cursor === undefined)
    ? layoutNextRichInlineLineRange(prepared, 320)
    : layoutNextRichInlineLineRange(prepared, 320, cursor);
  if (!range) break;
  const line = materializeRichInlineLineRange(prepared, range);
  for (const frag of line.fragments) {
    const item = items[frag.itemIndex];
    renderFragmentAt(frag, item, x, y); // your renderer; uses item.font + chrome
    x += frag.gapBefore + frag.occupiedWidth;
  }
  cursor = range.end;
  y += lineHeight;
  x = 0;
}
```

**Watch out for the parameter-order swap** between `layoutNextLine` (core) and `layoutNextRichInlineLineRange` (rich) — see [api.md Rich Inline](api.md#rich-inline) for side-by-side signatures.

Canonical reference: `pages/demos/markdown-chat.ts` and `pages/demos/rich-note.ts` in the upstream package.

---

## Rendering Per-Line in SVG

`layoutWithLines` returns the actual wrapped line strings. To draw them in SVG with pixel-perfect match to what was measured — and to avoid the wrap-point mismatch documented in SKILL.md gotcha #12 — render each line as a `<tspan>` with explicit `x` and a `dy` shift.

```js
import { prepareWithSegments, layoutWithLines } from '@chenglou/pretext';

const fontSize = 14;
const lineHeightPx = fontSize * 1.2;
const fontStr = `700 ${fontSize}px Helvetica, Arial, sans-serif`;
const renderText = text.toUpperCase();           // measure what you render (gotcha #11)

const prepared = prepareWithSegments(renderText, fontStr);
const { lines, height } = layoutWithLines(prepared, maxWidth, lineHeightPx);

// In SVG: first baseline ~0.85 * fontSize below the rect's top edge for a
// reasonable cap-line approximation. For exact alignment, use
// dominant-baseline="text-before-edge" (top-aligned) instead.
const cx = textRectX + maxWidth / 2;
const firstBaselineY = textRectY + fontSize * 0.85;
const escape = (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]);
const tspans = lines
  .map((line, i) => {
    const safe = line.replace(/[<>&]/g, escape);
    const dy = i === 0 ? 0 : lineHeightPx;
    return `<tspan x="${cx}" dy="${dy}">${safe}</tspan>`;
  })
  .join('');

const svg = `
  <text x="${cx}" y="${firstBaselineY}" text-anchor="middle"
        font-family="Helvetica, Arial, sans-serif" font-size="${fontSize}" font-weight="700">
    ${tspans}
  </text>`;
```

**Three subtleties:**

1. **Reset `x` on every tspan.** Without it, tspans stack horizontally (continuing on the same baseline), not as new lines.
2. **`text-anchor="middle"` centers each tspan independently** around its `x`. Each rendered line will be centered.
3. **Baseline placement varies by font.** `fontSize * 0.85` gives a reasonable cap-line approximation for sans-serif at typical sizes. For exact pixel alignment, use `dominant-baseline="text-before-edge"` (top-aligned) or `dominant-baseline="middle"` and adjust `y` accordingly.

When you also need shrink-wrap (a container that hugs the longest rendered line, not maxWidth), pair this with `measureLineStats` from the [Shrink-Wrap Chat Bubbles](#shrink-wrap-chat-bubbles-no-string-allocation) pattern: one call returns `{ lineCount, maxLineWidth }`, then a second `layoutWithLines` materializes the lines for the `<tspan>` pass.

`<foreignObject>` with `max-width` is the alternative, but it falls into the trap of gotcha #12 — CSS may break differently than pretext did. Per-`<tspan>` rendering with pretext's break points is the pixel-perfect path.

---

## Progressive Enhancement

Always load Pretext as enhancement — the page should work without it.

```html
<!-- Base functionality (no Pretext needed) -->
<script src="app.js"></script>

<!-- Enhancement (Pretext-powered, fails silently) -->
<script type="module" src="enhance.js"></script>
```

The `type="module"` attribute is a natural feature gate:
- Browsers without ES module support ignore it
- If the import fails (network, missing file), the module doesn't execute
- The base script already rendered the page

In the enhancement module:
```js
import { prepare, layout } from '@chenglou/pretext';

try {
  // Pretext-powered enhancement (auto-fit, precise heights, etc.)
  enhanceWithPretext();
} catch (e) {
  // Page already works without enhancement
  console.warn('Pretext enhancement unavailable:', e.message);
}
```

---

## Vendoring Without a Bundler

**Modern bundlers handle Pretext natively** — proper ESM exports, `sideEffects: false`, subpath exports for `./rich-inline`. Vite, Webpack 5+, esbuild, Rollup, Next.js, Astro all import-and-bundle it correctly. Reach for the recipe below only if you can't run a bundler at all.

**ESM-only.** Pretext is `"type": "module"` with no CJS build. CommonJS-only consumers (older Jest configs, some Node tooling) either need an ESM transform layer, `--experimental-vm-modules`, or a workspace upgrade.

**Only two importable paths.** The `exports` map declares `.` and `./rich-inline` only — there is no `./*` glob. Deep imports like `@chenglou/pretext/dist/layout.js` are blocked by Node's exports-policing. Stick to the public subpaths.

### No-bundler recipe

```bash
npm pack @chenglou/pretext
tar -xzf chenglou-pretext-*.tgz
cd package

# Bundle the core entry into a single ESM file
npx esbuild dist/layout.js --bundle --format=esm --outfile=pretext.esm.min.js --minify

# Optionally also bundle the rich-inline subpath
npx esbuild dist/rich-inline.js --bundle --format=esm --outfile=pretext-rich-inline.esm.min.js --minify
```

Then commit `pretext.esm.min.js` (and optionally `pretext-rich-inline.esm.min.js`) to your repo:

```html
<script type="module">
import { prepare, layout } from '/static/vendor/pretext.esm.min.js';
</script>
```

Size depends on which entry points you bundle and whether your bundler tree-shakes unused exports. The core import is roughly tens of KB minified+gzipped; rich-inline is smaller. There is no single "library size" number that holds across import shapes — measure your own bundle.

---

## Animation Patterns

### Cycling Text with Auto-Fit

Rotate through different text strings, auto-fitting each to the same container:

```js
const CYCLE_INTERVAL = 4000;
const FADE_DURATION = 500;

setInterval(() => {
  const nextText = pickNext();
  const newSize = autoFitFontSize(nextText, fontFamily, width, 1.5, 3);

  // Slide up + fade out
  el.style.opacity = '0';
  el.style.transform = 'translateY(-30px)';

  setTimeout(() => {
    el.textContent = nextText;
    el.style.fontSize = newSize + 'px';

    // Reset position (no transition)
    el.style.transition = 'none';
    el.style.transform = 'translateY(30px)';

    // Double-rAF forces a paint between state changes
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        el.style.transition = 'opacity 500ms, transform 500ms';
        el.style.opacity = '1';
        el.style.transform = 'translateY(0)';
      });
    });
  }, FADE_DURATION);
}, CYCLE_INTERVAL);
```

**The double-rAF is essential.** Without it, the browser batches the transition reset + new position + restored transition into one frame, producing no visible animation.

### Animated Filter (CSS Collapse/Expand)

For filtering a list of items, render all items as normal DOM and use CSS transitions — not Pretext + virtualization:

```js
function applyFilter(query) {
  items.forEach((item, i) => {
    const wrapper = wrappers[i];
    if (matches(item, query)) {
      wrapper.classList.remove('hidden');
      wrapper.style.opacity = '';
      wrapper.style.marginBottom = '';
      wrapper.style.maxHeight = wrapper.scrollHeight + 'px';
    } else {
      wrapper.style.maxHeight = wrapper.scrollHeight + 'px';
      wrapper.offsetHeight; // force reflow
      wrapper.style.maxHeight = '0';
      wrapper.style.opacity = '0';
      wrapper.style.marginBottom = '0';
      wrapper.classList.add('hidden');
    }
  });
}
```

```css
.card-wrapper {
  overflow: hidden;
  opacity: 1;
  transition: max-height 0.3s ease-out, opacity 0.25s ease-out, margin-bottom 0.3s ease-out;
}
```

Use inline styles for collapse values — CSS class `max-height: 0` gets overridden by the inline `max-height` from the scrollHeight snapshot.

---

## Streaming AI Chat

Streaming chat is the case where `prepare()`'s per-call cost matters. Each `prepare()` re-segments the full text — it's O(N) per call, not O(new tokens). Re-preparing on every incoming token in a 4K-token reply costs O(N²) over the stream.

### What works

**Short bubbles (under ~500 chars): coalesce per frame.**

```js
import { prepare, layout } from '@chenglou/pretext';

let pending = null;
let textSoFar = '';
const FONT = '16px sans-serif';
const WIDTH = 400;
const LH = 24;

for await (const token of stream) {
  textSoFar += token;
  bubble.textContent = textSoFar;

  if (pending != null) continue;          // a frame is already scheduled
  pending = requestAnimationFrame(() => {
    pending = null;
    const prepared = prepare(textSoFar, FONT);
    bubble.style.height = layout(prepared, WIDTH, LH).height + 'px';
  });
}

// On stream completion, force one final measurement so the last batch of
// tokens is reflected even if rAF was throttled
if (pending != null) cancelAnimationFrame(pending);
const finalPrepared = prepare(textSoFar, FONT);
bubble.style.height = layout(finalPrepared, WIDTH, LH).height + 'px';
```

The `pending != null` guard collapses multiple tokens into a single `prepare()` per frame. The stream-end flush catches the case where the last few tokens arrived inside the throttled window.

**Long replies: debounce on sentence boundaries, not frames.**

Once `textSoFar` crosses ~1–2K chars, even 60Hz re-preparing burns CPU. Switch to debouncing on punctuation:

```js
const SENTENCE = /[.!?]\s|\n/;
let lastMeasured = '';

for await (const token of stream) {
  textSoFar += token;
  bubble.textContent = textSoFar;

  // Only re-measure when we cross a sentence boundary
  if (SENTENCE.test(token) || textSoFar.length - lastMeasured.length > 200) {
    const prepared = prepare(textSoFar, FONT);
    bubble.style.height = layout(prepared, WIDTH, LH).height + 'px';
    lastMeasured = textSoFar;
  }
}
```

**Very long replies (5K+ chars): switch to DOM measurement.** Once the bubble is already painted and growing within an existing line-height grid, `element.offsetHeight` is cheap and accurate. Use Pretext only for the initial sizing, then let CSS handle the rest. The cost crossover varies by device — measure your own.

### What does NOT work

- **rAF-coalesce as the universal answer.** It's right for short messages; wrong for long ones.
- **Switching to `prepareRichInline` "to avoid re-prepare cost".** Rich-inline also re-prepares on every call. The subpath is for messages whose item array is stable (mentions/chips/code spans), not for incremental token concatenation.

Canonical reference: `pages/demos/markdown-chat.ts` in the upstream package — a virtualized chat that combines rich-inline for completed messages with chunked re-measurement for in-flight ones.

---

## Framework Integration Idiom

`PreparedText` and `PreparedTextWithSegments` are opaque, branded handles that don't change unless the text/font/options change. Store them in the *non-reactive* slot — refs, not state — so framework re-renders don't churn them.

### React

```jsx
import { useEffect, useMemo, useRef, useState } from 'react';
import { prepare, layout } from '@chenglou/pretext';

function AutoSizedText({ text, font, lineHeightPx }) {
  const containerRef = useRef(null);
  const [width, setWidth] = useState(0);

  // Prepared handle: recomputes only when text/font change. useMemo is enough —
  // the handle is opaque and React will never read its internals.
  const prepared = useMemo(() => prepare(text, font), [text, font]);

  // Track container width via ResizeObserver. setState here is the only re-render trigger.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      setWidth(entry.contentBoxSize?.[0]?.inlineSize ?? entry.contentRect.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Derived: height is a pure function of (prepared, width, lineHeightPx).
  // layout() is ~0.0002ms — fine to recompute on every render.
  const height = width > 0 ? layout(prepared, width, lineHeightPx).height : 0;

  return <div ref={containerRef} style={{ height }}>{text}</div>;
}
```

Three things to notice: (1) the prepared handle goes through `useMemo`, not state — it's opaque so reactivity buys nothing. (2) Only the container width is in state, so the component re-renders only on resize. (3) Height is *derived* on each render via `layout()` — that's cheap enough (~0.0002ms) to avoid the staleness bug you get when measurement lives inside the `ResizeObserver` callback (text changes without a resize would leave height stale).

### Vue 3

```js
import { shallowRef, watchEffect } from 'vue';

const prepared = shallowRef(null);
watchEffect(() => {
  prepared.value = prepare(text.value, font.value);
});
```

`shallowRef` keeps Vue from trying to deep-track the opaque internals.

### Svelte 5

```js
let prepared = $state.raw(prepare(text, font));
$effect(() => {
  prepared = prepare(text, font);
});
```

`$state.raw` is the Svelte equivalent — no reactive proxying around an opaque handle.

The common idiom: prepare once per `(text, font, options)` triple, observe size with `ResizeObserver`, call `layout()` inside the observer callback. `layout()` is pure arithmetic (~0.0002ms), so there's no performance cost to recomputing on every resize tick.

---

## Iterative Width Search

Any algorithm that searches for an optimal `maxWidth` (or font size, or line count) shares the same shape: **prepare once, layout many times.** Re-preparing inside the loop turns an O(log W) search into O(N × log W) — usually a visible UI hang on long text.

```js
import { prepareWithSegments, layout } from '@chenglou/pretext';

function searchOptimalWidth(text, font, lineHeightPx, opts) {
  // PREPARE ONCE — outside the loop
  const prepared = prepareWithSegments(text, font);

  let lo = opts.minWidth, hi = opts.maxWidth;
  let best = layout(prepared, hi, lineHeightPx);
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    // layout() reuses the prepared handle — pure arithmetic
    const r = layout(prepared, mid, lineHeightPx);
    if (opts.accept(r)) {
      hi = mid;
      best = r;
    } else {
      lo = mid;
    }
  }
  return best;
}
```

**Anti-pattern** — calls `prepare()` inside the loop, multiplies cost by the iteration count:

```js
function badSearchOptimalWidth(text, font, lineHeightPx, opts) {
  let lo = opts.minWidth, hi = opts.maxWidth;
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    const prepared = prepareWithSegments(text, font);  // ← O(N) per iteration
    const r = layout(prepared, mid, lineHeightPx);
    // ...
  }
}
```

Real-world cost: a "shrink-wrap balanced" driver re-preparing on each of ~10 binary-search iterations across 5 balloons can hang for 60 seconds on long text. With prepare hoisted out, the same workload is sub-millisecond.

This applies to:
- Shrink-wrap balanced (find narrowest width that keeps an aspect ratio under target)
- [Auto-fit font size](#auto-fit-font-size) (binary-search font-size that keeps text within N lines — note: this one *must* re-prepare per font size, but only once per size, not per width)
- Multi-pass paragraph balancing ([Knuth-Plass](#balanced-layout) demerit iteration)
- Any "try width × scoring function" optimization

Use `measureLineStats` instead of `layoutWithLines` when you don't need the actual line strings inside the loop — skips the string-allocation step. Materialize lines only after the search converges.

---

## Balanced Layout

The upstream package ships `pages/demos/justification-comparison.ts` (added in v0.0.4), which renders the same paragraph three ways side-by-side: native CSS justification, greedy hyphenation, and a Knuth-Plass-style paragraph layout. Pretext supplies the line-walking primitives; the demo supplies the optimization pass.

**The trick:** Knuth-Plass needs per-line widths and break costs. Pretext's `walkLineRanges` or `layoutNextLineRange` give you exactly that — call them with candidate widths, score the resulting line-shape (raggedness, hyphen frequency, overflow), pick the best. Because `layout` and `walkLineRanges` are essentially free, you can speculatively try many widths in a binary search.

```js
// Sketch — full Knuth-Plass is involved; see the demo for production code
import { prepareWithSegments, measureLineStats } from '@chenglou/pretext';

function findBalancedWidth(prepared, targetLines, minWidth, maxWidth) {
  let lo = minWidth, hi = maxWidth, best = maxWidth;
  for (let i = 0; i < 20; i++) {
    const mid = (lo + hi) / 2;
    const { lineCount } = measureLineStats(prepared, mid);
    if (lineCount <= targetLines) { best = mid; hi = mid; }
    else { lo = mid; }
  }
  return best; // narrowest width that still fits in targetLines
}
```

For full Knuth-Plass with proper badness scoring, demerits, and forced line breaks, read `pages/demos/justification-comparison.model.ts` in the package — it's ~200 lines and well-commented.

---

## Creative Demo Patterns

These patterns come from the community showcase. All use the same core API — the creativity is in how you compute widths and render output.

### ASCII Art with Pretext

Use `layoutWithLines()` to get per-line text, then render each character at computed positions. The fluid smoke demos use a physics simulation to compute character densities, then lay out proportional-width ASCII characters.

```js
// Concept: render a grid of characters where each cell
// uses Pretext to measure the character's exact width
const chars = ' .:-=+*#%@';

function renderFrame(densityGrid) {
  for (let row = 0; row < rows; row++) {
    let x = 0;
    for (let col = 0; col < cols; col++) {
      const density = densityGrid[row][col];
      const char = chars[Math.floor(density * (chars.length - 1))];
      ctx.fillText(char, x, row * lineHeight);
      x += charWidths[char]; // Pre-measured with Pretext
    }
  }
}
```

### Magazine / Editorial Layout

The Editorial Engine demo combines obstacle-aware text routing with multi-column layout:

```js
// Simplified editorial layout concept
function layoutEditorial(articles, columns, obstacles) {
  let y = 0;

  for (const article of articles) {
    const prepared = prepareWithSegments(article.text, article.font);
    let cursor = { segmentIndex: 0, graphemeIndex: 0 };

    while (cursor) {
      for (let col = 0; col < columns; col++) {
        const colWidth = getColumnWidth(col, y, obstacles);
        const line = layoutNextLine(prepared, cursor, colWidth);
        if (!line) { cursor = null; break; }

        renderInColumn(line, col, y);
        cursor = line.end;
      }
      y += lineHeight;
    }
  }
}
```

### Shrink-Wrap Chat Bubbles (no string allocation)

Single call returns line count + widest line — no per-line callback, no string allocation.

```js
import { prepareWithSegments, measureLineStats } from '@chenglou/pretext';

function getBubbleWidth(text, font, maxWidth, padding) {
  const prepared = prepareWithSegments(text, font);
  const { maxLineWidth } = measureLineStats(prepared, maxWidth);
  return Math.ceil(maxLineWidth) + padding * 2;
}
```

This is the "CSS can't do this" idiom — multiline text where the bubble width hugs the longest line, not the container width. Canonical demo: `pages/demos/bubbles.ts`. For chat messages that contain mentions, chips, or code spans, see the [Rich Inline Text](#rich-inline-text) pattern above.

### 3D Text Wrapping

The splat-editor and torus demos project 3D geometry into 2D obstacle masks, then use `layoutNextLine()` with the projected widths:

```js
// Each frame:
// 1. Project 3D object into 2D silhouette
// 2. For each text line Y, compute available width from silhouette
// 3. Feed width to layoutNextLine() (or layoutNextLineRange() if you're not rendering every line)
// 4. Render text — the text appears to flow around the 3D shape
```
