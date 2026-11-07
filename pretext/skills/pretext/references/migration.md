# Migrating to Pretext 1.0.0

Use this file when a project uses `@chenglou/pretext` below 1.0.0, or when code written for 0.0.x has to run on 1.0.0. Everything here comes from upstream's [CHANGELOG](https://github.com/chenglou/pretext/blob/v1.0.0/CHANGELOG.md), section *Upgrading from 0.0.9*, plus the checks behind this skill.

## Table of Contents

1. [Check the version](#check-the-version)
2. [Find old usage](#find-old-usage)
3. [Breaking changes](#breaking-changes)
4. [Silent changes](#silent-changes)
5. [Optional simplifications](#optional-simplifications)
6. [From before 0.0.9](#from-before-009)
7. [Code from community demos](#code-from-community-demos)

## Check the version

Check which version is installed before you write any code:

```sh
npm ls @chenglou/pretext
```

A range such as `^0.0.8` matches only that one patch, `0.0.8`, because a caret range below 0.1.0 never moves. Such a project never reaches 1.0.0 by itself. Upgrade explicitly:

```sh
npm install @chenglou/pretext@latest   # or: pnpm add, yarn add, bun add with the same argument
```

Then run the type checker (`tsc --noEmit`) if the project uses TypeScript. It reports most of the breaking changes below at the line that needs them.

## Find old usage

JavaScript gets no type errors, and some old code compiles but behaves differently. Run this from the project root and review every hit:

```sh
grep -rnE --include='*.js' --include='*.jsx' --include='*.ts' --include='*.tsx' \
  --include='*.mjs' --include='*.cjs' --include='*.vue' --include='*.svelte' \
  --exclude-dir=node_modules --exclude-dir=dist \
  -e '\blayoutNextLine(Range)?\b' \
  -e "segLevels|[\"']glue[\"']" \
  -e 'frag[[:alnum:]_]*(\[[^]]*\])?\.(start|end)\b' \
  -e '\b(start|end)\.(graphemeIndex|segmentIndex)\b' \
  -e '\{[^}]*\b(start|end)\b[^}]*\}[[:space:]]*(=[^=>]|:|\)[[:space:]]*=>|of\b)' \
  -e 'setLocale\(' \
  -e '\.map\(.*prepareRichInline' \
  -e '\bprepareRichInline[[:space:]]*([,)]|$)' \
  -e '\b(prepareRichInline|setLocale) as |= *[[:alnum:]_.]*(prepareRichInline|setLocale)[;[:space:]]*$' \
  -e 'extraWidth' \
  -e 'widths\.(map|filter|reduce|forEach|slice|some|every|find|indexOf|includes|join|concat|sort|entries|keys|values)\b|\.\.\.[[:alnum:]_.]*widths\b|of [[:alnum:]_.]*widths\b' \
  -e 'lineEndFitAdvances|lineEndPaintAdvances|breakablePreferredBreaks|spacingGraphemeCounts|\.chunks\b' \
  -e 'breakableFitAdvances|discretionaryHyphenWidth' \
  -e 'pages/demos' \
  -e 'letterSpacing' \
  -e 'getComputedStyle\(' \
  .
```

What each pattern finds, and where to look next:

| Pattern | Finds | Fix |
|---|---|---|
| `layoutNextLine`, `layoutNextLineRange` | Every call to the two line iterators, their imports, and any alias: `layoutNextLine as next`, `const next = layoutNextLine` | Row 1 of [Breaking changes](#breaking-changes). Check every call, since an old-order call never returns `null` and the loop never ends. For an alias, search for its name too, since its calls don't match |
| `segLevels`, `'glue'` | Removed bidi levels and a removed segment kind | Rows 4 and 5 |
| `frag….start`, `frag….end`, `.start.graphemeIndex`, `{ start, end } =` | Rich-inline fragment cursors read as text offsets, under any name or destructured | Row 2. Names vary, so also check other reads of a fragment's `start` and `end`. The same read of a line's cursor, such as `line.start.graphemeIndex`, is fine |
| `setLocale\(` | Locale calls, whose meaning changed | Row 6 |
| `.map(…prepareRichInline`, a bare `prepareRichInline` | Rich-inline preparation inside `map()`, on one line or split over several. The bare name also hits imports, which need nothing | Row 11. Also check for one `prepareRichInline()` per item, which [Silent changes](#silent-changes) covers |
| `prepareRichInline as`, `setLocale as`, `= prepareRichInline` | Aliases of these two | Search for the alias's name, then rows 11 and 6 |
| `extraWidth` | Padded items, and characters padded out to stand in for an image | An image stand-in becomes a box: see [Optional simplifications](#optional-simplifications) |
| `widths.reduce(`, `...widths`, `of widths` | Array methods, spread and loops over `widths` | Row 3 |
| `lineEndFitAdvances` and the rest | Handle fields that are gone, with no public equivalent | Row 3 |
| `breakableFitAdvances`, `discretionaryHyphenWidth` | Internal handle fields that no longer type-check, with no public equivalent | Row 3 |
| `pages/demos` | Imports from the demos, which no longer ship | Row 12 |
| `letterSpacing` | Letter spacing passed to Pretext, often read from CSS, where `normal` parses to `NaN` | Row 8 |
| `getComputedStyle(` | Fonts read from the page, which can be `''`, as for an element not in the document | Row 9. The computed style is often kept in a variable, so follow it to where its `font` is used |

The fragment and `widths` patterns go by common variable names, so they can miss code that names things differently. In TypeScript, the type checker finds those, unless the value is `any`.

A grep still can't see calls through a wrapper or a re-export, or a fragment read through a helper or a destructure split over lines: read the code around each hit for those.

## Breaking changes

One row per item of upstream's *Upgrading from 0.0.9*, in its order.

| # | Change | Before | After |
|---|---|---|---|
| 1 | The line iterators take the width before the cursor, and the cursor is optional. An old-order call in JavaScript never returns `null`, so its loop never ends | `layoutNextLine(prepared, cursor, width)`, `layoutNextLineRange(prepared, cursor, width)` | `layoutNextLine(prepared, width, cursor)`, `layoutNextLineRange(prepared, width, cursor)`, and `layoutNextLine(prepared, width)` for the first line |
| 2 | Rich-inline cursors are only for passing back. A fragment's `start` and `end` were never text offsets: in 0.0.x too they are cursors into the item's segments, so `fragment.end.graphemeIndex` reads as 0 wherever a line breaks between segments. 1.0.0 adds `sourceStart` and `sourceEnd` and drops `start` and `end` from a materialized fragment's type, but still returns them, so JavaScript and code typed `any` keep getting wrong offsets with no error | `text.slice(fragment.start.graphemeIndex)` and other reads of `fragment.start` or `fragment.end` | `item.text.slice(fragment.sourceStart, fragment.sourceEnd)`, and pass back the range: `materializeRichInlineLineRange(prepared, range)` |
| 3 | A `prepareWithSegments()` handle is typed as `segments`, `kinds` and `widths` only, all read-only. `widths` is `ArrayLike<number>` | `prepared.widths.reduce((a, b) => a + b, 0)`, `prepared.lineEndFitAdvances` | `measureNaturalWidth(prepared)` for the text's width, `line.width` for a line's, `Array.from(prepared.widths)` or `prepared.segments.slice()` for a copy |
| 4 | `segLevels` is gone, and 1.0.0 has no other bidi or direction API | `prepared.segLevels` | One DOM element per paragraph with `dir` set: see [accuracy.md](accuracy.md#painting). For Canvas, see below |
| 5 | Segment kinds: `'glue'` is gone, and `'zero-width-glue'` and `'control'` are new. No kind marks a no-break space: it is part of a `'text'` segment, as in `'10\u00A0km away'`, which segments as `['10\u00A0km', ' ', 'away']` | `kind === 'glue'` | Test the characters of the source text, not `kinds`: `/[\u00A0\u202F\u2060\uFEFF]/.test(text)`, the four characters `'glue'` stood for. This is not the old result: 0.0.x also folded a no-break space inside a word into its `'text'` segment, so `kind === 'glue'` was false for `'10\u00A0km away'` and the test above is true. Check what callers expect. `kind === 'text'` is no replacement, since it's true for nearly any text |
| 6 | `setLocale(locale)` replaces `<html lang>` for later preparations | `setLocale(navigator.language)`, `setLocale('')` to reset | `setLocale(document.documentElement.lang)`, or drop the call; `setLocale()` to reset |
| 7 | Don't deep-freeze a handle, and prepare again in place of an old version's handle | `deepFreeze(prepared)`, a handle read back from IndexedDB | `Object.freeze(prepared)` or Immer's `freeze()`; `prepare(text, font)` again |
| 8 | A `letterSpacing` that isn't finite throws a `RangeError` | `{ letterSpacing: parseFloat(style.letterSpacing) }`, which is `NaN` for `normal` | `{ letterSpacing: parseFloat(style.letterSpacing) || 0 }` |
| 9 | A `font` that Canvas ignores, such as `''`, `'16px'` or `'Arial 16px'`, throws a `RangeError` | `prepare(text, getComputedStyle(el).font)` | Check the computed font is not empty first, or build the string: `'16px Inter'`. See [accuracy.md](accuracy.md#fonts) |
| 10 | A `break: 'never'` item's own leading and trailing white space makes no gap, and an atomic item of only white space is an empty box as wide as its `extraWidth` | `{ text: ' @maya ', font, break: 'never' }` | `{ text: 'Ship ', font }, { text: '@maya', font, break: 'never' }`, with the space in the text beside it |
| 11 | TypeScript: a list entry may be a box, a run type can't carry `width`, hand-built fragments need the new fields, and `map()` needs an arrow | `paragraphs.map(prepareRichInline)`, `item.font` on an entry of the list | `paragraphs.map(items => prepareRichInline(items))`, `'text' in item ? item.font : null` |
| 12 | The demos are in the repository, not in the installed module | `import … from '@chenglou/pretext/pages/demos/…'` | Copy the code from [pages/demos at v1.0.0](https://github.com/chenglou/pretext/tree/v1.0.0/pages/demos) |

**Row 4 with Canvas.** Take one direction per paragraph from its first strong character, as `dir="auto"` does, and set `ctx.direction` to it for every line of that paragraph. Letters are strong; digits and punctuation are not, so a line starting `42` takes the direction of the letter after it. Neither version gives visual order: `fillText()` orders each line as a paragraph of its own, so a line with mixed directions can still differ from the DOM. A guess per line, as code built on `segLevels` often made, flips at lines that start with an embedded word.

The function below approximates `dir="auto"` for the modern right-to-left scripts. A JavaScript regex has no `Bidi_Class` property, so it lists scripts instead, and a letter of a historic right-to-left script reads as `ltr`.

```ts
const RTL = /[\u200F\u061C\p{Script=Hebrew}\p{Script=Arabic}\p{Script=Syriac}\p{Script=Thaana}\p{Script=Nko}\p{Script=Adlam}\p{Script=Samaritan}\p{Script=Mandaic}\p{Script=Hanifi_Rohingya}\p{Script=Yezidi}]/u
function paragraphDirection(text: string): CanvasDirection {
  const first = /[\p{L}\u200E\u200F\u061C]/u.exec(text) // a letter, LRM, RLM or ALM
  return first && RTL.test(first[0]) ? 'rtl' : 'ltr'
}
```

**Row 11 with mixed rich arrays.** In an inferred array that mixes text items and boxes, `break: 'never'` widens to `string`, and `prepareRichInline()` rejects the array. With `strict` off, the mix fails even without `break`. A `.map()` that returns text items or boxes, by a ternary or otherwise, needs the annotation on its arrow, `(p): RichInlineItem | RichInlineBox =>`. For an array, annotate the variable:

```ts
const items: Array<RichInlineItem | RichInlineBox> = [
  { text: 'Ship ', font: '500 17px Inter' },
  { text: '@maya', font: '700 12px Inter', break: 'never', extraWidth: 22 },
  { width: 20 }, // a custom emoji
]
const rich = prepareRichInline(items)
```

## Silent changes

These change results without an error or a type error.

- **Line breaks moved.** Each browser's own line breaker now decides where lines can break, so text breaks differently around CJK punctuation and quotes, dashes, URLs and Thai, among others. Line counts, heights and line strings can change. Update snapshot tests after checking a few changed cases in a browser.
- **Rich inline lays out as one paragraph.** Items are measured in their own fonts, but lines break where the same text in one element breaks. Punctuation at the start of an item stays with the word before it, and a word split across items wraps as one word. Code that called `prepareRichInline()` once per item, or expected a line to end at any item boundary, gets different lines.
- **The bundle grew.** Upstream gives about 40 KB gzipped for the main entry and 44 KB for `@chenglou/pretext/rich-inline`, up from about 16 KB each in 0.0.9. See [accuracy.md](accuracy.md#bundle-size).
- **Persisted handles throw.** A handle made by 0.0.x, as kept in IndexedDB or sent by a worker on an older bundle, throws a `TypeError` in 1.0.0's line functions. Store text, font and options, and prepare again.
- **An old `catch` may hide a `RangeError`.** Code that wrapped `prepare()` in `try`/`catch`, for example to fall back to DOM measurement, now also catches the new `RangeError` for a bad font or `letterSpacing`, and quietly takes the fallback. Log what the `catch` receives.

## Optional simplifications

Code that works after the breaking changes can get simpler.

- **Use `prepare()` where text isn't needed.** `walkLineRanges()`, `measureLineStats()`, `measureNaturalWidth()` and `layoutNextLineRange()` now take a `prepare()` handle. Only `layoutWithLines()`, `layoutNextLine()` and `materializeLineRange()`, which return text, need `prepareWithSegments()`.
- **Omit the first cursor.** The line iterators start at the beginning without one:

```ts
function lineWidths(text: string, widthAt: (y: number) => number, lineHeight: number) {
  const prepared = prepare(text, '16px Inter')
  const out: number[] = []
  let range = layoutNextLineRange(prepared, widthAt(0))
  while (range) {
    out.push(range.width)
    range = layoutNextLineRange(prepared, widthAt(out.length * lineHeight), range.end)
  }
  return out
}
```

- **Use boxes for images.** An image, custom emoji, formula or badge inside a line was a character with `break: 'never'` and an `extraWidth` that made up the rest of its width. Pass a box, `{ width }`, instead: its element's margin box, in whole or quarter px. A line can break on either side of a box, and its fragment has no text.

## From before 0.0.9

0.0.9 only fixed bugs, and its fixes need no code change. From any 0.0.x version, upgrade straight to 1.0.0 and follow this file.

## Code from community demos

Demos on pretext.cool and in awesome-pretext mostly pin `0.0.x` releases. Take the idea, not the calls. Before copying from one:

- Fix the argument order: `layoutNextLine(prepared, cursor, width)` is now `layoutNextLine(prepared, width, cursor)`, and the old order hangs (see [Breaking changes](#breaking-changes)).
- Replace reads of handle fields the 1.0 type doesn't show, such as `breakableFitAdvances`, which has no public equivalent, with [`glyphPositions`](patterns-glyphs.md#per-character-positions).
