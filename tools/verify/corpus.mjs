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
