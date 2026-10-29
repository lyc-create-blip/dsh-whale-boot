// Self-check for the Host half (entry.js):
//   * module evaluates (static schemastery import resolves),
//   * Config schema carries the documented fields, defaults and bounds,
//   * the webserver/index-inject subscription pushes exactly two head rows
//     when enabled and zero when disabled.
//
// Run from the repo root with the bundled node. The package's own
// node_modules must resolve @deepseek-ai/schemastery (>= 3.18.4 for
// .volatile()); a local development link does that without publishing.

import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = dirname(here)

let failures = 0
function check(name, ok, extra) {
  if (ok) {
    console.log('  ok  ' + name)
  } else {
    failures += 1
    console.error('  FAIL ' + name + (extra === undefined ? '' : '  ->  ' + extra))
  }
}

const mod = await import(pathToFileURL(join(root, 'entry.js')).href)

// 1. module surface (schemastery schemas are callable)
check('module exports Config schema', mod.Config !== undefined && (typeof mod.Config === 'function' || typeof mod.Config === 'object'))
check('module exports name', mod.name === 'dsh-whale-boot')
check('module exports inject', Array.isArray(mod.inject) && mod.inject.includes('webServer'))
check('module exports apply', typeof mod.apply === 'function')

// 2. schema shape: schemastery keeps object fields in `dict`, defaults and
//    volatility in each field's `meta`.
const meta = mod.Config.meta ?? {}
check('schema is an object schema', mod.Config.type === 'object')
const dict = mod.Config.dict ?? {}
const fields = ['enabled', 'theme', 'fadeMs', 'particles', 'showHint']
for (const field of fields) {
  const schema = dict[field]
  check('schema has ' + field, schema !== undefined, JSON.stringify(Object.keys(dict)))
  if (schema === undefined) continue
  const fm = schema.meta ?? {}
  check(field + ' is volatile', fm.volatile === true, JSON.stringify(Object.keys(fm)))
}
const defaults = {
  enabled: true,
  theme: 'nebula',
  fadeMs: 1200,
  particles: 110,
  showHint: true,
}
for (const [field, expected] of Object.entries(defaults)) {
  const schema = dict[field]
  if (schema === undefined) continue
  const actual = schema.meta?.default
  check(field + ' default', actual === expected, String(actual))
}

// 3. injection rows, enabled
const events = []
const logger = { warn: (...a) => console.log('  [warn]', ...a), error: console.error }
const ctx = {
  logger,
  on: (name, handler) => { events.push({ name, handler }); return () => {} },
}
mod.apply(ctx, {}) // no config at all: every default must still apply
check('subscribed to webserver/index-inject', events.some((e) => e.name === 'webserver/index-inject'))

const table = []
events.find((e) => e.name === 'webserver/index-inject').handler(table)
check('enabled: exactly 2 rows', table.length === 2, 'rows=' + table.length)
if (table.length === 2) {
  check('row 0 is a head script', table[0].kind === 'script' && table[0].placement === 'head')
  check('row 1 is a head script', table[1].kind === 'script' && table[1].placement === 'head')
  const cfgText = table[0].text ?? ''
  const m = /^globalThis\.__DSH_WHALE_BOOT_CFG__=(.*)$/s.exec(cfgText)
  check('row 0 sets the cfg global', m !== null, cfgText.slice(0, 60))
  if (m !== null) {
    const cfg = JSON.parse(m[1])
    check('cfg theme default', cfg.theme === 'nebula')
    check('cfg fadeMs default', cfg.fadeMs === 1200)
    check('cfg particles default', cfg.particles === 110)
    check('cfg showHint default', cfg.showHint === true)
    check('cfg holdMs', cfg.holdMs === 15000)
  }
  const src = table[1].text ?? ''
  check('row 1 carries the boot screen', src.includes('__DSH_WHALE_BOOT__') && src.includes('clientReady'))
  check('row 1 reads the kernel boot arc', src.includes('--dsh-boot-arc'))
}

// 4. injection rows, disabled
const tableOff = []
mod.apply({ ...ctx, on: (name, handler) => (name === 'webserver/index-inject' ? handler(tableOff) : undefined) }, { enabled: false })
check('disabled: zero rows', tableOff.length === 0, 'rows=' + tableOff.length)

// 5. settings overrides travel into the cfg row
const tableCfg = []
mod.apply({
  ...ctx,
  on: (name, handler) => (name === 'webserver/index-inject' ? handler(tableCfg) : undefined),
}, { theme: 'meteor', fadeMs: 3000, particles: 220, showHint: false })
const cfg2 = JSON.parse(/^globalThis\.__DSH_WHALE_BOOT_CFG__=(.*)$/s.exec(tableCfg[0].text)[1])
check('cfg theme override', cfg2.theme === 'meteor')
check('cfg fadeMs override', cfg2.fadeMs === 3000)
check('cfg particles override', cfg2.particles === 220)
check('cfg showHint override', cfg2.showHint === false)

// 6. bad values fall back to defaults
const tableBad = []
mod.apply({
  ...ctx,
  on: (name, handler) => (name === 'webserver/index-inject' ? handler(tableBad) : undefined),
}, { theme: 'nonsense', fadeMs: 'x', particles: -5 })
const cfg3 = JSON.parse(/^globalThis\.__DSH_WHALE_BOOT_CFG__=(.*)$/s.exec(tableBad[0].text)[1])
check('cfg bad theme falls back', cfg3.theme === 'nebula')
check('cfg bad fadeMs falls back', cfg3.fadeMs === 1200)
check('cfg bad particles clamps to min', cfg3.particles === 40, 'got ' + cfg3.particles)

console.log(failures === 0 ? '\nALL CHECKS PASSED' : '\n' + failures + ' CHECK(S) FAILED')
process.exit(failures === 0 ? 0 : 1)
