// Behavioural claims the skill relies on (gate 4). Shape: { id, source, engines, recipe?, run(env) }.
// `recipe` names a function a skill `run` block declares; run.mjs loads that block first (browser only).
// `run` throws to fail. `engines` lists where it runs: 'node' runs in its own Node process;
// browser engines run in the verification page (fonts loaded, see fixtures.js) when named in BROWSERS.
// `source` records where the expectation comes from.
import {
  prepare, prepareWithSegments, layout, layoutWithLines, layoutNextLine, layoutNextLineRange,
  materializeLineRange, walkLineRanges, measureLineStats, measureNaturalWidth, clearCache,
} from '@chenglou/pretext'
import * as main from '@chenglou/pretext'
import * as rich from '@chenglou/pretext/rich-inline'
import { prepareRichInline, materializeRichInlineLineRange, walkRichInlineLineRanges } from '@chenglou/pretext/rich-inline'
import { freeze, produce } from 'immer'
import { createElement, useEffect, useMemo, useState } from 'react'
import { renderToString } from 'react-dom/server'
import { hydrateRoot } from 'react-dom/client'
import { PARITY_TEXTS, FONT, LINE_HEIGHT } from './corpus.mjs'

const BROWSERS = ['chromium', 'webkit', 'firefox']
const T = PARITY_TEXTS[0]
const LH = LINE_HEIGHT
const PROBE = 'Playwright probe, Chromium 156 / WebKit 27.2'

function assert(cond, msg) { if (!cond) throw new Error(msg) }
function throwsName(fn) { try { fn() } catch (e) { return e?.name || 'Error' } return null }
function eq(a, b) { return JSON.stringify(a) === JSON.stringify(b) }
function widths() { const w = []; for (let x = 40; x <= 420; x += 7) w.push(x); return w }

// DOM height vs layout() height over PARITY_TEXTS x widths, with and without overflow-wrap: break-word.
// `host` receives the element; `measure` reads its height in CSS px.
function parity(host, measure) {
  let withBW = 0, without = 0, total = 0
  for (const text of PARITY_TEXTS) {
    const p = prepare(text, FONT)
    for (const w of widths()) {
      total++
      const el = document.createElement('div')
      el.textContent = text
      el.style.cssText = `font:${FONT};line-height:${LH}px;width:${w}px;overflow-wrap:break-word;margin:0;padding:0`
      host.append(el)
      const expected = layout(p, w, LH).height
      if (measure(el) !== expected) withBW++
      el.style.overflowWrap = 'normal'
      if (measure(el) !== expected) without++
      el.remove()
    }
  }
  assert(withBW / total <= 0.01 && without > withBW, `break-word ${withBW}/${total} mismatches, without ${without}/${total}`)
  return { withBW, without, total }
}

function allLayouts(h) {
  const r = layoutNextLineRange(h, 200)
  return [
    layout(h, 200, LH), layoutWithLines(h, 200, LH), layoutNextLine(h, 200), r, materializeLineRange(h, r),
    walkLineRanges(h, 200, () => {}), measureLineStats(h, 200), measureNaturalWidth(h),
  ]
}

const SHY_TEXT =
  'Inter\u00ADnation\u00ADali\u00ADza\u00ADtion and in\u00ADcom\u00ADpre\u00ADhen\u00ADsi\u00ADbil\u00ADi\u00ADty meet state-of-the-art ' +
  'hy\u00ADphen\u00ADa\u00ADtion, while well-known self-contained com\u00ADpound-words and ex\u00ADtra\u00ADor\u00ADdi\u00ADnar\u00ADi\u00ADly ' +
  'long-winded sen\u00ADtences keep wrap\u00ADping across many nar\u00ADrow col\u00ADumns.'

export const CLAIMS = [
  {
    id: 'old-order-hangs', source: PROBE, engines: BROWSERS,
    run() {
      const ps = prepareWithSegments(T, FONT)
      for (const fn of [layoutNextLine, layoutNextLineRange]) {
        let c = { segmentIndex: 0, graphemeIndex: 0 }
        for (let n = 0; n < 5000; n++) {
          const l = fn(ps, c, 200)
          assert(l, `${fn.name}(p, cursor, 200) returned null after ${n} calls`)
          c = l.end
        }
      }
    },
  },
  {
    id: 'null-cursor-throws', source: PROBE, engines: BROWSERS,
    run() {
      const ps = prepareWithSegments(T, FONT)
      for (const fn of [layoutNextLine, layoutNextLineRange]) {
        assert(throwsName(() => fn(ps, 200, null)) === 'TypeError', `${fn.name} with null start did not throw TypeError`)
        assert(fn(ps, 200, undefined), `${fn.name} with undefined start returned no line`)
      }
    },
  },
  {
    id: 'swapped-prepare-throws', source: PROBE, engines: BROWSERS,
    run() {
      assert(throwsName(() => prepare('16px Georgia', 'Hello world')) === 'RangeError', "prepare('16px Georgia','Hello world') did not throw RangeError")
      assert(throwsName(() => prepare('16px Georgia', '16px Arial')) === null, "prepare('16px Georgia','16px Arial') threw")
    },
  },
  {
    id: 'prepare-handle-matrix', source: PROBE, engines: BROWSERS,
    run() {
      const pp = prepare(T, FONT)
      const r = layoutNextLineRange(pp, 200)
      assert(r && measureLineStats(pp, 200).lineCount > 0 && measureNaturalWidth(pp) > 0 && walkLineRanges(pp, 200, () => {}) > 0, 'prepare() handle rejected by a range/stats function')
      for (const [name, fn] of [['layoutNextLine', () => layoutNextLine(pp, 200)], ['layoutWithLines', () => layoutWithLines(pp, 200, LH)], ['materializeLineRange', () => materializeLineRange(pp, r)]])
        assert(throwsName(fn) === 'TypeError', `${name} on a prepare() handle did not throw TypeError`)
    },
  },
  {
    id: 'css-parity', source: PROBE + ': 0/220 with break-word, 43/220 without', engines: BROWSERS,
    run() { parity(document.body, (el) => el.getBoundingClientRect().height) },
  },
  {
    id: 'foreignobject-parity', source: PROBE + ': 0/220 at viewBox scales 0.75, 1, 2', engines: BROWSERS,
    run() {
      const NS = 'http://www.w3.org/2000/svg'
      for (const scale of [0.75, 1, 2]) {
        const svg = document.createElementNS(NS, 'svg')
        svg.setAttribute('width', String(600 * scale))
        svg.setAttribute('height', String(2000 * scale))
        svg.setAttribute('viewBox', '0 0 600 2000')
        const fo = document.createElementNS(NS, 'foreignObject')
        fo.setAttribute('x', '0'); fo.setAttribute('y', '0'); fo.setAttribute('width', '600'); fo.setAttribute('height', '2000')
        const host = document.createElementNS('http://www.w3.org/1999/xhtml', 'div')
        fo.append(host); svg.append(fo); document.body.append(svg)
        try { parity(host, (el) => el.offsetHeight) } catch (e) { throw new Error(`scale ${scale}: ${e.message}`) }
        finally { svg.remove() }
      }
    },
  },
  {
    id: 'empty-block', source: PROBE, engines: BROWSERS,
    run() {
      const d = document.createElement('div')
      d.style.cssText = `font:${FONT};line-height:${LH}px;width:200px`
      document.body.append(d)
      const h = d.getBoundingClientRect().height
      d.remove()
      assert(h === 0, `empty div is ${h}px tall`)
      assert(eq(layout(prepare('', FONT), 200, LH), { lineCount: 0, height: 0 }), "layout('') is not 0 lines")
    },
  },
  {
    id: 'textarea-extra-line', source: PROBE, engines: BROWSERS,
    run() {
      const ta = document.createElement('textarea')
      ta.rows = 1
      ta.style.cssText = `font:${FONT};line-height:${LH}px;width:200px;padding:0;border:0;overflow:hidden;resize:none`
      document.body.append(ta)
      for (const [value, shown] of [['a\n', 2], ['', 1]]) {
        ta.value = value
        const lines = ta.scrollHeight / LH
        const counted = layout(prepare(value, FONT, { whiteSpace: 'pre-wrap' }), 200, LH).lineCount
        assert(lines === shown && counted === shown - 1, `${JSON.stringify(value)}: textarea shows ${lines} lines, layout says ${counted}`)
      }
      ta.remove()
    },
  },
  {
    id: 'invalid-font-throws', source: PROBE + '; upstream: 1.5em throws in Firefox', engines: BROWSERS,
    run({ engine }) {
      for (const f of ['', '16px', 'var(--f)']) assert(throwsName(() => prepare(T, f)) === 'RangeError', `font ${JSON.stringify(f)} did not throw RangeError`)
      if (engine === 'chromium' || engine === 'webkit') assert(throwsName(() => prepare(T, '1.5em Arial')) === null, "'1.5em Arial' threw")
      if (engine === 'chromium') assert(throwsName(() => prepare(T, 'caption')) === null, "'caption' threw in Chromium")
      if (engine === 'webkit') assert(throwsName(() => prepare(T, 'caption')) !== null, "'caption' did not throw in WebKit")
    },
  },
  {
    id: 'fonts-load-rejects', source: PROBE, engines: BROWSERS,
    async run() {
      for (const f of ['', '16px', 'Arial 16px']) {
        let name = null
        try { await document.fonts.load(f) } catch (e) { name = e instanceof DOMException ? e.name : 'not a DOMException' }
        assert(name === 'SyntaxError', `document.fonts.load(${JSON.stringify(f)}) gave ${name}`)
      }
    },
  },
  {
    id: 'letterspacing', source: PROBE, engines: BROWSERS,
    run() {
      assert(throwsName(() => prepare(T, FONT, { letterSpacing: NaN })) !== null, 'letterSpacing NaN did not throw')
      const a = layout(prepare(T, FONT, { letterSpacing: undefined, whiteSpace: undefined, wordBreak: undefined }), 200, LH)
      assert(eq(a, layout(prepare(T, FONT), 200, LH)), 'undefined options changed the result')
    },
  },
  {
    id: 'structured-clone', source: PROBE, engines: BROWSERS,
    run() {
      for (const h of [prepare(T, FONT), prepareWithSegments(T, FONT)])
        assert(eq(layout(structuredClone(h), 200, LH), layout(h, 200, LH)), 'structuredClone(handle) lays out differently')
    },
  },
  {
    id: 'layoutline-is-object', source: PROBE, engines: BROWSERS,
    run() {
      const [line] = layoutWithLines(prepareWithSegments(T, FONT), 200, LH).lines
      assert(typeof line === 'object' && typeof line.text === 'string', 'LayoutLine is not an object with text')
      assert(throwsName(() => line.replace(/x/g, '')) === 'TypeError', 'line.replace did not throw')
    },
  },
  {
    id: 'box-fragment', source: PROBE, engines: BROWSERS,
    run() {
      const p = prepareRichInline([{ text: 'Ship ', font: FONT }, { width: 30 }, { text: ' it', font: FONT }])
      const frags = []
      walkRichInlineLineRanges(p, 400, (r) => frags.push(...materializeRichInlineLineRange(p, r).fragments))
      const box = frags.find((f) => f.itemIndex === 1)
      assert(box && box.text === '' && box.sourceStart === 0 && box.sourceEnd === 0 && box.occupiedWidth === 30, `box fragment ${JSON.stringify(box)}`)
      for (const bad of [{ width: -1 }, { width: NaN }, {}])
        assert(throwsName(() => prepareRichInline([bad])) === 'RangeError', `item ${JSON.stringify(bad)} did not throw RangeError`)
    },
  },
  {
    id: 'soft-hyphen-break', source: PROBE + '; src/measurement.ts:542-583', engines: BROWSERS,
    run() {
      let shy = 0, realHyphen = 0, lines = 0
      for (const text of [PARITY_TEXTS[3], SHY_TEXT]) for (const whiteSpace of ['normal', 'pre-wrap']) {
        const p = prepareWithSegments(text, FONT, { whiteSpace })
        assert(p.segments.join('') === text, 'segments.join("") differs from the text')
        for (const w of widths()) for (const line of layoutWithLines(p, w, LH).lines) {
          lines++
          const truth = line.end.graphemeIndex === 0 && line.end.segmentIndex > 0 && p.segments[line.end.segmentIndex - 1].endsWith('\u00AD')
          const detected = line.text.endsWith('-') && line.end.graphemeIndex === 0 && p.kinds[line.end.segmentIndex - 1] === 'soft-hyphen'
          assert(truth === detected, `w=${w} ${whiteSpace}: detection ${detected} but break at soft hyphen ${truth} for ${JSON.stringify(line.text)}`)
          if (truth) { shy++; assert(line.text.endsWith('-'), `soft-hyphen line does not end in '-': ${JSON.stringify(line.text)}`) }
          else if (line.text.endsWith('-')) realHyphen++
        }
      }
      assert(shy > 0 && realHyphen > 0, `corpus too weak: ${shy} soft-hyphen breaks, ${realHyphen} real-hyphen ends in ${lines} lines`)
    },
  },
  {
    id: 'rich-source-offsets', source: PROBE + ': Inter at width 400', engines: BROWSERS,
    run() {
      const p = prepareRichInline([{ text: 'Ship', font: FONT }, { text: ' it now', font: FONT }])
      const out = []
      walkRichInlineLineRanges(p, 400, (r) => out.push(materializeRichInlineLineRange(p, r).fragments))
      const [a, b] = out[0] || []
      assert(out.length === 1 && a && b, `expected one line with two fragments, got ${JSON.stringify(out)}`)
      assert(a.sourceStart === 0 && a.sourceEnd === 4, `Ship is ${a.sourceStart}-${a.sourceEnd}`)
      assert(b.text === 'it now' && b.sourceStart === 1 && b.sourceEnd === 7 && b.gapBefore > 0 && b.gapItemIndex === 1, `second fragment ${JSON.stringify(b)}`)
    },
  },
  {
    id: 'deep-freeze', source: PROBE, engines: BROWSERS,
    run() {
      const deepFreeze = (o) => { for (const v of Object.values(o)) if (v && typeof v === 'object') deepFreeze(v); return Object.freeze(o) }
      assert(throwsName(() => deepFreeze(prepareWithSegments(T, FONT))) === 'TypeError', 'recursive freeze reaching the typed array did not throw')
      const h = prepareWithSegments(T, FONT)
      const want = allLayouts(h)
      Object.freeze(h)
      assert(eq(allLayouts(h), want), 'shallow-frozen handle lays out differently')
    },
  },
  {
    id: 'immer-freeze', source: PROBE + ' with Immer 11', engines: BROWSERS,
    run() {
      const want = allLayouts(prepareWithSegments(T, FONT))
      const frozen = freeze(prepareWithSegments(T, FONT), true)
      assert(eq(allLayouts(frozen), want), 'Immer freeze(h, true) changed layout results')
      const state = produce({ h: prepareWithSegments(T, FONT), n: 0 }, (d) => { d.n = 1 })
      assert(eq(allLayouts(state.h), want), 'handle from produce() lays out differently')
    },
  },
  {
    id: 'space-natural-width', source: PROBE, engines: BROWSERS,
    run() {
      assert(measureNaturalWidth(prepareWithSegments(' ', FONT)) === 0, 'a lone space has non-zero width')
      assert(measureNaturalWidth(prepareWithSegments(' ', FONT, { whiteSpace: 'pre-wrap' })) > 0, 'pre-wrap space measures 0')
      assert(measureNaturalWidth(prepareWithSegments('\u00A0', FONT)) > 0, 'U+00A0 measures 0')
    },
  },
  {
    id: 'bubble-width-dom', source: PROBE + ': 0/60 mismatches; Math.floor and ceil - 1 give 6/60 each', engines: BROWSERS, recipe: 'bubbleWidth',
    run() {
      const bubbleWidth = globalThis.__recipes.bubbleWidth
      const PAD = 12
      const base = `box-sizing:border-box;padding:0 ${PAD}px;font:${FONT};line-height:${LH}px;overflow-wrap:break-word;margin:0;border:0`
      const bad = []
      for (const text of PARITY_TEXTS) for (let w = 120; w <= 400; w += 20) {
        const width = bubbleWidth(text, FONT, w, PAD)
        const el = document.createElement('div')
        el.textContent = text
        el.style.cssText = `width:${width}px;${base}`
        document.body.append(el)
        const height = el.getBoundingClientRect().height
        el.style.cssText = `display:inline-block;max-width:${w + 2 * PAD}px;${base}`
        const cssWidth = el.getBoundingClientRect().width
        el.remove()
        const want = layout(prepare(text, FONT), w, LH).height
        if (height !== want) bad.push(`w=${w} ${JSON.stringify(text.slice(0, 16))}: ${height}px tall, layout() says ${want}`)
        if (width > cssWidth) bad.push(`w=${w} ${JSON.stringify(text.slice(0, 16))}: ${width}px wider than CSS's ${cssWidth}px`)
      }
      assert(bad.length === 0, `${bad.length} mismatches: ${bad.slice(0, 3).join('; ')}`)
    },
  },
  {
    id: 'export-count', source: 'dist/layout.d.ts + dist/rich-inline.d.ts', engines: ['node'],
    run() {
      const count = (m) => Object.values(m).filter((v) => typeof v === 'function').length
      assert(count(main) === 12 && count(rich) === 5, `main ${count(main)}, rich-inline ${count(rich)} functions`)
    },
  },
  {
    id: 'node-throws', source: PROBE + ', Node', engines: ['node'],
    run() {
      let msg = null
      try { prepare(T, FONT) } catch (e) { msg = `${e.name}: ${e.message}` }
      assert(msg === 'Error: Text measurement requires OffscreenCanvas or a DOM canvas context.', `prepare in Node gave ${msg}`)
    },
  },
  {
    id: 'offscreen-shim', source: PROBE + ', Node', engines: ['node'],
    run() {
      globalThis.OffscreenCanvas = class { getContext() { return { font: '', measureText: (s) => ({ width: s.length * 8 }) } } }
      try {
        assert(layout(prepare(T, FONT), 200, LH).lineCount > 1, 'shimmed prepare/layout gave no lines')
        for (const f of ['', 'Arial 16px']) assert(throwsName(() => prepare(T, f)) === null, `font ${JSON.stringify(f)} threw under the shim`)
      } finally { delete globalThis.OffscreenCanvas; clearCache() }
    },
  },
  {
    id: 'react-ssr', source: PROBE + ', react-dom 19 renderToString / hydrateRoot', engines: ['node', ...BROWSERS],
    async run({ engine }) {
      const Memo = () => { useMemo(() => prepare(T, FONT), []); return createElement('div', null, 'x') }
      const Effect = () => {
        const [h, setH] = useState(null)
        useEffect(() => { setH(layout(prepare(T, FONT), 200, LH).height) }, [])
        return createElement('div', null, h === null ? '' : String(h))
      }
      if (engine === 'node') {
        assert(throwsName(() => renderToString(createElement(Memo))) !== null, 'useMemo(() => prepare()) rendered on the server')
        assert(renderToString(createElement(Effect)) === '<div></div>', 'useEffect form did not render on the server')
        return
      }
      const errors = []
      const origError = console.error
      console.error = (...a) => { errors.push(a.join(' ')) }
      try {
        const host = document.createElement('div')
        host.innerHTML = renderToString(createElement(Effect))
        document.body.append(host)
        hydrateRoot(host, createElement(Effect), { onRecoverableError: (e) => errors.push(String(e)) })
        for (let i = 0; i < 50 && !host.textContent; i++) await new Promise((r) => setTimeout(r, 20))
        assert(errors.length === 0, `hydration errors: ${errors.join(' | ')}`)
        assert(Number(host.textContent) > 0, `effect did not render a height: ${JSON.stringify(host.textContent)}`)
        host.remove()
      } finally { console.error = origError }
    },
  },
]
