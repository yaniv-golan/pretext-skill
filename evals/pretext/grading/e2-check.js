export default async (mod, { core }) => {
  const F = '15px Arial', T = 'Sure, I can do Thursday afternoon, but I would need to leave by four to pick up the kids from practice.'
  const L = 'https://example.com/' + 'averylongpathsegment'.repeat(12)
  const fails = []
  for (const t of [T, L, 'ok']) for (let w = 120.5; w <= 420; w += 37.5) {
    const got = mod.bubbleWidth(t, F, w), p = core.prepare(t, F)
    if (got > w) fails.push(['over', t.slice(0, 8), w, got])
    if (core.layout(p, got, 20).lineCount !== core.layout(p, w, 20).lineCount) fails.push(['lines', t.slice(0, 8), w, got])
  }
  const shrunk = mod.bubbleWidth(T, F, 300) < 300
  return { fails, shrunk, short: mod.bubbleWidth('ok', F, 300) }
}
