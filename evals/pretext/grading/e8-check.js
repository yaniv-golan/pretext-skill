export default async (mod) => {
  const F = '16px Arial', W = 300, LH = 24
  const ta = document.createElement('textarea'); ta.rows = 1
  ta.style.cssText = `font:${F};line-height:${LH}px;width:${W}px;padding:0;border:0;box-sizing:content-box;overflow:hidden;resize:none;display:block`
  document.body.append(ta)
  const browser = (v) => { ta.value = v; ta.style.height = '0px'; return ta.scrollHeight }
  const rows = ['', 'a', 'a\n', 'a\nb', 'a\n\n', 'x   y', '\n', 'one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen']
  return rows.map((v) => [v, mod.textareaHeight(v, F, W, LH), browser(v)])
}
