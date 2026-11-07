// Behavioural checks for `run` recipes, keyed by the first name in the block's id=.
// Each entry: { check(fn, env), mutants: [fn, ...] }. `check` runs in the page after the recipe's
// block loads; it throws (or returns false) to fail. Gate 2 requires `check` to pass on the
// documented recipe and to fail on every mutant. Every entry needs a `run` block with a matching id=.
import {
  prepareRichInline, walkRichInlineLineRanges, materializeRichInlineLineRange, measureRichInlineStats,
} from '@chenglou/pretext/rich-inline'
import {
  prepare, prepareWithSegments, layout, layoutWithLines, layoutNextLine, layoutNextLineRange, measureLineStats, measureNaturalWidth,
} from '@chenglou/pretext'
import { FONT, PARITY_TEXTS, CLAMP_TEXTS, PAINTABLE_TEXT, STREAM_REPLY, GLYPH_TEXTS, GLYPH_PAINT_TEXTS, glyphPaintRatio } from './corpus.mjs'

function assert(cond, msg) { if (!cond) throw new Error(msg) }
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const show = (s) => JSON.stringify(s)
const SHY = '\u00AD'
const U2010 = '\u2010'
const trimEndSpace = (s) => (s.endsWith(' ') ? s.slice(0, -1) : s)
const isSoftHyphenBreak = (prepared, line) =>
  line.text.endsWith('-') && line.end.graphemeIndex === 0 && prepared.kinds[line.end.segmentIndex - 1] === 'soft-hyphen'
const preWrapWidth = (s) => measureNaturalWidth(prepare(s, FONT, { whiteSpace: 'pre-wrap' }))
const graphemes = (s) => [...new Intl.Segmenter().segment(s)].map((g) => g.segment)

// Runs fn with console.error replaced; returns [result, number of console.error calls].
function withErrorSpy(fn) {
  const orig = console.error
  let calls = 0
  console.error = () => { calls++ }
  try { return [fn(), calls] } finally { console.error = orig }
}

// ---------- reference ports the mutants are built from ----------

// The text-measuring wrapper, with the faults each mutant adds.
function refMeasureText({ log = true, lineHeightIsPx = false } = {}) {
  return (text, fontFamily, fontSize, maxWidth, lineHeight = 1.5) => {
    try {
      const r = layout(prepare(text, `${fontSize}px ${fontFamily}`), maxWidth, lineHeightIsPx ? lineHeight : fontSize * lineHeight)
      return { height: r.height, lines: r.lineCount }
    } catch (e) {
      if (log) console.error(e)
      return null
    }
  }
}
function refMeasureTextExtended({ log = true, dropLetterSpacing = false } = {}) {
  return ({ text, fontFamily, fontSize, maxWidth, lineHeight = 1.5, whiteSpace, wordBreak, letterSpacingEm }) => {
    try {
      const letterSpacing = letterSpacingEm === undefined || dropLetterSpacing ? undefined : fontSize * letterSpacingEm
      const r = layout(prepare(text, `${fontSize}px ${fontFamily}`, { whiteSpace, wordBreak, letterSpacing }), maxWidth, fontSize * lineHeight)
      return { height: r.height, lines: r.lineCount }
    } catch (e) {
      if (log) console.error(e)
      return null
    }
  }
}

// Clamp port (ellipsis.model.ts at v1.0.0 plus the skill's two changes); options switch the changes off.
function refFillLine({ keepHyphen = false } = {}) {
  return (prepared, font, start, room) => {
    const spaceWidth = measureNaturalWidth(prepare('\u00A0', font))
    let text = '', cursor = start, x = 0
    for (;;) {
      const piece = layoutNextLine(prepared, room - x, cursor)
      if (piece === null || piece.width > room - x + 1 / 64) return text
      if (!keepHyphen && isSoftHyphenBreak(prepared, piece)) {
        const kept = piece.text.slice(0, -1)
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
}
function refClampLines({ fill = refFillLine(), trim = true, alwaysCut = false } = {}) {
  return (prepared, font, width, maxLines, tailWidth) => {
    const lines = []
    let cursor, lastStart, lastWidth = 0
    for (let i = 0; i < maxLines; i++) {
      const line = layoutNextLine(prepared, width, cursor)
      if (line === null) return lines
      lines.push(line.text)
      lastStart = cursor
      lastWidth = line.width
      cursor = line.end
    }
    if (layoutNextLineRange(prepared, width, cursor) === null) return lines
    const last = lines.length - 1
    const cut = fill(prepared, font, lastStart, width - tailWidth)
    lines[last] = !alwaysCut && lastWidth + tailWidth <= width ? trimEndSpace(lines[last]) : trim ? trimEndSpace(cut) : cut
    return lines
  }
}
const clampOk = refClampLines()
const clamped = (prepared, width, maxLines) => layoutWithLines(prepared, width, 20).lineCount > maxLines

function refSearchOptimalWidth({ ignoreMin = false, resultAtMax = false } = {}) {
  return (prepared, lineHeight, { minWidth, maxWidth, accept }) => {
    const widest = layout(prepared, maxWidth, lineHeight)
    if (!accept(widest)) return { width: maxWidth, result: widest }
    let lo = ignoreMin ? 1 : minWidth, hi = maxWidth
    while (lo < hi) {
      const mid = Math.floor((lo + hi) / 2)
      if (accept(layout(prepared, mid, lineHeight))) hi = mid
      else lo = mid + 1
    }
    return { width: lo, result: resultAtMax ? widest : layout(prepared, lo, lineHeight) }
  }
}

function refStreamBlocks({ split = (t) => t.split(/(?<=\n\n)/), whiteSpace = 'pre-wrap', cache: useCache = true, evict = false } = {}) {
  return (cache, text, font, width, lineHeight) => {
    let height = 0
    const blocks = split(text)
    for (const block of blocks) {
      let prepared = useCache ? cache.get(block) : undefined
      if (!prepared) {
        prepared = prepare(block, font, { whiteSpace })
        if (useCache) cache.set(block, prepared)
      }
      height += layout(prepared, width, lineHeight).height
    }
    if (evict) for (const key of cache.keys()) if (!blocks.includes(key)) cache.delete(key)
    return height
  }
}

// follow(stream, bubble, setRowHeight): the streaming loop, with the cache's scope as the fault.
// cacheScope: 'reply' (one Map per follow() call), 'shared' (one Map for every reply) or 'frame'.
function refFollow({ cacheScope = 'reply' } = {}) {
  const streamBlocks = refStreamBlocks({ evict: true })
  const shared = new Map()
  return async (stream, bubble, setRowHeight) => {
    const cache = cacheScope === 'shared' ? shared : new Map()
    let textSoFar = ''
    let frame = 0
    for await (const token of stream) {
      textSoFar += token
      bubble.textContent = textSoFar
      frame ||= requestAnimationFrame(() => {
        frame = 0
        setRowHeight(streamBlocks(cacheScope === 'frame' ? new Map() : cache, textSoFar, FONT, 400, 20))
      })
    }
  }
}

// The React MeasuredText idiom. Mutants run under the block's own React (globalThis.__react), since
// the harness bundle holds another copy. staleHandle: the 0.3.0 form, which keeps the old handle in
// state across a text change; neverSized: never sets a height.
function refMeasuredText({ staleHandle = false, neverSized = false } = {}) {
  return function MeasuredText({ text, font, width, lineHeight }) {
    const { useEffect, useState, createElement } = globalThis.__react
    const [measured, setMeasured] = useState(null)
    useEffect(() => {
      let current = true
      document.fonts.load(font, text).then(() => { if (current) setMeasured({ text, font, prepared: prepare(text, font) }) })
      return () => { current = false }
    }, [text, font])
    const fresh = measured && (staleHandle || (measured.text === text && measured.font === font))
    const height = fresh && !neverSized ? layout(measured.prepared, width, lineHeight).height : undefined
    return createElement('div', { style: { font, lineHeight: `${lineHeight}px`, width, overflowWrap: 'break-word', height } }, text)
  }
}

// layoutAroundCircle's band rule (editorial-engine.ts circleIntervalForBand at v1.0.0, no padding).
const MIN_SLOT = 32
function bandSlot(top, lineHeight, containerWidth, circle) {
  const bot = top + lineHeight
  const m = top <= circle.y && circle.y <= bot ? 0 : Math.min(Math.abs(circle.y - top), Math.abs(circle.y - bot))
  return m < circle.r ? Math.min(containerWidth, circle.x - Math.sqrt(circle.r ** 2 - m ** 2)) : containerWidth
}
function centreSlot(top, lineHeight, containerWidth, circle) {
  const dy = top + lineHeight / 2 - circle.y
  return Math.abs(dy) < circle.r ? Math.min(containerWidth, circle.x - Math.sqrt(circle.r ** 2 - dy ** 2)) : containerWidth
}
function refLayoutAroundCircle({ slot = bandSlot, minSlot = MIN_SLOT, skipTouched = false, advance = true, dropFirst = false, ignoreCircle = false } = {}) {
  return (prepared, containerWidth, lineHeight, circle) => {
    if (containerWidth < minSlot) return []
    const lines = []
    let cursor, y = 0, guard = 0
    for (;;) {
      if (++guard > 5000) throw new Error('mutant ran away')
      const maxWidth = ignoreCircle ? containerWidth : slot(y, lineHeight, containerWidth, circle)
      if (maxWidth < minSlot || (skipTouched && maxWidth < containerWidth)) { y += lineHeight; continue }
      const line = layoutNextLine(prepared, maxWidth, cursor)
      if (line === null) return dropFirst ? lines.slice(1) : lines
      lines.push({ text: line.text, width: line.width, y, maxWidth, end: line.end })
      cursor = line.end
      if (advance) y += lineHeight
    }
  }
}

// fontDrawsU2010 ports: per family (upstream), and the wrong whole-stack test.
// Created on first use: run.mjs also imports this file in Node.
let measureCtx
const widthIn = (font, s) => {
  measureCtx ??= document.createElement('canvas').getContext('2d')
  measureCtx.font = font
  return measureCtx.measureText(s).width
}
function refFontDrawsU2010(font) {
  const size = /\dpx(?:\s*\/\s*\S+)?\s+/.exec(font)
  if (!size || widthIn(font, U2010) === widthIn(font, '-')) return false
  const start = size.index + size[0].length
  const prefix = font.slice(0, start)
  const mono = prefix + 'monospace', serif = prefix + 'serif'
  if (widthIn(mono, ' ') === widthIn(serif, ' ') || widthIn(mono, U2010) === widthIn(serif, U2010)) return false
  for (const family of font.slice(start).match(/(?:"[^"]*"|'[^']*'|[^,])+/g) ?? []) {
    const a = `${prefix}${family}, monospace`, b = `${prefix}${family}, serif`
    if (widthIn(a, ' ') !== widthIn(b, ' ')) continue
    return widthIn(a, U2010) === widthIn(b, U2010)
  }
  return false
}
function wholeStackDrawsU2010(font) {
  if (widthIn(font, U2010) === widthIn(font, '-')) return false
  return widthIn(`${font}, monospace`, U2010) === widthIn(`${font}, serif`, U2010)
}

// Items with a box, an all-space atomic item, soft hyphens, letter spacing and spaces between items.
const RICH_ITEMS = [
  { text: 'Ship the ', font: FONT },
  { text: '@maya', font: '12px Inter', break: 'never', extraWidth: 16 },
  { text: ' in\u00ADter\u00ADna\u00ADtion\u00ADal\u00ADiza\u00ADtion build ', font: FONT },
  { width: 20 },
  { text: ' ', font: FONT, break: 'never', extraWidth: 10 },
  { text: ' with ', font: FONT },
  { text: 'git push', font: '14px Inter', break: 'never', extraWidth: 8 },
  { text: ' before the TRACKED standup', font: FONT, letterSpacing: 1.5 },
  { text: ', then sleep.', font: FONT },
]

export default {
  // paintRichLines(prepared, maxWidth, lineHeight, draw): draw(fragment, x, y) per fragment, x includes
  // gapBefore, y = lineIndex * lineHeight; returns the line count.
  paintRichLines: {
    check(fn) {
      let cases = 0, gaps = 0
      for (const LH of [20, 17]) for (const whiteSpace of ['normal', 'pre-wrap']) {
        const prepared = prepareRichInline(RICH_ITEMS, { whiteSpace })
        for (let maxWidth = 40; maxWidth <= 420; maxWidth += 19) {
          const want = []
          walkRichInlineLineRanges(prepared, maxWidth, (r) => want.push(materializeRichInlineLineRange(prepared, r)))
          const calls = []
          const count = fn(prepared, maxWidth, LH, (fragment, x, y) => calls.push({ fragment, x, y }))
          const at = `${whiteSpace} w=${maxWidth} lh=${LH}`
          assert(count === measureRichInlineStats(prepared, maxWidth).lineCount, `${at}: returned ${count}, expected ${measureRichInlineStats(prepared, maxWidth).lineCount}`)
          const total = want.reduce((n, l) => n + l.fragments.length, 0)
          assert(calls.length === total, `${at}: draw called ${calls.length} times for ${total} fragments`)
          let k = 0
          want.forEach((line, lineIndex) => {
            let before = 0
            for (const f of line.fragments) {
              const c = calls[k++]
              assert(c.fragment.itemIndex === f.itemIndex && c.fragment.text === f.text && c.fragment.sourceStart === f.sourceStart,
                `${at} line ${lineIndex}: drew ${JSON.stringify(c.fragment)} where ${JSON.stringify(f)} was due`)
              const x = before + f.gapBefore
              assert(Math.abs(c.x - x) < 1e-9, `${at} line ${lineIndex} item ${f.itemIndex}: x ${c.x}, expected ${x}`)
              assert(c.y === lineIndex * LH, `${at} line ${lineIndex}: y ${c.y}, expected ${lineIndex * LH}`)
              if (f.gapBefore > 0) gaps++
              before += f.gapBefore + f.occupiedWidth
            }
            assert(Math.abs(before - line.width) < 1e-9, `${at} line ${lineIndex}: fragments sum to ${before}, line width ${line.width}`)
          })
          cases++
        }
      }
      assert(cases > 0 && gaps > 0, `corpus too weak: ${cases} cases, ${gaps} fragments with a gap`)
    },
    mutants: [
      // skips gapBefore
      (prepared, maxWidth, lineHeight, draw) => {
        let n = 0
        walkRichInlineLineRanges(prepared, maxWidth, (r) => {
          let x = 0
          for (const f of materializeRichInlineLineRange(prepared, r).fragments) { draw(f, x, n * lineHeight); x += f.occupiedWidth }
          n++
        })
        return n
      },
      // y one line too low
      (prepared, maxWidth, lineHeight, draw) => {
        let n = 0
        walkRichInlineLineRanges(prepared, maxWidth, (r) => {
          let x = 0
          for (const f of materializeRichInlineLineRange(prepared, r).fragments) { x += f.gapBefore; draw(f, x, (n + 1) * lineHeight); x += f.occupiedWidth }
          n++
        })
        return n
      },
      // count off by one
      (prepared, maxWidth, lineHeight, draw) => {
        const lines = []
        walkRichInlineLineRanges(prepared, maxWidth, (r) => lines.push(materializeRichInlineLineRange(prepared, r)))
        lines.forEach((line, i) => {
          let x = 0
          for (const f of line.fragments) { x += f.gapBefore; draw(f, x, i * lineHeight); x += f.occupiedWidth }
        })
        return lines.length + 1
      },
      // line height hard-coded to 20
      (prepared, maxWidth, lineHeight, draw) => {
        let n = 0
        walkRichInlineLineRanges(prepared, maxWidth, (r) => {
          let x = 0
          for (const f of materializeRichInlineLineRange(prepared, r).fragments) { x += f.gapBefore; draw(f, x, n * 20); x += f.occupiedWidth }
          n++
        })
        return n
      },
    ],
  },
  // clampLines(prepared, font, width, maxLines, tailWidth) => string[], with fillLine and trimEndSpace in its block.
  clampLines: {
    check(fn) {
      const tail = measureNaturalWidth(prepare('…', FONT))
      const RTL = /[֐-ࣿ]/
      let naturals = 0, cuts = 0, shyCuts = 0, maximal = 0
      for (const text of CLAMP_TEXTS) {
        const prepared = prepareWithSegments(text, FONT)
        const segs = prepared.segments
        for (let w = 80; w <= 420; w += 5) {
          const fullLines = layoutWithLines(prepared, w, 20).lines
          const full = fullLines.map((l) => l.text)
          for (const N of [1, 2, 3]) {
            const at = `${show(text.slice(0, 16))} w=${w} N=${N}`
            const lines = fn(prepared, FONT, w, N, tail)
            if (full.length <= N) { assert(eq(lines, full), `${at}: unclamped text gave ${show(lines)}, expected ${show(full)}`); continue }
            assert(Array.isArray(lines) && lines.length === N, `${at}: ${show(lines)} is not ${N} lines`)
            assert(eq(lines.slice(0, N - 1), full.slice(0, N - 1)), `${at}: lines before the last differ from layoutWithLines`)
            const last = lines[N - 1]
            assert(typeof last === 'string' && last.length > 0, `${at}: last line is empty`)
            assert(!last.endsWith(' '), `${at}: last line ${show(last)} ends in a space`)
            const over = preWrapWidth(last + '…') - w
            assert(over <= 0.25, `${at}: ${show(last + '…')} overflows by ${over}px`)
            const natural = trimEndSpace(full[N - 1])
            if (preWrapWidth(natural) + tail <= w) {
              naturals++
              assert(last === natural, `${at}: tail fits after the natural line ${show(natural)}, got ${show(last)}`)
              continue
            }
            cuts++
            const start = fullLines[N - 1].start
            const rest = (graphemes(segs[start.segmentIndex]).slice(start.graphemeIndex).join('') + segs.slice(start.segmentIndex + 1).join('')).replaceAll(SHY, '')
            assert(rest.startsWith(last), `${at}: cut line ${show(last)} is not the start of ${show(rest.slice(0, 40))}`)
            if (text.includes(SHY)) shyCuts++
            if (text.includes(SHY) || RTL.test(text)) continue
            const after = graphemes(rest.slice(last.length))
            const cand = !after.length ? null : after[0] === ' ' ? (after.length > 1 ? last + ' ' + after[1] : null) : last + after[0]
            if (cand === null) continue
            maximal++
            assert(preWrapWidth(cand) > w - tail - 0.5, `${at}: cut line ${show(last)} could also hold ${show(cand)}`)
          }
        }
      }
      assert(naturals > 0 && cuts > 0 && shyCuts > 0 && maximal > 0, `corpus too weak: ${naturals} natural, ${cuts} cut (${shyCuts} soft hyphen, ${maximal} maximality) cases`)
    },
    mutants: [
      refClampLines({ alwaysCut: true }), // cuts mid-word even where the tail fits after the natural break
      refClampLines({ trim: false }), // keeps the space before the tail
      (p, f, w, n, t) => { const L = clampOk(p, f, w, n, t); if (clamped(p, w, n)) L[n - 1] = ''; return L },
      (p, f, w, n, t) => { const L = clampOk(p, f, w, n, t); L[L.length - 1] += '…'; return L }, // appends the tail itself, always
      refClampLines({ fill: refFillLine({ keepHyphen: true }) }), // upstream fillLine: keeps a soft hyphen's '-' mid-line
      (p, f, w, n, t) => { // drops the last word of a cut line
        const L = clampOk(p, f, w, n, t)
        if (clamped(p, w, n)) { const i = L[n - 1].lastIndexOf(' '); if (i > 0) L[n - 1] = L[n - 1].slice(0, i) }
        return L
      },
    ],
  },

  // measureText(text, fontFamily, fontSize, maxWidth, lineHeight = 1.5) => { height, lines } | null
  measureText: {
    check(fn) {
      for (const text of PARITY_TEXTS) for (const w of [90, 200, 333.25, 420]) for (const lh of [1.25, undefined]) {
        const want = layout(prepare(text, FONT), w, 16 * (lh ?? 1.5))
        const got = lh === undefined ? fn(text, 'Inter', 16, w) : fn(text, 'Inter', 16, w, lh)
        assert(got && Object.keys(got).length === 2 && got.height === want.height && got.lines === want.lineCount,
          `${show(text.slice(0, 16))} w=${w} lh=${lh}: ${show(got)}, expected { height: ${want.height}, lines: ${want.lineCount} }`)
      }
      const [r, calls] = withErrorSpy(() => fn(PARITY_TEXTS[0], '', 16, 200))
      assert(r === null && calls > 0, `empty fontFamily: returned ${show(r)} with ${calls} console.error calls`)
    },
    mutants: [
      refMeasureText({ log: false }), // swallows the error
      refMeasureText({ lineHeightIsPx: true }), // passes the multiplier as px
      (...a) => { const r = refMeasureText()(...a); return r && { ...r, width: a[3] } }, // keeps a width field
    ],
  },

  // measureTextExtended({ text, fontFamily, fontSize, maxWidth, lineHeight, whiteSpace, wordBreak, letterSpacingEm })
  measureTextExtended: {
    check(fn) {
      const cases = [
        ...PARITY_TEXTS.map((text) => ({ text })),
        { text: 'line one\n\n  indented  line two\tthen a tab and more words to wrap', whiteSpace: 'pre-wrap' },
        { text: PARITY_TEXTS[2], wordBreak: 'keep-all' },
        { text: '한국어 문장은 띄어쓰기가 있지만 keep-all 에서는 단어 안에서 끊지 않습니다.', wordBreak: 'keep-all' },
        { text: PARITY_TEXTS[0], letterSpacingEm: 0.05 },
        { text: PARITY_TEXTS[3], letterSpacingEm: -0.02, whiteSpace: 'pre-wrap' },
      ]
      for (const c of cases) for (const fontSize of [16, 20]) for (const w of [90, 200, 333.25]) for (const lineHeight of [1.25, undefined]) {
        const opts = { ...c, fontFamily: 'Inter', fontSize, maxWidth: w, lineHeight }
        const letterSpacing = c.letterSpacingEm === undefined ? undefined : fontSize * c.letterSpacingEm
        const want = layout(prepare(c.text, `${fontSize}px Inter`, { whiteSpace: c.whiteSpace, wordBreak: c.wordBreak, letterSpacing }), w, fontSize * (lineHeight ?? 1.5))
        const got = fn(opts)
        assert(got && Object.keys(got).length === 2 && got.height === want.height && got.lines === want.lineCount,
          `${show({ ...opts, text: c.text.slice(0, 16) })}: ${show(got)}, expected { height: ${want.height}, lines: ${want.lineCount} }`)
      }
      const [r, calls] = withErrorSpy(() => fn({ text: PARITY_TEXTS[0], fontFamily: '', fontSize: 16, maxWidth: 200 }))
      assert(r === null && calls > 0, `empty fontFamily: returned ${show(r)} with ${calls} console.error calls`)
    },
    mutants: [
      refMeasureTextExtended({ log: false }), // swallows the error
      refMeasureTextExtended({ dropLetterSpacing: true }), // ignores letterSpacingEm
    ],
  },

  // autoFitFontSize(text, fontFamily, maxWidth, lineHeight = 1.5, targetMaxLines = 3, minFont = 14, maxFont = 34) => number | null
  autoFitFontSize: {
    check(fn) {
      const lineCount = (text, size, w, lh) => layout(prepare(text, `${size}px Inter`), w, size * lh).lineCount
      let belowMax = 0, atMin = 0
      const verify = (r, text, w, lh, k, min, max, at) => {
        assert(Number.isInteger(r) && r >= min && r <= max, `${at}: ${r} is not a whole size in ${min}..${max}`)
        assert(lineCount(text, r, w, lh) <= k || r === min, `${at}: ${r}px takes ${lineCount(text, r, w, lh)} lines, more than ${k}`)
        assert(r === max || lineCount(text, r + 1, w, lh) > k, `${at}: ${r + 1}px also fits in ${k} lines`)
        if (r < max) belowMax++
        if (r === min && lineCount(text, r, w, lh) > k) atMin++
      }
      for (const text of PARITY_TEXTS) for (const w of [160, 260, 420]) {
        for (const k of [1, 2, 3]) verify(fn(text, 'Inter', w, 1.5, k, 14, 34), text, w, 1.5, k, 14, 34, `${show(text.slice(0, 16))} w=${w} k=${k}`)
        verify(fn(text, 'Inter', w, 1.2, 2, 10, 60), text, w, 1.2, 2, 10, 60, `${show(text.slice(0, 16))} w=${w} 10..60`)
        verify(fn(text, 'Inter', w), text, w, 1.5, 3, 14, 34, `${show(text.slice(0, 16))} w=${w} defaults`)
      }
      const [r] = withErrorSpy(() => fn(PARITY_TEXTS[0], '', 300))
      assert(r === null, `empty fontFamily returned ${show(r)}, expected null`)
      assert(belowMax > 0 && atMin > 0, `corpus too weak: ${belowMax} below maxFont, ${atMin} stuck at minFont`)
    },
    mutants: [
      (text, fontFamily, maxWidth, lineHeight = 1.5, targetMaxLines = 3, minFont = 14, maxFont = 34) => maxFont,
      (text, fontFamily, maxWidth, lineHeight = 1.5, targetMaxLines = 3, minFont = 14, maxFont = 34) => { // fractional bisection
        let lo = minFont, hi = maxFont, best = minFont
        for (let i = 0; i < 20; i++) {
          const mid = (lo + hi) / 2
          const r = refMeasureText()(text, fontFamily, mid, maxWidth, lineHeight)
          if (!r) return null
          if (r.lines <= targetMaxLines) { best = mid; lo = mid } else hi = mid
        }
        return Math.round(best * 10) / 10
      },
    ],
  },

  // bubbleWidth(text, font, maxWidth, padding) => number
  bubbleWidth: {
    check(fn) {
      // Linux Chromium measures web fonts in whole px, where rounding up and down agree. So the cases
      // run in FONT and again in FRACTIONAL, whose canvas widths are scaled by 1.1 (a stand-in for the
      // fractional advances of macOS), and some FRACTIONAL line must be fractional and round up.
      const FRACTIONAL = '17px Inter' // not measured anywhere else on the page
      // Pretext measures on an OffscreenCanvas where there is one.
      const protos = [globalThis.OffscreenCanvasRenderingContext2D, CanvasRenderingContext2D].filter(Boolean).map((c) => c.prototype)
      const originals = protos.map((proto) => proto.measureText)
      protos.forEach((proto, i) => {
        proto.measureText = function (s) {
          const m = originals[i].call(this, s)
          if (this.font !== FRACTIONAL) return m
          const { width, actualBoundingBoxLeft, actualBoundingBoxRight } = m
          return { width: width * 1.1, actualBoundingBoxLeft: actualBoundingBoxLeft * 1.1, actualBoundingBoxRight: actualBoundingBoxRight * 1.1 }
        }
      })
      try {
        let roundsUp = 0
        for (const font of [FONT, FRACTIONAL]) for (const text of PARITY_TEXTS) for (let w = 120; w <= 400; w += 20) for (const padding of [0, 12]) {
          const { maxLineWidth } = measureLineStats(prepare(text, font), w)
          const want = Math.min(Math.ceil(maxLineWidth), w)
          if (font === FRACTIONAL && Math.floor(maxLineWidth) < want) roundsUp++
          const r = fn(text, font, w, padding)
          assert(r - 2 * padding === want, `${font} ${show(text.slice(0, 16))} w=${w} padding=${padding}: ${r}, expected ${want + 2 * padding}`)
        }
        assert(roundsUp > 0, `corpus too weak: no ${FRACTIONAL} line width rounds up (is the measureText double engaged?)`)
      } finally { protos.forEach((proto, i) => { proto.measureText = originals[i] }) }
    },
    mutants: [
      (text, font, maxWidth, padding) => maxWidth + 2 * padding,
      (text, font, maxWidth, padding) => Math.min(Math.floor(measureLineStats(prepare(text, font), maxWidth).maxLineWidth), maxWidth) + 2 * padding,
    ],
  },

  // searchOptimalWidth(prepared, lineHeight, { minWidth, maxWidth, accept }) => { width, result }
  searchOptimalWidth: {
    check(fn) {
      const LH = 20
      let rejectedAll = 0, raisedMin = 0
      for (const text of PARITY_TEXTS) {
        const prepared = prepare(text, FONT)
        const cases = [1, 2, 3, 4].map((k) => ({ minWidth: 40, maxWidth: 400, accept: (r) => r.lineCount <= k, k }))
        const three = (r) => r.lineCount <= 3
        if (three(layout(prepared, 400, LH))) {
          let narrowest = 400
          while (narrowest > 1 && three(layout(prepared, narrowest - 1, LH))) narrowest--
          if (narrowest + 30 < 400) { cases.push({ minWidth: narrowest + 30, maxWidth: 400, accept: three, k: '3, raised min' }); raisedMin++ }
        }
        for (const o of cases) {
          const at = `${show(text.slice(0, 16))} k=${o.k} min=${o.minWidth}`
          const { width, result } = fn(prepared, LH, { minWidth: o.minWidth, maxWidth: o.maxWidth, accept: o.accept })
          assert(Number.isInteger(width) && o.minWidth <= width && width <= o.maxWidth, `${at}: width ${width} out of range`)
          assert(eq(result, layout(prepared, width, LH)), `${at}: result ${show(result)} is not layout() at ${width}`)
          if (!o.accept(layout(prepared, o.maxWidth, LH))) { rejectedAll++; assert(width === o.maxWidth, `${at}: nothing fits, expected maxWidth, got ${width}`); continue }
          assert(o.accept(result), `${at}: result at ${width} is not accepted`)
          assert(width === o.minWidth || !o.accept(layout(prepared, width - 1, LH)), `${at}: ${width - 1} is accepted too`)
        }
      }
      assert(rejectedAll > 0 && raisedMin > 0, `corpus too weak: ${rejectedAll} unaccepted, ${raisedMin} raised-min cases`)
    },
    mutants: [
      refSearchOptimalWidth({ ignoreMin: true }),
      refSearchOptimalWidth({ resultAtMax: true }),
      (prepared, lineHeight, { maxWidth }) => ({ width: maxWidth, result: layout(prepared, maxWidth, lineHeight) }),
    ],
  },

  // findBalancedWidth(prepared, targetLines, minWidth, maxWidth) => number
  findBalancedWidth: {
    check(fn) {
      let reachable = 0
      for (const text of PARITY_TEXTS) {
        const prepared = prepare(text, FONT)
        const lines = (w) => measureLineStats(prepared, w).lineCount
        for (const k of [1, 2, 3, 4]) {
          const r = fn(prepared, k, 40, 400)
          const at = `${show(text.slice(0, 16))} k=${k}`
          assert(Number.isInteger(r) && r >= 40 && r <= 400, `${at}: ${r} is not a whole width in 40..400`)
          if (lines(400) > k) continue
          reachable++
          assert(lines(r) <= k, `${at}: ${r} gives ${lines(r)} lines`)
          assert(r === 40 || lines(r - 1) > k, `${at}: ${r - 1} also fits in ${k} lines`)
        }
      }
      assert(reachable > 0, 'corpus too weak: no reachable target')
    },
    mutants: [
      (prepared, targetLines, minWidth, maxWidth) => maxWidth,
      (prepared, targetLines, minWidth, maxWidth) => { // fractional bisection
        let lo = minWidth, hi = maxWidth, best = maxWidth
        for (let i = 0; i < 20; i++) {
          const mid = (lo + hi) / 2
          if (measureLineStats(prepared, mid).lineCount <= targetLines) { best = mid; hi = mid } else lo = mid
        }
        return best
      },
    ],
  },

  // streamBlocks(cache, text, font, width, lineHeight) => number
  streamBlocks: {
    check(fn) {
      const el = document.createElement('div')
      document.body.append(el)
      try {
        for (const w of [200, 300]) {
          const cache = new Map()
          let sets = []
          const set = cache.set.bind(cache)
          cache.set = (k, v) => { sets.push(k); return set(k, v) }
          el.style.cssText = `font:${FONT};line-height:20px;width:${w}px;white-space:pre-wrap;overflow-wrap:break-word;margin:0;padding:0`
          for (let i = 1; i <= STREAM_REPLY.length; i++) {
            const prefix = STREAM_REPLY.slice(0, i)
            const at = `w=${w} prefix ${i}`
            sets = []
            const h = fn(cache, prefix, FONT, w, 20)
            el.textContent = prefix
            const dom = el.getBoundingClientRect().height
            assert(h === dom, `${at}: ${h}, one pre-wrap element is ${dom}px`)
            const blocks = prefix.split(/(?<=\n\n)/)
            assert(sets.length <= 1 && (sets.length === 0 || sets[0] === blocks.at(-1)), `${at}: cache.set for ${show(sets)}, expected at most ${show(blocks.at(-1))}`)
            for (const b of blocks) assert(cache.has(b), `${at}: block ${show(b.slice(0, 20))} is not in the cache`)
          }
        }
      } finally { el.remove() }
    },
    mutants: [
      refStreamBlocks({ split: (t) => t.split('\n\n') }),
      refStreamBlocks({ whiteSpace: 'normal' }),
      refStreamBlocks({ split: (t) => [t] }),
      refStreamBlocks({ cache: false }),
    ],
  },

  // MeasuredText({ text, font, width, lineHeight }): React component. Rendered with text A until its
  // height is set, then re-rendered with text B (more lines): right after that render the div must
  // have no explicit height (not A's), and then B's.
  MeasuredText: {
    async check(Comp) {
      const { createElement, createRoot, flushSync } = globalThis.__react
      const A = PARITY_TEXTS[0], B = PARITY_TEXTS[0] + ' ' + PARITY_TEXTS[3]
      const want = (t) => `${layout(prepare(t, FONT), 200, 20).height}px`
      assert(want(A) !== want(B), 'test texts have the same height')
      const host = document.createElement('div')
      document.body.append(host)
      const root = createRoot(host)
      const render = (text) => flushSync(() => root.render(createElement(Comp, { text, font: FONT, width: 200, lineHeight: 20 })))
      const height = () => host.firstElementChild?.style.height ?? ''
      const until = async (cond, what) => {
        for (let i = 0; i < 100 && !cond(); i++) await new Promise((r) => setTimeout(r, 20))
        assert(cond(), `${what}: height is ${show(height())}`)
      }
      try {
        render(A)
        await until(() => height() === want(A), `text A never got its height ${want(A)}`)
        render(B)
        assert(height() === '', `right after the text changed, the height is ${show(height())}, not unset (A's is ${want(A)})`)
        await until(() => height() === want(B), `text B never got its height ${want(B)}`)
      } finally { root.unmount(); host.remove() }
    },
    mutants: [refMeasuredText({ staleHandle: true }), refMeasuredText({ neverSized: true })],
  },

  // follow(stream, bubble, setRowHeight) => Promise<void>. Two replies stream at once, a token per
  // frame each. A Map.prototype.set spy records every set of a prepared handle by a string key: each
  // reply must fill one cache of its own, and no cache may get the same whole block twice (a shared cache
  // evicts the other reply's blocks, which are then prepared again).
  follow: {
    async check(fn) {
      const replies = [STREAM_REPLY, STREAM_REPLY.toUpperCase()]
      const tokens = (s) => s.match(/[^]{1,6}/g)
      const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()))
      async function* stream(s) { for (const t of tokens(s)) { await nextFrame(); yield t } }
      const sets = new Map() // cache -> keys set, in order
      const origSet = Map.prototype.set
      Map.prototype.set = function (k, v) {
        if (typeof k === 'string' && v && typeof v === 'object' && 'segmentFlags' in v) {
          if (!sets.has(this)) sets.set(this, [])
          sets.get(this).push(k)
        }
        return origSet.call(this, k, v)
      }
      const bubbles = replies.map(() => document.createElement('div'))
      const heights = replies.map(() => [])
      try {
        await Promise.all(replies.map((s, i) => fn(stream(s), bubbles[i], (px) => heights[i].push(px))))
        for (let i = 0; i < 5; i++) await nextFrame() // the last scheduled frame
      } finally { Map.prototype.set = origSet }
      replies.forEach((s, i) => {
        assert(bubbles[i].textContent === s, `reply ${i + 1}: bubble holds ${show(bubbles[i].textContent.slice(-20))}`)
        const want = layout(prepare(s, FONT, { whiteSpace: 'pre-wrap' }), 400, 20).height
        assert(heights[i].at(-1) === want, `reply ${i + 1}: last height ${heights[i].at(-1)}, the whole reply in pre-wrap is ${want}`)
      })
      assert(sets.size === replies.length, `${sets.size} caches were filled for ${replies.length} replies`)
      for (const keys of sets.values()) {
        // only whole blocks: a partial last block such as 'F' can recur at the start of a later block
        const twice = keys.find((k, j) => k.endsWith('\n\n') && keys.indexOf(k) !== j)
        assert(twice === undefined, `block ${show(twice?.slice(0, 20))} was prepared and cached twice`)
      }
    },
    mutants: [refFollow({ cacheScope: 'shared' }), refFollow({ cacheScope: 'frame' })],
  },

  // layoutAroundCircle(prepared, containerWidth, lineHeight, { x, y, r }) => { text, width, y, maxWidth, end }[]
  layoutAroundCircle: {
    check(fn) {
      const LH = 20
      const strip = (s) => s.replace(/\s+/g, '')
      let skipped = 0, narrowed = 0
      for (const text of PARITY_TEXTS) {
        const prepared = prepareWithSegments(text, FONT)
        for (const cw of [20, 120, 200, 300, 420]) for (const circle of [{ x: 100, y: 40, r: 60 }, { x: 60, y: 30, r: 50 }, { x: cw, y: 50, r: cw }]) {
          const at = `${show(text.slice(0, 16))} cw=${cw} circle=${show(circle)}`
          const lines = fn(prepared, cw, LH, circle)
          if (cw < MIN_SLOT) { assert(Array.isArray(lines) && lines.length === 0, `${at}: expected no lines`); continue }
          const joined = lines.map((l) => (isSoftHyphenBreak(prepared, l) ? l.text.slice(0, -1) : l.text)).join('')
          assert(strip(joined) === strip(text.replaceAll(SHY, '')), `${at}: lines don't spell the text: ${show(joined.slice(0, 60))}`)
          let ey = 0
          for (const l of lines) {
            while (bandSlot(ey, LH, cw, circle) < MIN_SLOT) { ey += LH; skipped++ }
            assert(l.y === ey, `${at}: line ${show(l.text)} at y=${l.y}, expected ${ey}`)
            const slot = bandSlot(l.y, LH, cw, circle)
            assert(l.maxWidth === slot, `${at} y=${l.y}: maxWidth ${l.maxWidth}, band rule gives ${slot}`)
            if (slot < cw) narrowed++
            assert(l.maxWidth >= MIN_SLOT, `${at} y=${l.y}: maxWidth ${l.maxWidth} below ${MIN_SLOT}`)
            assert(l.width <= l.maxWidth + 1 / 64, `${at} y=${l.y}: width ${l.width} over ${l.maxWidth}`)
            ey += LH
          }
        }
      }
      assert(skipped > 0 && narrowed > 0, `corpus too weak: ${skipped} skipped bands, ${narrowed} narrowed lines`)
    },
    mutants: [
      refLayoutAroundCircle({ dropFirst: true }),
      refLayoutAroundCircle({ ignoreCircle: true }),
      refLayoutAroundCircle({ slot: centreSlot }),
      refLayoutAroundCircle({ minSlot: 50 }),
      refLayoutAroundCircle({ skipTouched: true }),
      refLayoutAroundCircle({ advance: false }),
    ],
  },

  // paintableText(prepared, line, font) => string, with fontDrawsU2010 in its block.
  paintableText: {
    check(fn) {
      for (const [font, swaps] of [['16px InterWide', true], [FONT, false]]) {
        const prepared = prepareWithSegments(PAINTABLE_TEXT, font)
        let shy = 0, real = 0
        for (let w = 40; w <= 200; w++) for (const line of layoutWithLines(prepared, w, 20).lines) {
          const brk = isSoftHyphenBreak(prepared, line)
          const want = brk && swaps ? line.text.slice(0, -1) + U2010 : line.text
          const got = fn(prepared, line, font)
          assert(got === want, `${font} w=${w}: ${show(line.text)} painted as ${show(got)}, expected ${show(want)}`)
          if (brk) shy++
          else if (line.text.endsWith('-')) real++
        }
        assert(shy > 0 && real > 0, `${font}: corpus too weak: ${shy} soft-hyphen breaks, ${real} real-hyphen ends`)
      }
    },
    mutants: [
      (prepared, line, font) => (line.text.endsWith('-') && refFontDrawsU2010(font) ? line.text.slice(0, -1) + U2010 : line.text), // swaps every '-'
      (prepared, line) => line.text, // never swaps
      (prepared, line) => (isSoftHyphenBreak(prepared, line) ? line.text.slice(0, -1) + U2010 : line.text), // swaps whatever the font
    ],
  },

  // fontDrawsU2010(font) => boolean: upstream's per-family test (dist/measurement.js getHyphenText).
  fontDrawsU2010: {
    check(fn) {
      const generic = (s) => widthIn('16px monospace', s) !== widthIn('16px serif', s)
      assert(generic(' ') && generic(U2010), 'generic fonts measure alike; fontDrawsU2010 expectations not applicable')
      for (const [font, want] of [
        ['16px Inter', false], ['16px InterNo', false], ['16px InterNo, sans-serif', false], ['16px NotLoaded, Inter', false],
        ['16px InterWide', true], ['16px NotLoaded, InterWide', true], ['16px InterNo, InterWide', false],
      ]) {
        const got = fn(font)
        assert(got === want, `fontDrawsU2010(${show(font)}) is ${show(got)}, expected ${want}`)
      }
    },
    mutants: [() => true, () => false, wholeStackDrawsU2010],
  },

  // glyphPositions(ctx, text) => [{ grapheme, x, width }]: where one fillText of the line puts each grapheme.
  glyphPositions: {
    check(fn) {
      const ctx = document.createElement('canvas').getContext('2d')
      ctx.font = FONT
      const w = (s) => ctx.measureText(s).width
      const kern = Math.abs(graphemes(GLYPH_TEXTS[0]).reduce((a, g) => a + w(g), 0) - w(GLYPH_TEXTS[0]))
      assert(kern > 5, `corpus too weak: font does not kern (${kern}px)`)
      for (const text of GLYPH_TEXTS) {
        const boxes = fn(ctx, text)
        assert(eq(boxes.map((b) => b.grapheme), graphemes(text)), `${show(text)}: graphemes ${show(boxes.map((b) => b.grapheme))}`)
        assert(Math.abs(boxes[0].x) <= 0.01, `${show(text)}: first x is ${boxes[0].x}`)
        for (const b of boxes) assert(Math.abs(b.width - w(b.grapheme)) <= 0.01, `${show(text)}: ${show(b.grapheme)} width ${b.width}`)
      }
      for (const text of GLYPH_PAINT_TEXTS) {
        const ratio = glyphPaintRatio(text, fn(ctx, text))
        assert(ratio <= 0.02, `${show(text)}: painted glyphs differ from the line by ${ratio}`)
      }
    },
    mutants: [
      (ctx, text) => { // adds up standalone widths, so kerning is lost
        let x = 0
        return graphemes(text).map((grapheme) => { const width = ctx.measureText(grapheme).width, box = { grapheme, x, width }; x += width; return box })
      },
      (ctx, text) => { // prefix without the glyph misses the kerning pair before it
        let at = 0
        return graphemes(text).map((grapheme) => {
          const box = { grapheme, x: ctx.measureText(text.slice(0, at)).width, width: ctx.measureText(grapheme).width }
          at += grapheme.length
          return box
        })
      },
      (ctx, text) => { // code points instead of graphemes
        let at = 0
        return Array.from(text).map((grapheme) => {
          at += grapheme.length
          const width = ctx.measureText(grapheme).width
          return { grapheme, x: ctx.measureText(text.slice(0, at)).width - width, width }
        })
      },
      (ctx, text) => { // each segment's width spread evenly over its graphemes
        const prepared = prepareWithSegments(text, FONT)
        const boxes = []
        let x = 0
        prepared.segments.forEach((segment, i) => {
          const parts = graphemes(segment), width = prepared.widths[i] / parts.length
          for (const grapheme of parts) { boxes.push({ grapheme, x, width }); x += width }
        })
        return boxes
      },
    ],
  },
}
