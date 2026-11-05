// Loaded as a classic script before any module in the verification page.
// Holds the recipe registry, runtime placeholders for `run` blocks, and the bundled Inter font.
globalThis.__recipes = {}

// Runtime counterparts of prelude.d.ts placeholders that `run` blocks may touch.
globalThis.ctx = document.createElement('canvas').getContext('2d')

// @fontsource/inter 400 latin + latin-ext, same unicode ranges as its CSS.
globalThis.__fontsReady = (async () => {
  const faces = [
    ['/fonts/inter-latin-400-normal.woff2', 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD'],
    ['/fonts/inter-latin-ext-400-normal.woff2', 'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF'],
  ]
  for (const [url, unicodeRange] of faces) {
    const face = new FontFace('Inter', `url(${url})`, { unicodeRange, weight: '400', style: 'normal' })
    document.fonts.add(face)
    await face.load()
  }
  await document.fonts.load('16px Inter', 'abc')
  // Test fonts for fontDrawsU2010, from the same latin file. InterNo has no U+2010 (its range stops at
  // U+00FF). InterWide draws U+2010 from a face scaled to 150%, so it is wider than '-'.
  const latin = '/fonts/inter-latin-400-normal.woff2'
  for (const [family, unicodeRange, sizeAdjust] of [
    ['InterNo', 'U+0000-00FF', '100%'],
    ['InterWide', 'U+0000-200F,U+2011-FFFF', '100%'],
    ['InterWide', 'U+2010', '150%'],
  ]) {
    const face = new FontFace(family, `url(${latin})`, { unicodeRange, sizeAdjust, weight: '400', style: 'normal' })
    document.fonts.add(face)
    await face.load()
  }
})()
