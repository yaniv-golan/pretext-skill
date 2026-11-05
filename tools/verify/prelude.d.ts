// Ambient placeholders for skill code blocks (gate 1). Placeholders are `any`.
// Never declare Pretext names here: those come from real imports injected by extract.mjs.

declare module 'vue'

declare function $state<T>(value?: T): T
declare namespace $state {
  function raw<T>(value?: T): T
}
declare function $effect(fn: () => void | (() => void)): void

declare namespace JSX {
  interface IntrinsicElements { [k: string]: any }
}

// Values a block uses without defining: inputs, DOM nodes and app callbacks the reader supplies.
declare var text: any, font: any, fontFamily: any, items: any, stream: any, textSoFar: any, textareaValue: any
declare var article: any, longText: any, longArticle: any
declare var prepared: any, range: any
declare var width: any, maxWidth: any, w: any, containerWidth: any, columnWidth: any, paddingX: any
declare var lineHeight: any, lineHeightPx: any, lh: any, LH: any, WIDTH: any, FONT: any, BODY_FONT: any
declare var x: any, y: any, rows: any, cols: any, viewportTop: any, viewportBottom: any, textRectX: any, textRectY: any
declare var circle: any, circleX: any, circleY: any, circleRadius: any, obstacles: any, image: any, charWidths: any
declare var ctx: any, el: any, bubble: any, wrappers: any
declare var getWidthAroundObstacle: any, getColumnWidth: any, isVisible: any, matches: any, pickNext: any
declare var renderLine: any, renderLines: any, renderInColumn: any, renderFragmentAt: any, enhanceWithPretext: any
