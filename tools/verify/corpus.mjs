// Fixed test texts shared by claims and recipe checks.
export const PARITY_TEXTS = [
  'The quick brown fox jumps over the lazy dog and keeps running far away.',
  'Supercalifragilisticexpialidocious-and-more https://example.com/a/very/long/path/that/keeps/going/on/and/on?q=1 end',
  '春天到了，花儿开了。「你好」世界。AGI 春天到了. بدأت الرحلة 🚀',
  'Mix of (parens), "quotes" — dashes—and\u00ADsoft\u00ADhyphens in a longer sentence for wrapping purposes.',
]
export const STREAM_REPLY =
  'Here is the plan.\n\nFirst, measure each block once and keep the handle.\n\n' +
  '- prepare the block\n- lay it out per width\n- paint only what shows\n\n' +
  'Then, when a new token arrives, only the last block changes, so only it is prepared again.\n\n' +
  'Finally, sum the heights.'
export const FONT = '16px Inter'   // @fontsource/inter latin + latin-ext, loaded via FontFace before any check
export const LINE_HEIGHT = 20
// Clamp corpus: the parity texts plus long unbroken words, CJK, Thai, emoji, one-letter words,
// short words and Arabic.
export const CLAMP_TEXTS = [
  ...PARITY_TEXTS,
  'Supercalifragilisticexpialidociousandmorewithoutanyspacesatall',
  '日本語の文章はスペースなしで続きます。改行の位置を確かめる。',
  'ภาษาไทยไม่มีช่องว่างระหว่างคำ',
  '🚀🎉✨ emoji 🌍 run 🎈🎁',
  'a b c d e f g h i j k l m n o p q r s t u v w x y z',
  'Go to it, do it, and so on.',
  'مرحبا بالعالم',
]
// Real hyphens ('well-known', 're-entry') beside soft-hyphen break points.
export const PAINTABLE_TEXT = 'well-known contre-pro\u00ADposition co\u00ADoperate re-entry'

// Per-character recipes. Kerned capitals first; the third text keeps U+0301 as an escape so that
// normalizing this file can't compose it, and holds the ZWJ emoji the grapheme split must keep whole.
export const GLYPH_TEXTS = ['AVATAR Tokyo WAVE To Ty Yo', 'We Were Taking Awkward Vows', 'cafe\u0301 👩‍👩‍👧 ok', 'office affinity fjord', 'go 🇺🇸 now']
export const GLYPH_PAINT_TEXTS = GLYPH_TEXTS.filter((t) => !/\p{Extended_Pictographic}/u.test(t))

// How far drawing each box's grapheme at its x is from one fillText of the whole line:
// sum of |alpha difference| over the line's total alpha. 0 means the same pixels.
export function glyphPaintRatio(text, boxes, font = FONT) {
  const draw = (paint) => {
    const c = document.createElement('canvas')
    c.width = 600; c.height = 40
    const g = c.getContext('2d', { willReadFrequently: true })
    g.font = font; g.textBaseline = 'top'
    paint(g)
    return g.getImageData(0, 0, 600, 40).data
  }
  const whole = draw((g) => g.fillText(text, 2, 8))
  const parts = draw((g) => { for (const b of boxes) g.fillText(b.grapheme, 2 + b.x, 8) })
  let diff = 0, ink = 0
  for (let i = 3; i < whole.length; i += 4) { diff += Math.abs(whole[i] - parts[i]); ink += whole[i] }
  return diff / ink
}
