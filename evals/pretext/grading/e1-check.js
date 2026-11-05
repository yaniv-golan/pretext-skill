export default async (mod, { core }) => {
  const T = 'The quick brown fox jumps over the lazy dog and keeps running past the old mill. '.repeat(12).trim()
  const F = '16px Arial', LH = 22, W = 320, image = { width: 120, height: 100, gap: 12 }
  const lines = mod.flowAroundImage(T, F, LH, W, image)
  const bad = []
  for (const l of lines) {
    if (l.y + LH <= image.height && l.x < image.width + image.gap) bad.push(['beside', l])
    if (l.y >= image.height + image.gap + LH && l.x !== 0) bad.push(['below', l])
    const painted = core.measureNaturalWidth(core.prepare(l.text.trimEnd(), F))
    if (l.x + painted > W + 0.5) bad.push(['overflow', l])
  }
  return { n: lines.length, sameText: lines.map((l) => l.text).join(' ').replace(/\s+/g, ' ').trim() === T, bad }
}
