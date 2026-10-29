// Headless smoke test for src/boot-screen.js.
//
// A minimal DOM + Canvas 2D stub runs the real pre-boot script through its
// whole lifecycle: eval during parse -> mount on DOMContentLoaded -> progress
// mirroring -> animation frames -> clientReady hand-off -> fade + cleanup, and
// a second pass through the kernel-failure path. It cannot judge how the
// canvas LOOKS, but it catches every runtime error, timing bug and leak in the
// wiring — the things a wrong-looking-but-running screen does not show.

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

const here = dirname(fileURLToPath(import.meta.url))
const root = dirname(here)
const SOURCE = readFileSync(join(root, 'src', 'boot-screen.js'), 'utf8')

let failures = 0
function check(name, ok, extra) {
  if (ok) {
    console.log('  ok  ' + name)
  } else {
    failures += 1
    console.error('  FAIL ' + name + (extra === undefined ? '' : '  ->  ' + extra))
  }
}

function makeStyle() {
  const store = new Map()
  return new Proxy({}, {
    get(t, k) {
      if (k === 'setProperty') return (p, v) => store.set(p, v)
      if (k === 'getPropertyValue') return (p) => (store.get(p) === undefined ? '' : store.get(p))
      return store.get(k)
    },
    set(t, k, v) { store.set(k, v); return true },
  })
}

function gradientStub() { return { addColorStop() {} } }

function makeCtx() {
  return new Proxy({}, {
    get(t, k) {
      if (k === 'createLinearGradient' || k === 'createRadialGradient') return gradientStub
      return function noop() { return undefined }
    },
    set() { return true },
  })
}

function makeEl(tag) {
  const listeners = new Map()
  const el = {
    tagName: tag,
    children: [],
    parentNode: null,
    style: makeStyle(),
    dataset: {},
    textContent: '',
    className: '',
    width: 0,
    height: 0,
    setAttribute(k, v) { el['attr:' + k] = String(v) },
    getAttribute(k) { return el['attr:' + k] === undefined ? null : el['attr:' + k] },
    appendChild(c) { c.parentNode = el; el.children.push(c); return c },
    removeChild(c) { el.children = el.children.filter((x) => x !== c); c.parentNode = null; return c },
    remove() { if (el.parentNode) el.parentNode.removeChild(el) },
    addEventListener(type, fn) { listeners.set(type, fn) },
    removeEventListener(type) { listeners.delete(type) },
    getContext() { return makeCtx() },
    querySelector(sel) {
      if (sel === '[data-dsh-boot-spinner]') return el.spinner ?? null
      return null
    },
    _fire(type, event) { const fn = listeners.get(type); if (fn) fn(event) },
    _listener(type) { return listeners.get(type) },
  }
  return el
}

function bootEnvironment({ failureText }) {
  const els = []
  const bootEl = makeEl('div')
  bootEl.spinner = makeEl('div')
  bootEl.spinner.style.setProperty('--dsh-boot-arc', '144')
  bootEl.textContent = failureText
  const bodyEl = makeEl('body')
  const docListeners = new Map()
  const winListeners = new Map()
  const rafQueue = []

  const document = {
    body: null,
    createElement(tag) { const el = makeEl(tag); els.push(el); return el },
    querySelector(sel) { return sel === '[data-dsh-boot]' ? bootEl : null },
    addEventListener(type, fn) { docListeners.set(type, fn) },
    removeEventListener(type) { docListeners.delete(type) },
    getElementById() { return null },
    head: makeEl('head'),
  }
  const window = {
    innerWidth: 1280,
    innerHeight: 720,
    devicePixelRatio: 1.25,
    matchMedia() { return { matches: false } },
    addEventListener(type, fn) { winListeners.set(type, fn) },
    removeEventListener(type) { winListeners.delete(type) },
  }

  globalThis.document = document
  globalThis.window = window
  globalThis.MutationObserver = class {
    constructor(cb) { this.cb = cb }
    observe() {}
    disconnect() {}
  }
  globalThis.requestAnimationFrame = (fn) => { rafQueue.push(fn); return rafQueue.length }
  globalThis.cancelAnimationFrame = () => {}
  try {
    Object.defineProperty(globalThis, 'navigator', { value: { language: 'zh-CN' }, configurable: true })
  } catch (error) { /* keep node's navigator */ }

  const fakeNow = { value: 1_000_000 }
  const realNow = Date.now
  globalThis.Date.now = () => fakeNow.value

  return {
    document, window, bootEl, bodyEl, rafQueue, fakeNow, realNow,
    mount() {
      document.body = bodyEl
      const fn = docListeners.get('DOMContentLoaded')
      check('DOMContentLoaded handler registered', typeof fn === 'function')
      fn()
    },
    runFrames(count) {
      for (let i = 0; i < count; i += 1) {
        fakeNow.value += 16
        const queue = rafQueue.splice(0)
        for (const fn of queue) fn(fakeNow.value)
      }
    },
    keydown(key) {
      const fn = winListeners.get('keydown')
      if (fn) fn({ key, preventDefault() {} })
    },
    pointerdown() {
      const rootEl = bodyEl.children[0]
      rootEl._fire('pointerdown', {})
    },
    rootEl() { return bodyEl.children[0] },
  }
}

function evalBoot() {
  vm.runInThisContext(SOURCE, { filename: 'boot-screen.js' })
}

async function wait(ms) { return new Promise((resolve) => setTimeout(resolve, ms)) }

// ---- scenario A: normal boot, progress, hand-off, cleanup -----------------

console.log('scenario A: normal boot')
{
  const env = bootEnvironment({ failureText: '' })
  globalThis.__DSH_WHALE_BOOT_CFG__ = { theme: 'aurora', fadeMs: 400, particles: 80, showHint: true, holdMs: 15000, version: '1.0.0' }
  evalBoot()

  const ns = globalThis.__DSH_WHALE_BOOT__
  check('namespace exposed', ns !== undefined && typeof ns.clientReady === 'function')
  check('nothing mounted before DOMContentLoaded', env.document.body === null)

  env.mount()
  const rootEl = env.rootEl()
  check('overlay mounted into body', env.bodyEl.children.length === 1 && rootEl.tagName === 'div')

  const canvasEl = rootEl.children.find((c) => c.tagName === 'canvas')
  check('canvas sized', canvasEl !== undefined && canvasEl.width === Math.round(1280 * 1.25))

  const fillEl = rootEl.children.find((c) => c.tagName === 'div' && String(c.className) === 'dwb-fill')
  // the real fill is nested; find by class among all descendants
  function findByClass(node, cls) {
    for (const child of node.children) {
      if (String(child.className) === cls) return child
      const deep = findByClass(child, cls)
      if (deep) return deep
    }
    return null
  }
  const fill = findByClass(rootEl, 'dwb-fill')
  check('progress mirrored from --dsh-boot-arc', fill !== null && fill.style.getPropertyValue('width') === '33.3%',
    fill === null ? 'no fill element' : String(fill.style.getPropertyValue('width')))

  env.runFrames(6)
  check('animation frames ran without throwing', true)

  // hand-off: kernel becomes ready well after the minimum display time
  env.fakeNow.value += 1500
  ns.clientReady()
  check('leave starts on clientReady', rootEl.style.getPropertyValue('opacity') === '0')

  await wait(700)
  check('overlay removed after fade', rootEl.parentNode === null)

  // skip key before any of that: fresh run, press Esc while not booted
  globalThis.__DSH_WHALE_BOOT__ = undefined
}

// ---- scenario B: kernel failure rendering --------------------------------

console.log('scenario B: kernel failure')
{
  const env = bootEnvironment({ failureText: 'Failed to load plugins: something broke' })
  globalThis.__DSH_WHALE_BOOT_CFG__ = { theme: 'nebula', fadeMs: 400, particles: 80, showHint: true, holdMs: 15000, version: '1.0.0' }
  evalBoot()
  env.mount()

  const ns = globalThis.__DSH_WHALE_BOOT__
  check('failure detected', ns.failed === true)

  const rootEl = env.rootEl()
  const hint = (function find(node) {
    for (const child of node.children) {
      if (String(child.className) === 'dwb-hint') return child
      const deep = find(child)
      if (deep) return deep
    }
    return null
  })(rootEl)
  const zh = String(globalThis.navigator.language).indexOf('zh') === 0
  const expected = zh ? '启动失败，点击查看诊断' : 'Startup failed - click to see the diagnosis'
  check('hint shows failure message', hint !== null && hint.textContent === expected,
    hint === null ? 'no hint element' : String(hint.textContent))

  // the only way out is a press
  env.pointerdown()
  check('press leaves on failure', rootEl.style.getPropertyValue('opacity') === '0')
  await wait(700)
  check('overlay removed on failure path', rootEl.parentNode === null)
  globalThis.__DSH_WHALE_BOOT__ = undefined
}

// ---- scenario C: skip key during boot -------------------------------------

console.log('scenario C: skip via Esc')
{
  const env = bootEnvironment({ failureText: '' })
  globalThis.__DSH_WHALE_BOOT_CFG__ = { theme: 'meteor', fadeMs: 400, particles: 80, showHint: false, holdMs: 15000, version: '1.0.0' }
  evalBoot()
  env.mount()
  env.runFrames(2)

  const rootEl = env.rootEl()
  const hint = (function find(node) {
    for (const child of node.children) {
      if (String(child.className) === 'dwb-hint') return child
      const deep = find(child)
      if (deep) return deep
    }
    return null
  })(rootEl)
  check('showHint off hides the hint', hint !== null && hint.style.getPropertyValue('display') === 'none')

  // Pressing while the kernel is still starting never force-enters a
  // half-built app: it marks the screen as waiting instead.
  env.keydown('Escape')
  check('Esc during boot does not leave yet', rootEl.style.getPropertyValue('opacity') !== '0')
  const zh = String(globalThis.navigator.language).indexOf('zh') === 0
  const slowText = zh ? '启动较慢，就绪后自动进入' : 'Still starting - entering as soon as it is ready'
  check('Esc during boot shows the slow hint', hint !== null && hint.textContent === slowText,
    hint === null ? 'no hint element' : String(hint.textContent))

  // After the hold budget, a press always releases the screen.
  env.fakeNow.value += 16000
  env.keydown('Enter')
  check('press after hold budget leaves', rootEl.style.getPropertyValue('opacity') === '0')
  await wait(700)
  check('overlay removed after hold', rootEl.parentNode === null)
}

console.log(failures === 0 ? '\nALL SMOKE CHECKS PASSED' : '\n' + failures + ' SMOKE CHECK(S) FAILED')
process.exit(failures === 0 ? 0 : 1)
