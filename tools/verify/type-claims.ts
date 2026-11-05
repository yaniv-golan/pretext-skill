// Type-level claims (gate 4). Each @ts-expect-error must fire; everything else must compile.
import {
  prepare, prepareWithSegments, layoutWithLines, layoutNextLine, layoutNextLineRange, measureLineStats,
  type LayoutCursor,
} from '@chenglou/pretext'
import {
  prepareRichInline, materializeRichInlineLineRange, walkRichInlineLineRanges,
  type RichInlineItem, type RichInlineBox, type RichInlineFragment,
} from '@chenglou/pretext/rich-inline'

declare const t: string
declare const f: string
declare const cursor: LayoutCursor
declare const fragment: RichInlineFragment
declare const items: RichInlineItem[]

// --- must error ---

// @ts-expect-error fragments carry sourceStart/sourceEnd, not start
fragment.start

// @ts-expect-error prepareRichInline's second parameter is options, so map's index doesn't fit
;[[]].map(prepareRichInline)

// @ts-expect-error a text item can't also carry a width
const itemWithWidth: RichInlineItem = { text: 'a', font: f, width: 20 }

const prepared = prepareWithSegments(t, f)
// @ts-expect-error widths is ArrayLike<number>, not an array
prepared.widths.map((w) => w * 2)

// @ts-expect-error 'glue' is not a SegmentBreakKind
prepared.kinds[0] === 'glue'

// @ts-expect-error segLevels is not on the public handle
prepared.segLevels

// @ts-expect-error layoutWithLines needs the prepareWithSegments handle
layoutWithLines(prepare(t, f), 200, 20)

// @ts-expect-error 1.0 order is (prepared, maxWidth, start?)
layoutNextLine(prepared, cursor, 200)

const mixed = [{ text: 'a', font: '16px Inter', break: 'never' }, { width: 20 }]
// @ts-expect-error break widens to string in an inferred array
prepareRichInline(mixed)

// --- must compile ---

measureLineStats(prepare(t, f), 200)
layoutNextLineRange(prepare(t, f), 200)
prepareRichInline([{ width: 20 }])
const rich = prepareRichInline(items, { whiteSpace: 'pre-wrap', wordBreak: 'keep-all' })
const typed: Array<RichInlineItem | RichInlineBox> = [{ text: 'a', font: '16px Inter', break: 'never' }, { width: 20 }]
prepareRichInline(typed)
walkRichInlineLineRanges(rich, 200, (range) => materializeRichInlineLineRange(rich, range))

export { itemWithWidth }
