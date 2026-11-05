// Markdown extraction: fenced blocks, block modules for gates 1-2, doc declarations for gate 3,
// and headings/links for gate 6.
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
export const ts = require('ts-api')

const HERE = path.dirname(new URL(import.meta.url).pathname)
export const PKG = path.join(HERE, 'node_modules/@chenglou/pretext')
const MAIN = '@chenglou/pretext'
const RICH = '@chenglou/pretext/rich-inline'

// ---------- fences ----------

// Returns [{ file, lang, line, bodyLine, body, tags }] where line is the 1-based fence line.
export function parseFences(text, file) {
  const lines = text.split('\n')
  const blocks = []
  let open = null
  lines.forEach((l, i) => {
    if (!open) {
      const m = /^(\s*)```\s*([\w-]+)?(.*)$/.exec(l)
      if (!m) return
      open = { file, indent: m[1].length, lang: (m[2] || '').toLowerCase(), info: m[3].trim(), line: i + 1, buf: [] }
      return
    }
    if (/^\s*```\s*$/.test(l)) {
      const tags = parseInfo(open.info)
      blocks.push({ file, lang: open.lang, line: open.line, bodyLine: open.line + 1, body: open.buf.join('\n'), tags })
      open = null
      return
    }
    open.buf.push(l.slice(Math.min(open.indent, l.length - l.trimStart().length)))
  })
  return blocks
}

function parseInfo(info) {
  const tags = { run: false, illustrative: false, id: [], needs: [], claim: null }
  for (const tok of info.split(/\s+/).filter(Boolean)) {
    const [k, v] = tok.split('=')
    if (k === 'run') tags.run = true
    else if (k === 'illustrative') tags.illustrative = true
    else if (k === 'id' && v) tags.id = v.split(',').filter(Boolean)
    else if (k === 'needs' && v) tags.needs = v.split(',').filter(Boolean)
    else if (k === 'claim' && v) tags.claim = v
  }
  return tags
}

export function skillFiles(skillDir) {
  const refs = path.join(skillDir, 'references')
  const out = ['SKILL.md']
  if (fs.existsSync(refs)) for (const f of fs.readdirSync(refs).sort()) if (f.endsWith('.md')) out.push('references/' + f)
  return out
}

export function loadBlocks(skillDir) {
  return skillFiles(skillDir).flatMap((f) => parseFences(fs.readFileSync(path.join(skillDir, f), 'utf8'), f))
}

export const CODE_LANGS = new Set(['js', 'ts', 'jsx'])

// ---------- pretext export names (from the d.ts, never hand-typed) ----------

export function pretextNames() {
  const fns = new Map(), types = new Map()
  for (const [file, mod] of [['dist/layout.d.ts', MAIN], ['dist/rich-inline.d.ts', RICH]]) {
    const sf = parse(fs.readFileSync(path.join(PKG, file), 'utf8'), 'x.d.ts')
    for (const s of sf.statements) {
      if (!isExported(s)) continue
      if (ts.isFunctionDeclaration(s) && s.name) fns.set(s.name.text, mod)
      else if (ts.isTypeAliasDeclaration(s)) types.set(s.name.text, mod)
    }
  }
  return { fns, types }
}

const isExported = (s) => (ts.getModifiers?.(s) || s.modifiers || []).some((m) => m.kind === ts.SyntaxKind.ExportKeyword)

export function parse(src, name = 'x.tsx') {
  const kind = name.endsWith('.d.ts') || name.endsWith('.ts') ? ts.ScriptKind.TS : name.endsWith('.jsx') ? ts.ScriptKind.JSX : name.endsWith('.js') ? ts.ScriptKind.JS : ts.ScriptKind.TSX
  return ts.createSourceFile(name, src, ts.ScriptTarget.Latest, true, kind)
}

// Top-level function names a block declares (function declarations and const/let/var = function/arrow).
export function topLevelFunctions(src, ext) {
  const sf = parse(src, 'x.' + ext)
  const out = []
  for (const s of sf.statements) {
    if (ts.isFunctionDeclaration(s) && s.name) out.push(s.name.text)
    else if (ts.isVariableStatement(s))
      for (const d of s.declarationList.declarations)
        if (ts.isIdentifier(d.name) && d.initializer && (ts.isArrowFunction(d.initializer) || ts.isFunctionExpression(d.initializer))) out.push(d.name.text)
  }
  return out
}

// ---------- block modules (gates 1 and 2) ----------

export function blockExt(block) {
  return block.lang === 'jsx' ? 'jsx' : block.lang === 'ts' ? 'ts' : 'js'
}

// Finds the block that declares `id` (its id= list names it), in any file.
function findDeclaring(blocks, id) {
  return blocks.find((b) => b.tags.id.includes(id))
}

// Collects needs= parts depth-first (dependencies first), without duplicates.
function collectParts(block, blocks, seen = new Set(), errors = []) {
  const parts = []
  for (const id of block.tags.needs) {
    const dep = findDeclaring(blocks, id)
    if (!dep) { errors.push(`needs=${id}: no block declares it`); continue }
    if (seen.has(dep)) continue
    seen.add(dep)
    parts.push(...collectParts(dep, blocks, seen, errors).parts, dep)
  }
  return { parts, errors }
}

// Builds one module for a block: merged imports of the block and its needs= parts, injected Pretext
// imports, then the bodies. `map[i]` gives { file, line } for generated line i (0-based).
export function buildModule(block, blocks, names) {
  const ext = blockExt(block)
  const { parts, errors } = collectParts(block, blocks, new Set([block]))
  parts.push(block)
  const named = new Map() // module -> Set(specifier text)
  const otherImports = new Set()
  const imported = new Set(), declared = new Set(), used = new Set()
  const bodies = []
  for (const p of parts) {
    const sf = parse(p.body, 'x.' + ext)
    const lines = p.body.split('\n')
    for (const s of sf.statements) {
      if (ts.isImportDeclaration(s)) {
        const mod = s.moduleSpecifier.text
        const c = s.importClause
        if (c && !c.name && c.namedBindings && ts.isNamedImports(c.namedBindings)) {
          if (!named.has(mod)) named.set(mod, new Set())
          for (const el of c.namedBindings.elements) named.get(mod).add((c.isTypeOnly ? 'type ' : '') + el.getText(sf))
        } else otherImports.add(s.getText(sf).replace(/\s+/g, ' '))
        collectBindings(c, imported)
        // blank the import out, keeping line numbers
        const a = sf.getLineAndCharacterOfPosition(s.getStart(sf)).line
        const b = sf.getLineAndCharacterOfPosition(s.getEnd()).line
        for (let i = a; i <= b; i++) lines[i] = ''
      } else collectDeclared(s, declared)
    }
    walkIdentifiers(sf, used)
    bodies.push({ p, lines })
  }
  const inject = new Map()
  for (const n of used) {
    if (imported.has(n) || declared.has(n)) continue
    if (names.fns.has(n)) addTo(inject, names.fns.get(n), n)
    else if (ext === 'ts' && names.types.has(n)) addTo(inject, names.types.get(n), 'type ' + n)
  }
  for (const [mod, set] of inject) for (const n of set) {
    if (!named.has(mod)) named.set(mod, new Set())
    named.get(mod).add(n)
  }
  const head = [...otherImports]
  for (const [mod, set] of named) head.push(`import { ${[...set].join(', ')} } from '${mod}';`)
  const code = [], map = []
  for (const h of head) { code.push(h); map.push({ file: block.file, line: block.line }) }
  for (const { p, lines } of bodies) lines.forEach((l, i) => { code.push(l); map.push({ file: p.file, line: p.bodyLine + i }) })
  return { code: code.join('\n') + '\n', map, ext, errors, parts }
}

function addTo(m, k, v) { if (!m.has(k)) m.set(k, new Set()); m.get(k).add(v) }

function collectBindings(clause, out) {
  if (!clause) return
  if (clause.name) out.add(clause.name.text)
  const nb = clause.namedBindings
  if (nb && ts.isNamespaceImport(nb)) out.add(nb.name.text)
  if (nb && ts.isNamedImports(nb)) for (const el of nb.elements) out.add(el.name.text)
}

function collectDeclared(s, out) {
  if ((ts.isFunctionDeclaration(s) || ts.isClassDeclaration(s) || ts.isTypeAliasDeclaration(s) || ts.isInterfaceDeclaration(s) || ts.isEnumDeclaration(s)) && s.name) out.add(s.name.text)
  if (ts.isVariableStatement(s)) for (const d of s.declarationList.declarations) bindingNames(d.name, out)
}

function bindingNames(n, out) {
  if (ts.isIdentifier(n)) out.add(n.text)
  else for (const el of n.elements) if (!ts.isOmittedExpression(el)) bindingNames(el.name, out)
}

// Identifiers in reference position (skips `.name` property access and object keys).
function walkIdentifiers(sf, out) {
  const visit = (n) => {
    if (ts.isIdentifier(n)) {
      const p = n.parent
      const isMember = p && ((ts.isPropertyAccessExpression(p) && p.name === n) || (ts.isPropertyAssignment(p) && p.name === n) || (ts.isQualifiedName(p) && p.right === n))
      if (!isMember) out.add(n.text)
    }
    ts.forEachChild(n, visit)
  }
  visit(sf)
}

// ---------- gate 3 doc declarations ----------

export const DOC_IMPORTS = {
  header: [
    "import type { PreparedText, PreparedTextWithSegments, LayoutCursor, LayoutLine, LayoutLineRange } from '@chenglou/pretext';",
    "import type { PreparedRichInline } from '@chenglou/pretext/rich-inline';",
  ],
  names: new Set(['PreparedText', 'PreparedTextWithSegments', 'LayoutCursor', 'LayoutLine', 'LayoutLineRange', 'PreparedRichInline']),
}

// `typescript` blocks of a reference, or [] when the file doesn't exist yet.
export function typescriptBlocks(skillDir, rel) {
  const p = path.join(skillDir, rel)
  if (!fs.existsSync(p)) return []
  return parseFences(fs.readFileSync(p, 'utf8'), rel).filter((b) => b.lang === 'typescript')
}

// Function and type declarations in doc blocks: [{ node, sf, name, file, line }].
export function docDeclarations(blocks) {
  const out = []
  for (const b of blocks) {
    const sf = parse(b.body, 'doc.ts')
    for (const s of sf.statements)
      if ((ts.isFunctionDeclaration(s) || ts.isTypeAliasDeclaration(s)) && s.name) out.push({ node: s, sf, name: s.name.text, file: b.file, line: b.line })
  }
  return out
}

// One compilable module per reference: imports, doc functions as `declare function`, and type
// blocks the imports already provide dropped. Returns { code, map } with map[i] = fence-line info.
export function docModule(blocks) {
  const code = [...DOC_IMPORTS.header], map = DOC_IMPORTS.header.map(() => null)
  for (const b of blocks) {
    const sf = parse(b.body, 'doc.ts')
    let src = b.body
    const edits = []
    for (const s of sf.statements) {
      if (ts.isFunctionDeclaration(s)) edits.push({ at: s.getStart(sf), del: 0, ins: 'declare ' })
      else if (ts.isTypeAliasDeclaration(s) && DOC_IMPORTS.names.has(s.name.text)) {
        const a = s.getStart(sf), e = s.getEnd()
        edits.push({ at: a, del: e - a, ins: src.slice(a, e).replace(/[^\n]/g, ' ') })
      }
    }
    for (const ed of edits.sort((x, y) => y.at - x.at)) src = src.slice(0, ed.at) + ed.ins + src.slice(ed.at + ed.del)
    src.split('\n').forEach((l, i) => { code.push(l); map.push({ file: b.file, line: b.line, mdLine: b.bodyLine + i }) })
  }
  return { code: code.join('\n') + '\n', map }
}

// ---------- gate 6 headings and links ----------

// GitHub heading slugs for a markdown file (outside fences), with -1, -2 de-duplication.
export function headingSlugs(text) {
  const seen = new Map(), out = new Set()
  for (const { line } of outsideFences(text)) {
    const m = /^#{1,6}\s+(.*?)\s*#*\s*$/.exec(line)
    if (m) {
      const base = slug(m[1])
      const n = seen.get(base) || 0
      seen.set(base, n + 1)
      out.add(n ? `${base}-${n}` : base)
    }
    for (const a of line.matchAll(/<a\s+[^>]*(?:name|id)="([^"]+)"/g)) out.add(a[1])
  }
  return out
}

export function slug(heading) {
  const text = heading
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, '')
  return text.toLowerCase().trim().replace(/[^\p{L}\p{M}\p{N}\p{Pc}\- ]/gu, '').replace(/ /g, '-')
}

// Lines outside fenced code, with 1-based numbers and inline code removed.
export function outsideFences(text) {
  const out = []
  let inFence = false
  text.split('\n').forEach((l, i) => {
    if (/^\s*```/.test(l)) { inFence = !inFence; return }
    if (!inFence) out.push({ line: l.replace(/`[^`]*`/g, (s) => (/^#/.test(l) ? s.slice(1, -1) : '')), n: i + 1 })
  })
  return out
}

export function links(text) {
  const out = []
  for (const { line, n } of outsideFences(text))
    for (const m of line.matchAll(/!?\[([^\]]*)\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g)) out.push({ text: m[1], target: m[2], line: n })
  return out
}
