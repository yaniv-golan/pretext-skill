// Lines must stay out of every circle's band interval, with text on both sides of the body.
export default async (mod, { core }) => {
  const T = 'The quick brown fox jumps over the lazy dog and keeps running past the old mill. '.repeat(14).trim()
  const F = '16px Arial', LH = 22, W = 420, H = 1400
  const circles = [{ x: 210, y: 130, r: 60 }, { x: 250, y: 200, r: 40 }, { x: 40, y: 320, r: 34 }]
  const interval = (c, top, bottom) => {
    const m = top <= c.y && c.y <= bottom ? 0 : Math.min(Math.abs(c.y - top), Math.abs(c.y - bottom))
    if (m >= c.r) return null
    const dx = Math.sqrt(c.r ** 2 - m ** 2)
    return { left: c.x - dx, right: c.x + dx }
  }
  const lines = mod.flowAroundBody(T, F, W, H, LH, circles)
  const bad = []
  const perBand = new Map()
  for (const l of lines) {
    const painted = core.measureNaturalWidth(core.prepare(l.text.trimEnd(), F))
    perBand.set(l.y, (perBand.get(l.y) ?? 0) + 1)
    if (l.x < -0.5 || l.x + painted > W + 0.5) bad.push(['outside', l])
    for (const c of circles) {
      const hit = interval(c, l.y, l.y + LH)
      if (hit && l.x < hit.right - 0.5 && l.x + painted > hit.left + 0.5) bad.push(['overlap', l.text, l.x, l.y])
    }
  }
  const strip = (s) => s.replace(/\s+/g, '')
  return { n: lines.length, sameText: strip(lines.map((l) => l.text).join('')) === strip(T), twoInBand: [...perBand.values()].some((n) => n > 1), bad: bad.slice(0, 5) }
}
