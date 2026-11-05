# Pretext API Reference

API reflects v1.0.0 (2026-10-14). The main entry, `@chenglou/pretext`, exports the 12 functions below. The other 5 come from `@chenglou/pretext/rich-inline` and are in [rich-inline.md](rich-inline.md). Coming from an older Pretext, or reading code written for one? Start with [migration.md](migration.md).

Signatures and types here are copied from the package's `dist/*.d.ts`. Upstream's [README](https://github.com/chenglou/pretext/blob/v1.0.0/README.md) and [CHANGELOG](https://github.com/chenglou/pretext/blob/v1.0.0/CHANGELOG.md) are the source for behaviour.

## Table of Contents

**Measure height**

1. [prepare](#prepare)
2. [layout](#layout)

**Lay out lines yourself**

3. [prepareWithSegments](#preparewithsegments)
4. [Prepared handle fields](#prepared-handle-fields)
5. [layoutWithLines](#layoutwithlines)
6. [layoutNextLine](#layoutnextline)
7. [layoutNextLineRange](#layoutnextlinerange)
8. [materializeLineRange](#materializelinerange)
9. [walkLineRanges](#walklineranges)
10. [measureLineStats](#measurelinestats)
11. [measureNaturalWidth](#measurenaturalwidth)

**Caches and language**

12. [clearCache](#clearcache)
13. [setLocale](#setlocale)

**Reference**

14. [Types](#types)
15. [Language Support](#language-support)
16. [Rich inline text](#rich-inline-text)

Which handle each function takes:

| Function | `prepare()` handle | `prepareWithSegments()` handle |
|---|---|---|
| `layout`, `walkLineRanges`, `measureLineStats`, `measureNaturalWidth`, `layoutNextLineRange` | Yes | Yes |
| `layoutWithLines`, `layoutNextLine`, `materializeLineRange` (they return text) | No: a `TypeError` | Yes |

How well the results match the page depends on the font, language, width and CSS you paint with: see [accuracy.md](accuracy.md).

---

## prepare

```typescript
function prepare(text: string, font: string, options?: PrepareOptions): PreparedText
```

Does the one-time work, as upstream's README puts it: normalizes whitespace, segments the text at its break opportunities, measures the segments with canvas, and returns an opaque handle. `layout()` is then cheap arithmetic over the cached widths. Don't call `prepare()` again for the same text, font and options. On resize, call only `layout()`.

**Arguments:**

- `text`: the exact string you will paint. **Text comes first, font second** (see SKILL.md gotcha #2).
- `font`: a canvas font string, the same format as `ctx.font`, such as `'16px Inter'` or `'500 17px "Helvetica Neue"'`. Keep it in sync with the CSS of the element you paint. Sizes in px.
- `options`:
  - `whiteSpace`: `'normal'` (default) or `'pre-wrap'`. `'pre-wrap'` keeps ordinary spaces, `\t` tabs and `\n` hard breaks, as in a `<textarea>`.
  - `wordBreak`: `'normal'` (default) or `'keep-all'`, for CSS `word-break: keep-all`.
  - `letterSpacing`: CSS `letter-spacing` as a px number (see SKILL.md gotcha #9).

**Returns** a `PreparedText` handle. Its type is a brand with no readable fields. Pass it to `layout()` or to the four other functions that take one: `walkLineRanges()`, `measureLineStats()`, `measureNaturalWidth()` and `layoutNextLineRange()`.

**Throws** a `RangeError` for a `font` that Canvas ignores, such as `''`, `'16px'` or `'Arial 16px'` (family first), and for a `letterSpacing` that isn't finite, such as `NaN`. Which fonts throw depends on the browser: see [accuracy.md](accuracy.md#fonts).

**Cost.** Each call walks the whole text, so preparing a growing string over and over costs more each time. Measured segments are cached and shared between calls. Upstream's CHANGELOG ("Slower") notes that the first `prepare()` of text with long words costs more: a word 80px or wider gets a width for each of its letters, which Pretext uses to cut the word when a line is narrower than it (Chrome and Firefox cut such words this way, per the CHANGELOG). If you prepare labels with long words on a hot path, prepare them once beforehand, off that path.

```ts
const body = prepare('Hello world', '16px Inter')
const note = prepare(textareaValue, '14px Inter', { whiteSpace: 'pre-wrap' })
const korean = prepare('서울에서 만나요', '16px "Apple SD Gothic Neo"', { wordBreak: 'keep-all' })
const tracked = prepare('SHIPPING', '600 12px Inter', { letterSpacing: 1.5 })
```

---

## layout

```typescript
function layout(prepared: PreparedText, maxWidth: number, lineHeight: number): LayoutResult
```

Computes the line count and height at a width, with arithmetic only and no DOM access.

**Arguments:**

- `prepared`: a handle from `prepare()` or `prepareWithSegments()`.
- `maxWidth`: the content width of the element, in CSS px. Pass the width you set, not one read back from the page (see [accuracy.md](accuracy.md#widths)).
- `lineHeight`: **CSS px, not a multiplier.** For `font-size: 14px; line-height: 1.5`, pass `21` (see SKILL.md gotcha #1).

**Returns** `{ lineCount, height }`, where `height` is `lineCount * lineHeight`.

```ts
const prepared = prepare('Some text content here', '14px Georgia')
const lineHeight = 14 * 1.5 // CSS line-height: 1.5 on a 14px font

const wide = layout(prepared, 500, lineHeight)   // → { lineCount: number, height: number }
const narrow = layout(prepared, 100, lineHeight) // more lines at a narrower width; prepare() is not called again
```

**Empty text gives 0 lines and a height of 0.** That matches the browser: an empty block is 0 tall. Don't clamp it to one line.

```ts claim=empty-block
layout(prepare('', '16px Inter'), 200, 20) // → { lineCount: 0, height: 0 }
```

**A newline at the very end of `pre-wrap` text adds no line.** A `<textarea>` shows one more line than `layout()` counts when its value is empty or ends with `\n`, because it keeps a line for the caret. Add it yourself when you size a textarea:

```ts claim=textarea-extra-line
function textareaLines(value: string, font: string, width: number, lineHeight: number) {
  const { lineCount } = layout(prepare(value, font, { whiteSpace: 'pre-wrap' }), width, lineHeight)
  return value === '' || value.endsWith('\n') ? lineCount + 1 : lineCount
}
textareaLines('a\n', '16px Inter', 200, 20) // → 2, as the textarea shows
textareaLines('', '16px Inter', 200, 20)    // → 1
```

---

## prepareWithSegments

```typescript
function prepareWithSegments(text: string, font: string, options?: PrepareOptions): PreparedTextWithSegments
```

Same as `prepare()`, with the same arguments and errors, but the handle also exposes the segments. Use it only for the three functions that return a line's text: `layoutWithLines()`, `layoutNextLine()` and `materializeLineRange()`. Everything else takes a plain `prepare()` handle, which doesn't keep every segment's string.

```ts
const prepared = prepareWithSegments('Hello world, this is a test.', '16px Inter')
const { lines } = layoutWithLines(prepared, 200, 24)
```

## Prepared handle fields

The type of a `prepareWithSegments()` handle shows three fields, all read-only:

| Field | Typed as | Holds |
|---|---|---|
| `segments` | `readonly string[]` | The text split into segments, such as `['hello', ' ', 'world']` |
| `kinds` | `readonly SegmentBreakKind[]` (the 9 values below) | How each segment breaks |
| `widths` | `ArrayLike<number>` | Each segment's width in px |

The values of `kinds`, with upstream README's meanings:

| Kind | Segment |
|---|---|
| `'text'` | Text, including a run of no-break spaces or a word joiner |
| `'space'` | A collapsible space |
| `'preserved-space'` | A space kept by `pre-wrap` |
| `'tab'` | A tab kept by `pre-wrap` |
| `'hard-break'` | A newline kept by `pre-wrap` |
| `'zero-width-break'` | A zero-width space the line can break after |
| `'soft-hyphen'` | A soft hyphen (U+00AD) |
| `'zero-width-glue'` | A zero-width space or soft hyphen the browser doesn't break after, such as before a combining mark |
| `'control'` | In Safari, a next-line character (U+0085) |

**Copy before using array methods.** `widths` is typed `ArrayLike<number>`: it has an index and a `length`, and no `map`, `reduce`, spread or `for...of` is promised. Copy first: `Array.from(prepared.widths)`, `prepared.segments.slice()`. Never write to a field.

**Segment widths don't add up to a line's width.** A tab's width is 0, the letter spacing after a segment's last letter isn't in its width, and a line broken at a soft hyphen adds the hyphen. Segment widths are for line breaking, not for placing characters in Arabic or mixed-direction text. For a line's width, read the line's `width`. For the whole text, call `measureNaturalWidth()`.

```ts
const prepared = prepareWithSegments('Hello world', '16px Inter')
const widths = Array.from(prepared.widths) // a number[] you may sort, map or pass on
const longest = prepared.segments.slice().sort((a, b) => b.length - a.length)[0]
```

---

## layoutWithLines

```typescript
function layoutWithLines(prepared: PreparedTextWithSegments, maxWidth: number, lineHeight: number): LayoutLinesResult
```

All lines at one width, with their text. Use it to draw lines yourself, such as with Canvas `fillText()` or SVG `<text>`. Needs a `prepareWithSegments()` handle.

**Returns** `{ lineCount, height, lines }`. Each line is an object, `{ text, width, start, end }`, not a string (see [Types](#types)).

- `line.text` can keep a trailing space where the line wrapped after it. Trim it if you paint something after the line's end.
- `line.width` leaves out spaces and tabs that hang past the line's end, as browsers do.

```ts
const prepared = prepareWithSegments('The quick brown fox jumps over the lazy dog.', '16px Georgia')
const { lines } = layoutWithLines(prepared, 200, 24)
lines.forEach((line, i) => ctx.fillText(line.text, 0, i * 24))
```

What `lines` looks like (the break points and widths depend on the font):

```js illustrative
[
  { text: 'The quick brown fox ', width: 151.2, start: { segmentIndex: 0, graphemeIndex: 0 }, end: { segmentIndex: 8, graphemeIndex: 0 } },
  { text: 'jumps over the lazy ', width: 149.8, start: { segmentIndex: 8, graphemeIndex: 0 }, end: { segmentIndex: 16, graphemeIndex: 0 } },
  { text: 'dog.', width: 34.6, start: { segmentIndex: 16, graphemeIndex: 0 }, end: { segmentIndex: 17, graphemeIndex: 0 } },
]
```

---

## layoutNextLine

```typescript
function layoutNextLine(prepared: PreparedTextWithSegments, maxWidth: number, start?: LayoutCursor): LayoutLine | null
```

Lays out one line at a time, each at its own width: text around an image, inside a shape, or across columns. Returns `null` when the text is used up. Needs a `prepareWithSegments()` handle. When you don't need every line's text, use `layoutNextLineRange()`.

- **Width second, cursor third.** Omit `start`, or pass `undefined`, for the first line. Then pass the previous line's `end`. A `null` cursor throws a `TypeError`.
- **Before 1.0.0 the cursor came second.** A call left in that order still runs in JavaScript but never returns `null`, so the loop never ends. See SKILL.md gotcha #10, and search old code as [migration.md](migration.md#find-old-usage) shows.

```ts
const prepared = prepareWithSegments(longText, '14px Georgia')
const lineHeight = 21
let cursor: LayoutCursor | undefined // undefined: start at the beginning
let y = 0
while (true) {
  const line = layoutNextLine(prepared, getWidthAroundObstacle(y), cursor)
  if (line === null) break
  renderLine(line.text, y)
  cursor = line.end
  y += lineHeight
}
```

---

## layoutNextLineRange

```typescript
function layoutNextLineRange(prepared: PreparedText, maxWidth: number, start?: LayoutCursor): LayoutLineRange | null
```

Same as `layoutNextLine()`, with the same argument order, but returns a range, `{ width, start, end }`, without the text. It takes a `prepare()` handle. Use it to measure variable-width layouts, for virtualization or hit-testing, and turn only the lines you paint into text with `materializeLineRange()`, which needs a `prepareWithSegments()` handle.

```ts
const prepared = prepareWithSegments(article, BODY_FONT) // for materializeLineRange() below
const visible: Array<{ range: LayoutLineRange; y: number }> = []
let cursor: LayoutCursor | undefined
let y = 0
while (true) {
  const range = layoutNextLineRange(prepared, getColumnWidth(y), cursor)
  if (range === null) break
  if (isVisible(y)) visible.push({ range, y })
  cursor = range.end
  y += lineHeight
}
for (const { range, y } of visible) ctx.fillText(materializeLineRange(prepared, range).text, 0, y)
```

---

## materializeLineRange

```typescript
function materializeLineRange(prepared: PreparedTextWithSegments, line: LayoutLineRange): LayoutLine
```

Turns a range from `layoutNextLineRange()` or `walkLineRanges()` into a line with its `text`. Needs a `prepareWithSegments()` handle of the same text.

**A line broken at a soft hyphen** has `text` ending in `-`, and its `width` counts the hyphen the browser draws there. To tell such a line from one that ends in a real hyphen, check the segment before its end:

```ts claim=soft-hyphen-break
function endsAtSoftHyphen(prepared: PreparedTextWithSegments, line: LayoutLine) {
  return line.text.endsWith('-') && line.end.graphemeIndex === 0 && prepared.kinds[line.end.segmentIndex - 1] === 'soft-hyphen'
}
const hyphenated = prepareWithSegments('in\u00ADcom\u00ADpre\u00ADhen\u00ADsi\u00ADble', '16px Inter')
const range = layoutNextLineRange(hyphenated, 60) // null only for text with no lines
if (range !== null) endsAtSoftHyphen(hyphenated, materializeLineRange(hyphenated, range)) // true where the line broke at a soft hyphen
```

---

## walkLineRanges

```typescript
function walkLineRanges(prepared: PreparedText, maxWidth: number, onLine: (line: LayoutLineRange) => void): number
```

Calls `onLine` once per line at a fixed width, with the line's `width`, `start` and `end`, without building text. Returns the line count. Takes a `prepare()` handle. Use it when you need each line's width, such as to search for a width that gives balanced lines. For only the count and the widest line, `measureLineStats()` is one call with no callback.

```ts
const prepared = prepare(text, '16px Inter')
const lineWidths: number[] = []
const lineCount = walkLineRanges(prepared, 320, (line) => lineWidths.push(line.width))
const shortestLast = lineWidths[lineWidths.length - 1] < 0.3 * 320 // a short last line: try a narrower width
```

---

## measureLineStats

```typescript
function measureLineStats(prepared: PreparedText, maxWidth: number): LineStats
```

Returns `{ lineCount, maxLineWidth }` at a width: a single call, no callback. Takes a `prepare()` handle. Use it to shrink-wrap a chat bubble or a tooltip to its widest line.

**Cap the width you set.** Size the element to `Math.ceil(maxLineWidth)`, capped at the `maxWidth` you measured with. At the exact fractional width the browser can wrap the widest line, and without the cap the element can come out wider than `maxWidth`.

```ts
const maxWidth = 280
const prepared = prepare('Hello world, this is a chat message.', '14px Inter')
const { lineCount, maxLineWidth } = measureLineStats(prepared, maxWidth)
const contentWidth = Math.min(maxWidth, Math.ceil(maxLineWidth))
bubble.style.width = `${contentWidth}px` // content box: padding and border go outside it
bubble.style.height = `${lineCount * 20}px`
```

---

## measureNaturalWidth

```typescript
function measureNaturalWidth(prepared: PreparedText): number
```

The width of the widest line when only explicit line breaks apply, like CSS `max-content`. Takes a `prepare()` handle.

- Text without `\n` (or in `normal` white space) measures as one line. For the width of soft-wrapped text, such as a bubble, use `measureLineStats()` at a `maxWidth`.
- In `pre-wrap`, it counts the spaces before a newline, as `max-content` does, though a line's `width` leaves them out.
- A lone collapsible space measures 0. To measure a space, use `pre-wrap` or a no-break space, `'\u00A0'`.

```ts
const prepared = prepare('First line\nSecond, longer line', '16px Inter', { whiteSpace: 'pre-wrap' })
const natural = measureNaturalWidth(prepared) // the width of "Second, longer line"
```

```ts claim=space-natural-width
measureNaturalWidth(prepare(' ', '16px Inter'))                           // → 0
measureNaturalWidth(prepare(' ', '16px Inter', { whiteSpace: 'pre-wrap' })) // → more than 0
measureNaturalWidth(prepare('\u00A0', '16px Inter'))                      // → more than 0
```

---

## clearCache

```typescript
function clearCache(): void
```

Empties the measurement caches that `prepare()`, `prepareWithSegments()` and `prepareRichInline()` share. Handles you already have keep their widths. Text prepared afterwards is measured again. Call it:

- **After a web font loads late**, if text in that font was prepared before: those widths are the fallback font's. Clear, then prepare that text again (see SKILL.md gotcha #4 and [accuracy.md](accuracy.md#fonts)).
- **After `devicePixelRatio` changes**, as when the page is zoomed, if text has emoji: on macOS a small emoji's painted width depends on the ratio, per upstream. Clear, then prepare that text again.
- **When your app cycles through many fonts** and you want to release what has built up.

The caches also empty themselves: once they hold more than 262,144 segments between all fonts, the next preparation clears them first.

```ts
async function useFontLate(text: string) {
  await document.fonts.load('16px Inter', text)
  clearCache()
  return prepare(text, '16px Inter')
}
```

---

## setLocale

```typescript
function setLocale(locale?: string): void
```

Sets the language that later `prepare()`, `prepareWithSegments()` and `prepareRichInline()` calls break lines and measure under, in place of the page's `<html lang>`.

- **Pass the page's language, not the user's.** The language changes line breaks and fonts, so it has to be the language the page's text is painted under. On a page with `<html lang>`, you don't need to call it.
- `setLocale()` with no argument goes back to `<html lang>`. `setLocale('')` means a page with no language.
- **Workers need it.** A worker has no `<html lang>`: send it the page's `document.documentElement.lang` and call `setLocale()` with it once, before the first `prepare()` (see [accuracy.md](accuracy.md#outside-the-browser)).
- Internally calls `clearCache()`. Existing handles are not changed. If the page's `lang` changes, prepare your text again.

```ts
// In a worker, once, with the language the page sent first: '' for a page without one
self.addEventListener('message', (event: MessageEvent<{ lang: string }>) => setLocale(event.data.lang), { once: true })
```

---

## Types

All exported types of the main entry, as `dist/layout.d.ts` declares them, with the type aliases written out.

`PreparedText` is a brand: a type with no readable fields, made only by `prepare()` or `prepareWithSegments()`. `WordBreakMode` is `'normal' | 'keep-all'`.

```typescript
type PreparedTextWithSegments = PreparedText & {
  readonly segments: readonly string[]
  readonly kinds: readonly ('text' | 'space' | 'preserved-space' | 'tab' | 'zero-width-break' | 'soft-hyphen' | 'zero-width-glue' | 'hard-break' | 'control')[]
  readonly widths: ArrayLike<number>
}
```

See [Prepared handle fields](#prepared-handle-fields). All three are read-only: copy one before you pass it on as a mutable array or write to it. `segments` and `kinds` are readonly arrays, so their non-mutating array methods work; `widths` is only `ArrayLike<number>`, so copy it (`Array.from(prepared.widths)`) before any array method, spread or `for...of`.

```typescript
type PrepareOptions = {
  whiteSpace?: 'normal' | 'pre-wrap'
  wordBreak?: 'normal' | 'keep-all'
  letterSpacing?: number
}
```

`letterSpacing` is in CSS px and must be finite. Leaving a field out, or passing `undefined`, gives the default.

```typescript
type LayoutResult = {
  lineCount: number
  height: number
}
```

`height` is `lineCount * lineHeight`. Both are 0 for empty text.

```typescript
type LineStats = {
  lineCount: number
  maxLineWidth: number
}
```

`maxLineWidth` is the widest line's `width`, so it leaves out hanging spaces.

```typescript
type LayoutCursor = {
  segmentIndex: number
  graphemeIndex: number
}
```

A position in the prepared segments, not a string offset. `graphemeIndex` is 0 at a segment boundary. Pass a line's `end` back as the next `start`.

```typescript
type LayoutLine = {
  text: string
  width: number
  start: LayoutCursor
  end: LayoutCursor
}
```

`start` is inclusive and `end` exclusive. `width` leaves out spaces and tabs that hang past the line's end: all of them where the line wraps, and in `pre-wrap`, before a newline or at the end of the text, only the part that doesn't fit in `maxWidth`.

```typescript
type LayoutLineRange = {
  width: number
  start: LayoutCursor
  end: LayoutCursor
}
```

A `LayoutLine` without its `text`. Turn it into one with `materializeLineRange()`.

```typescript
type LayoutLinesResult = LayoutResult & {
  lines: LayoutLine[]
}
```

---

## Language Support

In Chrome, Safari and Firefox, Pretext finds where lines can break with ports of that browser's own line breaker and its data, and finds grapheme clusters with the character rules that browser ships. Lines break where that browser breaks them, including around CJK punctuation and quotes, dashes and URLs. Engines it doesn't recognize, and runtimes outside the browser, get Chrome's rules (see [accuracy.md](accuracy.md#engine-versions)).

- **Latin, Greek, Cyrillic and similar:** breaks at spaces and at the browser's other break opportunities, such as after hyphens.
- **Chinese, Japanese, Korean:** breaks between characters, with closing punctuation such as `。` kept on the line before. `wordBreak: 'keep-all'` matches CSS `word-break: keep-all`.
- **Thai, Lao, Khmer, Myanmar** and other scripts written without spaces: word boundaries come from `Intl.Segmenter`, which Pretext needs only for these scripts. Without it, preparing such text throws.
- **Arabic, Hebrew and mixed-direction text:** lines break correctly, but **Pretext gives no bidi levels and no visual order.** Paint each paragraph as one element with its direction set, and let the browser order each line. Lines drawn one at a time, such as with Canvas, are each ordered as their own paragraph (see [accuracy.md](accuracy.md#painting)).
- **Soft hyphens:** insert U+00AD (`'\u00AD'`) yourself. Pretext doesn't hyphenate. A line broken at one ends with `-`, which its `width` counts.
- **Emoji:** measured with the canvas. Small emoji widths on macOS depend on `devicePixelRatio` (see [clearCache](#clearcache)).
- **Page language** changes line breaks and fonts. Pretext reads `<html lang>`, or what you pass to `setLocale()`, never an element's own `lang` (see [accuracy.md](accuracy.md#language)).

---

## Rich inline text

Text in several fonts, with chips, mentions, code spans or inline images, uses `@chenglou/pretext/rich-inline`: see [rich-inline.md](rich-inline.md).
