window.__ModuleLoader__.load({ id: 'dsh-whale-boot', factory: function (require) {
var module = { exports: {} }; var exports = module.exports;
// dsh-whale-boot — browser half.
//
// Two jobs, in this order and with this priority:
//
//   1. Report the browser roster's activation to the injected pre-boot screen
//      (`clientReady`). That call is part of the screen's hand-off condition, so
//      it happens first, unconditionally, and cannot be delayed or prevented by
//      anything below it.
//   2. Contribute the settings card to the Plugins settings page.
//
// Everything about job 2 is optional by construction. This package does not
// declare `inject`, because a required service would leave the fiber PENDING in
// a profile that lacks it — and then job 1 would never run, the screen would
// never learn the kernel is ready, and the animation would sit there refusing
// to hand over. The services are therefore reached with the dynamic
// `ctx.inject(deps, callback)` form, which waits for them without gating
// `apply`; the callback fires once all arrive, and simply never fires if they
// do not. Services are read with `owner.get(name)`, the form every other
// client bundle in this deployment uses.
//
// Bundle artifact contract: the shell materializes this file as a closure
// factory (`window.__ModuleLoader__.load({ id, factory })`), so `require` is a
// parameter supplied by the shell's module table. `react` is one of the
// baseline modules every dynamic bundle may request.

const OVERLAY = '__DSH_WHALE_BOOT__'

/** Settings namespace the Host half serves; also this card's slot id. */
const SETTINGS_NAMESPACE = 'dsh-whale-boot'

/**
 * The Plugins settings page dispatches cards by slot name.
 * Current builds register into `plugins.item`.
 */
const SLOT = 'plugins.item'

/** Client dictionary namespace this card's tab label is read from. */
const LOCALE_NAMESPACE = 'dshWhaleBoot'

/** zh dictionary: card labels and control captions. */
const DICTIONARY_ZH = {
  title: '星海鲸跃',
  desc: 'Canvas 粒子星海与跃出水面的鲸鱼，同步真实启动进度',
  theme: '主题',
  themeNebula: '星海',
  themeNebulaDesc: '深蓝星云与闪烁的星野',
  themeAurora: '极光',
  themeAuroraDesc: '流动的极光飘带',
  themeMeteor: '流星',
  themeMeteorDesc: '不时划过的流星',
  fade: '淡出时长',
  particles: '粒子数量',
  hint: '显示底部提示文字',
  hintOn: '画面底部显示「点击进入」这类操作提示',
  hintOff: '底部不再显示操作提示，标题和进度条保留',
  enabled: '开启启动动画',
  enabledOn: '每次打开页面播放「星海鲸跃」启动动画',
  enabledOff: '关闭后恢复 DSH 原生启动页',
  note: '改动在下次打开页面时生效',
  writeFailed: '保存失败：',
  noDoc: '这一页没有连上设置文档，改动不会保存。',
  refused: '本部署没有接受这次修改。',
}

/** English half of the same dictionary. */
const DICTIONARY_EN = {
  title: 'Star Ocean Whale',
  desc: 'A canvas star ocean with a leaping whale, mirroring the real boot progress',
  theme: 'Theme',
  themeNebula: 'Nebula',
  themeNebulaDesc: 'Deep-blue nebulae over a twinkling starfield',
  themeAurora: 'Aurora',
  themeAuroraDesc: 'Drifting aurora ribbons',
  themeMeteor: 'Meteor',
  themeMeteorDesc: 'Occasional shooting stars',
  fade: 'Fade duration',
  particles: 'Particles',
  hint: 'Show bottom hint',
  hintOn: 'The hint line below the progress bar is shown',
  hintOff: 'The hint line is hidden; title and progress bar stay',
  enabled: 'Enable boot animation',
  enabledOn: 'The Star Ocean Whale screen plays on every page load',
  enabledOff: 'Off restores the DSH native boot page',
  note: 'Changes apply on the next page load',
  writeFailed: 'Save failed: ',
  noDoc: 'No settings document on this page; changes will not be saved.',
  refused: 'This deployment did not accept the change.',
}

/** Offered dissolve lengths, in milliseconds. */
const FADE_CHOICES = [600, 1200, 2000, 3000]

/** Offered star densities. */
const PARTICLE_CHOICES = [60, 110, 160, 220]

/** Theme values, in card order; the Host schema accepts exactly these. */
const THEMES = ['nebula', 'aurora', 'meteor']

/** Stable empty snapshot, so `getSnapshot` never returns a fresh object. */
const NO_SNAPSHOT = Object.freeze({
  status: 'unavailable', value: undefined, base: undefined, user: undefined,
  revision: undefined, writable: false, mode: 'host',
})

const STYLE_ID = 'dsh-whale-boot-card-style'

// No backticks in this sheet. The token names and geometry are copied from the
// harness's own plugin card (ui-settings-plugins PluginCard.module.css) so this
// card reads as a shipped one rather than a guest; each token keeps a literal
// fallback for a page that has no theme loaded.
const CSS = [
  '.dwbc-card{list-style:none;border:.5px solid var(--dsw-alias-border-l4,rgba(127,127,127,.28));',
  'border-radius:16px;background:var(--dsw-alias-bg-layer-3,transparent);',
  'transition:border-color .16s,background .16s;font-family:inherit}',
  '.dwbc-card:hover{border-color:var(--dsw-alias-label-dimmed,rgba(127,127,127,.5))}',
  '.dwbc-card[data-open="1"]{background:var(--dsw-alias-bg-layer-2,rgba(127,127,127,.07));',
  'border-color:var(--dsw-alias-label-dimmed,rgba(127,127,127,.5))}',
  '.dwbc-head{width:100%;appearance:none;border:0;background:none;font:inherit;color:inherit;',
  'text-align:left;cursor:pointer;display:flex;align-items:center;gap:12px;padding:14px 16px;border-radius:12px}',
  '.dwbc-head:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,#4f9dd9);outline-offset:-2px}',
  '.dwbc-headtext{flex:1;min-width:0;display:flex;flex-direction:column;gap:4px}',
  '.dwbc-name{font-size:15px;font-weight:600;line-height:1.4;color:var(--dsw-alias-label-primary,inherit)}',
  '.dwbc-desc{font-size:13px;line-height:1.5;color:var(--dsw-alias-label-tertiary,rgba(127,127,127,.9))}',
  '.dwbc-chev{flex:none;width:7px;height:7px;margin-right:3px;',
  'border-right:1.5px solid var(--dsw-alias-label-tertiary,rgba(127,127,127,.9));',
  'border-bottom:1.5px solid var(--dsw-alias-label-tertiary,rgba(127,127,127,.9));',
  'transform:rotate(45deg);transition:transform .16s}',
  '.dwbc-card[data-open="1"] .dwbc-chev{transform:rotate(225deg)}',
  '.dwbc-body{border-top:.5px solid var(--dsw-alias-border-l2,rgba(127,127,127,.2));',
  'margin:0 16px;padding:14px 0 10px}',
  '.dwbc-sec{margin:0 0 18px}',
  '.dwbc-sec:last-child{margin-bottom:4px}',
  '.dwbc-h{font-size:13px;font-weight:600;line-height:1.5;margin:0 0 3px;',
  'color:var(--dsw-alias-label-primary,inherit)}',
  '.dwbc-p{margin:0 0 10px;font-size:12px;line-height:1.5;',
  'color:var(--dsw-alias-label-tertiary,rgba(127,127,127,.9))}',
  '.dwbc-row{display:flex;flex-wrap:wrap;gap:6px}',
  '.dwbc-switch{display:inline-flex;align-items:center;gap:9px;cursor:pointer}',
  '.dwbc-switch input{margin:0;flex:none}',
  '.dwbc-opt{border:1px solid var(--dsw-alias-border-l2,rgba(127,127,127,.34));background:none;',
  'color:inherit;border-radius:8px;padding:5px 12px;font:inherit;font-size:12.5px;cursor:pointer}',
  '.dwbc-opt:hover:not(:disabled){background:rgba(127,127,127,.14)}',
  '.dwbc-opt[data-on="1"]{border-color:var(--dsw-alias-brand-primary,#07974b);',
  'color:var(--dsw-alias-brand-primary,#07974b);font-weight:600;background:rgba(7,193,96,.1)}',
  '.dwbc-opt:disabled{opacity:.45;cursor:default}',
  '.dwbc-fail{font-size:12px;line-height:1.5;color:var(--dsw-alias-danger,#e5534b);margin:8px 0 0}',
  '.dwbc-note{font-size:11px;line-height:1.5;margin:2px 0 0;',
  'color:var(--dsw-alias-label-tertiary,rgba(127,127,127,.9))}',
].join('')

function ensureStyle() {
  if (document.getElementById(STYLE_ID) !== null) return
  const el = document.createElement('style')
  el.id = STYLE_ID
  el.textContent = CSS
  document.head.appendChild(el)
}

function serviceAt(owner, name) {
  try {
    if (owner !== null && owner !== undefined && typeof owner.get === 'function') {
      const value = owner.get(name)
      if (value !== undefined && value !== null) return value
    }
  } catch (error) { /* the property may still answer */ }
  try {
    return owner === null || owner === undefined ? undefined : owner[name]
  } catch (error) {
    return undefined
  }
}

/**
 * The page's own configuration form, as an observable the card can read.
 * The Plugins page hands every `plugins.item` entry a `form` prop — `{ state,
 * mutate }` — in addition to whatever the entry's own inject face returns.
 * Reads need a subscribe/getSnapshot pair for `useSyncExternalStore`; writes
 * go through `mutate(ops, revision)`, where `ops` is the settings service's
 * own operation shape: `[{ op: 'set', path: [field], value }]`.
 */
function cardForm(props) {
  const pageForm = props.form
  const scope = props.scope
  const observable = pageForm !== undefined && pageForm !== null
    && typeof pageForm.subscribe === 'function' && typeof pageForm.getSnapshot === 'function'
  const observableScope = scope !== undefined && scope !== null
    && typeof scope.subscribe === 'function' && typeof scope.getSnapshot === 'function'

  const source = observable ? pageForm : (observableScope ? scope : null)
  let fallback = NO_SNAPSHOT
  if (pageForm !== undefined && pageForm !== null && pageForm.state !== undefined) fallback = pageForm.state
  else if (scope !== undefined && scope !== null && typeof scope.getSnapshot === 'function') fallback = scope.getSnapshot()

  const mutate = (() => {
    if (pageForm !== undefined && pageForm !== null && typeof pageForm.mutate === 'function') {
      return (ops, revision) => pageForm.mutate(ops, revision)
    }
    if (scope !== undefined && scope !== null && typeof scope.mutate === 'function') {
      return (ops, revision) => scope.mutate(ops, revision)
    }
    return null
  })()

  // The RPC itself, reached when the form refuses a write: it answers the reason
  // the local mutate only reports as a bare `false`.
  const remoteMutate = (() => {
    const remote = props.remote
    const settings = remote !== undefined && remote !== null ? remote.settings : undefined
    if (settings !== undefined && settings !== null && typeof settings.mutate === 'function') {
      return (namespace, ops, revision) => settings.mutate(namespace, ops, revision)
    }
    return null
  })()

  return { source, fallback, mutate, remoteMutate }
}

function Summary(props) {
  const React = props.runtime
  const h = React.createElement
  return h('div', { style: { display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 } },
    h('div', { style: { fontSize: 14, fontWeight: 600, color: 'inherit' } }, props.t('title')),
    h('div', { style: { fontSize: 12, color: 'rgba(127,127,127,.9)' } }, props.t('desc')))
}

/** One option button in a choice row. */
function Opt(props) {
  const React = props.runtime
  const h = React.createElement
  return h('button', {
    type: 'button',
    className: 'dwbc-opt',
    'data-on': props.on ? '1' : '0',
    disabled: props.disabled === true,
    onClick: props.onClick,
  }, props.label)
}

/** One labelled switch with a state-dependent explanation. */
function Switch(props) {
  const React = props.runtime
  const h = React.createElement
  return h('div', null,
    h('label', { className: 'dwbc-switch' },
      h('input', {
        type: 'checkbox',
        checked: props.on,
        onChange: (event) => props.onChange(event.target.checked),
      }),
      h('span', { style: { fontSize: 12.5 } }, props.label)),
    h('p', { className: 'dwbc-p', style: { marginTop: 6 } }, props.on ? props.onText : props.offText))
}

/**
 * The card. Collapsed by default, like every other card on this page: the
 * Plugins section is a list of plugins, and one that unfolds its controls on
 * arrival pushes everything below it out of view.
 */
function Card(props) {
  const React = props.runtime
  const h = React.createElement
  const [open, setOpen] = React.useState(false)
  const [failure, setFailure] = React.useState(null)
  const [busy, setBusy] = React.useState(false)

  ensureStyle()

  const form = cardForm(props)
  const source = form.source
  const subscribe = React.useCallback(
    (listener) => (source === null ? function () {} : source.subscribe(listener)),
    [source],
  )
  const readSnapshot = React.useCallback(
    () => (source === null ? form.fallback : source.getSnapshot()),
    [source, form.fallback],
  )
  const snapshot = React.useSyncExternalStore(subscribe, readSnapshot)
  const stored = (snapshot && snapshot.value) || {}
  const enabled = stored.enabled !== false
  const theme = typeof stored.theme === 'string' ? stored.theme : 'nebula'
  const fadeMs = typeof stored.fadeMs === 'number' ? stored.fadeMs : 1200
  const particles = typeof stored.particles === 'number' ? stored.particles : 110
  const showHint = stored.showHint !== false

  /**
   * Stage one field write as one atomic `set` at a top-level path, so the same
   * call works whether the page handed us its configuration form or we fell
   * back to the injected scope. A refusal is retried once through the remote
   * service to learn the reason, so a control never quietly does nothing.
   */
  const write = (field, value) => {
    if (form.mutate === null) {
      setFailure(props.t('noDoc'))
      return
    }
    setBusy(true)
    setFailure(null)
    const revision = snapshot === undefined || snapshot === null ? undefined : snapshot.revision
    const ops = [{ op: 'set', path: [field], value }]
    Promise.resolve(form.mutate(ops, revision))
      .then(async (accepted) => {
        if (accepted !== false) return
        if (form.remoteMutate === null) {
          setFailure(props.t('writeFailed') + props.t('refused'))
          return
        }
        try {
          const answer = await form.remoteMutate(SETTINGS_NAMESPACE, ops, undefined)
          if (answer !== null && typeof answer === 'object' && answer.ok === false) {
            const reason = answer.error === undefined || answer.error === null
              ? '未说明原因' : String(answer.error.message ?? answer.error)
            setFailure(props.t('writeFailed') + reason)
          } else {
            setFailure(props.t('writeFailed') + props.t('refused'))
          }
        } catch (error) {
          setFailure(props.t('writeFailed') + String(error))
        }
      })
      .catch((error) => setFailure(props.t('writeFailed') + String(error)))
      .then(() => setBusy(false))
  }

  const themeRows = THEMES.map((value) => h(Opt, {
    key: value,
    runtime: React,
    on: theme === value,
    disabled: busy,
    label: props.t('theme' + value.charAt(0).toUpperCase() + value.slice(1)),
    onClick: () => write('theme', value),
  }))

  const fadeRows = FADE_CHOICES.map((ms) => h(Opt, {
    key: String(ms),
    runtime: React,
    on: fadeMs === ms,
    disabled: busy,
    label: (ms / 1000).toFixed(1).replace(/\.0$/, '') + 's',
    onClick: () => write('fadeMs', ms),
  }))

  const particleRows = PARTICLE_CHOICES.map((count) => h(Opt, {
    key: String(count),
    runtime: React,
    on: particles === count,
    disabled: busy,
    label: String(count),
    onClick: () => write('particles', count),
  }))

  return h('li', { className: 'dwbc-card', 'data-open': open ? '1' : '0' },
    h('button', {
      type: 'button',
      className: 'dwbc-head',
      onClick: () => setOpen((current) => !current),
    },
    h('div', { className: 'dwbc-headtext' },
      h('div', { className: 'dwbc-name' }, props.t('title')),
      h('div', { className: 'dwbc-desc' }, props.t('desc'))),
    h('span', { className: 'dwbc-chev', 'aria-hidden': 'true' })),
    open ? h('div', { className: 'dwbc-body' },
      h('div', { className: 'dwbc-sec' },
        h('div', { className: 'dwbc-h' }, props.t('theme')),
        h('p', { className: 'dwbc-p' }, props.t('theme' + theme.charAt(0).toUpperCase() + theme.slice(1) + 'Desc')),
        h('div', { className: 'dwbc-row' }, themeRows)),
      h('div', { className: 'dwbc-sec' },
        h('div', { className: 'dwbc-h' }, props.t('fade')),
        h('div', { className: 'dwbc-row' }, fadeRows)),
      h('div', { className: 'dwbc-sec' },
        h('div', { className: 'dwbc-h' }, props.t('particles')),
        h('div', { className: 'dwbc-row' }, particleRows)),
      h('div', { className: 'dwbc-sec' },
        h(Switch, {
          runtime: React,
          on: showHint,
          label: props.t('hint'),
          onText: props.t('hintOn'),
          offText: props.t('hintOff'),
          onChange: (value) => write('showHint', value),
        })),
      h('div', { className: 'dwbc-sec' },
        h(Switch, {
          runtime: React,
          on: enabled,
          label: props.t('enabled'),
          onText: props.t('enabledOn'),
          offText: props.t('enabledOff'),
          onChange: (value) => write('enabled', value),
        })),
      failure !== null ? h('div', { className: 'dwbc-fail' }, failure) : null,
      h('p', { className: 'dwbc-note' }, props.t('note'))) : null)
}

/** Dispatcher: the page asks for `summary` rows and full `page` sections. */
function Entry(props) {
  return props.view === 'summary' ? Summary(props) : Card(props)
}

// The settings-card registration lives at factory scope — not inside the
// inject callback — so a re-fired callback (service re-arrival, HMR) shares
// one registration and never registers the card twice.
let registration = null

/**
 * Report activation, then contribute the settings card if the shell is willing.
 * @param ctx - Client plugin context.
 */
exports.apply = function apply(ctx) {
  // 1. Priority one, and it must not be able to fail for any other reason.
  try {
    const overlay = globalThis[OVERLAY]
    // A missing overlay means the Host half contributed nothing (for example a
    // static deployment whose boot payload carries no injection), in which case
    // the kernel boot page is the only screen and there is nothing to hand over.
    if (overlay !== undefined && overlay !== null && typeof overlay.clientReady === 'function') {
      overlay.clientReady()
    }
  } catch (error) {
    console.warn('dsh-whale-boot: client hand-off failed', error)
  }

  // 2. Optional: the settings card, reached with the dynamic `ctx.inject` form.
  try {
    let React = null
    try {
      React = require('react')
    } catch (error) {
      React = null
    }
    if (React === null || typeof React.createElement !== 'function') return
    if (ctx === undefined || ctx === null || typeof ctx.inject !== 'function') return

    ctx.inject(['slots', 'locale', 'configForms'], (owner) => {
      try {
        const slots = serviceAt(owner, 'slots')
        const locale = serviceAt(owner, 'locale')
        const forms = serviceAt(owner, 'configForms')
        if (slots === undefined || slots === null || typeof slots.inject !== 'function') return
        // `configForms` owns both the per-namespace scope and the "is the Host
        // serving it at all" gate.
        if (forms === undefined || forms === null || typeof forms.get !== 'function') return
        if (typeof forms.whileServed !== 'function') return

        if (locale !== undefined && locale !== null && typeof locale.register === 'function') {
          const dictionaries = () => locale.register(LOCALE_NAMESPACE, {
            zh: DICTIONARY_ZH,
            en: DICTIONARY_EN,
          })
          if (typeof owner.effect === 'function') owner.effect(dictionaries, 'dsh-whale-boot: dictionaries')
          else dictionaries()
        }
        const t = locale !== undefined && locale !== null && typeof locale.bind === 'function'
          ? locale.bind(LOCALE_NAMESPACE)
          : function (key) { return DICTIONARY_ZH[key] === undefined ? key : DICTIONARY_ZH[key] }

        // Registration is IDEMPOTENT by construction: `slots.register` throws
        // when a list slot already holds an entry with the same id, and that
        // throw lands inside the slot ledger's store notification, killing the
        // card's updates. The guard lives at factory scope — not inside the
        // inject callback — so a re-fired callback (service re-arrival, HMR)
        // shares the same registration and never registers twice.
        const contribute = () => {
          if (registration !== null) return
          try {
            registration = slots.inject(SLOT, () => slots.register(
              {
                name: SLOT,
                id: SETTINGS_NAMESPACE,
                order: 60,
                label: () => t('title'),
                locale: LOCALE_NAMESPACE,
                // Read lazily: the scope binds when the slot actually renders.
                inject: () => ({ runtime: React, scope: forms.get(SETTINGS_NAMESPACE), t }),
              },
              Entry,
            ))
          } catch (error) {
            registration = null
            console.warn('dsh-whale-boot: settings card not registered', error)
          }
        }
        const withdraw = () => {
          if (registration === null) return
          const dispose = registration
          registration = null
          try {
            if (typeof dispose === 'function') dispose()
          } catch (error) {
            console.warn('dsh-whale-boot: settings card not withdrawn', error)
          }
        }
        forms.whileServed([SETTINGS_NAMESPACE], () => {
          contribute()
          return withdraw
        })
      } catch (error) {
        console.warn('dsh-whale-boot: settings wiring failed', error)
      }
    })
  } catch (error) {
    console.warn('dsh-whale-boot: client half failed', error)
  }
}
return module.exports
} })
