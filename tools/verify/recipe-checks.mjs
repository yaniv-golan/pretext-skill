// Behavioural checks for `run` recipes, keyed by the first name in the block's id=.
// Each entry: { check(fn, env), mutants: [fn, ...] }. `check` runs in the page after the recipe's
// block loads; it throws (or returns false) to fail. Gate 2 requires `check` to pass on the
// documented recipe and to fail on every mutant. Every entry needs a `run` block with a matching id=.
import {
  prepareRichInline, walkRichInlineLineRanges, materializeRichInlineLineRange, measureRichInlineStats,
} from '@chenglou/pretext/rich-inline'
import { FONT } from './corpus.mjs'

function assert(cond, msg) { if (!cond) throw new Error(msg) }

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
}
