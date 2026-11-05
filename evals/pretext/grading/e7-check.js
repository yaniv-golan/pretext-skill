export default async (mod, { core }) => {
  const F = '15px Arial', T = 'We shipped the new onboarding flow on Tuesday and the first numbers look good, though a few people got stuck on the invite step and we will look into that next week. '.repeat(3)
  const bad = []
  for (let w = 180; w <= 420; w += 23) {
    const r = mod.clampPreview(T, F, w), last = r.lines.at(-1)
    if (r.lines.length !== 3 || !r.truncated) bad.push(['shape', w, r.lines.length])
    if (!/\S…$/.test(last)) bad.push(['space', w, last])
    if (!/[\p{L}\p{N}]/u.test(last)) bad.push(['empty', w, last])
    if (core.measureNaturalWidth(core.prepare(last, F)) + 44 > w + 0.5) bad.push(['room', w, last])
  }
  const s = mod.clampPreview('Short note.', F, 300)
  return { bad, short: s }
}
