# Integration Patterns: Frameworks, Loading, Runtimes

How Pretext fits into an app: framework components, loading it as an enhancement, using it without a bundler, and running it outside the browser. The measuring recipes themselves are in [patterns-sizing.md](patterns-sizing.md) and [patterns-flow.md](patterns-flow.md).

## Table of Contents

1. [Framework integration idiom](#framework-integration-idiom)
2. [Progressive enhancement](#progressive-enhancement)
3. [Vendoring without a bundler](#vendoring-without-a-bundler)
4. [Outside the browser](#outside-the-browser)

---

## Framework integration idiom

**A prepared handle is derived data.** It is a pure function of the text, font and options, so memoize it on the client and lay it out per width. Two rules shape every framework version:

- **Never `prepare()` during a server render.** A server render runs in Node, where `prepare()` throws ([accuracy.md](accuracy.md#outside-the-browser)). In Next.js that includes the server render of a `'use client'` component. Prepare in an effect, which runs only in the browser.
- **Prepare after the font loads**, or the handle holds the fallback font's widths ([accuracy.md](accuracy.md#fonts)).

### React

```jsx
import { useEffect, useState } from 'react'

function MeasuredText({ text, font, width, lineHeight }) {
  const [prepared, setPrepared] = useState(null)

  useEffect(() => {
    let current = true
    document.fonts.load(font, text) // a malformed font string rejects here, before prepare() runs
      .then(() => { if (current) setPrepared(prepare(text, font)) })
      .catch((e) => console.error(e))
    return () => { current = false } // text or font changed before the font loaded
  }, [text, font])

  // undefined until measured: the server render and the first client render agree
  const height = prepared ? layout(prepared, width, lineHeight).height : undefined
  return (
    <div style={{ font, lineHeight: `${lineHeight}px`, width, overflowWrap: 'break-word', height }}>
      {text}
    </div>
  )
}
```

- The handle goes into state once the font has loaded. Putting a handle in state, or in a store such as Immer's, is fine ([accuracy.md](accuracy.md#outside-the-browser)).
- `width` is the width you set on the element, passed down. A width read back from the page is rounded and scaled under zoom ([accuracy.md](accuracy.md#widths)).
- `layout()` is arithmetic over the cached widths, so deriving the height on every render is fine. Measuring inside a `ResizeObserver` callback instead goes stale when the text changes without a resize.
- `useMemo(() => prepare(text, font))` runs during the server render and throws there.

### Vue 3 and Svelte 5

Untested; these follow the same rules. Vue runs `onMounted` only in the browser:

```js
import { onMounted, shallowRef, watch } from 'vue'

const prepared = shallowRef(null) // shallow: Vue doesn't proxy the handle's internals
onMounted(() => {
  watch([text, font], ([t, f]) => {
    document.fonts.load(f, t).then(() => { prepared.value = prepare(t, f) }).catch((e) => console.error(e))
  }, { immediate: true })
})
```

Svelte runs `$effect` only in the browser:

```js
let prepared = $state.raw(null) // raw: no proxy around the handle
$effect(() => {
  const t = text, f = font // read synchronously, so the effect tracks them
  document.fonts.load(f, t).then(() => { prepared = prepare(t, f) }).catch((e) => console.error(e))
})
```

In each, prepare once per text, font and options on the client after the font loads, pass the width you set on the element, and call `layout()` whenever the width changes.

---

## Progressive enhancement

Load Pretext as an enhancement, so the page works without it:

```html
<script src="app.js"></script>                <!-- the page, without Pretext -->
<script type="module" src="enhance.js"></script> <!-- Pretext on top -->
```

In `enhance.js`, import Pretext dynamically so a failure to load lands in the same `catch`:

```js
try {
  enhanceWithPretext(await import('@chenglou/pretext'))
} catch (e) {
  console.error(`Pretext enhancement skipped: ${e.name}`, e) // the page already works without it
}
```

- `e.name` tells the failures apart: a `RangeError` is a bad font string, a plain `Error` is a missing Canvas, and a `SyntaxError` at load means a runtime without Unicode property escapes (`\p{...}`), which Pretext needs.
- Log it rather than swallow it: a fallback that hides a `RangeError` hides a bug in your font strings.

---

## Vendoring without a bundler

**Bundlers handle Pretext as is.** It ships ES modules with `"sideEffects": false`; Vite, webpack 5, esbuild, Rollup, Next.js and Astro import it directly. Use the recipe below only where you can't run a bundler.

- **ES modules only.** The package is `"type": "module"` with no CommonJS build. A CommonJS-only consumer needs an ESM transform or an upgrade.
- **Three exports:** `.`, `./rich-inline` and `./package.json`. Deep imports such as `@chenglou/pretext/dist/layout.js` are blocked by the exports map.

```bash
npm pack @chenglou/pretext
tar -xzf chenglou-pretext-*.tgz
cd package
npx esbuild dist/layout.js --bundle --format=esm --minify --outfile=pretext.esm.min.js
npx esbuild dist/rich-inline.js --bundle --format=esm --minify --outfile=pretext-rich-inline.esm.min.js # if you use it
```

Commit the output and import it by path:

```html
<script type="module">
  import { prepare, layout } from '/static/vendor/pretext.esm.min.js'
</script>
```

Upstream gives about 40 KB gzipped for the main entry and 44 KB for `rich-inline`, most of it each browser's line-break data ([accuracy.md](accuracy.md#bundle-size)). Each bundle includes the shared code, so vendoring both duplicates it.

---

## Outside the browser

Node has no Canvas, so every `prepare()` there throws `Error: Text measurement requires OffscreenCanvas or a DOM canvas context.` Upstream says the same of Bun, jsdom and happy-dom. [accuracy.md](accuracy.md#outside-the-browser) lists what a runtime needs.

**A measuring shim.** Define a global `OffscreenCanvas` whose 2D context measures text your own way, for example with a font library that reads the same font files. Install it before the first `prepare()`: Pretext creates its context then and keeps it.

```ts
function installMeasuringShim(measure: (text: string, font: string) => number) {
  class MeasuringCanvas {
    getContext() {
      const context = { font: '', measureText: (text: string) => ({ width: measure(text, context.font) }) }
      return context
    }
  }
  Object.assign(globalThis, { OffscreenCanvas: MeasuringCanvas })
}
```

- **Exact or an estimate.** Lines break by Chrome's rules over the widths your `measure` returns. That is exact where you paint those lines yourself with the same measurements, as when rendering an image or PDF on the server. For text a browser will paint, it is an estimate: the browser measures with its own fonts and engine.
- **No font validation.** Under a shim, Pretext can't tell a bad font string: `''` and `'Arial 16px'` don't throw. Validate font strings yourself.
- **Server rendering.** Don't install a shim to make a server render of browser text work: its heights are estimates, and the client's differ. Prepare on the client, as in [Framework integration idiom](#framework-integration-idiom).
- Text in Thai and other scripts written without spaces also needs the runtime's word segmenter: see the table in [accuracy.md](accuracy.md#outside-the-browser).
