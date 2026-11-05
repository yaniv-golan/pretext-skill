# Rich Inline Text

`@chenglou/pretext/rich-inline` lays out one paragraph of text in several fonts, with chips, mentions, code spans and inline images. API reflects v1.0.0 (2026-10-14). The 12 functions of the main entry are in [api.md](api.md). Code written for an older Pretext: see [migration.md](migration.md).

## Table of Contents

1. [Scope](#scope)
2. [Functions](#functions)
3. [Types](#types)
4. [Items and boxes](#items-and-boxes)
5. [Painting fragments](#painting-fragments)
6. [Recipes](#recipes)

## Scope

- **One paragraph of items.** You pass a flat list of items: text runs, each in its own font, and boxes. Pretext lays them out as one paragraph, as a browser lays out a paragraph's spans. It finds where lines can break in the items' joined text, and measures each item in its own font. A line ends between items, or inside one, only where the joined text can break.
- **White space and word breaking** for the whole paragraph: `white-space: normal` (default) or `pre-wrap`, and `word-break: normal` (default) or `keep-all`.
- **Boxes**, `{ width }`, for an image, a custom emoji, a formula or a badge inside a line.
- **It is not a general CSS inline formatting engine.** There are no nested elements, no block children and no vertical metrics: heights are yours.

## Functions

```typescript
function prepareRichInline(items: Array<RichInlineItem | RichInlineBox>, options?: RichInlineOptions): PreparedRichInline
```

Prepares the items for layout and, in `normal` white space, collapses the spaces between them. `options` takes the paragraph's `whiteSpace` and `wordBreak`, as `prepare()` does, and they apply to every item. Throws a `RangeError` for an invalid item, a font Canvas ignores, or a `letterSpacing` that isn't finite. Prepare once per paragraph and lay out again on resize, as with `prepare()`.

To prepare several paragraphs, write `paragraphs.map(items => prepareRichInline(items))`, not `paragraphs.map(prepareRichInline)`: `map()` passes its index where the options go, and the second form doesn't type-check.

```typescript
function layoutNextRichInlineLineRange(prepared: PreparedRichInline, maxWidth: number, start?: RichInlineCursor): RichInlineLineRange | null
```

One line at a time, each at its own width, without fragment text. Omit `start` for the first line, then pass the previous line's `end`. Returns `null` when the items are used up.

```typescript
function materializeRichInlineLineRange(prepared: PreparedRichInline, line: RichInlineLineRange): RichInlineLine
```

Turns a line range into a line whose fragments have their `text`, `sourceStart` and `sourceEnd`.

```typescript
function walkRichInlineLineRanges(prepared: PreparedRichInline, maxWidth: number, onLine: (line: RichInlineLineRange) => void): number
```

Calls `onLine` once per line at a fixed width, without fragment text. Returns the line count.

```typescript
function measureRichInlineStats(prepared: PreparedRichInline, maxWidth: number): RichInlineStats
```

Returns `{ lineCount, maxLineWidth }` at a width, without building lines.

**Cursors are only for passing back.** A line's `end` and a fragment range's `start` and `end` count segments of the item's part of the paragraph. Pass them back to `layoutNextRichInlineLineRange()` or `materializeRichInlineLineRange()`, and don't read them as positions in the item's text or as cursors into `prepareWithSegments(item.text)`. For where a fragment's text sits in its item, read the materialized fragment's `sourceStart` and `sourceEnd`. To paint a line later, keep its range.

## Types

All exported types of `dist/rich-inline.d.ts`, with the type aliases written out. `PreparedRichInline` is a brand: a type with no readable fields, made only by `prepareRichInline()`.

```typescript
type RichInlineItem = {
  text: string
  font: string
  letterSpacing?: number
  break?: 'normal' | 'never'
  extraWidth?: number
  width?: never
}
```

- `text`: the raw text, including spaces at its edges. In `normal` white space, spaces between items collapse as in the browser.
- `font`: a canvas font string for this item, such as `'700 12px Inter'`.
- `letterSpacing`: CSS `letter-spacing` in px.
- `break: 'never'` makes the item atomic: one box that can't break inside, as CSS `display: inline-block` does. A line can break on either side of it.
- `extraWidth`: the item's padding and border, in px.
- `width?: never`: an item can't carry a `width`. Only a box has one. If your own run type has a `width` field beside its `text`, pass runs without it or rename it, or the list won't type-check.

```typescript
type RichInlineBox = {
  width: number
  text?: never
}
```

A box: an object inside the line that has no text. See [Boxes](#boxes).

```typescript
type RichInlineOptions = {
  whiteSpace?: 'normal' | 'pre-wrap'
  wordBreak?: 'normal' | 'keep-all'
}
```

```typescript
type RichInlineCursor = {
  itemIndex: number
  segmentIndex: number
  graphemeIndex: number
}
```

Only for passing back (see [Functions](#functions)).

```typescript
type RichInlineFragment = {
  itemIndex: number
  text: string
  gapBefore: number
  gapItemIndex: number
  occupiedWidth: number
  sourceStart: number
  sourceEnd: number
}
```

A piece of one item on one line, with its text.

- `itemIndex`: the item it comes from, an index into the list you prepared.
- `text`: the fragment's text. `''` for a box. A line broken at a soft hyphen ends with `-`.
- `gapBefore`: the collapsed space before the fragment, in px. 0 when there is none.
- `gapItemIndex`: the item whose font and letter spacing measured that space: the fragment's own item, the previous fragment's item, or an item holding only white space, which gets no fragment. -1 when no space precedes the fragment on its line. A gap of 0 with an index of 0 or more is a space that takes no room, which is not the same as no space.
- `occupiedWidth`: the text's width plus `extraWidth`, or a box's width.
- `sourceStart`, `sourceEnd`: where `text` starts and ends in the item's `text`, as UTF-16 offsets. Both 0 for a box.

Its type has no `start` or `end`. At run time a materialized fragment still carries cursor objects under those names, but they are not offsets into the item's text: read `sourceStart` and `sourceEnd` instead.

```ts claim=rich-source-offsets
const prepared = prepareRichInline([{ text: 'Ship', font: '16px Inter' }, { text: ' it now', font: '16px Inter' }])
const range = layoutNextRichInlineLineRange(prepared, 400) // null only for items with no lines
const line = range === null ? null : materializeRichInlineLineRange(prepared, range)
line?.fragments[1] // → text 'it now', sourceStart 1, sourceEnd 7, gapBefore > 0, gapItemIndex 1
```

```typescript
type RichInlineFragmentRange = {
  itemIndex: number
  gapBefore: number
  gapItemIndex: number
  occupiedWidth: number
  start: LayoutCursor
  end: LayoutCursor
}
```

A fragment without its text. `start` and `end` are only for passing back. If you build a range by hand, as a test might, it needs `gapItemIndex`.

```typescript
type RichInlineLine = {
  fragments: RichInlineFragment[]
  width: number
  end: RichInlineCursor
}
```

```typescript
type RichInlineLineRange = {
  fragments: RichInlineFragmentRange[]
  width: number
  end: RichInlineCursor
}
```

A line's `width` is the sum of its fragments' `gapBefore` and `occupiedWidth`. It includes `extraWidth` and leaves out spaces that hang past the line's end.

```typescript
type RichInlineStats = {
  lineCount: number
  maxLineWidth: number
}
```

## Items and boxes

**Declare a mixed list as `Array<RichInlineItem | RichInlineBox>`.** Without the annotation, TypeScript widens `break: 'never'` in an array literal to `string`, and the list no longer type-checks at `prepareRichInline()`. With `strict` off, the mix fails even without `break`. Don't fix it with a list declared `as const`: that makes a readonly tuple, which `prepareRichInline()` rejects (TS4104). An array literal written inline in the call, `prepareRichInline([...] as const)` included, compiles, because the parameter type guides it. That covers array literals only. A `.map()` that returns text items or boxes, by a ternary or otherwise, needs the annotation on its arrow: `parts.map((p): RichInlineItem | RichInlineBox => ...)` compiles under either `strict` setting. Without it, a `break: 'never'` branch fails when the result goes into an unannotated variable, and with `strict` off every such `.map()` fails, passed inline or into an annotated variable too. When you read an item back, check that it has text before you read its font, since an entry may be a box:

```ts
const items: Array<RichInlineItem | RichInlineBox> = [
  { text: 'Ship ', font: '500 17px Inter' },
  { text: '@maya', font: '700 12px Inter', break: 'never', extraWidth: 16 },
  { text: "'s fix ", font: '500 17px Inter' },
  { width: 20 }, // a custom emoji
]
const prepared = prepareRichInline(items)
const fontOf = (i: number) => {
  const item = items[i]
  return 'font' in item ? item.font : null // null for a box
}
```

**Atomic items** (`break: 'never'`):

- **Put the spaces next to an atomic item in the text beside it**, as in `'Ship '` above, not in the atomic item.
- An atomic item's own leading and trailing white space is trimmed, as browsers trim it inside an inline-block. It makes no gap.
- An atomic item of only white space is an empty box as wide as its `extraWidth`.

**Known gaps.** An item of only a zero-width space or soft hyphens, such as the placeholder an editor keeps in an empty styled run, gets no fragment on a line whose start consumes it, and may not get the line of its own that the browser gives it. If that line matters, keep a real character or a box of width 0 in such runs. Upstream's [CHANGELOG](https://github.com/chenglou/pretext/blob/v1.0.0/CHANGELOG.md) lists these cases under "Four things got worse".

### Boxes

A box, `{ width }`, stands for an image, a custom emoji, a formula or a badge inside a line. A line can break before and after it, as at an `<img>`, whatever text touches it. Its fragment has the box's width as `occupiedWidth`, `text: ''`, and `sourceStart` and `sourceEnd` of 0.

- **`width` is the element's margin box**, padding and border included, in whole or quarter px. It must be finite and at least 0.
- **A size you don't know yet:** prepare with a placeholder width, and prepare again when the real size arrives.
- **An image capped at `max-width: 100%`:** pass `Math.min(imageWidth, paragraphWidth)`, and prepare again when the paragraph's width changes.
- **Invalid items throw a `RangeError`**: a negative or `NaN` width, or an item with neither `text` nor `width`.

```ts claim=box-fragment
const prepared = prepareRichInline([{ text: 'Ship ', font: '16px Inter' }, { width: 30 }, { text: ' it', font: '16px Inter' }])
let box: RichInlineFragment | undefined
walkRichInlineLineRanges(prepared, 400, (range) => {
  box ??= materializeRichInlineLineRange(prepared, range).fragments.find((f) => f.itemIndex === 1)
})
box // → { text: '', occupiedWidth: 30, sourceStart: 0, sourceEnd: 0, … }
prepareRichInline([{ width: -1 }]) // throws RangeError
```

## Painting fragments

A paragraph's lines are painted a line at a time, from their fragments. Each fragment is its own element, or its own draw call.

- **Draw each fragment at `x + gapBefore`**, where `x` is where the previous fragment ended. When you paint a line as a row of inline elements, put the gap's space inside the element of item `gapItemIndex`, so it paints in that item's font and at that width.
- **Paint a `never` item as `display: inline-block; white-space: nowrap`.** A span with only `white-space: nowrap` stays in the text's flow, so the browser keeps a `:` or `'s` right after it on its line, where Pretext can break before them.
- **`extraWidth` is charged on every line an item reaches**, as CSS `box-decoration-break: clone` pads a span. Paint each fragment as its own element with the padding on both sides. A padded span that the browser wraps itself can break elsewhere, with `clone` too.
- **`pre-wrap`:** paint each line with `white-space: pre`, since a line painted alone in `pre-wrap` can wrap again. In `pre-wrap`, fragments have no gaps: a fragment's `text` keeps its spaces, and its `occupiedWidth` leaves out what hangs at the line's end.
- **Tabs in `pre-wrap`:** Pretext counts a tab's stops in its own item's font, as Safari does. Upstream says Chrome and Firefox count them in the paragraph's font, so a tab after a change of font, such as inside a code span, can land on a different stop there.
- **Spans without padding can wrap differently too:** items are measured apart, while Chrome and Firefox kern across neighbouring elements in one font, per upstream.
- **Heights are yours.** When you paint fragments as inline elements in a line box, give each item's element `line-height: 1` and each box `vertical-align: top`. A line is then as tall as the paragraph's line height or its tallest box, whichever is taller. Text in another size, or in a face whose ascent and descent differ, makes its line taller, and so does a chip whose vertical padding comes within a few px of the line height. While no item grows its line, the line count times the line height is the paragraph's height. Fragments positioned absolutely, as in the bubble recipe below, sit in no line box: give each the paragraph's line height and place it at its line's `y`.

## Recipes

### Chat bubble with a chip, a code span and a custom emoji

`paintRichLines` walks the lines and calls `draw(fragment, x, y)` for every fragment, boxes included, with `x` already including `gapBefore`. It returns the line count.

```ts run id=paintRichLines
function paintRichLines(
  prepared: PreparedRichInline,
  maxWidth: number,
  lineHeight: number,
  draw: (fragment: RichInlineFragment, x: number, y: number) => void,
): number {
  let lineIndex = 0
  walkRichInlineLineRanges(prepared, maxWidth, (range) => {
    const line = materializeRichInlineLineRange(prepared, range)
    let x = 0
    for (const fragment of line.fragments) {
      draw(fragment, x + fragment.gapBefore, lineIndex * lineHeight)
      x += fragment.gapBefore + fragment.occupiedWidth
    }
    lineIndex++
  })
  return lineIndex
}
```

A bubble that positions each fragment absolutely, shrink-wrapped to its widest line:

```ts needs=paintRichLines
const BODY = '15px Inter'
const LINE_HEIGHT = 20
const CHIP_PAD = 8 // px of horizontal padding on each side of the chip
const CODE_PAD = 4

const message: Array<RichInlineItem | RichInlineBox> = [
  { text: 'Ship ', font: BODY },
  { text: '@maya', font: '600 13px Inter', break: 'never', extraWidth: 2 * CHIP_PAD },
  { text: "'s fix with ", font: BODY },
  { text: 'git push', font: '13px "JetBrains Mono"', break: 'never', extraWidth: 2 * CODE_PAD },
  { text: ' before standup ', font: BODY },
  { width: 20 }, // custom emoji: its margin box
]

function renderBubble(bubble: HTMLElement, items: Array<RichInlineItem | RichInlineBox>, maxWidth: number) {
  const prepared = prepareRichInline(items)
  const { maxLineWidth } = measureRichInlineStats(prepared, maxWidth)
  const width = Math.min(maxWidth, Math.ceil(maxLineWidth))
  bubble.replaceChildren()
  bubble.style.position = 'relative'
  const lineCount = paintRichLines(prepared, width, LINE_HEIGHT, (fragment, x, y) => {
    const item = items[fragment.itemIndex]
    const el = document.createElement('font' in item ? 'span' : 'img') // give the img its src yourself
    el.style.cssText = `position:absolute;left:${x}px;top:${y}px`
    if ('font' in item) {
      el.textContent = fragment.text // the span's width comes from its text and padding
      el.style.font = item.font
      el.style.lineHeight = `${LINE_HEIGHT}px`
      el.style.whiteSpace = 'pre'
      el.style.padding = `0 ${(item.extraWidth ?? 0) / 2}px`
    } else {
      el.style.width = `${item.width}px` // the box width you prepared: whole or quarter px
      el.style.height = `${LINE_HEIGHT}px`
    }
    bubble.append(el)
  })
  bubble.style.width = `${width}px`
  bubble.style.height = `${lineCount * LINE_HEIGHT}px`
}
```

Laid out at the shrunk width, the lines are the same as at `maxWidth`, because no line was wider than it. For a code span in another font, load that font before preparing (see SKILL.md gotcha #4).

### Shrink-wrap without painting

To size a container before painting, as for a virtualized list, take the widest line and cap it at the width you measured with:

```ts
function richContentSize(items: Array<RichInlineItem | RichInlineBox>, maxWidth: number, lineHeight: number) {
  const { lineCount, maxLineWidth } = measureRichInlineStats(prepareRichInline(items), maxWidth)
  return { width: Math.min(maxWidth, Math.ceil(maxLineWidth)), height: lineCount * lineHeight }
}
```

The height holds only while no item grows its line (see [Painting fragments](#painting-fragments)). Keep the prepared handle if you lay out the same items again.

### Upstream demos

- [`rich-note.model.ts`](https://github.com/chenglou/pretext/blob/v1.0.0/pages/demos/rich-note.model.ts): chips, code spans and links painted from fragments.
- [`markdown-chat.md`](https://github.com/chenglou/pretext/blob/v1.0.0/pages/demos/markdown-chat.md): the Markdown chat demo's patterns for long lists, and when you can skip each.
