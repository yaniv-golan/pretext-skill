export default async (mod) => {
  const parts = [
    { type: 'text', text: 'Shipped it to everyone this morning ' }, { type: 'emoji', name: 'party', src: 'party.png' },
    { type: 'text', text: ' and the graphs look fine so far, nobody has complained yet ' }, { type: 'emoji', name: 'fire', src: 'fire.png' },
    { type: 'emoji', name: 'ship', src: 'ship.png' },
  ]
  const lines = mod.layoutMessage(parts, 220)
  const flat = lines.flat()
  const emoji = flat.filter((p) => p.kind === 'emoji').map((p) => p.src)
  const text = flat.filter((p) => p.kind === 'text').map((p) => p.text).join(' ').replace(/\s+/g, ' ')
  const monotonic = lines.every((l) => l.every((p, i) => i === 0 || p.x >= l[i - 1].x))
  return { lines: lines.length, emoji, hasWords: /morning/.test(text) && /complained/.test(text), monotonic, stray: /[￼�]/.test(text) }
}
