# Glyph Patterns: Letters That Move on Their Own

Recipes where each character is its own object: letters that explode into particles, fall as game pieces, or fill a picture as ASCII art. Recipes that place whole lines are in [patterns-flow.md](patterns-flow.md).

## Table of Contents

1. [Characters as objects](#characters-as-objects)
2. [Per-character positions](#per-character-positions)
3. [Ink bounds for collisions](#ink-bounds-for-collisions)

---

## Characters as objects

Pretext decides the lines: where each one breaks, its `y`, its text. It has no public width for a single letter inside a line, so the position of a letter comes from the canvas that paints it.

Don't reach into the handle for this. A `prepareWithSegments()` handle holds more fields at runtime than its type shows, such as `breakableFitAdvances`. They are the library's working data, with [no public equivalent](https://github.com/chenglou/pretext/blob/v1.0.0/CHANGELOG.md), and they change with engine fixes.

---

## Per-character positions

Measure each line in canvas, up to and including the letter. Taking the letter's own width back off leaves the place where one `fillText` of the whole line draws it:

```ts run id=glyphPositions
type GlyphBox = { grapheme: string; x: number; width: number }

// Set ctx.font to the font the text was prepared with first. x is from the start of the line.
function glyphPositions(ctx: CanvasRenderingContext2D, text: string): GlyphBox[] {
  const boxes: GlyphBox[] = []
  for (const { segment: grapheme, index } of new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text)) {
    const width = ctx.measureText(grapheme).width
    boxes.push({ grapheme, x: ctx.measureText(text.slice(0, index + grapheme.length)).width - width, width })
  }
  return boxes
}
```

Pretext gives the lines, and each line gives its boxes:

```ts needs=glyphPositions,paintableText
function layoutGlyphs(prepared: PreparedTextWithSegments, font: string, maxWidth: number, lineHeight: number, ctx: CanvasRenderingContext2D) {
  ctx.font = font
  return layoutWithLines(prepared, maxWidth, lineHeight).lines.flatMap((line, row) =>
    glyphPositions(ctx, paintableText(prepared, line, font)).map((box) => ({ ...box, y: row * lineHeight })),
  )
}
```

- **Don't add up each letter's own width.** That drops the kerning between letters, and the error grows along the line. Each letter is a separate `fillText` here, but it still lands where the whole line would put it.
- **Compute the boxes once per layout**, then animate from them. Each box measures a growing prefix, so the work is quadratic in the line's length: fine once, wasteful on every frame.
- **Add the line's own `x`** when lines don't start at 0, as in [text around obstacles](patterns-flow.md#text-around-obstacles).
- **Left-to-right text only.** Arabic and other joining scripts change shape when their letters are apart, and right-to-left text needs visual order, which a string prefix doesn't give. Animate whole words or lines for those.
- **Ligatures.** Letters inside a ligature, such as `ffi` in some fonts, have only approximate positions.
- **Emoji.** In WebKit a colour emoji between other text can land slightly off.
- **Text painted in the DOM** can sit a little differently from canvas, so these boxes are for canvas. For DOM text, read `Range.getClientRects()`, which is the browser's answer and not Pretext's.

---

## Ink bounds for collisions

`x` and `width` are advances: the space a letter takes up in the line, not the shape you see. A game that collides with the visible letter needs its ink, which comes from canvas too: `ctx.measureText(grapheme)` returns `actualBoundingBoxLeft`, `actualBoundingBoxRight`, `actualBoundingBoxAscent` and `actualBoundingBoxDescent`, measured from the point it is drawn at. Keep them per grapheme and font, since the same letter always has the same ink.

For word-sized targets, such as bricks made of words, the line's advance widths are usually enough: each word's box is its width plus your padding.
