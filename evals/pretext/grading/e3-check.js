export default async (mod, { core, rich, only }) => {
  const T = 'The quick brown fox jumps over the lazy dog and keeps running past the old mill. '.repeat(6).trim()
  const F = '16px Arial'
  const r = {}
  const items = [{ text: 'Thanks for the review, ', font: F }, { text: '@maya', font: 'bold 14px Arial', break: 'never', extraWidth: 12 }, { text: ' this reads a lot better now that the section is split.', font: F }]
  const all = {
    flowArticle: () => mod.flowArticle(T, 320, 22, { top: 0, bottom: 80, width: 120 }).length,
    paintColumn: () => { let n = 0; const y = mod.paintColumn({ fillText() { n++ } }, core.prepareWithSegments(T, F), { top: 0, left: 0, width: 300, lineHeight: 22 }); return { n, y } },
    countColumnLines: () => mod.countColumnLines(core.prepareWithSegments(T, F), (i) => 200 + i),
    singleLineWidth: () => mod.singleLineWidth('Hello world'),
    hasNoBreakRun: () => ({ noBreak: mod.hasNoBreakRun('10\u00A0km away'), plain: mod.hasNoBreakRun('10 km away') }),
    prepareForElement: () => { const el = document.createElement('p'); el.style.font = '16px Arial'; document.body.append(el); return !!mod.prepareForElement('hi there', el) },
    prepareThread: () => mod.prepareThread([items, items]).length,
    prepareAllThreads: () => mod.prepareAllThreads([{ paragraphs: items }]).length,
    highlightSpans: () => mod.highlightSpans(items, 160),
    copySpans: () => mod.copySpans(rich.prepareRichInline(items), 160),
    locale: () => { mod.applyReaderLocale(); mod.resetReaderLocale(); return true },
  }
  for (const [k, f] of Object.entries(all)) { if (only && only !== k) continue; try { r[k] = f() } catch (e) { r[k] = 'THROW ' + e } }
  return r
}
