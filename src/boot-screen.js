// Pre-boot screen, injected as a parser-blocking head row by entry.js.
//
// The script runs while the document is still being parsed, before the shell
// module script builds the kernel boot page, so this screen owns the viewport
// from the very first paint. It reads its configuration from
// globalThis.__DSH_WHALE_BOOT_CFG__ (injected as the row before this script),
// draws a canvas star-ocean with a leaping whale, mirrors the kernel's real
// boot progress (--dsh-boot-arc, 72deg..288deg) into a progress bar, detects
// the kernel's failure rendering, and dissolves into the app once the client
// half reports clientReady — or once the user presses a key / pointer, or
// once the hold budget runs out. Nothing is left behind: the overlay, its
// stylesheet, the animation loop, the observers and the listeners are all
// removed on the way out.
//
// Plain ES5, no template literals: the file is served as a raw head script, so
// it must survive every transport and minifier exactly as written.

/* eslint-disable */
;(function () {
  'use strict'

  var cfg = globalThis.__DSH_WHALE_BOOT_CFG__
  if (!cfg || typeof cfg !== 'object') return
  if (globalThis.__DSH_WHALE_BOOT__) return

  // ---- configuration ------------------------------------------------

  var HOLD_MS = typeof cfg.holdMs === 'number' ? cfg.holdMs : 15000
  var FADE_MS = typeof cfg.fadeMs === 'number' && cfg.fadeMs >= 400 && cfg.fadeMs <= 4000
    ? Math.round(cfg.fadeMs) : 1200
  var THEME = cfg.theme === 'aurora' || cfg.theme === 'meteor' ? cfg.theme : 'nebula'
  var SHOW_HINT = cfg.showHint !== false
  var PARTICLES = typeof cfg.particles === 'number'
    ? Math.min(240, Math.max(40, Math.round(cfg.particles))) : 110
  var VERSION = typeof cfg.version === 'string' ? cfg.version : ''

  var REDUCED = typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  var MIN_SHOW_MS = REDUCED ? 400 : 900

  var LANG = typeof navigator !== 'undefined' && typeof navigator.language === 'string'
    && /^zh/i.test(navigator.language) ? 'zh' : 'en'

  var DICT = {
    zh: {
      title: 'DeepSeek Harness',
      subtitle: '鲸鱼跃入星海 · 正在唤醒',
      hint: '点击任意位置，或按 Esc / 空格进入',
      slow: '启动较慢，就绪后自动进入',
      failed: '启动失败，点击查看诊断',
    },
    en: {
      title: 'DeepSeek Harness',
      subtitle: 'A whale leaps across the star ocean',
      hint: 'Click anywhere, or press Esc / Space to enter',
      slow: 'Still starting - entering as soon as it is ready',
      failed: 'Startup failed - click to see the diagnosis',
    },
  }
  function t(key) {
    var dict = DICT[LANG] || DICT.en
    if (dict[key] !== undefined) return dict[key]
    return DICT.en[key] !== undefined ? DICT.en[key] : key
  }

  var state = {
    startedAt: Date.now(),
    bootedAt: null,
    failed: false,
    leaving: false,
    gone: false,
    mounted: false,
  }

  /** The hand the client half reaches for; see lib/client.js. */
  var namespace = {
    clientReady: function () {
      if (state.bootedAt === null) state.bootedAt = Date.now()
      tryEnter(false)
    },
    failed: false,
  }
  globalThis.__DSH_WHALE_BOOT__ = namespace

  // ---- DOM ------------------------------------------------------------

  var FONT = '"Segoe UI","PingFang SC","Microsoft YaHei",system-ui,-apple-system,sans-serif'

  var CSS = [
    '.dwb-root{position:fixed;inset:0;z-index:2147482000;overflow:hidden;cursor:pointer;',
    'background:linear-gradient(180deg,#020916 0%,#061a33 45%,#0a2f55 72%,#0d3f70 100%);',
    'font-family:' + FONT + ';opacity:1;transition:opacity ' + FADE_MS + 'ms ease}',
    '.dwb-canvas{position:absolute;inset:0;width:100%;height:100%;display:block}',
    '.dwb-glow{position:absolute;inset:0;pointer-events:none;',
    'background:radial-gradient(ellipse at 50% -10%,rgba(130,190,255,.15),transparent 55%)}',
    '.dwb-title{position:absolute;left:0;right:0;top:9vh;text-align:center;',
    'font-size:21px;font-weight:700;letter-spacing:.42em;padding-left:.42em;color:#eef8ff;',
    'text-shadow:0 2px 22px rgba(110,200,255,.42);user-select:none}',
    '.dwb-sub{position:absolute;left:0;right:0;top:calc(9vh + 46px);text-align:center;',
    'font-size:12.5px;letter-spacing:.14em;padding-left:.14em;color:rgba(205,234,255,.72);',
    'user-select:none}',
    '.dwb-track{position:absolute;left:50%;bottom:9vh;transform:translateX(-50%);',
    'width:min(64vw,300px);height:4px;border-radius:999px;',
    'background:rgba(160,215,255,.16);overflow:hidden}',
    '.dwb-fill{height:100%;width:0%;border-radius:999px;',
    'background:linear-gradient(90deg,#5ec0ff,#9fdcff);',
    'box-shadow:0 0 12px rgba(120,200,255,.6);transition:width .25s ease}',
    '.dwb-hint{position:absolute;left:0;right:0;bottom:calc(9vh + 20px);text-align:center;',
    'font-size:11.5px;letter-spacing:.06em;color:rgba(180,220,250,.55);user-select:none}',
    '.dwb-hint[data-state=warn]{color:rgba(255,199,110,.9)}',
    '.dwb-hint[data-state=bad]{color:rgba(255,126,126,.95)}',
    '.dwb-ver{position:absolute;right:14px;bottom:10px;font-size:10px;',
    'color:rgba(160,205,245,.35);user-select:none;font-family:ui-monospace,Consolas,monospace}',
  ].join('')

  var root = document.createElement('div')
  root.className = 'dwb-root'
  root.setAttribute('role', 'presentation')
  root.setAttribute('aria-label', 'DeepSeek Harness boot screen')

  var styleEl = document.createElement('style')
  styleEl.setAttribute('data-dwb', '')
  styleEl.textContent = CSS

  var canvas = document.createElement('canvas')
  canvas.className = 'dwb-canvas'

  var glow = document.createElement('div')
  glow.className = 'dwb-glow'

  var title = document.createElement('div')
  title.className = 'dwb-title'
  title.textContent = t('title')

  var sub = document.createElement('div')
  sub.className = 'dwb-sub'
  sub.textContent = t('subtitle')

  var track = document.createElement('div')
  track.className = 'dwb-track'
  var fill = document.createElement('div')
  fill.className = 'dwb-fill'
  track.appendChild(fill)

  var hint = document.createElement('div')
  hint.className = 'dwb-hint'
  hint.textContent = t('hint')
  if (!SHOW_HINT) hint.style.display = 'none'

  var ver = null
  if (VERSION !== '') {
    ver = document.createElement('div')
    ver.className = 'dwb-ver'
    ver.textContent = 'dsh-whale-boot v' + VERSION
  }

  root.appendChild(styleEl)
  root.appendChild(glow)
  root.appendChild(canvas)
  root.appendChild(title)
  root.appendChild(sub)
  root.appendChild(track)
  root.appendChild(hint)
  if (ver !== null) root.appendChild(ver)

  // ---- canvas engine ----------------------------------------------------

  var ctx2d = null
  var dpr = 1
  var W = 0
  var H = 0
  var waterY = 0

  var stars = []
  var blobs = []
  var auroras = []
  var bubbles = []
  var drops = []
  var rings = []
  var trail = []
  var puffs = []
  var meteors = []

  var nextBubble = 0
  var nextMeteor = 0
  var nextSpout = 0
  var prevCycle = -1
  var lastNow = 0
  var rafId = 0

  var LEAP_MS = 6800
  var AIR = 0.68

  function rand(a, b) { return a + Math.random() * (b - a) }
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v) }

  function seed() {
    stars.length = 0
    bubbles.length = 0
    drops.length = 0
    rings.length = 0
    trail.length = 0
    puffs.length = 0
    meteors.length = 0
    var count = Math.round(clamp(PARTICLES * 2.2, 80, 420) * Math.min(1, (W * H) / 1150000))
    count = Math.max(count, 80)
    for (var i = 0; i < count; i += 1) {
      var big = Math.random() < 0.07
      stars.push({
        x: rand(0, W), y: rand(0, H * 0.92),
        r: big ? rand(1.5, 2.1) : rand(0.4, 1.4),
        a: rand(0.25, 0.95), tw: rand(0.0005, 0.0022), ph: rand(0, Math.PI * 2),
        vx: rand(-0.006, 0.002), vy: rand(0.004, 0.02),
        big: big,
      })
    }
    blobs = [
      { xf: 0.22, yf: 0.18, rf: 0.4, ph: 0.0, rgba: 'rgba(88,130,255,' },
      { xf: 0.74, yf: 0.12, rf: 0.44, ph: 2.1, rgba: 'rgba(150,90,255,' },
      { xf: 0.52, yf: 0.52, rf: 0.56, ph: 4.2, rgba: 'rgba(60,120,235,' },
    ]
    auroras = [
      { yf: 0.14, amp: H * 0.045, len: W * 0.55, speed: 0.00035, ph: 0.0,
        wide: 'rgba(90,240,170,0.055)', core: 'rgba(150,255,200,0.1)' },
      { yf: 0.22, amp: H * 0.06, len: W * 0.75, speed: -0.00028, ph: 1.7,
        wide: 'rgba(140,120,255,0.05)', core: 'rgba(180,160,255,0.09)' },
      { yf: 0.3, amp: H * 0.04, len: W * 0.9, speed: 0.00022, ph: 3.4,
        wide: 'rgba(80,200,255,0.05)', core: 'rgba(140,225,255,0.09)' },
    ]
  }

  function resize() {
    W = typeof window.innerWidth === 'number' && window.innerWidth > 0 ? window.innerWidth : 320
    H = typeof window.innerHeight === 'number' && window.innerHeight > 0 ? window.innerHeight : 240
    dpr = typeof window.devicePixelRatio === 'number' && window.devicePixelRatio > 0
      ? Math.min(window.devicePixelRatio, 2) : 1
    canvas.width = Math.max(1, Math.round(W * dpr))
    canvas.height = Math.max(1, Math.round(H * dpr))
    waterY = Math.round(H * 0.72)
    ctx2d = canvas.getContext('2d')
    ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0)
    seed()
  }

  function drawBlobs(now) {
    var t = now * 0.00006
    for (var i = 0; i < blobs.length; i += 1) {
      var b = blobs[i]
      var cx = W * b.xf + Math.sin(t + b.ph) * W * 0.03
      var cy = H * b.yf + Math.cos(t * 0.8 + b.ph) * H * 0.03
      var r = Math.min(W, H) * b.rf
      var grad = ctx2d.createRadialGradient(cx, cy, 0, cx, cy, r)
      grad.addColorStop(0, b.rgba + '0.09)')
      grad.addColorStop(1, b.rgba + '0)')
      ctx2d.fillStyle = grad
      ctx2d.fillRect(cx - r, cy - r, r * 2, r * 2)
    }
  }

  function drawMoon(now) {
    var mx = W * 0.8
    var my = H * 0.17
    var mr = H * 0.2
    var halo = ctx2d.createRadialGradient(mx, my, 0, mx, my, mr)
    halo.addColorStop(0, 'rgba(255,250,235,0.12)')
    halo.addColorStop(1, 'rgba(255,250,235,0)')
    ctx2d.fillStyle = halo
    ctx2d.fillRect(mx - mr, my - mr, mr * 2, mr * 2)
    ctx2d.fillStyle = 'rgba(255,252,240,0.85)'
    ctx2d.beginPath()
    ctx2d.arc(mx, my, H * 0.028, 0, Math.PI * 2)
    ctx2d.fill()
    ctx2d.fillStyle = 'rgba(190,220,255,0.25)'
    ctx2d.beginPath()
    ctx2d.arc(mx - H * 0.012, my - H * 0.006, H * 0.006, 0, Math.PI * 2)
    ctx2d.fill()
  }

  function drawStars(now) {
    for (var i = 0; i < stars.length; i += 1) {
      var s = stars[i]
      var tw = 0.55 + 0.45 * Math.sin(now * s.tw + s.ph)
      ctx2d.fillStyle = 'rgba(215,235,255,' + (s.a * tw).toFixed(3) + ')'
      ctx2d.beginPath()
      ctx2d.arc(s.x, s.y, s.r, 0, Math.PI * 2)
      ctx2d.fill()
      if (s.big) {
        ctx2d.strokeStyle = 'rgba(200,230,255,' + (s.a * tw * 0.5).toFixed(3) + ')'
        ctx2d.lineWidth = 0.6
        ctx2d.beginPath()
        ctx2d.moveTo(s.x - s.r * 3.2, s.y)
        ctx2d.lineTo(s.x + s.r * 3.2, s.y)
        ctx2d.moveTo(s.x, s.y - s.r * 3.2)
        ctx2d.lineTo(s.x, s.y + s.r * 3.2)
        ctx2d.stroke()
      }
    }
  }

  function drawAurora(now) {
    ctx2d.lineCap = 'round'
    for (var i = 0; i < auroras.length; i += 1) {
      var a = auroras[i]
      var base = a.yf * H
      var phase = now * a.speed + a.ph
      var k = (Math.PI * 2) / a.len
      var pass = function (lineWidth, style) {
        ctx2d.lineWidth = lineWidth
        ctx2d.strokeStyle = style
        ctx2d.beginPath()
        ctx2d.moveTo(0, base + Math.sin(phase) * a.amp)
        for (var x = 24; x <= W; x += 24) {
          ctx2d.lineTo(x, base + Math.sin(x * k + phase) * a.amp)
        }
        ctx2d.stroke()
      }
      pass(H * 0.07, a.wide)
      pass(H * 0.028, a.core)
    }
  }

  function stepMeteors(now, dt) {
    if (now >= nextMeteor && meteors.length < 3) {
      meteors.push({
        x: rand(W * 0.1, W * 0.92), y: rand(-40, H * 0.22),
        vx: rand(-0.58, -0.38), vy: rand(0.3, 0.5),
      })
      nextMeteor = now + rand(500, 1400)
    }
    for (var i = meteors.length - 1; i >= 0; i -= 1) {
      var m = meteors[i]
      m.x += m.vx * dt
      m.y += m.vy * dt
      if (m.y > H + 60 || m.x < -160) {
        meteors.splice(i, 1)
        continue
      }
      var tailX = m.x - m.vx * 120
      var tailY = m.y - m.vy * 120
      var grad = ctx2d.createLinearGradient(m.x, m.y, tailX, tailY)
      grad.addColorStop(0, 'rgba(255,255,255,0.85)')
      grad.addColorStop(1, 'rgba(255,255,255,0)')
      ctx2d.strokeStyle = grad
      ctx2d.lineWidth = 1.6
      ctx2d.beginPath()
      ctx2d.moveTo(m.x, m.y)
      ctx2d.lineTo(tailX, tailY)
      ctx2d.stroke()
      ctx2d.fillStyle = 'rgba(255,255,255,0.9)'
      ctx2d.beginPath()
      ctx2d.arc(m.x, m.y, 1.8, 0, Math.PI * 2)
      ctx2d.fill()
    }
  }

  function stepBubbles(now, dt) {
    if (now >= nextBubble && bubbles.length < 26) {
      bubbles.push({
        x: rand(0, W), y: waterY + rand(4, H * 0.2),
        r: rand(1.2, 3.4), vy: rand(0.05, 0.11), wob: rand(0, Math.PI * 2),
        wv: rand(0.004, 0.008), a: rand(0.25, 0.6),
      })
      nextBubble = now + rand(240, 520)
    }
    for (var i = bubbles.length - 1; i >= 0; i -= 1) {
      var b = bubbles[i]
      b.y -= b.vy * dt
      b.wob += b.wv * dt
      if (b.y < waterY - H * 0.55) {
        bubbles.splice(i, 1)
        continue
      }
      var bx = b.x + Math.sin(b.wob) * 6
      ctx2d.strokeStyle = 'rgba(190,225,255,' + b.a.toFixed(3) + ')'
      ctx2d.lineWidth = 1
      ctx2d.beginPath()
      ctx2d.arc(bx, b.y, b.r, 0, Math.PI * 2)
      ctx2d.stroke()
      ctx2d.fillStyle = 'rgba(255,255,255,' + (b.a * 0.4).toFixed(3) + ')'
      ctx2d.beginPath()
      ctx2d.arc(bx - b.r * 0.3, b.y - b.r * 0.3, b.r * 0.28, 0, Math.PI * 2)
      ctx2d.fill()
    }
  }

  function splash(x, dir) {
    for (var i = 0; i < 12; i += 1) {
      drops.push({
        x: x + rand(-10, 10), y: waterY - rand(0, 6),
        vx: rand(-0.3, 0.3) + dir * rand(0.1, 0.3), vy: rand(-0.9, -0.3),
        life: 1, r: rand(1.2, 3.2),
      })
    }
    rings.push({ x: x, y: waterY, life: 1 })
  }

  function stepDrops(now, dt) {
    for (var i = drops.length - 1; i >= 0; i -= 1) {
      var d = drops[i]
      d.vy += 0.0018 * dt
      d.x += d.vx * dt
      d.y += d.vy * dt
      d.life -= dt / 900
      if (d.life <= 0) {
        drops.splice(i, 1)
        continue
      }
      ctx2d.fillStyle = 'rgba(255,255,255,' + (d.life * 0.9).toFixed(3) + ')'
      ctx2d.beginPath()
      ctx2d.arc(d.x, d.y, d.r, 0, Math.PI * 2)
      ctx2d.fill()
    }
    for (var j = rings.length - 1; j >= 0; j -= 1) {
      var r = rings[j]
      r.life -= dt / 600
      if (r.life <= 0) {
        rings.splice(j, 1)
        continue
      }
      var p = 1 - r.life
      ctx2d.strokeStyle = 'rgba(210,240,255,' + (r.life * 0.5).toFixed(3) + ')'
      ctx2d.lineWidth = 1.4
      ctx2d.beginPath()
      ctx2d.ellipse(r.x, r.y, 6 + p * 40, 2.4 + p * 7, 0, 0, Math.PI * 2)
      ctx2d.stroke()
    }
  }

  function stepTrail(now, dt) {
    for (var i = trail.length - 1; i >= 0; i -= 1) {
      var p = trail[i]
      p.a -= dt * 0.0011
      if (p.a <= 0) {
        trail.splice(i, 1)
        continue
      }
      ctx2d.fillStyle = 'rgba(143,208,255,' + (p.a * 0.4).toFixed(3) + ')'
      ctx2d.beginPath()
      ctx2d.arc(p.x, p.y, 2 + p.a * 7, 0, Math.PI * 2)
      ctx2d.fill()
    }
  }

  function stepPuffs(now, dt) {
    for (var i = puffs.length - 1; i >= 0; i -= 1) {
      var p = puffs[i]
      p.y += p.vy * dt
      p.x += p.vx * dt
      p.life -= dt / 1100
      if (p.life <= 0) {
        puffs.splice(i, 1)
        continue
      }
      var pr = p.r * (1.6 - p.life * 0.6)
      var grad = ctx2d.createRadialGradient(p.x, p.y, 0, p.x, p.y, pr)
      grad.addColorStop(0, 'rgba(255,255,255,' + (p.life * 0.55).toFixed(3) + ')')
      grad.addColorStop(1, 'rgba(255,255,255,0)')
      ctx2d.fillStyle = grad
      ctx2d.beginPath()
      ctx2d.arc(p.x, p.y, pr, 0, Math.PI * 2)
      ctx2d.fill()
    }
  }

  function drawWater(now, front) {
    var amp = front ? 8 : 6
    var speed = front ? -0.0006 : 0.0005
    var alpha = front ? 0.3 : 0.44
    var rgb = front ? '62,138,214' : '30,90,170'
    var offset = front ? 3 : 0
    ctx2d.fillStyle = 'rgba(' + rgb + ',' + alpha + ')'
    ctx2d.beginPath()
    ctx2d.moveTo(0, waterY + offset + Math.sin(now * speed) * amp)
    for (var x = 20; x <= W + 20; x += 20) {
      ctx2d.lineTo(x, waterY + offset + Math.sin(x * 0.014 + now * speed) * amp)
    }
    ctx2d.lineTo(W, H)
    ctx2d.lineTo(0, H)
    ctx2d.closePath()
    ctx2d.fill()
  }

  /** The whale, nose at +x, tail root at x=-40, body about 116 units long. */
  function drawWhale(x, y, scale, rot, under) {
    ctx2d.save()
    ctx2d.translate(x, y)
    ctx2d.rotate(rot)
    var wag = under ? Math.sin(Date.now() * 0.006) * 0.16 : 0
    if (!under) {
      ctx2d.shadowColor = 'rgba(120,190,255,0.45)'
      ctx2d.shadowBlur = 26
    }
    ctx2d.scale(scale, scale)
    // tail: stem + two flukes
    ctx2d.save()
    ctx2d.translate(-38, 0)
    ctx2d.rotate(wag)
    ctx2d.fillStyle = '#1d4d9e'
    ctx2d.beginPath()
    ctx2d.moveTo(4, 0)
    ctx2d.lineTo(-22, -3)
    ctx2d.lineTo(-22, 3)
    ctx2d.closePath()
    ctx2d.fill()
    ctx2d.beginPath()
    ctx2d.ellipse(-30, -20, 15, 6.5, -0.5, 0, Math.PI * 2)
    ctx2d.fill()
    ctx2d.beginPath()
    ctx2d.ellipse(-30, 20, 15, 6.5, 0.5, 0, Math.PI * 2)
    ctx2d.fill()
    ctx2d.restore()
    // body
    var body = ctx2d.createLinearGradient(-40, 0, 58, 0)
    body.addColorStop(0, '#2a63b8')
    body.addColorStop(1, '#1b438f')
    ctx2d.fillStyle = body
    ctx2d.beginPath()
    ctx2d.moveTo(58, 0)
    ctx2d.bezierCurveTo(54, -16, 34, -26, 2, -25)
    ctx2d.bezierCurveTo(-16, -24, -30, -17, -38, -7)
    ctx2d.lineTo(-38, 7)
    ctx2d.bezierCurveTo(-30, 17, -16, 24, 2, 25)
    ctx2d.bezierCurveTo(34, 26, 54, 16, 58, 0)
    ctx2d.closePath()
    ctx2d.fill()
    ctx2d.shadowBlur = 0
    // back patch
    ctx2d.fillStyle = 'rgba(170,215,255,0.3)'
    ctx2d.beginPath()
    ctx2d.moveTo(26, -20)
    ctx2d.bezierCurveTo(10, -23, -12, -22, -28, -15)
    ctx2d.bezierCurveTo(-16, -11, 2, -11, 26, -20)
    ctx2d.closePath()
    ctx2d.fill()
    // belly
    ctx2d.fillStyle = 'rgba(210,232,255,0.92)'
    ctx2d.beginPath()
    ctx2d.moveTo(46, 12)
    ctx2d.bezierCurveTo(24, 23, -8, 23, -32, 13)
    ctx2d.bezierCurveTo(-24, 6, -10, 3, 6, 3)
    ctx2d.bezierCurveTo(24, 3, 38, 6, 46, 12)
    ctx2d.closePath()
    ctx2d.fill()
    // belly grooves
    ctx2d.strokeStyle = 'rgba(30,70,130,0.35)'
    ctx2d.lineWidth = 1
    ctx2d.beginPath()
    ctx2d.moveTo(38, 11)
    ctx2d.quadraticCurveTo(28, 16, 18, 17)
    ctx2d.moveTo(24, 9)
    ctx2d.quadraticCurveTo(14, 13, 4, 14)
    ctx2d.moveTo(10, 8)
    ctx2d.quadraticCurveTo(0, 11, -8, 11)
    ctx2d.stroke()
    // pectoral fin
    ctx2d.fillStyle = '#1f4e9e'
    ctx2d.beginPath()
    ctx2d.moveTo(8, 8)
    ctx2d.bezierCurveTo(4, 20, 12, 32, 26, 34)
    ctx2d.bezierCurveTo(18, 28, 14, 18, 16, 10)
    ctx2d.closePath()
    ctx2d.fill()
    // eye + smile
    ctx2d.fillStyle = '#0b2149'
    ctx2d.beginPath()
    ctx2d.arc(40, -5, 2.6, 0, Math.PI * 2)
    ctx2d.fill()
    ctx2d.fillStyle = 'rgba(255,255,255,0.9)'
    ctx2d.beginPath()
    ctx2d.arc(41, -6, 0.9, 0, Math.PI * 2)
    ctx2d.fill()
    ctx2d.strokeStyle = '#0b2149'
    ctx2d.lineWidth = 1.4
    ctx2d.beginPath()
    ctx2d.arc(43, 2, 7, Math.PI * 0.15, Math.PI * 0.85)
    ctx2d.stroke()
    ctx2d.restore()
  }

  function stepWhale(now) {
    var tCycle = ((now - state.startedAt) % LEAP_MS) / LEAP_MS
    var scale = Math.max(0.6, Math.min(W * 0.18, 260, H * 0.5) / 116)
    var airborne = tCycle < AIR

    if (prevCycle >= 0) {
      if (tCycle < prevCycle) splash(W * 0.06, 1)
      else if (prevCycle < AIR && tCycle >= AIR) splash(W * 0.98, -1)
    }
    prevCycle = tCycle

    var px, py, rot
    if (airborne) {
      var tt = tCycle / AIR
      var x0 = W * 0.06
      var x1 = W * 0.98
      var amp = Math.max(H * 0.22, 110)
      px = x0 + (x1 - x0) * tt
      py = waterY - amp * 4 * tt * (1 - tt)
      rot = Math.atan2(-amp * 4 * (1 - 2 * tt), (x1 - x0))

      if (tt > 0.06 && tt < 0.8) {
        trail.push({
          x: px + Math.cos(rot) * (-30) * scale,
          y: py + Math.sin(rot) * (-30) * scale,
          a: 0.5,
        })
        if (trail.length > 120) trail.shift()
      }
      if (tt > 0.38 && tt < 0.62 && now >= nextSpout) {
        var headX = px + Math.cos(rot) * 50 * scale
        var headY = py + Math.sin(rot) * 50 * scale - 4 * scale
        puffs.push({
          x: headX + rand(-5, 5), y: headY - rand(0, 4),
          vx: rand(-0.02, 0.02), vy: rand(-0.12, -0.06),
          life: 1, r: rand(2.5, 4.5),
        })
        nextSpout = now + 70
      }
      drawWhale(px, py, scale, rot, false)
    } else {
      var u = (tCycle - AIR) / (1 - AIR)
      px = W * 0.98 - (W * 0.98 - W * 0.06) * u
      py = waterY + H * 0.09 + Math.sin(u * Math.PI * 2) * 8
      rot = Math.PI + Math.sin(now * 0.006) * 0.05
      // underwater glow
      var glowR = 46 * scale
      var uglow = ctx2d.createRadialGradient(px, py, 0, px, py, glowR)
      uglow.addColorStop(0, 'rgba(120,180,255,0.12)')
      uglow.addColorStop(1, 'rgba(120,180,255,0)')
      ctx2d.fillStyle = uglow
      ctx2d.beginPath()
      ctx2d.arc(px, py, glowR, 0, Math.PI * 2)
      ctx2d.fill()
      drawWhale(px, py, scale, rot, true)
    }
  }

  function draw(now) {
    ctx2d.clearRect(0, 0, W, H)
    if (THEME === 'nebula') drawBlobs(now)
    if (THEME === 'nebula' || THEME === 'meteor') drawMoon(now)
    drawStars(now)
    if (THEME === 'aurora') drawAurora(now)
    drawWater(now, false)
    if (THEME === 'meteor') stepMeteors(now, 16)
    stepWhale(now)
    stepTrail(now, 16)
    stepPuffs(now, 16)
    stepDrops(now, 16)
    drawWater(now, true)
    stepBubbles(now, 16)
  }

  function frame(now) {
    if (state.gone) return
    if (lastNow === 0) lastNow = now
    var dt = Math.min(now - lastNow, 80)
    lastNow = now
    // motion updates
    for (var i = 0; i < stars.length; i += 1) {
      var s = stars[i]
      s.x += s.vx * dt
      s.y += s.vy * dt
      if (s.x < -2) s.x = W + 2
      if (s.x > W + 2) s.x = -2
      if (s.y < -2) s.y = H * 0.92 + 2
      if (s.y > H * 0.92 + 2) s.y = -2
    }
    draw(now)
    rafId = requestAnimationFrame(frame)
  }

  function drawStatic() {
    var apexNow = state.startedAt + LEAP_MS * AIR / 2
    draw(apexNow)
  }

  // ---- boot hand-off ----------------------------------------------------

  function leave() {
    if (state.leaving || state.gone) return
    state.leaving = true
    root.style.opacity = '0'
    setTimeout(cleanup, FADE_MS + 120)
  }

  function tryEnter(forced) {
    if (state.leaving || state.gone) return
    if (state.failed) return
    var elapsed = Date.now() - state.startedAt
    if (state.bootedAt === null) {
      if (forced && elapsed < HOLD_MS) {
        hint.textContent = t('slow')
        hint.setAttribute('data-state', 'warn')
      } else if (elapsed >= HOLD_MS) {
        leave()
      }
      return
    }
    if (forced || elapsed >= MIN_SHOW_MS) leave()
  }

  function press() {
    if (state.leaving || state.gone) return
    if (state.failed) {
      leave()
      return
    }
    tryEnter(true)
  }

  function onKey(event) {
    if (event.key === 'Escape' || event.key === ' ' || event.key === 'Enter') {
      event.preventDefault()
      press()
    }
  }

  /** Drive the bar from the kernel's own progress arc (72deg..288deg). */
  function observeProgress() {
    var boot = document.querySelector('[data-dsh-boot]')
    if (boot === null) return
    var spinner = boot.querySelector('[data-dsh-boot-spinner]')
    if (spinner === null) return
    var update = function () {
      var raw = parseFloat(spinner.style.getPropertyValue('--dsh-boot-arc'))
      var ratio = Number.isFinite(raw) ? clamp((raw - 72) / 216, 0, 1) : 0
      fill.style.width = (ratio * 100).toFixed(1) + '%'
      if (ratio >= 1) tryEnter(false)
    }
    update()
    try {
      new MutationObserver(update).observe(spinner, { attributes: true, attributeFilter: ['style'] })
    } catch (error) { /* observer unavailable: the bar stays where it was */ }
  }

  /**
   * Detect the kernel's failure rendering: the kernel replaces the boot card's
   * children with a failure report and never mounts the application, so without
   * this the screen would hold the viewport forever and hide the diagnosis.
   */
  function observeFailure() {
    var boot = document.querySelector('[data-dsh-boot]')
    if (boot === null) return
    var check = function () {
      if (state.failed) return
      var text = boot.textContent || ''
      if (text.indexOf('Failed to load plugins') < 0 && text.indexOf('did not activate') < 0) return
      state.failed = true
      namespace.failed = true
      hint.textContent = t('failed')
      hint.setAttribute('data-state', 'bad')
    }
    try {
      new MutationObserver(check).observe(boot, { childList: true, subtree: true, characterData: true })
    } catch (error) { /* observer unavailable */ }
    check()
  }

  // ---- lifecycle --------------------------------------------------------

  var pollId = 0
  var resizeHandler = null

  function cleanup() {
    if (state.gone) return
    state.gone = true
    if (rafId !== 0) {
      try { cancelAnimationFrame(rafId) } catch (error) { /* already stopped */ }
      rafId = 0
    }
    if (pollId !== 0) {
      clearInterval(pollId)
      pollId = 0
    }
    try {
      window.removeEventListener('keydown', onKey, true)
      root.removeEventListener('pointerdown', press)
      if (resizeHandler !== null) window.removeEventListener('resize', resizeHandler)
    } catch (error) { /* gone window: nothing left to detach */ }
    if (root.parentNode) root.parentNode.removeChild(root)
  }

  function mount() {
    if (state.mounted || state.gone) return
    state.mounted = true
    document.body.appendChild(root)
    resize()
    observeProgress()
    observeFailure()
    if (REDUCED) {
      drawStatic()
    } else {
      rafId = requestAnimationFrame(frame)
    }
    pollId = setInterval(function () { tryEnter(false) }, 200)
    root.addEventListener('pointerdown', press)
    window.addEventListener('keydown', onKey, true)
    resizeHandler = function () { resize() }
    window.addEventListener('resize', resizeHandler)
  }

  if (document.body) mount()
  else document.addEventListener('DOMContentLoaded', mount, { once: true })
})()
