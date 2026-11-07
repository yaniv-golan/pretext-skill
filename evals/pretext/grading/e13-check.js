// Pixel test: each grapheme drawn at its x must match one fillText of its line.
export default async (mod, { core }) => {
  const LINE = 'AVATAR Tokyo WAVE To Ty Yo', T = (LINE + ' ').repeat(6).trim()
  const F = '16px Arial', LH = 22, W = 300
  const ctx = document.createElement('canvas').getContext('2d')
  ctx.font = F
  const segmenter = new Intl.Segmenter()
  const kern = Math.abs([...segmenter.segment(LINE)].reduce((a, s) => a + ctx.measureText(s.segment).width, 0) - ctx.measureText(LINE).width)
  if (kern <= 5) return { bad: [['font does not kern here', kern]] }

  const draw = (paint) => {
    const c = document.createElement('canvas')
    c.width = 600; c.height = 40
    const g = c.getContext('2d', { willReadFrequently: true })
    g.font = F; g.textBaseline = 'top'
    paint(g)
    return g.getImageData(0, 0, 600, 40).data
  }
  const chars = mod.layoutCharacters(T, F, W, LH)
  const lines = core.layoutWithLines(core.prepareWithSegments(T, F), W, LH).lines
  const strip = (s) => s.replace(/\s+/g, '')
  const bad = []
  if (strip(chars.map((c) => c.grapheme).join('')) !== strip(T)) bad.push(['spelling'])
  if (chars.some((c) => c.y % LH !== 0)) bad.push(['y'])
  lines.forEach((line, row) => {
    const boxes = chars.filter((c) => c.y === row * LH)
    const expected = [...segmenter.segment(line.text)].map((g) => g.segment)
    const visible = (list) => list.filter((g) => g.trim())
    if (visible(boxes.map((b) => b.grapheme)).join('\0') !== visible(expected).join('\0')) bad.push(['not one box per grapheme', row])
    for (const b of boxes) if (Math.abs(b.width - ctx.measureText(b.grapheme).width) > 0.01) bad.push(['width', row, b.grapheme])
    const whole = draw((g) => g.fillText(line.text, 2, 8))
    const parts = draw((g) => { for (const b of boxes) g.fillText(b.grapheme, 2 + b.x, 8) })
    let diff = 0, ink = 0
    for (let i = 3; i < whole.length; i += 4) { diff += Math.abs(whole[i] - parts[i]); ink += whole[i] }
    if (diff / ink > 0.02) bad.push(['paint', row, +(diff / ink).toFixed(3)])
  })
  return { n: chars.length, bad }
}
