# Flow Patterns: Lines You Place Yourself

Recipes where you place each line: text around obstacles, SVG and Canvas, balanced lines, creative layouts. When the browser can wrap the text for you, let it: one element per paragraph, painted as [accuracy.md](accuracy.md#painting) describes, is simpler and handles mixed-direction text. Sizing recipes (heights, bubbles, clamping) are in [patterns-sizing.md](patterns-sizing.md).

## Table of Contents

1. [Painting a line's text](#painting-a-lines-text)
2. [Text around obstacles](#text-around-obstacles)
3. [Rendering per line in SVG](#rendering-per-line-in-svg)
4. [Balanced layout](#balanced-layout)
5. [Animation patterns](#animation-patterns)
6. [Creative patterns](#creative-patterns)

---

## Painting a line's text

A line broken at a soft hyphen has `text` ending in `-`, while its `width` counts the hyphen the browser draws there: U+2010 where the font has that glyph, and `-` otherwise. The two can differ by a little (1.6px in upstream's Inter) or a lot (a full em in Songti SC), depending on the font. Every recipe that paints `line.text` goes through `paintableText`, which swaps that `-` for the glyph the width counts.

```ts run id=paintableText,fontDrawsU2010
const drawsU2010 = new Map<string, boolean>() // per font string; clear it when you call clearCache()

// Whether a soft-hyphen break in `font` draws U+2010: a port of upstream's per-family test
// (getHyphenText in dist/measurement.js). The first family that is loaded decides.
function fontDrawsU2010(font: string): boolean {
  const known = drawsU2010.get(font)
  if (known !== undefined) return known
  const context = document.createElement('canvas').getContext('2d')!
  const measure = (f: string, s: string) => { context.font = f; return context.measureText(s).width }
  let draws = false
  const size = /\dpx(?:\s*\/\s*\S+)?\s+/.exec(font)
  if (size && measure(font, '\u2010') !== measure(font, '-')) {
    const prefix = font.slice(0, size.index + size[0].length)
    const mono = prefix + 'monospace', serif = prefix + 'serif'
    // Only where the generic families differ can they tell a loaded family from a missing one
    if (measure(mono, ' ') !== measure(serif, ' ') && measure(mono, '\u2010') !== measure(serif, '\u2010')) {
      for (const family of font.slice(prefix.length).match(/(?:"[^"]*"|'[^']*'|[^,])+/g) ?? []) {
        const a = `${prefix}${family}, monospace`, b = `${prefix}${family}, serif`
        if (measure(a, ' ') !== measure(b, ' ')) continue // not loaded: the generic family answered
        draws = measure(a, '\u2010') === measure(b, '\u2010')
        break
      }
    }
  }
  drawsU2010.set(font, draws)
  return draws
}

function paintableText(prepared: PreparedTextWithSegments, line: { text: string; end: LayoutCursor }, font: string): string {
  const softHyphenBreak = line.text.endsWith('-') && line.end.graphemeIndex === 0 && prepared.kinds[line.end.segmentIndex - 1] === 'soft-hyphen'
  return softHyphenBreak && fontDrawsU2010(font) ? line.text.slice(0, -1) + '\u2010' : line.text
}
```

- `font` is the string you prepared with. Call `fontDrawsU2010` only after the font has loaded.
- A line that ends in a real hyphen, as in `well-known`, keeps it.
- **Firefox:** upstream says Firefox always measures U+2010 at a soft hyphen (`hyphenFromPrimaryFont: engine !== 'gecko'`, `dist/measurement.js` line 577). With a font that lacks U+2010, the `-` painted there can differ from the width Pretext measured.
- Lines painted one by one lose the browser's ordering of mixed-direction text: see [accuracy.md](accuracy.md#painting).

---

## Text around obstacles

Give each line its own `maxWidth` from the obstacle's geometry, and lay out one line at a time with `layoutNextLine(prepared, maxWidth, cursor)`.

### Around a circle

```ts run id=layoutAroundCircle,circleIntervalForBand
const MIN_SLOT = 32 // about 2 × the 16px font size

type Circle = { x: number; y: number; r: number }

// The part of the band top..bottom the circle covers, or null. Port of circleIntervalForBand in upstream's
// editorial-engine.ts (lines 142-157 at v1.0.0), without its padding.
function circleIntervalForBand(circle: Circle, top: number, bottom: number): { left: number; right: number } | null {
  if (top >= circle.y + circle.r || bottom <= circle.y - circle.r) return null
  const minDy = circle.y >= top && circle.y <= bottom ? 0 : circle.y < top ? top - circle.y : circle.y - bottom
  if (minDy >= circle.r) return null
  const maxDx = Math.sqrt(circle.r * circle.r - minDy * minDy)
  return { left: circle.x - maxDx, right: circle.x + maxDx }
}

// Text on the left of a circle that sits on the right
function layoutAroundCircle(prepared: PreparedTextWithSegments, containerWidth: number, lineHeight: number, circle: Circle) {
  const lines: { text: string; width: number; y: number; maxWidth: number; end: LayoutCursor }[] = []
  if (containerWidth < MIN_SLOT) return lines // no band could ever hold a line
  let cursor: LayoutCursor | undefined
  for (let y = 0; ; y += lineHeight) {
    const blocked = circleIntervalForBand(circle, y, y + lineHeight)
    const maxWidth = blocked ? Math.min(containerWidth, blocked.left) : containerWidth
    if (maxWidth < MIN_SLOT) continue // too narrow for a line: leave this band empty
    const line = layoutNextLine(prepared, maxWidth, cursor)
    if (line === null) return lines
    lines.push({ text: line.text, width: line.width, y, maxWidth, end: line.end })
    cursor = line.end
  }
}
```

- **The whole band.** The width comes from the closest point of the circle anywhere in the line's band, not from the line's centre. Sampling only the centre lets glyphs at a band's top or bottom run over the circle.
- **`MIN_SLOT` skips slivers.** A line always holds at least one grapheme, so a chord narrower than one would overflow. Bands narrower than `MIN_SLOT` stay empty and the text moves down a line. Scale it with your font size; upstream's editorial demo uses 50. If `containerWidth` itself is below `MIN_SLOT`, the recipe returns no lines at once, since otherwise every band is skipped and the loop never ends.
- **Each line keeps its `end`** so that painting can apply [paintableText](#painting-a-lines-text). `text` is the raw `line.text`.

### Animated obstacle

Prepare once, outside the frame loop. Each frame only lays out:

```ts needs=layoutAroundCircle,paintableText
const ARTICLE_FONT = '16px Inter'
const ball = { x: 300, y: 200, r: 80 }
const article = prepareWithSegments(longText, ARTICLE_FONT) // once

function frame(time: number) {
  ball.x = 300 + Math.sin(time / 1000) * 100
  ball.y = 200 + Math.cos(time / 1000) * 80
  ctx.clearRect(0, 0, 600, 800)
  ctx.font = ARTICLE_FONT
  ctx.textBaseline = 'top'
  for (const line of layoutAroundCircle(article, 600, 20, ball)) ctx.fillText(paintableText(article, line, ARTICLE_FONT), 0, line.y)
  requestAnimationFrame(frame)
}
requestAnimationFrame(frame)
```

### Multiple obstacles

Obstacles on the right only: each narrows the line from the right. Use the same band rule, `MIN_SLOT` skip and guard.

```ts id=layoutAroundCircles,slotWidth needs=layoutAroundCircle
function slotWidth(circles: Circle[], containerWidth: number, top: number, bottom: number): number {
  let width = containerWidth
  for (const circle of circles) {
    const blocked = circleIntervalForBand(circle, top, bottom)
    if (blocked) width = Math.min(width, blocked.left)
  }
  return width
}

function layoutAroundCircles(prepared: PreparedTextWithSegments, containerWidth: number, lineHeight: number, circles: Circle[]) {
  const lines: { text: string; width: number; y: number; maxWidth: number; end: LayoutCursor }[] = []
  if (containerWidth < MIN_SLOT) return lines
  let cursor: LayoutCursor | undefined
  for (let y = 0; ; y += lineHeight) {
    const maxWidth = slotWidth(circles, containerWidth, y, y + lineHeight)
    if (maxWidth < MIN_SLOT) continue
    const line = layoutNextLine(prepared, maxWidth, cursor)
    if (line === null) return lines
    lines.push({ text: line.text, width: line.width, y, maxWidth, end: line.end })
    cursor = line.end
  }
}
```

An obstacle on the left needs an x offset for each line as well as a narrower width, and text on both sides of an obstacle needs two slots per band: see [Text on both sides and in shapes](#text-on-both-sides-and-in-shapes).

### Range routing: build only the lines you paint

When most lines are off screen, walk with `layoutNextLineRange`, which builds no strings, and materialize only the visible ones. `materializeLineRange` needs a `prepareWithSegments()` handle; if you never materialize, `prepare()` is enough.

```ts needs=layoutAroundCircles
function visibleLines(prepared: PreparedTextWithSegments, circles: Circle[], containerWidth: number, lineHeight: number, viewTop: number, viewBottom: number) {
  const visible: { line: LayoutLine; y: number }[] = []
  if (containerWidth < MIN_SLOT) return visible
  let cursor: LayoutCursor | undefined
  for (let y = 0; y < viewBottom; y += lineHeight) { // nothing below the view is walked
    const maxWidth = slotWidth(circles, containerWidth, y, y + lineHeight)
    if (maxWidth < MIN_SLOT) continue
    const range = layoutNextLineRange(prepared, maxWidth, cursor)
    if (range === null) break
    if (y + lineHeight > viewTop) visible.push({ line: materializeLineRange(prepared, range), y })
    cursor = range.end
  }
  return visible // paint each line's text through paintableText
}
```

### Text on both sides and in shapes

For an obstacle anywhere in the column, many bodies at once such as a dragon's segments, or a silhouette from a video frame or webcam mask. Each band can hold several slots. One running cursor fills them from left to right, so the text still reads in order across the band.

```ts run id=layoutInBands,freeSlots,circleBlocker needs=layoutAroundCircle
type Interval = { left: number; right: number }
type BandLine = { text: string; x: number; y: number; width: number; maxWidth: number; end: LayoutCursor }

// What is left of 0..containerWidth once `blocked` is taken out, left to right, slivers dropped.
function freeSlots(blocked: Interval[], containerWidth: number, minSlot: number): Interval[] {
  const slots: Interval[] = []
  let left = 0
  for (const b of [...blocked].sort((p, q) => p.left - q.left)) {
    if (b.left > left) slots.push({ left, right: Math.min(b.left, containerWidth) })
    left = Math.max(left, b.right)
  }
  if (left < containerWidth) slots.push({ left, right: containerWidth })
  return slots.filter((slot) => slot.right - slot.left >= minSlot)
}

function circleBlocker(circles: Circle[]) {
  return (top: number, bottom: number): Interval[] =>
    circles.flatMap((circle) => circleIntervalForBand(circle, top, bottom) ?? [])
}

// With `loop`, the text starts again when it runs out, for decorative text that fills a shape.
function layoutInBands(
  prepared: PreparedTextWithSegments, containerWidth: number, containerHeight: number, lineHeight: number,
  blockedAt: (top: number, bottom: number) => Interval[], loop = false,
): BandLine[] {
  const lines: BandLine[] = []
  let cursor: LayoutCursor | undefined
  for (let y = 0; y + lineHeight <= containerHeight; y += lineHeight) {
    for (const slot of freeSlots(blockedAt(y, y + lineHeight), containerWidth, MIN_SLOT)) {
      const maxWidth = slot.right - slot.left
      let line = layoutNextLine(prepared, maxWidth, cursor)
      if (line === null && loop) line = layoutNextLine(prepared, maxWidth) // again from the start
      if (line === null) return lines // the text ended, or it is empty
      lines.push({ text: line.text, x: slot.left, y, width: line.width, maxWidth, end: line.end })
      cursor = line.end
    }
  }
  return lines
}
```

```ts needs=layoutInBands,paintableText
const FLOW_FONT = '16px Inter'
const flowed = prepareWithSegments(longText, FLOW_FONT) // once
const body = [{ x: 200, y: 120, r: 50 }, { x: 260, y: 170, r: 36 }, { x: 310, y: 210, r: 24 }]

function paintFlow() { // every frame, after moving `body`
  ctx.font = FLOW_FONT
  ctx.textBaseline = 'top'
  for (const line of layoutInBands(flowed, 600, 800, 20, circleBlocker(body))) ctx.fillText(paintableText(flowed, line, FLOW_FONT), line.x, line.y)
}
```

Any shape works if you can say which part of a band it covers. A mask gives that directly: one value per pixel, such as a frame's alpha or a thresholded webcam segmentation, non-zero where the shape is. A column is blocked when any mask row in the band covers it, the same whole-band rule as for a circle. Build the blocker from each new frame:

```ts run id=maskBlocker
function maskBlocker(mask: ArrayLike<number>, maskWidth: number, maskHeight: number, containerWidth: number, containerHeight: number) {
  const scaleX = containerWidth / maskWidth, scaleY = containerHeight / maskHeight
  return (top: number, bottom: number): { left: number; right: number }[] => {
    const covered = new Uint8Array(maskWidth)
    for (let row = 0; row < maskHeight; row++) {
      if (row * scaleY >= bottom || (row + 1) * scaleY <= top) continue
      for (let column = 0; column < maskWidth; column++) if (mask[row * maskWidth + column]) covered[column] = 1
    }
    const intervals: { left: number; right: number }[] = []
    for (let column = 0; column < maskWidth; column++) {
      if (!covered[column]) continue
      const start = column
      while (column + 1 < maskWidth && covered[column + 1]) column++
      intervals.push({ left: start * scaleX, right: (column + 1) * scaleX })
    }
    return intervals
  }
}
```

- To fill the shape instead of flowing around it, block its outside: pass a mask with the values inverted.
- For padding around each obstacle, widen its intervals; upstream's [editorial-engine.ts](https://github.com/chenglou/pretext/blob/v1.0.0/pages/demos/editorial-engine.ts) does this per obstacle.
- Mixed-direction text has the limits in [accuracy.md](accuracy.md#painting), as for any line painted on its own.

---

## Rendering per line in SVG

SVG `<text>` doesn't wrap. Lay the text out with `layoutWithLines()` and draw each line as a `<tspan>`:

```ts needs=paintableText
const ESCAPES: Record<string, string> = { '<': '&lt;', '>': '&gt;', '&': '&amp;' }

function svgParagraph(text: string, maxWidth: number, x: number, y: number): string {
  const fontSize = 14
  const lineHeight = 17
  const font = `700 ${fontSize}px Inter`
  const shown = text.toUpperCase() // measure what you paint (SKILL.md gotcha #11)
  const prepared = prepareWithSegments(shown, font)
  const { lines } = layoutWithLines(prepared, maxWidth, lineHeight)
  const cx = x + maxWidth / 2
  const tspans = lines.map((line, i) => {
    const safe = paintableText(prepared, line, font).replace(/[<>&]/g, (c) => ESCAPES[c])
    return `<tspan x="${cx}" dy="${i === 0 ? 0 : lineHeight}">${safe}</tspan>`
  }).join('')
  return `<text x="${cx}" y="${y}" dominant-baseline="text-before-edge" text-anchor="middle"
    font-family="Inter" font-size="${fontSize}" font-weight="700">${tspans}</text>`
}
```

- **Reset `x` on every `<tspan>`.** Without it, tspans continue on the same baseline instead of starting new lines.
- **`text-anchor="middle"`** centres each tspan on its own `x`.
- **Baseline.** `dominant-baseline="text-before-edge"` puts the first line's top at `y`. With the default alphabetic baseline, `y` is the first line's baseline instead, and the distance to the line's top depends on the font.
- A line is an object: paint `line.text` through `paintableText`, never the line itself.
- For a bubble that hugs the widest line, size it first with [bubbleWidth](patterns-sizing.md#shrink-wrap-bubbles), then lay out at that width.

**Plain text can use `<foreignObject>` instead.** An HTML element inside a `<foreignObject>`, painted as [accuracy.md](accuracy.md#painting) describes, wraps to the same lines as `layout()` at any `viewBox` scale we checked, so let the browser wrap it (see SKILL.md gotcha #12). Per-line `<tspan>`s are for when the SVG must stand alone, as in an exported file. For mixed-direction text, see [accuracy.md](accuracy.md#painting).

---

## Balanced layout

The narrowest width that keeps text within a line count. With `targetLines` set to the count at the full width, the lines come out about even, close in spirit to CSS `text-wrap: balance` (which Pretext doesn't model, so paint at the width this returns).

```ts run id=findBalancedWidth
function findBalancedWidth(prepared: PreparedText, targetLines: number, minWidth: number, maxWidth: number): number {
  let lo = minWidth, hi = maxWidth // whole px
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2)
    if (measureLineStats(prepared, mid).lineCount <= targetLines) hi = mid
    else lo = mid + 1
  }
  return lo // maxWidth when even maxWidth takes more lines
}
```

```ts needs=findBalancedWidth
const headline = prepare(text, '600 28px Inter')
const lines = measureLineStats(headline, 600).lineCount
const balancedWidth = findBalancedWidth(headline, lines, 1, 600)
```

For a full Knuth-Plass paragraph layout with badness, demerits and hyphenation, read upstream's [`justification-comparison.model.ts`](https://github.com/chenglou/pretext/blob/v1.0.0/pages/demos/justification-comparison.model.ts), which sets one paragraph three ways: CSS justification, greedy hyphenation and Knuth-Plass. Pretext supplies the line walking (`walkLineRanges`, `layoutNextLineRange`); the demo supplies the optimization.

---

## Animation patterns

- **Prepare outside the frame loop.** A frame calls only `layout()` or the line functions, which are arithmetic over cached widths. See [Animated obstacle](#animated-obstacle).
- **Text that changes on a timer** is new text each time: prepare it once per change, as in [Cycling text with auto-fit](patterns-sizing.md#cycling-text-with-auto-fit).
- A CSS transition on height or opacity needs no Pretext unless you need the target height before paint.

---

## Creative patterns

These use the same API; the creativity is in how widths are computed and lines painted.

ASCII art and letters that move on their own are in [patterns-glyphs.md](patterns-glyphs.md#proportional-ascii-art).

### Magazine columns

Fill a column, then hand its cursor to the next. A `done` flag ends the flow, since the cursor starts `undefined` and can't serve as the loop condition:

```ts needs=paintableText
function flowColumns(
  prepared: PreparedTextWithSegments, font: string, columnCount: number, columnHeight: number, lineHeight: number,
  widthAt: (column: number, y: number) => number, // your column width at this y, at least MIN_SLOT
  place: (text: string, column: number, y: number) => void,
): LayoutCursor | undefined {
  let cursor: LayoutCursor | undefined
  let done = false
  for (let column = 0; column < columnCount && !done; column++) {
    for (let y = 0; y + lineHeight <= columnHeight; y += lineHeight) {
      const line = layoutNextLine(prepared, widthAt(column, y), cursor)
      if (line === null) { done = true; break }
      place(paintableText(prepared, line, font), column, y)
      cursor = line.end
    }
  }
  return done ? undefined : cursor // where the text continues, if it didn't all fit
}
```

### Projected shapes

For text that wraps around a 3D object, or any shape you can rasterize:

1. Each frame, project the shape into a 2D silhouette.
2. Rasterize it into a mask and build a blocker with [`maskBlocker`](#text-on-both-sides-and-in-shapes).
3. Pass that to `layoutInBands`, which fills the free slots of each band and skips those narrower than `MIN_SLOT`.
4. Paint each line at its `x` and `y`, through `paintableText`.
