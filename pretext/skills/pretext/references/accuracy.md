# Accuracy: Making Painted Text Match `layout()`

Pretext predicts how the browser wraps text. The prediction holds only while the text you paint has the same string, font, language, width and CSS as the text you prepared. This file lists what has to match and what Pretext does not model. It follows upstream's README [Caveats](https://github.com/chenglou/pretext/blob/v1.0.0/README.md#caveats) and API notes for 1.0.0.

Coming from an older Pretext? Start with [migration.md](migration.md).

## Table of Contents

- [Painting](#painting)
- [Fonts](#fonts)
- [Language](#language)
- [Widths](#widths)
- [CSS Pretext does not model](#css-pretext-does-not-model)
- [Outside the browser](#outside-the-browser)
- [Engine versions](#engine-versions)
- [Bundle size](#bundle-size)

## Painting

**Paint one element per paragraph and let the browser wrap it.** Give the element the same `font`, the same `line-height` in px, the content `width` you passed to `layout()`, and `overflow-wrap: break-word`. The browser then wraps it to the same lines.

```ts claim=css-parity
function paintParagraph(el: HTMLElement, text: string, maxWidth: number) {
  const font = '16px Inter'
  const lineHeight = 20
  const width = Math.floor(maxWidth * 4) / 4 // quarter px, never past maxWidth: see Widths
  el.style.font = font
  el.style.lineHeight = `${lineHeight}px`
  el.style.width = `${width}px` // the content width: padding and border go outside it
  el.style.overflowWrap = 'break-word'
  el.textContent = text
  return layout(prepare(text, font), width, lineHeight).height
}
```

- `overflow-wrap: break-word` is not CSS's default, and it matters. In our checks with the Inter web font, the element matched `layout()` at every width tried with it, and missed at about one width in five without it.
- `width` here is the content box. With `box-sizing: border-box`, add the padding and border to it.
- An SVG `<foreignObject>` holding such an element matches too, at any `viewBox` scale we tried.
- Check it once in your browser, as upstream advises. Paint a few real paragraphs at a few widths and compare the element's height with `layout()`'s. A mismatch almost always means one of the sections below.

**Paint a line at a time only when the browser cannot wrap the text for you:**

- Canvas `fillText()` and SVG `<text>` don't wrap. Use `prepareWithSegments()` and `layoutWithLines()`, and draw each line's `text` (a line is an object, not a string).
- Lines of different widths, such as text flowing around an image. Use `layoutNextLineRange()`, which takes the width before the cursor.
- Rich inline text with several fonts or padded pieces. Paint each line from its fragments.
- A line painted alone from `pre-wrap` text can wrap again in its element. Paint such lines with `white-space: pre`.

**Measure the exact string you paint.** Pretext measures the characters it is given. Anything that changes them after `prepare()` runs, such as CSS `text-transform`, `.toUpperCase()`, `.normalize()`, smart-quote substitution or number formatting, makes the painted text wider or narrower than measured. Apply the change first, and prepare and paint the result:

```ts
// Wrong: measures mixed case and paints capitals, which are wider
const wrong = prepare(text, '16px Inter')
el.style.textTransform = 'uppercase'

// Right: transform once, then measure and paint that string
const shown = text.toUpperCase()
const prepared = prepare(shown, '16px Inter')
const { height } = layout(prepared, 320, 20)
el.textContent = shown
```

Typical cases are comic lettering, all-caps headlines and button labels styled with `text-transform`.

**Mixed-direction text** (English with Arabic or Hebrew):

- Pretext gives no bidi levels and no visual order. Render each paragraph as one DOM element with its direction set, such as `dir="auto"`, and the browser orders every line.
- In `pre-wrap` text every newline starts a new paragraph. Set `unicode-bidi: plaintext` on the element so each paragraph takes its own direction, or prepare and paint each paragraph apart.
- Lines drawn separately, such as with Canvas `fillText()`, are each ordered as their own paragraph. Numbers or punctuation next to a line break can then come out in a different order from the browser's.
- Segment widths are for line breaking. They can't position individual characters in Arabic or mixed-direction text.

## Fonts

**Prepare text only after its font has loaded.** Before that, Canvas measures the fallback font, and every width is wrong.

```ts claim=fonts-load-rejects
async function prepareLoaded(text: string, font: string) {
  // Rejects with a DOMException named SyntaxError for a malformed font such as '', '16px' or 'Arial 16px'
  await document.fonts.load(font, text)
  return prepare(text, font)
}
```

- Pass the text as the second argument. A family split by `unicode-range`, as every Google Fonts family is, loads only the parts that text needs.
- Waiting on the `ready` promise of `document.fonts` is not enough. It resolves without waiting for a font that nothing on the page has used yet.
- `document.fonts.load()` rejects a malformed font string with a `SyntaxError` before `prepare()` ever runs, so that is the error you see, not Pretext's `RangeError`.
- **A font that arrives late.** If text was prepared before its web font loaded, call `clearCache()` once the font arrives and prepare that text again. Widths measured earlier are the fallback font's.
- **`FontFace` order matters in Safari**, per upstream. Add a `FontFace` to `document.fonts` before it loads, or call `clearCache()` after adding it. Until then Safari keeps the fallback font's widths.

**Name fonts the way Canvas resolves them:**

- Use the English family name: `"Hiragino Kaku Gothic ProN"`, not `"ヒラギノ角ゴ ProN"`, and not a face name such as `"Avenir Next Demi Bold"`.
- List a named font for each script your text uses, such as `16px "Helvetica Neue", "PingFang SC", "Geeza Pro", sans-serif`. A generic family, or a character missing from every named font, may paint in a different font from the one Pretext measured. Upstream notes that under `"Helvetica Neue"` alone, kana that the system's fallback draws still measure apart in Chrome on macOS, so name a Japanese font after it.
- `system-ui` and `-apple-system` are unreliable on macOS. Canvas resolves them to a different font from the one the page paints. Use a named font. Upstream's [platform bug ledger](https://github.com/chenglou/pretext/blob/v1.0.0/PLATFORM_BUGS.md) has the details.

**Sizes and emoji:**

- Pass sizes in px. If your CSS uses `rem` or `em`, resolve them to px once, higher up in your app, and pass that string.
- Prefer whole-pixel sizes. Upstream says Firefox measures canvas text at a rounded font size, so a size such as `13.33px` can wrap differently there.
- On macOS a small emoji's painted width depends on `devicePixelRatio`. When the ratio changes, as when the page is zoomed, call `clearCache()` and prepare text with emoji again:

```ts
function onPixelRatioChange(callback: () => void) {
  const query = matchMedia(`(resolution: ${devicePixelRatio}dppx)`)
  query.addEventListener('change', () => { callback(); onPixelRatioChange(callback) }, { once: true })
}
onPixelRatioChange(() => clearCache()) // then prepare and lay out text with emoji again
```

**Font strings from the page:**

- `getComputedStyle(el).font` can be an empty string. That happens for an element not mounted yet, or one that sets a longhand the shorthand can't hold, such as `font-variant-numeric`. An empty font throws a `RangeError` in `prepare()`, so check it first:

```ts claim=invalid-font-throws
function computedFont(el: Element): string {
  const font = getComputedStyle(el).font
  if (!font) throw new Error('No font shorthand for this element: build the font string yourself')
  return font
}
```

- Which strings throw differs by engine, since each browser throws for what its own Canvas ignores:
  - `''`, `'16px'` and `'var(--f)'` throw a `RangeError` in Chrome and Safari in our checks. Upstream lists `'Arial 16px'` (family first) too.
  - `'1.5em Arial'` works in Chrome and Safari. Upstream says Firefox throws for a size that isn't an absolute length, such as `1.5em` or `100%`.
  - `'caption'` and the other system-font keywords work in Chrome and throw in Safari. Upstream says Firefox throws for them too.
  - The safe form everywhere is an explicit px size and a named family, such as `'600 16px Inter'`.

## Language

The page's language changes which fonts paint and where lines break, so Pretext reads it too.

- **Set `<html lang>`.** Pretext reads the language from `<html lang>`.
- **Pretext doesn't read an element's own `lang`.** A `lang` on a paragraph changes how the browser paints that paragraph, while Pretext still measures it under the page's language. `setLocale()` takes the page's language, not the user's or a paragraph's: use it where there is no `<html lang>`, as in a worker.
- **Without a page language, browsers fall back to their own.** Upstream says Chrome then lays text out under Chrome's UI language, and Firefox under the browser's or system's. Under a Chinese UI, for example, curly double quotes follow CJK bracket rules in Chrome, so `他说“OK”然后` breaks differently. Pretext follows Chrome's UI language there too, so the same page can wrap differently for different users. Setting `lang` makes it predictable.
- **Generic families change with the language.** `sans-serif`, `serif` or `monospace` can name a different font on a `ko` page than on an `en` page. Upstream gives Safari's examples: Apple SD Gothic Neo for `sans-serif` on a `ko` page and Menlo for `monospace` on an `en` page. Name a font instead.
- **Prepare again after changing `lang`.** Existing handles keep the old widths and line-break rules. The same goes for `setLocale()`, which only affects later preparations.

## Widths

- **Pass the width you set on the element**, in CSS px. Don't pass a width read back from the page: it is rounded, and scaled under zoom.
- **Round a width you compute** to whole or quarter px. Browsers round other widths to their layout unit. Round down and cap at the space you have, so the element never grows past it:

```ts
function columnContentWidth(container: number, share: number, maxWidth: number) {
  return Math.min(maxWidth, Math.floor(container * share * 4) / 4) // quarter px
}
const colWidth = columnContentWidth(containerWidth, 0.3, 480)
el.style.width = `${colWidth}px`
const { height } = layout(prepare(text, '16px Inter'), colWidth, 20)
```

- **Firefox rounds fractional font sizes**, per upstream, so a size such as `13.33px` can wrap differently there. Prefer whole-pixel sizes.

## CSS Pretext does not model

Pretext targets `white-space: normal` and `pre-wrap`, `word-break: normal` and `keep-all`, `overflow-wrap: break-word`, `line-break: auto`, and `letter-spacing` passed to `prepare()` as a px number. Text painted with any of the following can wrap differently from what `layout()` says.

**Wrapping:**

- `text-wrap: balance` and `text-wrap: pretty`.
- `hyphens: auto`. Pretext doesn't hyphenate. Insert soft hyphens (`'­'`) yourself before preparing, and paint the same string. A line broken at a soft hyphen ends with a hyphen, which its `width` counts.
- `hanging-punctuation`.
- `line-break` other than `auto`.

**Rendering:**

- `text-rendering: optimizeLegibility`.
- `font-kerning` other than the default, and `word-spacing`, including word spacing the text inherits from the page.
- `font-feature-settings`, `font-variation-settings`, `font-variant-numeric` and `font-optical-sizing`. Variable-font settings apply only when the font string expresses them, such as the weight.

**Browser settings:**

- **Minimum font size.** Upstream says Chrome and Firefox let people set one, and text below it paints at the minimum while Pretext measures the size you pass. If your app uses small sizes, measure once the height of an element with `font-size: 1px; line-height: 1`. That height is the minimum size in px: pass Pretext the larger of it and your size.
- **iPhone text enlargement.** iPhone Safari can enlarge the text of a block wider than the screen. Set `-webkit-text-size-adjust: 100%` on the page.

**Spacing:**

- Tabs follow the browser default `tab-size: 8`. Another `tab-size` isn't modeled.
- In `pre-wrap`, Pretext treats a lone `\r` as a line break, but browsers don't. Normalize `\r` to `\n` in the text you paint, not only in the text you measure.

## Outside the browser

**What a runtime needs, and what fails without it:**

| Needs | Without it |
|---|---|
| Unicode property escapes (`\p{…}`) | Pretext can't load: a `SyntaxError` |
| A Canvas 2D context, or a global `OffscreenCanvas` | Every `prepare()` throws `Error: Text measurement requires OffscreenCanvas or a DOM canvas context.` This is the case in Node, and upstream says in Bun, jsdom and happy-dom too |
| `Intl.Segmenter` | Preparing text in Thai, Lao, Khmer, Myanmar or another Southeast Asian script written without spaces throws. Other text works |

- **Server rendering.** `prepare()` throws during a server render, even inside a `'use client'` component. Call it only on the client, such as in an effect.
- **A measuring shim.** Outside a browser you can define, before the first `prepare()`, a global `OffscreenCanvas` class that measures text your own way. Lines then break by Chrome's rules over your widths, which is exact only where you paint those lines yourself.
- **React Native.** Upstream says a runtime whose `navigator` has no `userAgent` follows Chrome's rules, and still needs a measuring `OffscreenCanvas`.

**Workers.** `OffscreenCanvas` measures in a worker, but a worker has no `<html lang>`. Send the page's `document.documentElement.lang` and pass it to `setLocale()` once, before the worker's first `prepare()`:

```ts
let localeSet = false
self.onmessage = (event: MessageEvent) => {
  const { lang, text, font, width, lineHeight } = event.data // the page sends document.documentElement.lang
  if (!localeSet) { setLocale(lang); localeSet = true } // '' means a page without a language
  self.postMessage(layout(prepare(text, font), width, lineHeight))
}
```

- Call `setLocale()` once, not per message: it also calls `clearCache()`.
- Upstream says that in a worker, small emoji measure too wide in Chrome and Firefox on macOS. Prepare emoji-heavy text on the page if that matters.

**Handles are tied to the version that made them.**

- A handle made by another version of Pretext, such as one kept in IndexedDB or sent by a worker on an older bundle, throws a `TypeError` in this version's line functions. Store the text, font and options, and prepare again.
- Within one version, a handle lays out the same after `structuredClone()`.

**Freezing handles.** A handle holds a typed array.

- A hand-written recursive freeze that reaches the typed array throws a `TypeError`.
- A shallow `Object.freeze(handle)` works, and so do Immer's `freeze(handle, true)` and `produce()`. A handle kept in an Immer store keeps working.

## Engine versions

- **Safari.** Pretext follows Safari 27's line breaking. Upstream says Safari 26, on macOS 26 and iOS 26, breaks differently around curly quotes and guillemets, after punctuation with `word-break: keep-all`, and at U+2028 and U+2029.
- **Every browser on iPhone and iPad**, and in-app web views on iPhone, iPad and Mac, use WebKit, so Pretext gives them Safari's rules, per upstream.
- **Engines Pretext doesn't recognize**, such as some TV web views, follow Chrome's rules.
- **Older Chromium.** Upstream says `letterSpacing` in Arabic and other joined scripts follows Chrome 149's rule. On Chromium 138 to 148, such text measures off by the spacing times its spaces, and before 138 by the spacing times its letters. An older Electron app or web view can be on such a version.

## Bundle size

Upstream's [CHANGELOG](https://github.com/chenglou/pretext/blob/v1.0.0/CHANGELOG.md) gives these figures for 1.0.0:

| Entry | Gzipped | Minified |
|---|---|---|
| `@chenglou/pretext` | about 40 KB | 95 KB |
| `@chenglou/pretext/rich-inline` | about 44 KB | 107 KB |

About 23 KB gzipped of each is each browser's line-break and grapheme data, with the code that reads it.
