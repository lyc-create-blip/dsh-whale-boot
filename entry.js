// dsh-whale-boot — Host half.
//
// One contribution, the whole reason this is a plugin rather than a client
// component: the kernel constructs its own boot page synchronously in
// `AppWebEntry`'s constructor, which runs from the shell module script, so only
// a parser-blocking index row executes early enough to pre-empt it. On every
// index render this entry pushes two head rows — a config global and the
// pre-boot screen source — through the `webserver/index-inject` event, exactly
// like the shipped boot-animation plugin does.
//
// The screen itself needs no routes and no assets: the whale, the star ocean and
// every effect are drawn on a canvas from code, so the whole package is a few
// kilobytes and the animation starts on the very first painted frame.
//
// Settings are DECLARED rather than registered. Under DSH 0.2.0-rc.2 the Host
// `settings` service derives a settings namespace from a running entry whose
// resolved export carries a `Config` schema (schemastery), keyed by the entry id
// in the profile patch — here `dsh-whale-boot` (cordis.patch.yml). The browser
// half pairs with that same string through the client `configForms` service.
// Two consequences are load-bearing:
//
//   * `Config` must be a property of the module namespace object, so the schema
//     package has to resolve at module-evaluation time — a static import.
//     `@deepseek-ai/schemastery` is therefore a plain dependency pinned at
//     `^3.18.4` (the first release with `.volatile()`).
//   * `describe()` reports only an entry whose Config projects a non-empty
//     volatile form; a schema with no live field is invisible to the settings
//     page. Every field below is marked `.volatile()` where the library
//     supports it, and `LIVE_CAPABLE` degrades the schema instead of throwing
//     when an older copy was resolved against the declaration.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import z from '@deepseek-ai/schemastery'

/** Absolute path of the pre-boot screen source, read per index render. */
const BOOT_SCREEN_PATH = fileURLToPath(new URL('./src/boot-screen.js', import.meta.url))

/** The values the screen runs with when the applied config does not carry one. */
const DEFAULT_SETTINGS = {
  /** Whether the screen is injected at all. Off restores DSH's own boot page. */
  enabled: true,
  /** Which visual theme the screen draws: nebula / aurora / meteor. */
  theme: 'nebula',
  /** How long the dissolve into the app takes, in milliseconds. */
  fadeMs: 1200,
  /** Star density: more stars, more expensive; clamped to 40..240. */
  particles: 110,
  /** Whether the bottom hint line is drawn. */
  showHint: true,
}

/** The accepted theme values, in the order the browser card presents them. */
const THEMES = ['nebula', 'aurora', 'meteor']

/**
 * Whether the resolved schemastery can mark a Config field live-editable.
 * See the module header: probing here keeps an older resolution from throwing
 * during module evaluation and taking the boot screen down with the card.
 */
const LIVE_CAPABLE = typeof z.boolean().volatile === 'function'

/** Mark one Config field live-editable, where the schema library allows it. */
function live(schema) {
  return LIVE_CAPABLE ? schema.volatile() : schema
}

/** The well-known key cosmokit puts on a live config reference. */
const VOLATILE_REF = Symbol.for('cosmokit.volatile.write')

/** Whether a config value is a live reference rather than a plain snapshot. */
function isLive(value) {
  return typeof value === 'object' && value !== null && VOLATILE_REF in value
}

/**
 * Read one applied-config field: a live reference when `Config` declared the
 * field volatile, a plain value when the config arrived without schema
 * resolution. An absent field stays absent; the caller applies its default.
 * @param config - the applied config, possibly undefined.
 * @param key - field name.
 * @returns the current value, or undefined when the field is absent.
 */
function readField(config, key) {
  const value = config?.[key]
  return isLive(value) && typeof value.get === 'function' ? value.get() : value
}

function clamp(value, min, max) {
  return value < min ? min : (value > max ? max : value)
}

/**
 * This entry's Host configuration schema. Every field is volatile, because that
 * is the only class the settings service serves.
 */
export const Config = z.object({
  enabled: live(z.boolean().default(DEFAULT_SETTINGS.enabled)),
  theme: live(z.union([...THEMES]).default(DEFAULT_SETTINGS.theme)),
  fadeMs: live(z.number().min(400).max(4000).default(DEFAULT_SETTINGS.fadeMs)),
  particles: live(z.number().min(40).max(240).default(DEFAULT_SETTINGS.particles)),
  showHint: live(z.boolean().default(DEFAULT_SETTINGS.showHint)),
})

/** Package name the loader mounts this row as. */
export const name = 'dsh-whale-boot'

/** Services this half consumes. */
export const inject = ['webServer']

/** The screen source, re-read on every index render so edits show on reload. */
function bootScreenSource() {
  return readFileSync(BOOT_SCREEN_PATH, 'utf8')
}

/**
 * Mount the pre-boot index injection.
 * @param ctx - Host plugin context.
 * @param config - the applied config, already validated against `Config`.
 */
export function apply(ctx, config) {
  if (!LIVE_CAPABLE) {
    ctx.logger?.warn?.(
      'dsh-whale-boot: the resolved @deepseek-ai/schemastery has no .volatile(), so DSH '
      + 'will not serve this entry as a settings namespace and the settings card stays '
      + 'hidden. This package declares ^3.18.4 as a dependency; reinstall the plugin so '
      + 'pnpm resolves the declared version.',
    )
  }

  /**
   * The settings the screen should run with right now. Read per index render,
   * because the boot screen is rebuilt from this on the next page load — which
   * is exactly when a stored edit takes effect. Every field falls back
   * individually so a config that arrived without schema resolution still
   * boots a working animation under the documented defaults.
   * @returns the resolved settings, with every field defaulted.
   */
  function currentSettings() {
    try {
      const enabled = readField(config, 'enabled')
      const theme = readField(config, 'theme')
      const fadeMs = readField(config, 'fadeMs')
      const particles = readField(config, 'particles')
      const showHint = readField(config, 'showHint')
      return {
        enabled: typeof enabled === 'boolean' ? enabled : DEFAULT_SETTINGS.enabled,
        theme: THEMES.includes(theme) ? theme : DEFAULT_SETTINGS.theme,
        fadeMs: typeof fadeMs === 'number' ? clamp(fadeMs, 400, 4000) : DEFAULT_SETTINGS.fadeMs,
        particles: typeof particles === 'number' ? clamp(particles, 40, 240) : DEFAULT_SETTINGS.particles,
        showHint: typeof showHint === 'boolean' ? showHint : DEFAULT_SETTINGS.showHint,
      }
    } catch (error) {
      ctx.logger?.warn?.('dsh-whale-boot: settings unreadable, using defaults', error)
      return DEFAULT_SETTINGS
    }
  }

  // `ctx.on` returns a disposer the fiber tracks, so it is registered directly
  // rather than wrapped in an effect — matching the other subscribers of this
  // event (ui-theme, client-modules, client-connection).
  ctx.on('webserver/index-inject', (table) => {
    const settings = currentSettings()

    // Switched off means switched off: no configuration row, no screen script,
    // no overlay and not one canvas painted. The kernel's own boot page is what
    // shows. Injecting a disabled screen and making the script bail out would
    // look the same but leave the whole thing running.
    if (!settings.enabled) return

    // The row reads a plain global the script fills in, so the injection stays
    // JSON-serializable data and the script itself stays a static asset.
    table.push({
      kind: 'script',
      placement: 'head',
      text: 'globalThis.__DSH_WHALE_BOOT_CFG__=' + JSON.stringify({
        theme: settings.theme,
        fadeMs: settings.fadeMs,
        particles: settings.particles,
        showHint: settings.showHint,
        holdMs: 15000,
        version: '1.0.0',
      }),
    })
    table.push({ kind: 'script', placement: 'head', text: bootScreenSource() })
  })
}
