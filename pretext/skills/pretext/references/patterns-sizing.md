# Sizing Patterns: Heights, Widths, Line Counts

Recipes that size things before the browser paints them: a block's height, a bubble's width, a font size that fits, the lines left after a clamp. Each one assumes the font has loaded and that the text is painted the way [accuracy.md](accuracy.md#painting) describes. For lines you place yourself, such as text around an image, see [patterns-flow.md](patterns-flow.md). For frameworks, loading and Node, see [patterns-integration.md](patterns-integration.md).

## Table of Contents

1. [Wrapper module](#wrapper-module)
2. [Auto-fit font size](#auto-fit-font-size)
3. [Height estimation for cards](#height-estimation-for-cards)
4. [Shrink-wrap bubbles](#shrink-wrap-bubbles)
5. [Iterative width search](#iterative-width-search)
6. [Truncating with an ellipsis](#truncating-with-an-ellipsis)
7. [Virtualized lists](#virtualized-lists)
8. [Live-edited text](#live-edited-text)
9. [Streaming AI chat](#streaming-ai-chat)

---

## Wrapper module

Create this first. It converts the CSS line-height multiplier you think in to the px Pretext expects (SKILL.md gotcha #1), and returns `null` when measuring fails so the caller can fall back.

```ts run id=measureText
function measureText(text: string, fontFamily: string, fontSize: number, maxWidth: number, lineHeight = 1.5) {
  try {
    const { height, lineCount } = layout(prepare(text, `${fontSize}px ${fontFamily}`), maxWidth, fontSize * lineHeight)
    return { height, lines: lineCount }
  } catch (e) {
    console.error(e)
    return null
  }
}
```

- **Log every error.** A `RangeError` is a font string Canvas ignores, such as an empty family. A plain `Error` is a missing Canvas, as in Node or a server render. Neither should vanish into the fallback.
- **Don't rethrow.** Which font strings throw differs by engine ([accuracy.md](accuracy.md#fonts)), so a rethrow would crash some browsers and not others.
- The wrapper prepares on every call. When the same text is measured again at other widths, keep the handle and call only `layout()`.

### Extended wrapper

For `pre-wrap` text, `keep-all` CJK, or letter spacing given in em, forward the `prepare()` options. Same contract.

```ts run id=measureTextExtended
type MeasureOptions = {
  text: string
  fontFamily: string // e.g. 'Inter, sans-serif'
  fontSize: number // px
  maxWidth: number // px
  lineHeight?: number // CSS multiplier, default 1.5
  whiteSpace?: PrepareOptions['whiteSpace']
  wordBreak?: PrepareOptions['wordBreak']
  letterSpacingEm?: number // em, converted to px
}

function measureTextExtended({ text, fontFamily, fontSize, maxWidth, lineHeight = 1.5, whiteSpace, wordBreak, letterSpacingEm }: MeasureOptions) {
  try {
    const letterSpacing = letterSpacingEm === undefined ? undefined : fontSize * letterSpacingEm
    const prepared = prepare(text, `${fontSize}px ${fontFamily}`, { whiteSpace, wordBreak, letterSpacing })
    const { height, lineCount } = layout(prepared, maxWidth, fontSize * lineHeight)
    return { height, lines: lineCount }
  } catch (e) {
    console.error(e)
    return null
  }
}
```

`letterSpacingEm` lets callers think in em as they do in stylesheets. Pretext takes `letterSpacing` in px (SKILL.md gotcha #9).

---

## Auto-fit font size

The largest whole-px font size that keeps text within N lines. CSS has no equivalent.

```ts run id=autoFitFontSize needs=measureText
function autoFitFontSize(
  text: string, fontFamily: string, maxWidth: number,
  lineHeight = 1.5, targetMaxLines = 3, minFont = 14, maxFont = 34,
): number | null {
  let lo = minFont, hi = maxFont // lo always fits, or is minFont; every size above hi is too big
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2)
    const result = measureText(text, fontFamily, mid, maxWidth, lineHeight)
    if (result === null) return null
    if (result.lines <= targetMaxLines) lo = mid
    else hi = mid - 1
  }
  return lo
}
```

- It returns `minFont` when even that takes more lines, and `null` when measuring fails.
- **Each size is a new cache key.** The font string is part of what `prepare()` caches, so every size tried is measured from scratch, about log2(maxFont − minFont) + 1 times per call. Whole px keeps that count small, and whole-pixel sizes are safer anyway ([accuracy.md](accuracy.md#fonts)).
- Tuning: `maxFont: 34` suits serif body text in a container about 500px wide; above 40px most content looks oversized; below 14px defeats the purpose; `targetMaxLines: 3` suits headlines. Short text may hit `maxFont` on one line, which is fine.

Use it for hero headlines, card titles, quotes: anywhere the text length varies but the block should look the same size.

### Cycling text with auto-fit

Rotate through strings, fitting each to the same box. On `null`, keep the current size rather than writing `"nullpx"`.

```ts needs=autoFitFontSize
const CYCLE_INTERVAL = 4000
const FADE_DURATION = 500

setInterval(() => {
  const nextText = pickNext()
  const size = autoFitFontSize(nextText, fontFamily, width, 1.5, 3)

  el.style.opacity = '0' // slide up and fade out
  el.style.transform = 'translateY(-30px)'

  setTimeout(() => {
    el.textContent = nextText
    if (size !== null) el.style.fontSize = `${size}px`
    el.style.transition = 'none' // jump below, without a transition
    el.style.transform = 'translateY(30px)'
    requestAnimationFrame(() => {
      requestAnimationFrame(() => { // the double rAF forces a paint between the two states
        el.style.transition = 'opacity 500ms, transform 500ms'
        el.style.opacity = '1'
        el.style.transform = 'translateY(0)'
      })
    })
  }, FADE_DURATION)
}, CYCLE_INTERVAL)
```

The double `requestAnimationFrame` is essential: without it the browser batches the reset, the new position and the restored transition into one frame, and nothing animates.

---

## Height estimation for cards

Measure the text with Pretext and add the fixed parts yourself.

```ts needs=measureText
function estimateCardHeight(card: { text: string; hasFooter: boolean }, cardWidth: number) {
  const BORDER = 1 + 1 // each side: the part most often forgotten (SKILL.md gotcha #7)
  const PADDING_X = 18 + 18
  const PADDING_Y = 16 + 16
  const GAP = 8
  const HEADER = 24 // one line, fixed
  const FOOTER = 28

  const body = measureText(card.text, 'Georgia, serif', 14, cardWidth - BORDER - PADDING_X, 1.5)
  if (body === null) return null
  return BORDER + PADDING_Y + HEADER + GAP + body.height + (card.hasFooter ? GAP + FOOTER : 0)
}
```

- The text's height is what the browser paints, provided the card paints it as [accuracy.md](accuracy.md#painting) describes. The total is only as good as the fixed parts: a header or row of tags that can wrap is not fixed, so measure it too.
- **Pass the width the text will have.** A width of 0, as of a container not laid out yet, lays out like 1px: about a character per line. Measure after layout, or pass the width you are about to set.
- For a long list sized this way, see [Virtualized lists](#virtualized-lists).
- When you need the line count or widest line rather than a height, `measureLineStats(prepared, maxWidth)` returns `{ lineCount, maxLineWidth }` in one call, with no line strings.

---

## Shrink-wrap bubbles

A multiline bubble as wide as its widest line, not as wide as its container.

```ts run id=bubbleWidth
function bubbleWidth(text: string, font: string, maxWidth: number, padding: number): number {
  const { maxLineWidth } = measureLineStats(prepare(text, font), maxWidth)
  return Math.min(Math.ceil(maxLineWidth), maxWidth) + 2 * padding
}
```

- **Why not CSS:** `width: fit-content` under a `max-width` gives text that wraps the whole `max-width`, whatever its widest line. Upstream's [`bubbles.model.ts`](https://github.com/chenglou/pretext/blob/v1.0.0/pages/demos/bubbles.model.ts) compares the two.
- Set the result as the bubble's width with `box-sizing: border-box` and the same horizontal `padding`, and paint the text with `overflow-wrap: break-word`. The content width is rounded up to a whole px and capped at `maxWidth`, so the text wraps to the same lines as at `maxWidth`.
- For bubbles with mentions, chips or code spans, see [rich-inline.md](rich-inline.md#shrink-wrap-without-painting).

---

## Iterative width search

Searching for a width, a font size or a line count has one shape: **prepare once, lay out many times.** `searchOptimalWidth` takes the handle, so `prepare()` is visibly outside the loop.

```ts run id=searchOptimalWidth
type WidthSearch = { minWidth: number; maxWidth: number; accept: (result: LayoutResult) => boolean }

function searchOptimalWidth(prepared: PreparedText, lineHeight: number, { minWidth, maxWidth, accept }: WidthSearch) {
  const widest = layout(prepared, maxWidth, lineHeight)
  if (!accept(widest)) return { width: maxWidth, result: widest } // nothing in the range is accepted
  let lo = minWidth, hi = maxWidth // whole px; hi is always accepted
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2)
    if (accept(layout(prepared, mid, lineHeight))) hi = mid
    else lo = mid + 1
  }
  return { width: lo, result: layout(prepared, lo, lineHeight) }
}
```

It returns the narrowest whole width in `minWidth..maxWidth` that `accept` takes, with its layout. If `accept` rejects even `maxWidth`, it returns `maxWidth` and that layout, so check `accept(result)` when that matters.

```ts needs=searchOptimalWidth
const prepared = prepare(text, '16px Inter') // once, outside the search
const { width: narrowest } = searchOptimalWidth(prepared, 20, { minWidth: 120, maxWidth: 480, accept: (r) => r.lineCount <= 3 })
```

**The cost is iterations × `prepare()`.** `layout()` is arithmetic over the widths `prepare()` cached. A search from 120 to 480 px takes about 9 iterations, so preparing inside the loop measures the whole text with Canvas 9 times instead of once:

```ts
function slowSearch(text: string, font: string, lineHeight: number, accept: (r: LayoutResult) => boolean) {
  let lo = 120, hi = 480
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2)
    const prepared = prepare(text, font) // wrong: measures the text again on every iteration
    if (accept(layout(prepared, mid, lineHeight))) hi = mid
    else lo = mid + 1
  }
  return lo
}
```

The same shape covers balanced text ([patterns-flow.md](patterns-flow.md#balanced-layout)) and any "try a width, score it" loop. [Auto-fit](#auto-fit-font-size) is the exception: each font size is new text to measure, so it prepares once per size, never once per width. Use `measureLineStats()` instead of `layoutWithLines()` inside a loop that only needs counts, and build lines once the search is done.

---

## Truncating with an ellipsis

**When CSS is enough:** if the browser paints the text, `-webkit-line-clamp` (with `display: -webkit-box; -webkit-box-orient: vertical; overflow: hidden`) draws the ellipsis, and `layout()` gives what a list needs before paint: the height is `Math.min(lineCount, maxLines) * lineHeight`, and the text is truncated when `lineCount > maxLines`. Use the recipe below when you need the clamped strings themselves: for Canvas or SVG, or to put a "more" link after the ellipsis.

`clampLines` returns the first `maxLines` lines at `width`. When text is left over, the last line leaves `tailWidth` free for the ellipsis, the way browsers end a clamped box: the line breaks where it would without the clamp if the tail fits after it, and is otherwise cut after the last grapheme that leaves the tail room.

```ts run id=clampLines,fillLine,trimEndSpace
const FIT_TOLERANCE = 1 / 64

function trimEndSpace(s: string): string {
  return s.endsWith(' ') ? s.slice(0, -1) : s
}

// The start of the line at `start` that fits in `room`, cut between any two graphemes.
function fillLine(prepared: PreparedTextWithSegments, font: string, start: LayoutCursor | undefined, room: number): string {
  const spaceWidth = measureNaturalWidth(prepare('\u00A0', font)) // a lone space would measure 0
  let text = ''
  let cursor = start
  let x = 0
  for (;;) {
    const piece = layoutNextLine(prepared, room - x, cursor)
    if (piece === null || piece.width > room - x + FIT_TOLERANCE) return text
    if (piece.text.endsWith('-') && piece.end.graphemeIndex === 0 && prepared.kinds[piece.end.segmentIndex - 1] === 'soft-hyphen') {
      const kept = piece.text.slice(0, -1) // a soft hyphen mid-line is invisible: drop its '-' and its width
      x += measureNaturalWidth(prepare(kept, font))
      text += kept
      cursor = piece.end
      continue
    }
    x += piece.width
    if (piece.text.endsWith(' ')) {
      if (x + spaceWidth > room) return text + piece.text.slice(0, -1)
      x += spaceWidth
    }
    text += piece.text
    cursor = piece.end
  }
}

function clampLines(prepared: PreparedTextWithSegments, font: string, width: number, maxLines: number, tailWidth: number): string[] {
  const lines: string[] = []
  let cursor: LayoutCursor | undefined
  let lastStart: LayoutCursor | undefined
  let lastWidth = 0
  for (let i = 0; i < maxLines; i++) {
    const line = layoutNextLine(prepared, width, cursor)
    if (line === null) return lines
    lines.push(line.text)
    lastStart = cursor
    lastWidth = line.width
    cursor = line.end
  }
  if (layoutNextLineRange(prepared, width, cursor) === null) return lines // nothing left over
  const last = lines.length - 1
  lines[last] = lastWidth + tailWidth <= width ? trimEndSpace(lines[last]) : trimEndSpace(fillLine(prepared, font, lastStart, width - tailWidth))
  return lines
}
```

```ts needs=clampLines
const font = '16px Inter'
const prepared = prepareWithSegments(text, font)
const tail = measureNaturalWidth(prepare('…', font))
const lines = clampLines(prepared, font, 300, 3, tail)
if (layout(prepared, 300, 20).lineCount > 3) lines[lines.length - 1] += '…'
```

- Ported from upstream's [`ellipsis.model.ts`](https://github.com/chenglou/pretext/blob/v1.0.0/pages/demos/ellipsis.model.ts) (lines 128-178), with two changes: (1) `fillLine`'s result goes through `trimEndSpace`, since it can end in a space; (2) a piece that ends at a soft hyphen is added without its `-`, and `x` advances by the re-measured text instead of `piece.width`, which counts the hyphen glyph (U+2010 where the font has one, and always in Firefox, per upstream). Upstream would leave a `-` mid-line; its samples have no soft hyphens.
- **Prepare the handle with `prepareWithSegments(text, font)` and default options** (no `letterSpacing`, `whiteSpace: 'normal'`), and pass the same `font`. `fillLine` measures the space and the re-measured pieces with no options.
- Near a soft hyphen, the cut can fall up to a syllable earlier than the browser's.
- Measure the tail in the paragraph's font: browsers draw a clamp's ellipsis in the paragraph's first font, per upstream.
- Paint each line in its own row with `white-space: pre`.
- The lines are raw `line.text`, so they don't go through [`paintableText`](patterns-flow.md#painting-a-lines-text): a non-last line that breaks at a soft hyphen paints `-`, where its width counted the hyphen glyph, U+2010 where the font has one. To route them through it, keep each line's `end` beside its text.

---

## Virtualized lists

A long list mounts only the rows on screen, so it needs every row's height before paint. Pretext gives the heights the browser paints, when the rows are painted as [accuracy.md](accuracy.md#painting) describes, so no estimate has to be corrected later. Upstream's [Markdown chat patterns](https://github.com/chenglou/pretext/blob/v1.0.0/pages/demos/markdown-chat.md) cover this in depth; the essentials:

- **One source for font values.** Keep every font string, line height and padding in your model. Prepare with them, and write them to the CSS (inline or through custom properties) rather than restating them in a stylesheet, where they drift.
- **Prepare each block once**, when it arrives, and keep the handle. On a width change, lay out again; never prepare again.
- **Heights from line counts.** `layout()` gives each row's text height. Add the row's fixed parts ([Height estimation for cards](#height-estimation-for-cards)) and keep the tops as running sums.
- **Materialize only visible rows.** Find the first visible row by binary search over the tops, and build lines or DOM only for the rows on screen.
- **Anchor the scroll.** When widths change, the rows above the viewport change height. Keep the first visible row where it was.

```ts
type Row = { prepared: PreparedText; chrome: number } // chrome: the row's fixed px (padding, border, header)

function layoutRows(rows: Row[], textWidth: number, lineHeight: number): Float64Array {
  const tops = new Float64Array(rows.length + 1) // tops[rows.length] is the list's height
  for (let i = 0; i < rows.length; i++) tops[i + 1] = tops[i] + rows[i].chrome + layout(rows[i].prepared, textWidth, lineHeight).height
  return tops
}

function rowAt(tops: Float64Array, y: number): number { // the row that covers y
  let lo = 0, hi = tops.length - 2
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (tops[mid] <= y) lo = mid
    else hi = mid - 1
  }
  return lo
}

function relayout(scroller: HTMLElement, content: HTMLElement, rows: Row[], oldTops: Float64Array, textWidth: number, lineHeight: number) {
  const anchor = rowAt(oldTops, scroller.scrollTop)
  const offset = scroller.scrollTop - oldTops[anchor]
  const tops = layoutRows(rows, textWidth, lineHeight)
  content.style.height = `${tops[rows.length]}px` // first, or the browser clamps the scroll to the old height
  scroller.scrollTop = tops[anchor] + offset
  return tops
}
```

What it costs, from upstream's Markdown chat demo, which prepares every message at startup and keeps them all (Chrome 153, Apple M5 Max, upstream's measurements of 2026-09-15):

| Messages | First message on screen | JS heap | Worst frame, a resize |
|---|---|---|---|
| 10,000 | 0.65-0.74 s | 48 MB | 7.9-13.1 ms |
| 100,000 | 4.9-5.4 s | 402 MB | 54.9-55.2 ms |

Upstream adds that 100,000 messages crashed iOS Safari on an iPhone, and that "None of this was measured again after [#325](https://github.com/chenglou/pretext/pull/325) simplified painting and [#338](https://github.com/chenglou/pretext/pull/338), [#340](https://github.com/chenglou/pretext/pull/340) and [#344](https://github.com/chenglou/pretext/pull/344) sped up Pretext."

**What Pretext can't size**, so measure it after mount and anchor the scroll around it: images and embeds without known sizes, math, text in a font that hasn't loaded, and text styled with CSS Pretext doesn't model ([accuracy.md](accuracy.md#css-pretext-does-not-model)).

---

## Live-edited text

A `<textarea>` keeps spaces, tabs and newlines, so prepare its value with `pre-wrap`. For long text, prepare each paragraph apart, keeping its `\n`, and prepare again only the one an edit touches. This is upstream's README idiom:

```ts
const paragraphs = textareaValue.split(/(?<=\n)/).map((p) => prepare(p, '16px Inter', { whiteSpace: 'pre-wrap' }))
const lineCount = paragraphs.reduce((n, p) => n + layout(p, width, 20).lineCount, 0)
// A textarea shows one more line than this when its value is empty or ends with \n
const shownLines = lineCount + (textareaValue === '' || textareaValue.endsWith('\n') ? 1 : 0)
```

- **The extra line.** An empty textarea shows 1 line where `layout()` says 0, and one holding `'a\n'` shows 2 where `layout()` says 1. Add the line yourself.
- To prepare only what an edit touched, keep the handles in a `Map` keyed by paragraph text, as [Streaming AI chat](#streaming-ai-chat) does with blocks.
- Give the textarea the same font and `line-height`, and pass its content width: its `width` minus padding and border.

---

## Streaming AI chat

While a reply streams in, its text grows with every token. Preparing the whole reply again for each token measures text that hasn't changed. Split it into blocks at blank lines and prepare only the last block, which is the one that changes:

```ts run id=streamBlocks
function streamBlocks(cache: Map<string, PreparedText>, text: string, font: string, width: number, lineHeight: number): number {
  const blocks = text.split(/(?<=\n\n)/) // each block keeps its blank line
  let height = 0
  for (const block of blocks) {
    let prepared = cache.get(block)
    if (prepared === undefined) {
      prepared = prepare(block, font, { whiteSpace: 'pre-wrap' })
      cache.set(block, prepared)
    }
    height += layout(prepared, width, lineHeight).height
  }
  for (const key of cache.keys()) if (!blocks.includes(key)) cache.delete(key) // drop partial blocks
  return height
}
```

```ts run id=follow needs=streamBlocks
const FONT = '16px Inter'

async function follow(stream: AsyncIterable<string>, bubble: HTMLElement, setRowHeight: (px: number) => void) {
  const cache = new Map<string, PreparedText>() // one per reply: streamBlocks evicts every block not in its text
  let textSoFar = ''
  let frame = 0
  for await (const token of stream) {
    textSoFar += token
    bubble.textContent = textSoFar
    frame ||= requestAnimationFrame(() => { // at most once a frame, however many tokens arrive
      frame = 0
      setRowHeight(streamBlocks(cache, textSoFar, FONT, 400, 20))
    })
  }
}
```

- **Paint the reply as one element** with `white-space: pre-wrap`, `overflow-wrap: break-word`, the same font and `line-height`, and the content width you passed. In `pre-wrap` every newline is a hard break, so a block's lines never depend on another block's, and the heights add up to the element's.
- **Keep the blank line with its block**, as `split(/(?<=\n\n)/)` does. Splitting on `'\n\n'` drops the newlines, and the blank lines with them.
- **Prepare with `pre-wrap`.** In `normal`, newlines collapse to spaces and the heights no longer match the element.
- **One cache per reply.** `streamBlocks` drops every key that isn't a block of the text it was given, so two replies streaming into one shared cache evict each other's blocks on every frame and prepare them all again.
- **Reuse only blocks that are unchanged.** Markdown can change an earlier block as the reply grows: a closing `**` or a later `===` line changes what came before. The cache is keyed by block text, so a block whose text changed is prepared again. If you render Markdown, re-parse the whole reply on each update and key the cache by each block's text the same way.
- Upstream's Markdown chat demo lists streaming as not covered ([issue #313](https://github.com/chenglou/pretext/issues/313)).
- `prepareRichInline()` also prepares everything again on each call. It is for messages whose items are stable, such as mentions and code spans, not for text that grows token by token.
