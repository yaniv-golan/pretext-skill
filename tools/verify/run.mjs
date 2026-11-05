// Skill verifier. Prints only `FAIL <gate> <file>:<line> [<id>] <message>`, `UNLAUNCHABLE <engine> <message>`
// and one `GATE <n> PASS|FAIL` per gate. Exit 0: all gates pass; 1: a gate failed; 2: an engine in
// BROWSERS could not launch (the other engines' results still print).
//   BROWSERS=chromium,webkit,firefox   (default chromium)
//   SCOPE=skill                        limits gates 5 and 6 to the shipped skill
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import {
  ts, parse, PKG, loadBlocks, skillFiles, pretextNames, buildModule, blockExt, topLevelFunctions, CODE_LANGS,
  typescriptBlocks, docDeclarations, docModule, headingSlugs, links, outsideFences,
} from './extract.mjs'

const THIS = fileURLToPath(import.meta.url)
const HERE = path.dirname(THIS)
const ROOT = path.resolve(HERE, '../..')
const SKILL = path.join(ROOT, 'pretext/skills/pretext')
const BUILD = path.join(HERE, '.build')

// ---------- child mode: one Node claim per process, so globals and caches never leak ----------
if (process.argv[2] === '--node-claim') {
  const { CLAIMS } = await import('./claims.mjs')
  const claim = CLAIMS.find((c) => c.id === process.argv[3])
  let result
  try { await claim.run({ engine: 'node' }); result = { ok: true } } catch (e) { result = { ok: false, msg: e?.message || String(e) } }
  process.stdout.write('\n' + JSON.stringify(result) + '\n')
  process.exit(0)
}

// ---------- reporting ----------
const GATES = [1, 2, 3, 4, 5, 6]
const lines = Object.fromEntries(GATES.map((g) => [g, []]))
const failed = new Set()
const unlaunchable = []
const oneLine = (s) => String(s).replace(/\s+/g, ' ').trim()
function fail(gate, loc, id, msg) {
  lines[gate].push(`FAIL ${gate} ${loc} [${id}] ${oneLine(msg)}`)
  failed.add(gate)
}
async function guard(gate, fn) {
  try { await fn() } catch (e) { fail(gate, '<none>:0', 'crash', e?.stack?.split('\n').slice(0, 2).join(' ') || e) }
}

const BROWSERS = (process.env.BROWSERS || 'chromium').split(',').map((s) => s.trim()).filter(Boolean)
const SCOPE = process.env.SCOPE || 'all'

const names = pretextNames()
const blocks = loadBlocks(SKILL)
const { CLAIMS } = await import('./claims.mjs')
const CLAIM_IDS = new Set(CLAIMS.map((c) => c.id))
fs.rmSync(BUILD, { recursive: true, force: true })
fs.mkdirSync(path.join(BUILD, 'g1'), { recursive: true })
fs.mkdirSync(path.join(BUILD, 'g3'), { recursive: true })

// ---------- gate 1 prep: one module per non-illustrative js/ts/jsx block ----------
const g1Files = new Map() // abs path -> { block, map }
await guard(1, () => {
  for (const u of blocks.unclosed) fail(1, `${u.file}:${u.line}`, 'fence', 'code fence never closed')
  for (const b of blocks) {
    if (!CODE_LANGS.has(b.lang) || b.tags.illustrative) continue
    const mod = buildModule(b, blocks, names)
    for (const e of mod.errors) fail(1, `${b.file}:${b.line}`, 'needs', e)
    const abs = path.join(BUILD, 'g1', `${b.file.replace(/[/.]/g, '_')}-L${b.line}.${mod.ext}`)
    fs.writeFileSync(abs, mod.code)
    g1Files.set(abs, { block: b, map: mod.map })
    const knownClaim = b.tags.claim && CLAIM_IDS.has(b.tags.claim)
    if (b.tags.claim && !knownClaim) fail(1, `${b.file}:${b.line}`, 'claim', `unknown claim id ${b.tags.claim}`)
    if (!knownClaim) b.body.split('\n').forEach((l, i) => {
      if (/\/\/\s*→.*\d/.test(l)) fail(1, `${b.file}:${b.bodyLine + i}`, 'arrow', `numeric // → output without claim=: ${l.trim()}`)
    })
  }
})

// ---------- gate 3 prep: doc blocks of api.md and rich-inline.md as two modules ----------
const DOC_FILES = ['references/api.md', 'references/rich-inline.md']
const docBlocks = Object.fromEntries(DOC_FILES.map((f) => [f, typescriptBlocks(SKILL, f)]))
const g3Files = new Map() // abs path -> { file, map }
await guard(3, () => {
  for (const f of DOC_FILES) {
    const { code, map } = docModule(docBlocks[f])
    const abs = path.join(BUILD, 'g3', path.basename(f, '.md') + '.ts')
    fs.writeFileSync(abs, code)
    g3Files.set(abs, { file: f, map })
  }
})

// ---------- one tsc run (TypeScript 7) for gates 1, 3 and 4 ----------
// A syntax error anywhere stops tsc from reporting type errors everywhere, so files that don't parse
// are reported from their parse diagnostics and left out of the tsc run.
const diags = runTsc()
function runTsc() {
  const out = []
  const files = [path.join(HERE, 'prelude.d.ts'), path.join(HERE, 'type-claims.ts')]
  for (const abs of [...g1Files.keys(), ...g3Files.keys()]) {
    const sf = parse(fs.readFileSync(abs, 'utf8'), path.basename(abs))
    if (!sf.parseDiagnostics.length) { files.push(abs); continue }
    for (const d of sf.parseDiagnostics)
      out.push({ file: abs, line: sf.getLineAndCharacterOfPosition(d.start).line + 1, code: 'TS' + d.code, msg: ts.flattenDiagnosticMessageText(d.messageText, ' ') })
  }
  fs.writeFileSync(path.join(BUILD, 'tsconfig.json'), JSON.stringify({ extends: '../tsconfig.json', include: [], files }))
  const r = spawnSync(process.execPath, [path.join(HERE, 'node_modules/typescript/bin/tsc'), '-p', path.join(BUILD, 'tsconfig.json'), '--pretty', 'false'], { cwd: HERE, encoding: 'utf8' })
  const tscOut = []
  for (const l of (r.stdout + r.stderr).split('\n')) {
    const m = /^(.+?)\((\d+),(\d+)\): error (TS\d+): (.*)$/.exec(l)
    if (m) tscOut.push({ file: path.resolve(HERE, m[1]), line: +m[2], code: m[4], msg: m[5] })
    else if (l.startsWith(' ') && tscOut.length) tscOut[tscOut.length - 1].msg += ' ' + l.trim()
    else if (/error TS\d+/.test(l)) tscOut.push({ file: null, line: 0, code: 'tsc', msg: l })
  }
  if (r.status !== 0 && tscOut.length === 0) tscOut.push({ file: null, line: 0, code: 'tsc', msg: `tsc exited ${r.status}: ${(r.stderr || r.stdout).slice(0, 300)}` })
  return out.concat(tscOut)
}

// ---------- gate 1: compile ----------
await guard(1, () => {
  for (const d of diags) {
    if (d.file && g1Files.has(d.file)) {
      const { block, map } = g1Files.get(d.file)
      const at = map[d.line - 1] || { file: block.file, line: block.line }
      fail(1, `${at.file}:${at.line}`, 'compile', `${d.code} ${d.msg}`)
    } else if (!d.file || (!d.file.startsWith(path.join(BUILD, 'g3')) && d.file !== path.join(HERE, 'type-claims.ts'))) {
      fail(1, `${d.file ? path.relative(HERE, d.file) : '<none>'}:${d.line}`, 'tsc', `${d.code} ${d.msg}`)
    }
  }
})

// ---------- gate 3: signatures and types ----------
await guard(3, () => {
  const f = ts.factory
  const printer = ts.createPrinter({ removeComments: true })
  const UNIONS = unionsFrom(path.join(PKG, 'dist/analysis.d.ts'))
  UNIONS.AnalysisWordBreakMode = UNIONS.WordBreakMode
  const SKIP = new Set(['PreparedText', 'PreparedRichInline', 'WordBreakMode'])
  const isUnionRef = (n) => ts.isTypeReferenceNode(n) && ts.isIdentifier(n.typeName) && !n.typeArguments && UNIONS[n.typeName.text]
  const union = (n) => f.createUnionTypeNode(UNIONS[n.typeName.text].map((s) => f.createLiteralTypeNode(f.createStringLiteral(s, true))))
  const visit = (n) => {
    if (ts.isArrayTypeNode(n) && isUnionRef(n.elementType)) return f.updateArrayTypeNode(n, f.createParenthesizedType(union(n.elementType)))
    if (isUnionRef(n)) return union(n)
    return ts.visitEachChild(n, visit, undefined)
  }
  const canon = (node, sf) => {
    const bare = ts.isFunctionDeclaration(node)
      ? f.updateFunctionDeclaration(node, undefined, node.asteriskToken, node.name, node.typeParameters, node.parameters, node.type, node.body)
      : f.updateTypeAliasDeclaration(node, undefined, node.name, node.typeParameters, node.type)
    return printer.printNode(ts.EmitHint.Unspecified, ts.visitEachChild(bare, visit, undefined), sf).replace(/\s+/g, ' ').trim()
  }

  const dtsFns = [], dtsTypes = []
  for (const file of ['dist/layout.d.ts', 'dist/rich-inline.d.ts']) {
    const sf = parse(fs.readFileSync(path.join(PKG, file), 'utf8'), 'x.d.ts')
    for (const s of sf.statements) {
      if (ts.isFunctionDeclaration(s) && s.name) dtsFns.push({ name: s.name.text, canon: canon(s, sf) })
      else if (ts.isTypeAliasDeclaration(s)) dtsTypes.push({ name: s.name.text, canon: canon(s, sf) })
    }
  }
  const dtsCanon = new Set([...dtsFns, ...dtsTypes].map((d) => d.canon))
  const docs = docDeclarations(DOC_FILES.flatMap((file) => docBlocks[file])).map((d) => ({ ...d, canon: canon(d.node, d.sf) }))
  const docCanon = new Set(docs.map((d) => d.canon))

  // gate3:functions
  if (dtsFns.length !== 17) fail(3, '<none>:0', 'functions', `expected 17 functions in the d.ts, found ${dtsFns.length}`)
  for (const d of dtsFns) if (!docCanon.has(d.canon)) fail(3, '<none>:0', d.name, 'undocumented')
  // gate3:types
  for (const t of dtsTypes) if (!SKIP.has(t.name) && !docCanon.has(t.canon)) fail(3, '<none>:0', t.name, 'undocumented')
  // gate3:no-stale
  for (const d of docs) if (!dtsCanon.has(d.canon)) fail(3, `${d.file}:${d.line}`, d.name, 'stale')
  // gate3:doc-blocks-compile: first failing doc block per module (and nothing proven if tsc didn't run)
  for (const d of diags) if (!d.file) fail(3, '<none>:0', 'compile', `${d.code} ${d.msg}`)
  for (const [abs, { file, map }] of g3Files) {
    const ds = diags.filter((d) => d.file === abs).sort((a, b) => a.line - b.line)
    if (!ds.length) continue
    const at = map[ds[0].line - 1]
    fail(3, at ? `${at.file}:${at.line}` : `${file}:0`, 'compile', `${ds[0].code} ${ds[0].msg}${ds.length > 1 ? ` (+${ds.length - 1} more)` : ''}`)
  }
})

function unionsFrom(file) {
  const sf = parse(fs.readFileSync(file, 'utf8'), 'x.d.ts')
  const out = {}
  for (const s of sf.statements)
    if (ts.isTypeAliasDeclaration(s) && ts.isUnionTypeNode(s.type) && s.type.types.every((t) => ts.isLiteralTypeNode(t) && ts.isStringLiteral(t.literal)))
      out[s.name.text] = s.type.types.map((t) => t.literal.text)
  return out
}

// ---------- gates 2 and 4: browser and Node ----------
const CHECKS = (await import('./recipe-checks.mjs')).default
const claimsSrc = fs.readFileSync(path.join(HERE, 'claims.mjs'), 'utf8').split('\n')
const claimLoc = (id) => `claims.mjs:${claimsSrc.findIndex((l) => l.includes(`id: '${id}'`)) + 1}`
const runBlocks = blocks.filter((b) => b.tags.run && !b.tags.illustrative && CODE_LANGS.has(b.lang))
const bundles = new Map() // name -> js
const blockUnits = [] // { block, bundle, ids, exposed }

// gate 2 static rules (engine-independent) and bundles
await guard(2, async () => {
  const esbuild = await import('esbuild')
  const bundle = async (contents, loader, sourcefile) => (await esbuild.build({
    stdin: { contents, resolveDir: HERE, loader, sourcefile }, bundle: true, format: 'esm', write: false, platform: 'browser',
    jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"' }, logLevel: 'silent',
  })).outputFiles[0].text
  bundles.set('harness', await bundle(
    "import { CLAIMS } from './claims.mjs'; import CHECKS from './recipe-checks.mjs';\n" +
    'globalThis.__claims = Object.fromEntries(CLAIMS.map((c) => [c.id, c])); globalThis.__checks = CHECKS;', 'js', 'harness.js'))

  const declaredIds = new Set(runBlocks.flatMap((b) => b.tags.id))
  for (const id of Object.keys(CHECKS)) if (!declaredIds.has(id)) fail(2, '<none>:0', id, 'no block')

  for (const [i, b] of runBlocks.entries()) {
    const loc = `${b.file}:${b.line}`
    const ext = blockExt(b)
    const fns = topLevelFunctions(b.body, ext)
    for (const fn of fns) if (!b.tags.id.includes(fn)) fail(2, loc, fn, 'declared function not listed in id=')
    for (const id of b.tags.id) if (!fns.includes(id)) fail(2, loc, id, 'id= names a function the block does not declare')
    if (b.tags.id.length && !CHECKS[b.tags.id[0]]) fail(2, loc, b.tags.id[0], 'no entry in recipe-checks.mjs')
    const mod = buildModule(b, blocks, names)
    for (const e of mod.errors) fail(2, loc, 'needs', e)
    const exposed = b.tags.id.filter((id) => fns.includes(id))
    // A jsx block also exposes its own copy of React and react-dom: a component only renders under
    // the React it imports, and the harness bundle holds another copy.
    const react = ext === 'jsx'
      ? "\nimport * as __React from 'react'; import * as __ReactDOM from 'react-dom'; import * as __ReactDOMClient from 'react-dom/client';" +
        '\nglobalThis.__react = { ...__React, ...__ReactDOM, ...__ReactDOMClient };'
      : ''
    const code = mod.code + react + exposed.map((id) => `\nglobalThis.__recipes.${id} = ${id};`).join('')
    try {
      bundles.set(`block${i}`, await bundle(code, ext, `${b.file.replace(/\//g, '_')}-L${b.line}.${ext}`))
      blockUnits.push({ block: b, bundle: `block${i}`, ids: exposed.filter((id) => CHECKS[id]), exposed })
    } catch (e) {
      fail(2, loc, 'bundle', e.errors?.[0]?.text || e.message)
    }
  }
})

// A claim with `recipe: '<id>'` runs on the documented recipe: its page first loads the bundle of the
// `run` block whose id= declares that function, which sets globalThis.__recipes.<id>.
const recipeBundle = (c) => blockUnits.find((u) => u.exposed.includes(c.recipe))?.bundle
await guard(4, () => {
  for (const c of CLAIMS) {
    if (!c.recipe || recipeBundle(c)) continue
    const b = runBlocks.find((rb) => rb.tags.id.includes(c.recipe))
    fail(4, b ? `${b.file}:${b.line}` : '<none>:0', c.id, b ? `block declaring ${c.recipe} failed to bundle` : 'no block')
  }
})

// Node claims, each in its own process
const NODE_CLAIM_MS = 60000
await guard(4, () => {
  for (const c of CLAIMS) {
    if (!c.engines.includes('node')) continue
    const r = spawnSync(process.execPath, [THIS, '--node-claim', c.id], { cwd: HERE, encoding: 'utf8', timeout: NODE_CLAIM_MS })
    let res
    if (r.error?.code === 'ETIMEDOUT' || r.signal) res = { ok: false, msg: r.error?.code === 'ETIMEDOUT' ? `timed out after ${NODE_CLAIM_MS}ms` : `killed by ${r.signal}` }
    else try { res = JSON.parse(r.stdout.trim().split('\n').pop()) } catch { res = { ok: false, msg: `child failed: ${oneLine(r.stderr).slice(0, 300)}` } }
    if (!res.ok) fail(4, claimLoc(c.id), c.id, `node: ${res.msg}`)
  }
})

// type-claims.ts
await guard(4, () => {
  for (const d of diags) if (!d.file) fail(4, 'type-claims.ts:0', 'types', `${d.code} ${d.msg}`)
  for (const d of diags) if (d.file === path.join(HERE, 'type-claims.ts')) fail(4, `type-claims.ts:${d.line}`, 'types', `${d.code} ${d.msg}`)
})

// Browser engines
const FONT_DIR = path.join(HERE, 'node_modules/@fontsource/inter/files')
const INDEX = '<!doctype html><html lang="en"><head><meta charset="utf-8"><script src="/fixtures.js"></script></head><body style="margin:0"></body></html>'
const ORIGIN = 'http://verify.test'

function withTimeout(p, ms, onTimeout) {
  let t
  return Promise.race([p, new Promise((_, rej) => { t = setTimeout(() => { onTimeout?.(); rej(new Error(`timed out after ${ms}ms`)) }, ms) })]).finally(() => clearTimeout(t))
}

async function openPage(context) {
  const page = await context.newPage()
  await page.goto(ORIGIN + '/')
  await page.evaluate(() => globalThis.__fontsReady)
  await page.evaluate(() => import('/b/harness.js').then(() => {}))
  return page
}

const { chromium, webkit, firefox } = await import('playwright')
const ENGINES = { chromium, webkit, firefox }
for (const engine of BROWSERS) {
  if (!ENGINES[engine]) { unlaunchable.push(`UNLAUNCHABLE ${engine} unknown engine`); continue }
  let browser
  try {
    browser = await withTimeout(ENGINES[engine].launch(), 60000)
  } catch (e) {
    unlaunchable.push(`UNLAUNCHABLE ${engine} ${oneLine(e.message.split('\n')[0])}`)
    continue
  }
  try {
    const context = await browser.newContext()
    await context.route(ORIGIN + '/**', (route) => {
      const p = new URL(route.request().url()).pathname
      if (p === '/') return route.fulfill({ contentType: 'text/html', body: INDEX })
      if (p === '/fixtures.js') return route.fulfill({ contentType: 'text/javascript', path: path.join(HERE, 'fixtures.js') })
      if (p.startsWith('/fonts/')) return route.fulfill({ contentType: 'font/woff2', path: path.join(FONT_DIR, path.basename(p)) })
      const m = /^\/b\/(\w+)\.js$/.exec(p)
      if (m && bundles.has(m[1])) return route.fulfill({ contentType: 'text/javascript', body: bundles.get(m[1]) })
      return route.fulfill({ status: 404, body: '' })
    })

    // gate 2: each run block loads (5 s watchdog). Then, on a fresh page each, its check runs on the
    // documented recipe (must pass within 60 s) and on every mutant (must fail; a mutant that hangs past
    // 10 s counts as rejected). A synchronous hang blocks the whole page, hence one page per function.
    // A watchdog that fires sets timedOut, so its error (often "Target page ... has been closed",
    // since the watchdog closes the page) is told apart from a page that crashed or closed by itself.
    const TIMED_OUT = Symbol('timed out')
    const loadBlock = async (u) => {
      const page = await withTimeout(openPage(context), 30000)
      let timedOut = false
      try {
        await withTimeout(page.evaluate((n) => import(`/b/${n}.js`).then(() => {}), u.bundle), 5000, () => { timedOut = true; page.close().catch(() => {}) })
      } catch (e) { await page.close().catch(() => {}); if (timedOut) e[TIMED_OUT] = true; throw e }
      return page
    }
    // target: 'recipe' or a mutant index. Resolves { ok: true }, { ok: false, kind: 'check', msg } when
    // the check rejected it, { ok: false, kind: 'timeout' } or { ok: false, kind: 'error', msg } when
    // the block failed to load or evaluate.
    const attempt = async (u, id, target, ms) => {
      let page
      let timedOut = false
      try {
        page = await loadBlock(u)
        const msg = await withTimeout(page.evaluate(async ({ id, target, engine }) => {
          const entry = globalThis.__checks[id]
          const fn = target === 'recipe' ? globalThis.__recipes[id] : entry.mutants[target]
          try { return (await entry.check(fn, { engine })) === false ? 'check returned false' : null } catch (e) { return String(e?.message || e) }
        }, { id, target, engine }), ms, () => { timedOut = true; page.close().catch(() => {}) })
        return msg ? { ok: false, kind: 'check', msg } : { ok: true }
      } catch (e) {
        if (timedOut || e[TIMED_OUT]) return { ok: false, kind: 'timeout', msg: 'timed out' }
        return { ok: false, kind: 'error', msg: e.message.split('\n')[0] }
      } finally { await page?.close().catch(() => {}) }
    }
    await guard(2, async () => {
      for (const u of blockUnits) {
        const loc = `${u.block.file}:${u.block.line}`
        try {
          try { await (await loadBlock(u)).close() } catch (e) {
            fail(2, loc, u.block.tags.id[0] || 'load', `${engine}: ${e[TIMED_OUT] ? 'timed out' : e.message.split('\n')[0]}`)
            continue
          }
          for (const id of u.ids) {
            const main = await attempt(u, id, 'recipe', 60000)
            if (!main.ok) fail(2, loc, id, `${engine}: ${main.msg}`)
            for (let i = 0; i < (CHECKS[id].mutants || []).length; i++) {
              // rejected: the check failed it, or it hung past the watchdog
              const r = await attempt(u, id, i, 10000)
              if (r.ok) fail(2, loc, id, `${engine}: check accepts mutant ${i + 1}`)
              else if (r.kind === 'error') fail(2, loc, id, `${engine}: mutant ${i + 1} did not run: ${r.msg}`)
            }
          }
        } catch (e) {
          fail(2, loc, u.block.tags.id[0] || 'block', `${engine}: ${e.message.split('\n')[0]}`)
        }
      }
    })

    // gate 4: browser claims
    await guard(4, async () => {
      for (const c of CLAIMS) {
        if (!c.engines.includes(engine) || (c.recipe && !recipeBundle(c))) continue
        const page = await openPage(context)
        try {
          if (c.recipe) await withTimeout(page.evaluate((n) => import(`/b/${n}.js`).then(() => {}), recipeBundle(c)), 5000)
          const msg = await withTimeout(page.evaluate(({ id, engine }) =>
            Promise.resolve().then(() => globalThis.__claims[id].run({ engine })).then(() => null, (e) => String(e?.message || e)), { id: c.id, engine }),
          120000, () => page.close().catch(() => {}))
          if (msg) fail(4, claimLoc(c.id), c.id, `${engine}: ${msg}`)
        } catch (e) {
          fail(4, claimLoc(c.id), c.id, `${engine}: ${e.message.split('\n')[0]}`)
        } finally { await page.close().catch(() => {}) }
      }
    })
  } finally { await browser.close().catch(() => {}) }
}

// ---------- gates 5 and 6: text rules and links ----------
const EXTRA = ['README.md', 'docs/cross-platform.md', '.claude-plugin/marketplace.json', 'pretext/.claude-plugin/plugin.json', '.cursor-plugin/plugin.json']
const scopeFiles = [
  ...skillFiles(SKILL).map((rel) => ({ rel, abs: path.join(SKILL, rel), skill: true })),
  ...(SCOPE === 'skill' ? [] : EXTRA.map((rel) => ({ rel, abs: path.join(ROOT, rel), skill: false }))),
].filter((f) => fs.existsSync(f.abs))
const read = (f) => fs.readFileSync(f.abs, 'utf8')
const lineAt = (text, i) => text.slice(0, i).split('\n').length

await guard(5, () => {
  const { patterns } = JSON.parse(fs.readFileSync(path.join(HERE, 'banlist.json'), 'utf8'))
  for (const f of scopeFiles) {
    const text = read(f)
    for (const p of patterns) {
      if (p.exempt.includes(path.basename(f.rel))) continue
      for (const m of text.matchAll(new RegExp(p.pattern, 'g'))) fail(5, `${f.rel}:${lineAt(text, m.index)}`, 'ban', `/${p.pattern}/ matched ${JSON.stringify(m[0])}`)
    }
  }

  const skillText = fs.readFileSync(path.join(SKILL, 'SKILL.md'), 'utf8')
  if (skillText.length > 19000) fail(5, 'SKILL.md:0', 'size', `SKILL.md is ${skillText.length} characters, limit 19000`)
  const desc = frontmatterDescription(skillText)
  if (!desc) fail(5, 'SKILL.md:1', 'description', 'no description in frontmatter')
  else if (desc.value.length > 700) fail(5, `SKILL.md:${desc.line}`, 'description', `description is ${desc.value.length} characters, limit 700`)

  const illustrative = blocks.filter((b) => b.tags.illustrative)
  if (illustrative.length > 8) fail(5, `${illustrative[8].file}:${illustrative[8].line}`, 'illustrative', `${illustrative.length} illustrative blocks, limit 8`)

  const refs = skillFiles(SKILL).filter((r) => r.startsWith('references/'))
  for (const r of refs) {
    const text = fs.readFileSync(path.join(SKILL, r), 'utf8')
    const n = text.replace(/\n$/, '').split('\n').length
    if (n > 150 && !/^#{1,3}\s+(Table of )?Contents\s*$/im.test(text)) fail(5, `${r}:1`, 'toc', `${n} lines and no table of contents`)
  }
  const routed = routingTargets(skillText)
  for (const r of refs) if (!routed.has(r)) fail(5, 'SKILL.md:0', 'routing', r)
})

// Folded (>-, >), literal (|) or plain/quoted scalar `description:` in the YAML frontmatter.
function frontmatterDescription(text) {
  const fm = /^---\n([\s\S]*?)\n---/.exec(text)
  if (!fm) return null
  const ls = fm[1].split('\n')
  const i = ls.findIndex((l) => /^description:/.test(l))
  if (i < 0) return null
  const rest = ls[i].replace(/^description:\s*/, '')
  if (/^[>|][-+]?$/.test(rest)) {
    const body = []
    for (let j = i + 1; j < ls.length && (/^\s+\S/.test(ls[j]) || ls[j].trim() === ''); j++) body.push(ls[j].trim())
    while (body.length && body[body.length - 1] === '') body.pop()
    const value = rest[0] === '|' ? body.join('\n') : body.join('\n').replace(/([^\n])\n(?=[^\n])/g, '$1 ').replace(/\n\n/g, '\n')
    return { value, line: i + 2 }
  }
  return { value: rest.replace(/^(['"])(.*)\1$/, '$2'), line: i + 2 }
}

// references/<file> linked from the first Markdown table under `## Where to Read More`.
function routingTargets(text) {
  const out = new Set()
  const ls = outsideFences(text)
  const start = ls.findIndex(({ line }) => /^##\s+Where to Read More\s*$/.test(line))
  if (start < 0) return out
  let inTable = false
  for (const { line } of ls.slice(start + 1)) {
    if (/^#{1,2}\s/.test(line)) break
    if (/^\s*\|/.test(line)) {
      inTable = true
      for (const m of line.matchAll(/\]\((?:\.\/)?(references\/[^)#\s]+)/g)) out.add(m[1])
    } else if (inTable) break
  }
  return out
}

await guard(6, () => {
  const mdFiles = scopeFiles.filter((f) => f.rel.endsWith('.md'))
  const slugCache = new Map()
  const slugsOf = (abs) => { if (!slugCache.has(abs)) slugCache.set(abs, headingSlugs(fs.readFileSync(abs, 'utf8'))); return slugCache.get(abs) }
  for (const f of mdFiles) {
    const text = read(f)
    for (const l of links(text)) {
      if (/^[a-z][a-z0-9+.-]*:/i.test(l.target) || l.target.startsWith('//')) continue
      const [p, anchor] = l.target.split('#')
      const abs = p ? path.resolve(path.dirname(f.abs), decodeURIComponent(p)) : f.abs
      const loc = `${f.rel}:${l.line}`
      if (!fs.existsSync(abs)) { fail(6, loc, 'link', `${l.target}: no such file`); continue }
      if (anchor !== undefined && abs.endsWith('.md') && !slugsOf(abs).has(anchor)) fail(6, loc, 'link', `${l.target}: no heading #${anchor}`)
      if (f.rel !== 'SKILL.md' && f.skill && path.basename(abs) === 'SKILL.md' && anchor !== undefined && (/^\d/.test(anchor) || /gotcha/i.test(l.text)))
        fail(6, loc, 'gotcha-link', `${l.target}: cite gotchas as plain text ("see SKILL.md gotcha #N"), not links`)
    }
    for (const m of text.matchAll(/gotchas?\s+#\d+(?:(?:\s*,\s*|\s+and\s+|\s+or\s+|\s*\/\s*)#\d+)*/gi))
      for (const n of m[0].matchAll(/#(\d+)/g))
        if (+n[1] < 1 || +n[1] > 13) fail(6, `${f.rel}:${lineAt(text, m.index)}`, 'gotcha', `gotcha #${n[1]} is outside 1-13`)
  }
})

// ---------- output ----------
for (const g of GATES) for (const l of lines[g]) console.log(l)
for (const l of unlaunchable) console.log(l)
for (const g of GATES) console.log(`GATE ${g} ${failed.has(g) ? 'FAIL' : 'PASS'}`)
process.exitCode = unlaunchable.length ? 2 : failed.size ? 1 : 0
