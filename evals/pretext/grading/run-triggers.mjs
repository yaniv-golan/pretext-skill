// Trigger eval: does a headless Claude load the pretext skill for each prompt in ../triggers.json?
//
// usage: node run-triggers.mjs [--runs N] [--only id,id] [--concurrency N] [--out file]
//
// Each run is `claude -p <prompt>` in a fresh, empty temp directory with stdin closed (claude -p
// appends stdin to the prompt), MCP servers off, no session persistence, and the working tree's
// plugin loaded with --plugin-dir while the installed marketplace copy is disabled. The init event
// must show exactly one pretext skill, from this repo's pretext/ directory; otherwise it exits 2.
//
// A run is a hit when Claude calls the Skill tool with pretext; an error when the session failed
// before answering (no assistant message, a timeout before one, or an error result other than
// reaching --max-turns). Errors are left out of every rate.
//
// Results depend on the skills installed on this machine, which compete with pretext for
// triggering, and on the model `claude` uses by default. Each run costs real usage.
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(HERE, '../../..')
const PLUGIN = path.join(REPO, 'pretext')
const SPEC = JSON.parse(fs.readFileSync(path.join(HERE, '../triggers.json'), 'utf8'))
const MISSED_GROUP = ['explode', 'smoke', 'lyrics', 'adtext']
const TIMEOUT_MS = 170_000

const args = process.argv.slice(2)
const opt = (name, fallback) => { const i = args.indexOf(name); return i === -1 ? fallback : args[i + 1] }
const runs = Number(opt('--runs', SPEC.runs))
const only = opt('--only', null)?.split(',')
const concurrency = Number(opt('--concurrency', 6))
const out = opt('--out', path.join(REPO, 'evals/pretext/pretext-workspace', `triggers-${new Date().toISOString().replace(/[:.]/g, '-')}.json`))
const prompts = SPEC.prompts.filter((p) => !only || only.includes(p.id))
if (only && prompts.length !== only.length) { console.error(`unknown id in --only: ${only.join(',')}`); process.exit(1) }

const isPretext = (s) => /(^|:)pretext$/.test(String(s))

// Throws when the session did not load exactly one pretext skill from this repo's plugin.
function checkInit(init) {
  const skills = (init.skills ?? []).filter(isPretext)
  const plugins = (init.plugins ?? []).filter((p) => p?.name === 'pretext')
  const ok = skills.length === 1 && plugins.length === 1 && path.resolve(plugins[0].path ?? '') === PLUGIN
  if (!ok) throw new Error(`init check failed: skills=${JSON.stringify(skills)} plugins=${JSON.stringify(plugins)}; expected one pretext skill from ${PLUGIN}`)
}

function runOnce(p) {
  return new Promise((resolve) => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-'))
    const child = spawn('claude', [
      '-p', p.prompt, '--max-turns', '2', '--output-format', 'stream-json', '--verbose',
      '--no-session-persistence', '--strict-mcp-config', '--plugin-dir', PLUGIN,
      '--settings', JSON.stringify({ enabledPlugins: { 'pretext@pretext-marketplace': false } }),
      '--disallowedTools', 'Write,Edit,Bash,Agent,WebSearch,WebFetch,Workflow',
    ], { cwd, stdio: ['ignore', 'pipe', 'pipe'] })
    let buf = '', timedOut = false
    const r = { id: p.id, outcome: 'error', skills: [], firstTool: null, cost: 0, detail: '' }
    let init = null, sawAssistant = false, result = null
    const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL') }, TIMEOUT_MS)
    child.stdout.on('data', (d) => {
      buf += d
      let nl
      while ((nl = buf.indexOf('\n')) !== -1) {
        const line = buf.slice(0, nl); buf = buf.slice(nl + 1)
        let o; try { o = JSON.parse(line) } catch { continue }
        if (o.type === 'system' && o.subtype === 'init') init = o
        if (o.type === 'assistant') {
          sawAssistant = true
          for (const c of o.message?.content ?? []) if (c.type === 'tool_use') {
            r.firstTool ??= c.name
            if (c.name === 'Skill') r.skills.push(c.input?.skill)
          }
        }
        if (o.type === 'result') result = o
      }
    })
    child.stderr.on('data', (d) => { r.detail += String(d).slice(0, 300) })
    child.on('close', () => {
      clearTimeout(timer)
      fs.rmSync(cwd, { recursive: true, force: true })
      r.cost = result?.total_cost_usd ?? 0
      if (!init) { r.detail ||= 'no init event'; return resolve(r) }
      try { checkInit(init) } catch (e) { r.initError = e.message; return resolve(r) }
      if (r.skills.some(isPretext)) r.outcome = 'hit'
      else if (!sawAssistant || (timedOut && !result)) r.detail ||= timedOut ? 'timed out' : 'no assistant message'
      else if (result?.is_error && result.subtype !== 'error_max_turns') r.detail = `result ${result.subtype}`
      else r.outcome = 'miss'
      resolve(r)
    })
  })
}

// Runs of one prompt go one after another; prompts share `concurrency` workers.
const queue = [...prompts]
const results = Object.fromEntries(prompts.map((p) => [p.id, []]))
let initFailure = null
async function worker() {
  while (queue.length && !initFailure) {
    const p = queue.shift()
    for (let i = 0; i < runs && !initFailure; i++) {
      const r = await runOnce(p)
      if (r.initError) { initFailure = r.initError; break }
      results[p.id].push(r)
    }
  }
}
await Promise.all(Array.from({ length: Math.min(concurrency, prompts.length) }, worker))
if (initFailure) { console.error(initFailure); process.exit(2) }

const tally = (id) => {
  const rs = results[id]
  return { hits: rs.filter((r) => r.outcome === 'hit').length, valid: rs.filter((r) => r.outcome !== 'error').length, errors: rs.filter((r) => r.outcome === 'error').length }
}
for (const p of prompts) {
  const t = tally(p.id)
  console.log(`${p.id} ${p.expect} ${p.set} ${t.hits}/${t.valid}${t.errors ? ` (${t.errors} errors)` : ''}`)
}
const pool = (name, pick) => {
  const ids = prompts.filter(pick).map((p) => p.id)
  if (!ids.length) return null
  const sum = ids.map(tally).reduce((a, t) => ({ hits: a.hits + t.hits, valid: a.valid + t.valid }), { hits: 0, valid: 0 })
  console.log(`${name} ${sum.hits}/${sum.valid}`)
  return { ids, ...sum }
}
const pooled = {
  'TUNED-MISSED-GROUP': pool('TUNED-MISSED-GROUP', (p) => p.set === 'tuned' && MISSED_GROUP.includes(p.id)),
  'TUNED-ESTABLISHED': pool('TUNED-ESTABLISHED', (p) => p.set === 'tuned' && p.expect === 'trigger' && !MISSED_GROUP.includes(p.id)),
  'NO-TRIGGER': pool('NO-TRIGGER', (p) => p.set === 'tuned' && p.expect === 'no-trigger'),
  'HELDOUT-TRIGGER': pool('HELDOUT-TRIGGER', (p) => p.set === 'heldout' && p.expect === 'trigger'),
  'HELDOUT-NO-TRIGGER': pool('HELDOUT-NO-TRIGGER', (p) => p.set === 'heldout' && p.expect === 'no-trigger'),
}
const cost = Object.values(results).flat().reduce((a, r) => a + r.cost, 0)
console.log(`COST $${cost.toFixed(2)} over ${Object.values(results).flat().length} runs`)
fs.mkdirSync(path.dirname(out), { recursive: true })
fs.writeFileSync(out, JSON.stringify({ when: new Date().toISOString(), runs, pooled, results }, null, 2) + '\n')
console.log(`wrote ${path.relative(REPO, out)}`)
