// usage: node run-export.mjs <module file> <check file> [only]
// Bundles <module> and <check> (a module with `export default async (mod, env) => result`) against the
// pinned package and runs the check in a fresh Chromium page under a 5 s watchdog. Prints JSON.
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
const VERIFY = fileURLToPath(new URL('../../../tools/verify', import.meta.url))
const require = createRequire(VERIFY + '/package.json')
const esbuild = require('esbuild')
const { chromium } = require('playwright')
const [modPath, checkPath] = process.argv.slice(2, 4).map((p) => resolve(p))
const only = process.argv[4] ?? null
const out = await esbuild.build({
  stdin: { contents: `import * as mod from ${JSON.stringify(modPath)}; import check from ${JSON.stringify(checkPath)}; import * as core from '@chenglou/pretext'; import * as rich from '@chenglou/pretext/rich-inline'; window.__run = () => check(mod, { core, rich, only: ${JSON.stringify(only)} });`, resolveDir: VERIFY, loader: 'ts' },
  bundle: true, write: false, format: 'iife', nodePaths: [VERIFY + '/node_modules'], logLevel: 'silent',
})
const browser = await chromium.launch()
const page = await browser.newPage()
await page.setContent('<!doctype html><body></body>')
await page.addScriptTag({ content: out.outputFiles[0].text })
let result
const watchdog = new Promise((res) => setTimeout(() => res({ ok: false, timeout: true }), 5000))
const run = page.evaluate(() => Promise.resolve(window.__run()).then((value) => ({ ok: true, value }), (e) => ({ ok: false, error: String(e) }))).catch((e) => ({ ok: false, error: String(e) }))
result = await Promise.race([run, watchdog])
console.log(JSON.stringify(result))
await browser.close().catch(() => {})
process.exit(result.ok ? 0 : 1)
