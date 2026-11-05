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
