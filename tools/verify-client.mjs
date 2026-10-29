// Self-check for the browser half (lib/client.js): load the bundle artifact
// with a stubbed module loader, run `apply` against a stubbed client context,
// and assert the two jobs it owes: the pre-boot screen hand-off fires first,
// and the settings card registers exactly once into `plugins.item`.

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

const here = dirname(fileURLToPath(import.meta.url))
const root = dirname(here)
const SOURCE = readFileSync(join(root, 'lib', 'client.js'), 'utf8')

let failures = 0
function check(name, ok, extra) {
  if (ok) {
    console.log('  ok  ' + name)
  } else {
    failures += 1
    console.error('  FAIL ' + name + (extra === undefined ? '' : '  ->  ' + extra))
  }
}

// --- stubs ----------------------------------------------------------------

let clientReadyCalls = 0
globalThis.__DSH_WHALE_BOOT__ = { clientReady: () => { clientReadyCalls += 1 } }

let loaded = null
globalThis.window = {
  __ModuleLoader__: {
    load: (entry) => { loaded = entry },
  },
}
globalThis.document = {
  getElementById: () => null,
  createElement: (tag) => ({ tagName: tag, id: '', textContent: '', setAttribute() {}, appendChild() {} }),
  head: { appendChild() {} },
}
globalThis.location = { search: '' }

vm.runInThisContext(SOURCE, { filename: 'lib/client.js' })
check('bundle registered with the module loader', loaded !== null && loaded.id === 'dsh-whale-boot')
check('factory returns the module', typeof loaded.factory === 'function')

let registrations = 0
let localeRegistered = null
let servedCallbacks = 0
let scopeSnapshot = {
  status: 'ok', revision: 3,
  value: { enabled: true, theme: 'aurora', fadeMs: 2000, particles: 160, showHint: true },
}
const scope = {
  subscribe: () => () => {},
  getSnapshot: () => scopeSnapshot,
  mutate: () => true,
}
const owner = {
  get: (name) => {
    switch (name) {
      case 'slots': return {
        inject: (slot, fn) => {
          if (slot !== 'plugins.item') return () => {}
          registrations += 1
          const dispose = fn() // runs slots.register immediately, like the real ledger
          return dispose
        },
        register: (meta, component) => {
          check('card meta id is the settings namespace', meta.id === 'dsh-whale-boot')
          check('card registers into plugins.item', meta.name === 'plugins.item')
          check('card inject face carries runtime/scope/t', typeof meta.inject === 'function')
          check('card component is a function', typeof component === 'function')
          return () => {}
        },
      }
      case 'locale': return {
        register: (ns, dicts) => { localeRegistered = { ns, dicts } },
        bind: () => (key) => key,
      }
      case 'configForms': return {
        get: () => scope,
        whileServed: (namespaces, fn) => {
          servedCallbacks += 1
          if (namespaces[0] !== 'dsh-whale-boot') return () => {}
          const withdraw = fn()
          return withdraw
        },
      }
      default: return undefined
    }
  },
  effect: (fn) => { fn() },
}

// --- run --------------------------------------------------------------------

const fakeReact = { createElement: () => ({}) }
const moduleExports = loaded.factory((name) => {
  if (name === 'react') return fakeReact
  return undefined
})
check('apply exported', typeof moduleExports.apply === 'function')

let injectCalled = null
const ctx = {
  inject: (deps, cb) => { injectCalled = { deps, cb } },
}
moduleExports.apply(ctx)
check('clientReady fired first, unconditionally', clientReadyCalls === 1)
check('ctx.inject used (not ctx.get)', injectCalled !== null && Array.isArray(injectCalled.deps))

injectCalled.cb(owner)
check('locale dictionary registered', localeRegistered !== null && localeRegistered.ns === 'dshWhaleBoot')
check('locale dictionary has zh/en', localeRegistered !== null
  && localeRegistered.dicts.zh !== undefined && localeRegistered.dicts.en !== undefined)
check('whileServed gated the contribution', servedCallbacks === 1)
check('settings card registered exactly once', registrations === 1)

// idempotency: a second service arrival must not register twice
injectCalled.cb(owner)
check('re-entry does not register twice', registrations === 1)

// missing overlay must be harmless (static deployments)
clientReadyCalls = 0
globalThis.__DSH_WHALE_BOOT__ = undefined
moduleExports.apply(ctx)
check('missing overlay is skipped without throwing', clientReadyCalls === 0)

console.log(failures === 0 ? '\nALL CLIENT CHECKS PASSED' : '\n' + failures + ' CLIENT CHECK(S) FAILED')
process.exit(failures === 0 ? 0 : 1)
