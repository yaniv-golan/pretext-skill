// Trigger eval on cowork-harness: does Claude load the pretext skill for each prompt in ../triggers.json?
//
//   node cowork-triggers.mjs gen                    write ../cowork/triggers/*.yaml from triggers.json
//   node cowork-triggers.mjs tally <run.json>...    score the JSON of one or more runs
//
// Run it, from the repo root (.env holds CLAUDE_CODE_OAUTH_TOKEN; each run costs real usage):
//   cowork-harness --dotenv .env run evals/pretext/cowork/triggers --repeat 3 --output-format json > run.json
//   node evals/pretext/grading/cowork-triggers.mjs tally run.json
//
// Each scenario stops after two turns (allow_max_turns makes that a normal ending) and copies this
// machine's installed plugins and skills into a sealed config with `from_host`, so they compete with the
// working tree's pretext. The result records that set as hostInputs. Don't record a cassette of these: it
// would name the installed plugins. Results depend on that set and on the model pinned in _session.yaml.
//
// A run is a hit when the Skill tool loaded pretext; an error when it failed some other way without a
// hit (a timeout, say). Errors are left out of every rate. Exits 2 if pretext wasn't staged in a run.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const SPEC = JSON.parse(fs.readFileSync(path.join(HERE, '../triggers.json'), 'utf8'))
const DIR = path.join(HERE, '../cowork/triggers')
const SKILL_RE = '(^|:)pretext$'
const isPretext = (s) => new RegExp(SKILL_RE).test(String(s))
const MISSED_GROUP = ['explode', 'smoke', 'lyrics', 'adtext']

const SESSION = `model: claude-sonnet-5-5
agent_max_turns: 2
permission_parity: strict
plugins:
  local_plugins:
  - ../../../../pretext
  from_host: true
`

function gen() {
  fs.mkdirSync(DIR, { recursive: true })
  fs.writeFileSync(path.join(DIR, '_session.yaml'), SESSION)
  const verdict = { trigger: `skill_triggered: ${JSON.stringify(SKILL_RE)}`, 'no-trigger': `no_skill_triggered: ${JSON.stringify(SKILL_RE)}`, either: null }
  for (const p of SPEC.prompts) {
    const asserts = [`skill_available: ${JSON.stringify(SKILL_RE)}`, verdict[p.expect], 'allow_max_turns: true'].filter(Boolean)
    fs.writeFileSync(path.join(DIR, `${p.id}.yaml`), [
      '# Generated from ../../triggers.json by grading/cowork-triggers.mjs. Edit that file, not this one.',
      `name: trigger-${p.id}`, 'session: _session.yaml', 'fidelity: hostloop', 'timeout_ms: 170000', 'on_unanswered: fail',
      `prompt: ${JSON.stringify(p.prompt)}`, 'assert:', ...asserts.map((a) => `- ${a}`), '',
    ].join('\n'))
  }
  const ids = new Set(SPEC.prompts.map((p) => `${p.id}.yaml`))
  for (const f of fs.readdirSync(DIR)) if (f !== '_session.yaml' && !ids.has(f)) console.warn(`stale scenario, not in triggers.json: ${f}`)
  console.log(`wrote ${SPEC.prompts.length} scenarios and _session.yaml to ${path.relative(process.cwd(), DIR)}`)
}

function classify(run) {
  const staged = (run.assertions ?? []).find((a) => a.assertion?.skill_available !== undefined)
  if (!staged?.pass) return 'not-staged'
  if ((run.skillsInvoked ?? []).some(isPretext)) return 'hit'
  return (run.verdict?.signals ?? []).some((s) => s.severity === 'fail' && s.code !== 'assertion') ? 'error' : 'miss'
}

function tally(files) {
  const byId = new Map(SPEC.prompts.map((p) => [p.id, []]))
  for (const f of files) for (const run of JSON.parse(fs.readFileSync(f, 'utf8')).results ?? []) {
    const id = String(run.scenario).replace(/^trigger-/, '')
    if (!byId.has(id)) { console.error(`unknown scenario: ${run.scenario}`); process.exit(1) }
    const outcome = classify(run)
    if (outcome === 'not-staged') { console.error(`pretext was not staged in ${run.outDir}`); process.exit(2) }
    byId.get(id).push({ outcome, cost: run.cost?.usd ?? 0 })
  }
  const count = (id) => {
    const rs = byId.get(id)
    return { hits: rs.filter((r) => r.outcome === 'hit').length, valid: rs.filter((r) => r.outcome !== 'error').length, errors: rs.filter((r) => r.outcome === 'error').length }
  }
  const ran = SPEC.prompts.filter((p) => byId.get(p.id).length)
  if (!ran.length) { console.error('no runs in the input'); process.exit(1) }
  for (const p of ran) {
    const t = count(p.id)
    console.log(`${p.id} ${p.expect} ${p.set} ${t.hits}/${t.valid}${t.errors ? ` (${t.errors} errors)` : ''}`)
  }
  const pool = (name, pick) => {
    const ts = ran.filter(pick).map((p) => count(p.id))
    if (ts.length) console.log(`${name} ${ts.reduce((a, t) => a + t.hits, 0)}/${ts.reduce((a, t) => a + t.valid, 0)}`)
  }
  pool('TUNED-MISSED-GROUP', (p) => p.set === 'tuned' && MISSED_GROUP.includes(p.id))
  pool('TUNED-ESTABLISHED', (p) => p.set === 'tuned' && p.expect === 'trigger' && !MISSED_GROUP.includes(p.id))
  pool('NO-TRIGGER', (p) => p.set === 'tuned' && p.expect === 'no-trigger')
  pool('HELDOUT-TRIGGER', (p) => p.set === 'heldout' && p.expect === 'trigger')
  pool('HELDOUT-NO-TRIGGER', (p) => p.set === 'heldout' && p.expect === 'no-trigger')
  pool('NEAR-MISS', (p) => p.set === 'nearmiss')
  const all = [...byId.values()].flat()
  console.log(`COST $${all.reduce((a, r) => a + r.cost, 0).toFixed(2)} over ${all.length} runs`)
}

const [cmd, ...rest] = process.argv.slice(2)
if (cmd === 'gen') gen()
else if (cmd === 'tally' && rest.length) tally(rest)
else { console.error('usage: cowork-triggers.mjs gen | tally <run.json>...'); process.exit(1) }
