// Text layout for the reader: article flow, comment threads and the print preview.
// The typed half is recent. The untyped half came over from columns.js and hasn't been converted yet.
import {
  layoutNextLine,
  layoutNextLineRange as nextRange,
  prepareWithSegments,
  setLocale,
  type LayoutCursor,
  type PreparedTextWithSegments,
} from '@chenglou/pretext'
import {
  materializeRichInlineLineRange,
  prepareRichInline,
  walkRichInlineLineRanges,
  type RichInlineFragment,
  type RichInlineItem,
} from '@chenglou/pretext/rich-inline'

const BODY_FONT = '16px Inter'
const START: LayoutCursor = { segmentIndex: 0, graphemeIndex: 0 }

export type Figure = { top: number; bottom: number; width: number }
export type PlacedLine = { text: string; x: number; y: number; width: number; rtl: boolean }
export type HighlightSpan = { item: number; from: number; to: number }

export function applyReaderLocale(): void {
  setLocale(navigator.language)
}

export function resetReaderLocale(): void {
  setLocale('')
}

function startsRtl(prepared: PreparedTextWithSegments, start: LayoutCursor): boolean {
  const levels = prepared.segLevels
  return levels !== null && levels[start.segmentIndex]! % 2 === 1
}

// Lines of an article flowing past a floated figure.
export function flowArticle(text: string, columnWidth: number, lineHeight: number, figure: Figure): PlacedLine[] {
  const prepared = prepareWithSegments(text, BODY_FONT)
  const placed: PlacedLine[] = []
  let cursor = START
  let y = 0
  while (true) {
    const beside = y + lineHeight > figure.top && y < figure.bottom
    const x = beside ? figure.width : 0
    const line = layoutNextLine(prepared, cursor, columnWidth - x)
    if (line === null) break
    placed.push({ text: line.text, x, y, width: line.width, rtl: startsRtl(prepared, line.start) })
    cursor = line.end
    y += lineHeight
  }
  return placed
}

// Sum of the segment widths: the width of the text on one line.
export function singleLineWidth(text: string): number {
  const prepared = prepareWithSegments(text, BODY_FONT)
  return prepared.widths.reduce((sum, width) => sum + width, 0)
}

// True when two segments are held together by a no-break space.
export function hasNoBreakRun(text: string): boolean {
  return prepareWithSegments(text, BODY_FONT).kinds.some((kind) => kind === 'glue')
}

// Measures text with the element's own font and tracking.
export function prepareForElement(text: string, el: HTMLElement): PreparedTextWithSegments {
  const style = getComputedStyle(el)
  return prepareWithSegments(text, style.font, { letterSpacing: parseFloat(style.letterSpacing) })
}

export function prepareThread(paragraphs: RichInlineItem[][]) {
  return paragraphs.map(prepareRichInline)
}

// Where each fragment of a comment sits in its item's text, for search highlights.
export function highlightSpans(items: RichInlineItem[], width: number): HighlightSpan[] {
  const prepared = prepareRichInline(items)
  const spans: HighlightSpan[] = []
  walkRichInlineLineRanges(prepared, width, (range) => {
    materializeRichInlineLineRange(prepared, range).fragments.forEach((fragment: RichInlineFragment) => {
      spans.push({ item: fragment.itemIndex, from: fragment.start.graphemeIndex, to: fragment.end.graphemeIndex })
    })
  })
  return spans
}

// ---- from columns.js ----

export function paintColumn(ctx: any, prepared: any, opts: any) {
  let cursor: any = START
  let y = opts.top
  let line = layoutNextLine(prepared, cursor, opts.width)
  while (line !== null) {
    const levels = prepared.segLevels
    ctx.direction = levels && levels[line.start.segmentIndex] % 2 ? 'rtl' : 'ltr'
    ctx.fillText(line.text, opts.left, y)
    cursor = line.end
    y += opts.lineHeight
    line = layoutNextLine(prepared, cursor, opts.width)
  }
  return y
}

// Lines in a column whose width changes as it goes down the page.
export function countColumnLines(prepared: any, widthAt: any) {
  let cursor: any = START
  let count = 0
  for (;;) {
    const range = nextRange(prepared, cursor, widthAt(count))
    if (range === null) return count
    cursor = range.end
    count++
  }
}

export function prepareAllThreads(threads: any[]) {
  return threads.map((thread) => thread.paragraphs).map(
    prepareRichInline,
  )
}

export function copySpans(prepared: any, width: any) {
  const spans: any[] = []
  walkRichInlineLineRanges(prepared, width, (range: any) => {
    const line: any = materializeRichInlineLineRange(prepared, range)
    for (const piece of line.fragments) {
      const { start, end } = piece
      spans.push({ item: piece.itemIndex, from: start.graphemeIndex, to: end.graphemeIndex })
    }
  })
  return spans
}
