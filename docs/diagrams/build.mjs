// Draws the figures in docs/images/*.svg.
//
// The README and the Symbo API's Embedded Dialer guide embed the same
// pictures, so they are generated from one place rather than drawn by hand
// twice. Plain SVG, no dependencies, no fonts to ship: every figure is boxes,
// arrows and text on a white card, which reads the same on GitHub in either
// theme, on npm, and in the Symbo API docs.
//
//   npm run diagrams
//
// Edit the data in the functions below and re-run. Coordinates are in the
// SVG's own units; each figure sets its own viewBox.
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'images')

const FONT =
  "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
const MONO = "ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace"

// One hue per party. Blue is yours, violet is Symbo, grey is the phone
// network and the people on it.
const C = {
  ink: '#14161c',
  muted: '#5b6479',
  faint: '#8b93a7',
  line: '#c9ced8',
  paper: '#ffffff',
  you: '#1f4fd8',
  youFill: '#eef2ff',
  symbo: '#5b5bd6',
  symboFill: '#f1f0fb',
  world: '#6b7280',
  worldFill: '#f3f4f6',
  ok: '#1a7f52',
  okFill: '#dff5e8',
  warn: '#9a5b12',
  warnFill: '#fff4d6',
  bad: '#b3271e',
  badFill: '#fde8e6',
}

/* ------------------------------------------------------------ primitives */

const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const attrs = (o) =>
  Object.entries(o)
    .filter(([, v]) => v !== undefined && v !== null && v !== false)
    .map(([k, v]) => ` ${k}="${v}"`)
    .join('')

function text(x, y, str, o = {}) {
  const {
    size = 12,
    weight = 400,
    anchor = 'start',
    fill = C.ink,
    mono = false,
    italic = false,
  } = o
  return `<text${attrs({
    x,
    y,
    'font-family': mono ? MONO : FONT,
    'font-size': size,
    'font-weight': weight === 400 ? undefined : weight,
    'text-anchor': anchor === 'start' ? undefined : anchor,
    fill,
    'font-style': italic ? 'italic' : undefined,
  })}>${esc(str)}</text>`
}

// Several lines of text, one <text> each. An entry can be a string or
// { t, ...overrides } to restyle a single line.
function lines(x, y, arr, o = {}) {
  const lh = o.lh ?? (o.size ?? 12) * 1.4
  return arr
    .map((entry, i) => {
      const str = typeof entry === 'string' ? entry : entry.t
      const opt = typeof entry === 'string' ? o : { ...o, ...entry }
      return text(x, y + i * lh, str, opt)
    })
    .join('\n')
}

function rect(x, y, w, h, o = {}) {
  const { fill = C.paper, stroke = C.line, sw = 1.25, rx = 6, dash } = o
  return `<rect${attrs({
    x,
    y,
    width: w,
    height: h,
    rx,
    fill,
    stroke,
    'stroke-width': sw,
    'stroke-dasharray': dash,
  })}/>`
}

function path(d, o = {}) {
  const { stroke = C.ink, sw = 1.25, dash, start, end, fill = 'none' } = o
  return `<path${attrs({
    d,
    fill,
    stroke,
    'stroke-width': sw,
    'stroke-dasharray': dash,
    'marker-start': start ? `url(#${start})` : undefined,
    'marker-end': end ? `url(#${end})` : undefined,
  })}/>`
}

// A straight or bent connector through `points`, with an arrowhead at the
// end (and at the start when `both`). Colour picks the matching marker.
function arrow(points, o = {}) {
  const { color = 'ink', both = false, dash, sw = 1.25 } = o
  const d = points.map(([x, y], i) => `${i ? 'L' : 'M'}${x},${y}`).join(' ')
  return path(d, {
    stroke: C[color],
    sw,
    dash,
    end: `arrow-${color}`,
    start: both ? `arrow-${color}` : undefined,
  })
}

function markers() {
  return (
    '<defs>' +
    ['ink', 'you', 'symbo', 'world', 'muted', 'faint']
      .map(
        (k) =>
          `<marker id="arrow-${k}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="${C[k]}"/></marker>`
      )
      .join('') +
    '</defs>'
  )
}

// A titled box: bold title on the first line, regular lines under it.
function card(x, y, w, h, title, body = [], o = {}) {
  const { fill = C.paper, stroke = C.line, titleFill = C.ink, size = 12, pad = 12, mono = false, dash, rx } = o
  const parts = [rect(x, y, w, h, { fill, stroke, dash, rx })]
  let ty = y + pad + 11
  if (title) {
    parts.push(text(x + pad, ty, title, { size: size + 1, weight: 650, fill: titleFill }))
    ty += (size + 1) * 1.5
  }
  if (body.length) parts.push(lines(x + pad, ty, body, { size, fill: C.muted, mono }))
  return parts.join('\n')
}

// A small caps section label.
const eyebrow = (x, y, str, fill = C.faint) =>
  text(x, y, str.toUpperCase(), { size: 10.5, weight: 700, fill })

// A rounded chip of monospace text, sized from its length.
function chip(cx, cy, str, o = {}) {
  const { fill = C.paper, stroke = C.line, color = C.ink, size = 11 } = o
  const w = Math.round(str.length * size * 0.62 + 16)
  const h = size + 10
  return (
    rect(cx - w / 2, cy - h / 2, w, h, { fill, stroke, rx: h / 2, sw: 1 }) +
    text(cx, cy + size * 0.36, str, { size, mono: true, anchor: 'middle', fill: color })
  )
}

function svg(w, h, body, { label }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="${esc(label)}">
<title>${esc(label)}</title>
${markers()}
<rect width="${w}" height="${h}" fill="${C.paper}"/>
${body}
</svg>
`
}

/* --------------------------------------------- sequence-diagram helpers */

// Lanes are { name, x, color, sub? }. Rows are drawn in order:
//   { y, from, to, label, sub?, color?, dash? }   an arrow between lanes
//   { y, lane, note: [...], w? }                  a note on one lane
//   { y, span: [a, b], label }                    a bracket across lanes
function lanes(spec, top, bottom) {
  return spec
    .map((l) => {
      const w = l.w ?? 150
      const color = C[l.color] ?? C.ink
      return (
        rect(l.x - w / 2, top, w, 40, { fill: C[`${l.color}Fill`] ?? C.paper, stroke: color, sw: 1.5 }) +
        text(l.x, top + (l.sub ? 18 : 25), l.name, { size: 13, weight: 650, anchor: 'middle', fill: color }) +
        (l.sub ? text(l.x, top + 32, l.sub, { size: 10.5, anchor: 'middle', fill: C.muted }) : '') +
        path(`M${l.x},${top + 40} L${l.x},${bottom}`, { stroke: C.line, dash: '4 4' })
      )
    })
    .join('\n')
}

function seqRows(laneMap, rows) {
  return rows
    .map((r) => {
      if (r.note) {
        const x = laneMap[r.lane]
        const w = r.w ?? 220
        const h = r.note.length * 16 + 14
        return (
          rect(x - w / 2, r.y - h / 2, w, h, { fill: C.warnFill, stroke: C.warn, sw: 1 }) +
          lines(x, r.y - h / 2 + 18, r.note, { size: 11.5, anchor: 'middle', fill: C.ink, lh: 16 })
        )
      }
      if (r.span) {
        const [a, b] = r.span.map((n) => laneMap[n])
        const x1 = Math.min(a, b) - 80
        const x2 = Math.max(a, b) + 80
        return (
          rect(x1, r.y, x2 - x1, r.h, { fill: 'none', stroke: C.faint, dash: '6 4', rx: 8 }) +
          text(x1 + 10, r.y + 16, r.label, { size: 11, weight: 700, fill: C.faint })
        )
      }
      const x1 = laneMap[r.from]
      const x2 = laneMap[r.to]
      const color = r.color ?? 'ink'
      const dir = x2 > x1 ? 1 : -1
      const mid = (x1 + x2) / 2
      const parts = [
        arrow([[x1, r.y], [x2 - dir * 4, r.y]], { color, dash: r.dash }),
        text(mid, r.y - 7, r.label, { size: 11.5, mono: r.mono ?? true, anchor: 'middle', fill: C[color] }),
      ]
      if (r.sub) parts.push(text(mid, r.y + 15, r.sub, { size: 10.5, anchor: 'middle', fill: C.muted }))
      return parts.join('\n')
    })
    .join('\n')
}

/* ---------------------------------------------------------- 1. the parts */

function architecture() {
  const W = 960
  const H = 470
  const b = []

  // Your application
  b.push(rect(20, 30, 450, 420, { fill: C.youFill, stroke: C.you, dash: '6 4', rx: 10 }))
  b.push(eyebrow(34, 52, 'Your application', C.you))

  // Your page, with your UI, the SDK and the frame inside it
  b.push(rect(36, 64, 418, 232, { fill: C.paper, stroke: C.you, sw: 1.5, rx: 8 }))
  b.push(text(48, 84, 'Your page', { size: 13, weight: 650, fill: C.you }))

  b.push(
    card(48, 98, 176, 184, 'Your UI', [
      'contact queue',
      'contact card',
      'post-call form',
      'inbound banner',
      'keypad, notes',
      '',
      { t: 'You render state;', fill: C.faint, size: 11 },
      { t: 'you decide what next.', fill: C.faint, size: 11 },
    ])
  )
  b.push(
    card(258, 98, 184, 62, '@symbo/dialer-embed', [
      { t: 'the SDK: creates the iframe,', size: 11 },
      { t: 'commands in, events out', size: 11 },
    ])
  )
  b.push(
    card(258, 176, 184, 106, 'The frame', [
      { t: 'iframe · app.symbo.ai', mono: true, size: 11 },
      "the rep's audio leg",
      'the calling device',
      'the realtime connection',
    ], { fill: C.symboFill, stroke: C.symbo, titleFill: C.symbo })
  )
  // UI <-> SDK
  b.push(arrow([[224, 118], [258, 118]], { color: 'you' }))
  b.push(text(241, 110, 'commands', { size: 10, anchor: 'middle', fill: C.you }))
  b.push(arrow([[258, 146], [224, 146]], { color: 'symbo' }))
  b.push(text(241, 160, 'events', { size: 10, anchor: 'middle', fill: C.symbo }))
  // SDK <-> frame
  b.push(arrow([[350, 160], [350, 176]], { color: 'ink', both: true }))
  b.push(text(358, 172, 'postMessage', { size: 10, fill: C.muted }))

  // Your server
  b.push(
    card(36, 312, 418, 122, 'Your server', [
      'holds the org-admin API token',
      'creates contacts and sessions, edits the queue while it runs',
      'reads every call back when a session ends',
      { t: 'The browser never holds a Symbo credential.', fill: C.faint, size: 11 },
    ], { stroke: C.you, titleFill: C.you })
  )

  // Symbo
  b.push(rect(520, 30, 420, 420, { fill: C.symboFill, stroke: C.symbo, dash: '6 4', rx: 10 }))
  b.push(eyebrow(534, 52, 'Symbo', C.symbo))

  b.push(
    card(536, 64, 250, 232, 'Power-dial engine', [
      'rings the session’s number of',
      'lines at once (1–4)',
      'bridges the rep to the first answer',
      'hangs up the other lines',
      'pauses until you say what is next',
      'stamps default outcomes on',
      'every line nobody dispositions',
    ], { stroke: C.symbo, titleFill: C.symbo })
  )
  // Contacts
  b.push(rect(806, 64, 118, 232, { fill: C.worldFill, stroke: C.world, rx: 8 }))
  b.push(text(865, 84, 'Contacts', { size: 13, weight: 650, anchor: 'middle', fill: C.world }))
  ;['Dana', 'Marcus', 'Priya', 'Tom'].forEach((name, i) => {
    const y = 108 + i * 42
    b.push(rect(818, y, 94, 30, { fill: C.paper, stroke: C.line, rx: 15 }))
    b.push(text(865, y + 19, name, { size: 11.5, anchor: 'middle', fill: C.ink }))
  })
  b.push(text(865, 286, 'phones', { size: 10.5, anchor: 'middle', fill: C.faint }))
  // engine -> contacts, two lines at once
  b.push(arrow([[786, 124], [818, 124]], { color: 'symbo' }))
  b.push(arrow([[786, 166], [818, 166]], { color: 'symbo' }))
  b.push(text(802, 114, 'rings', { size: 10, anchor: 'middle', fill: C.symbo }))

  b.push(
    card(536, 312, 388, 122, 'Public API', [
      { t: 'api.symbo.ai', mono: true, size: 11 },
      { t: 'POST /prospects          POST /v1/dialSessions', mono: true, size: 11 },
      { t: 'PUT  /v1/dialSessionQueuedCalls/{id}', mono: true, size: 11 },
      { t: 'GET  /calls?dialSessionId=   PUT /calls/{id}', mono: true, size: 11 },
    ], { stroke: C.symbo, titleFill: C.symbo })
  )
  // engine <-> API
  b.push(arrow([[661, 296], [661, 312]], { color: 'symbo', both: true }))
  b.push(text(670, 308, 'reads the queue before every round', { size: 10, fill: C.muted }))

  // Cross arrows
  b.push(arrow([[442, 230], [536, 230]], { color: 'ink', both: true }))
  b.push(text(489, 221, 'audio', { size: 10.5, anchor: 'middle', fill: C.ink }))
  b.push(text(489, 245, 'realtime', { size: 10.5, anchor: 'middle', fill: C.ink }))
  b.push(arrow([[454, 373], [536, 373]], { color: 'you' }))
  b.push(text(495, 364, 'HTTPS', { size: 10.5, anchor: 'middle', fill: C.you }))
  b.push(text(495, 388, 'bearer token', { size: 10, anchor: 'middle', fill: C.you }))

  return svg(W, H, b.join('\n'), {
    label:
      'The four parts of an embedded dialer integration: your page holds your UI, the SDK and the Symbo frame; your server talks to the public API; the Symbo engine rings contacts and reads the queue.',
  })
}

/* --------------------------------------------- 2. integration at a glance */

function integrationFlow() {
  const W = 900
  const H = 676
  const L = { server: 150, page: 450, symbo: 750 }
  const b = []
  b.push(
    lanes(
      [
        { name: 'Your server', x: L.server, color: 'you', sub: 'org-admin API token' },
        { name: 'Your page', x: L.page, color: 'you', sub: '@symbo/dialer-embed' },
        { name: 'Symbo', x: L.symbo, color: 'symbo', sub: 'public API · frame · engine' },
      ],
      20,
      H - 20
    )
  )

  const step = (n, y) =>
    `<circle cx="34" cy="${y}" r="11" fill="${C.ink}"/>` +
    text(34, y + 4, String(n), { size: 11, weight: 700, anchor: 'middle', fill: C.paper })

  const rows = [
    { y: 108, from: 'server', to: 'symbo', color: 'you', label: 'POST /prospects', sub: 'sync each contact once; keep its prospect id' },
    { y: 176, from: 'server', to: 'symbo', color: 'you', label: 'POST /v1/dialSessions  { owner, contacts[] }', sub: 'the queue, in dial order; the session waits on hold' },
    { y: 244, from: 'page', to: 'symbo', color: 'you', label: 'mount()  ·  signIn({ token, profileId })', sub: 'or the rep signs in through a Symbo login tab' },
    { y: 290, from: 'symbo', to: 'page', color: 'symbo', label: 'ready' },
    { y: 346, from: 'page', to: 'symbo', color: 'you', label: 'session.start({ dialSessionId })', sub: 'the session comes off hold and the engine dials' },
    { y: 388, span: ['page', 'symbo'], h: 130, label: 'EACH ROUND' },
    { y: 426, from: 'symbo', to: 'page', color: 'symbo', label: 'session.leg.ringing … session.leg.connected … session.postCall', sub: 'you light up rows as they ring, and show your post-call screen' },
    { y: 486, from: 'page', to: 'symbo', color: 'you', label: "session.saveOutcome({ callId, outcomeValue, then: 'resume' })", sub: 'the engine stays paused until the conversation has an outcome' },
    { y: 564, from: 'server', to: 'symbo', color: 'you', dash: '5 4', label: 'PUT /v1/dialSessionQueuedCalls/{id}', sub: 'any time: remove, re-queue, retry later, pin a number' },
    { y: 632, from: 'server', to: 'symbo', color: 'you', label: 'GET /calls?dialSessionId=…', sub: 'after session.ended: every leg, with its outcome and queue row' },
  ]
  b.push(seqRows(L, rows))
  b.push(step(1, 108), step(2, 176), step(3, 244), step(4, 346), step(5, 456), step(6, 564), step(7, 632))

  return svg(W, H, b.join('\n'), {
    label:
      'The integration in seven steps: sync contacts, create the session, mount and sign in, start, handle each round from the page, edit the queue from your server, read the calls back.',
  })
}

/* ----------------------------------------------------- 3. one round */

function roundSequence() {
  const W = 900
  const H = 760
  const L = { page: 130, symbo: 410, a: 660, b: 820 }
  const b = []
  b.push(
    lanes(
      [
        { name: 'Your page', x: L.page, color: 'you', sub: 'SDK commands and events' },
        { name: 'Symbo', x: L.symbo, color: 'symbo', sub: 'the frame and the engine' },
        { name: 'Line 1', x: L.a, color: 'world', w: 110, sub: 'Dana' },
        { name: 'Line 2', x: L.b, color: 'world', w: 110, sub: 'Marcus' },
      ],
      20,
      H - 50
    )
  )

  // The conversation, as a band on line 2 (drawn first, so labels stay legible)
  b.push(rect(L.b - 5, 256, 10, 196, { fill: C.okFill, stroke: C.ok, rx: 3, sw: 1 }))
  b.push(text(L.b - 14, 420, 'the', { size: 11, anchor: 'end', fill: C.ok }))
  b.push(text(L.b - 14, 434, 'conversation', { size: 11, anchor: 'end', fill: C.ok }))

  const rows = [
    { y: 100, from: 'page', to: 'symbo', color: 'you', label: 'session.start()  or  session.resume()' },
    { y: 136, from: 'symbo', to: 'a', color: 'symbo', label: 'ring', mono: false },
    { y: 164, from: 'symbo', to: 'b', color: 'symbo', label: 'ring', mono: false },
    { y: 200, from: 'symbo', to: 'page', color: 'symbo', label: 'session.leg.ringing  ×2', sub: 'one per line, keyed by queuedCallId' },
    { y: 252, from: 'b', to: 'symbo', color: 'world', label: 'answers', mono: false },
    { y: 288, from: 'symbo', to: 'page', color: 'symbo', label: 'session.leg.answered  →  session.leg.connected', sub: 'line 2: the rep is talking' },
    { y: 328, from: 'symbo', to: 'a', color: 'symbo', label: 'hang up', mono: false },
    { y: 364, from: 'symbo', to: 'page', color: 'symbo', label: "session.leg.ended { reason: 'answered_elsewhere' }", sub: "line 1 gets the rep's cancelled default outcome" },
    { y: 404, from: 'symbo', to: 'page', color: 'symbo', label: "session.paused { reason: 'connected' }", sub: 'no line rings while the rep talks' },
    { y: 452, from: 'b', to: 'symbo', color: 'world', label: 'hangs up (or you call hangUp())', mono: false },
    { y: 492, from: 'symbo', to: 'page', color: 'symbo', label: "session.leg.ended { reason: 'completed' }" },
    { y: 524, from: 'symbo', to: 'page', color: 'symbo', label: 'session.postCall { callId, outcomeRequired: true }' },
    { y: 570, lane: 'page', w: 230, note: ['You show your post-call screen.', 'The rep picks an outcome', 'and writes a note.'] },
    { y: 626, from: 'page', to: 'symbo', color: 'you', label: "saveOutcome({ outcomeValue, note, then: 'resume' })" },
    { y: 660, from: 'symbo', to: 'page', color: 'symbo', label: 'call.completed  →  session.resumed' },
    { y: 694, from: 'symbo', to: 'a', color: 'symbo', dash: '5 4', label: 'next round: rings lines 3 and 4', mono: false },
  ]
  b.push(seqRows(L, rows))

  // Legend
  const ly = H - 22
  b.push(arrow([[40, ly], [80, ly]], { color: 'you' }))
  b.push(text(88, ly + 4, 'a command from your page', { size: 11, fill: C.muted }))
  b.push(arrow([[270, ly], [310, ly]], { color: 'symbo' }))
  b.push(text(318, ly + 4, 'an event to your page, or the engine acting', { size: 11, fill: C.muted }))
  b.push(arrow([[600, ly], [640, ly]], { color: 'world' }))
  b.push(text(648, ly + 4, 'the contact', { size: 11, fill: C.muted }))

  return svg(W, H, b.join('\n'), {
    label:
      'One round with two lines: Symbo rings both, line 2 answers, line 1 is hung up as answered elsewhere, the engine pauses, the conversation ends with session.postCall, your page saves the outcome with then resume, and the next round rings.',
  })
}

/* ------------------------------------------------ 4. queued-call states */

function queuedCallStates() {
  const W = 960
  const H = 500
  const b = []

  const node = (x, y, label, o = {}) => {
    const w = o.w ?? 128
    const h = 44
    return (
      rect(x - w / 2, y - h / 2, w, h, { fill: o.fill ?? C.paper, stroke: o.stroke ?? C.ink, sw: 1.5, rx: 22 }) +
      text(x, y + 4.5, label, { size: 12.5, mono: true, weight: 600, anchor: 'middle', fill: o.color ?? C.ink })
    )
  }
  const lbl = (x, y, arr, o = {}) =>
    lines(x, y, arr, { size: 10.5, fill: o.fill ?? C.muted, anchor: o.anchor ?? 'middle', lh: 13, mono: o.mono })

  const Q = [240, 230]
  const D = [520, 230]
  const A = [800, 130]
  const Cd = [800, 230]
  const X = [520, 360]
  const R = [240, 380]

  // edges first, so nodes sit on top
  // queued -> dialing
  b.push(arrow([[304, 230], [425, 230]], { color: 'symbo' }))
  b.push(lbl(364, 212, ['the engine dials', 'the next round']))
  // dialing -> attempted
  b.push(arrow([[615, 218], [736, 142]], { color: 'symbo' }))
  b.push(lbl(600, 118, ['no answer · busy · failed · voicemail', 'answered elsewhere', { t: "the line gets the rep's default outcome", fill: C.faint }]))
  // dialing -> completed
  b.push(arrow([[615, 230], [736, 230]], { color: 'you' }))
  b.push(lbl(675, 200, ['the rep talked;', 'you save the outcome']))
  // dialing -> cancelled
  b.push(arrow([[520, 252], [520, 338]], { color: 'symbo' }))
  // queued -> cancelled
  b.push(arrow([[300, 250], [452, 352]], { color: 'symbo' }))
  b.push(lbl(520, 402, ['from dialing: paused, or ended, while ringing', 'from queued: still waiting when the session ended']))
  // attempted -> queued (over the top): retries
  b.push(path(`M${A[0]},108 L${A[0]},40 L${Q[0]},40 L${Q[0]},208`, { stroke: C.you, end: 'arrow-you' }))
  b.push(lbl(520, 20, [{ t: "back on the queue: Symbo's own retry, while the rep's settings allow one;", fill: C.ink }, { t: "PUT { retry_at } once that time passes; PUT { status: 'queued' } right now", mono: true }]))
  // queued <-> removed
  b.push(arrow([[220, 252], [220, 358]], { color: 'you' }))
  b.push(arrow([[260, 358], [260, 252]], { color: 'you' }))
  b.push(lbl(205, 296, ["PUT { status: 'removed' }", 'session.removeQueued()'], { anchor: 'end', mono: true }))
  b.push(lbl(205, 336, ["back: PUT { status: 'queued' }"], { anchor: 'end', mono: true }))

  b.push(node(...Q, 'queued', { fill: C.youFill, stroke: C.you, color: C.you }))
  b.push(node(...D, 'dialing · in_progress', { fill: C.warnFill, stroke: C.warn, color: C.warn, w: 190 }))
  b.push(node(...A, 'attempted', { fill: C.worldFill, stroke: C.world, color: C.world }))
  b.push(node(...Cd, 'completed', { fill: C.okFill, stroke: C.ok, color: C.ok }))
  b.push(node(...X, 'cancelled', { fill: C.worldFill, stroke: C.world, color: C.world }))
  b.push(node(...R, 'removed', { fill: C.worldFill, stroke: C.world, color: C.world }))

  // notes
  b.push(rect(60, 436, 840, 48, { fill: C.warnFill, stroke: C.warn, sw: 1 }))
  b.push(lines(72, 455, [
    'A row that is dialing or in_progress cannot be changed until its call ends (409 QUEUED_CALL_DIALING); an ended session’s rows cannot change at all.',
    "retry_position: 'top' | 'bottom' says where a contact re-enters the queue, for your re-queues and for Symbo's own retries alike.",
  ], { size: 11, fill: C.ink, lh: 16 }))

  return svg(W, H, b.join('\n'), {
    label:
      'The states of a queued contact: queued, dialing, then attempted, completed or cancelled; removed and re-queued through the API; attempted contacts come back to the queue on retry.',
  })
}

/* ----------------------------------------------------- 5. sign-in paths */

function signInPaths() {
  const W = 960
  const H = 470
  const b = []

  const panel = (x, title, sub) =>
    rect(x, 20, 450, H - 40, { fill: C.paper, stroke: C.line, rx: 10 }) +
    text(x + 18, 48, title, { size: 14, weight: 700 }) +
    text(x + 18, 66, sub, { size: 11, fill: C.muted })

  const flow = (x, steps) => {
    const w = 414
    let y = 88
    const parts = []
    steps.forEach((s, i) => {
      const h = 22 + s.body.length * 15 + 8
      const color = s.who === 'you' ? C.you : s.who === 'symbo' ? C.symbo : C.world
      const fill = s.who === 'you' ? C.youFill : s.who === 'symbo' ? C.symboFill : C.worldFill
      parts.push(rect(x, y, w, h, { fill, stroke: color, rx: 8 }))
      parts.push(text(x + 12, y + 19, s.title, { size: 12, weight: 650, fill: color }))
      parts.push(lines(x + 12, y + 36, s.body, { size: 11, fill: C.ink, lh: 15, mono: s.mono }))
      if (i < steps.length - 1) parts.push(arrow([[x + w / 2, y + h], [x + w / 2, y + h + 16]], { color: 'ink' }))
      y += h + 18
    })
    return parts.join('\n')
  }

  b.push(panel(20, 'A · A Symbo login tab', 'The rep signs in by hand, once a day at most. Nothing to build on your server.'))
  b.push(text(38, H - 36, 'Simplest. Fine for development, and for teams that already sign in to Symbo.', { size: 11, italic: true, fill: C.muted }))
  b.push(text(508, H - 36, 'Seamless for the rep. Needs a token endpoint and a JWKS, set up once.', { size: 11, italic: true, fill: C.muted }))
  b.push(
    flow(38, [
      { who: 'symbo', title: 'The frame asks', body: ['auth.required { loginUrl }'], mono: true },
      { who: 'you', title: 'Your page opens the tab from a click', body: ['signInButton.onclick = () => dialer.openSignIn()', "(compact mode's strip has its own Sign in button)"], mono: true },
      { who: 'world', title: 'The rep signs in on Symbo’s login page', body: ['a new tab on app.symbo.ai; the tab closes itself'] },
      { who: 'symbo', title: 'The frame picks the session up', body: ['ready { user, organization, capabilities … }'], mono: true },
    ])
  )

  b.push(panel(490, 'B · Silently, with a signed token', 'The rep is already logged into your app. Your server vouches for them.'))
  b.push(
    flow(508, [
      { who: 'symbo', title: 'The frame asks', body: ['auth.required'], mono: true },
      { who: 'you', title: 'Your server signs a short-lived JWT for the session user', body: ['RS256 with YOUR private key: your issuer (iss),', "audience (aud), the rep's email, org id; ~2 min life"], mono: true },
      { who: 'you', title: 'Your page hands it over', body: ['dialer.signIn({ token, profileId })'], mono: true },
      { who: 'symbo', title: 'Symbo verifies it against the public key you publish', body: ['the frame hands the token to Symbo, which checks the', 'signature against https://your-app/.well-known/jwks.json'], mono: true },
      { who: 'symbo', title: 'Session minted, nothing for the rep to click', body: ['ready; auth.required again in 8 hours, handled the same way'], mono: true },
    ])
  )

  return svg(W, H, b.join('\n'), {
    label:
      'Two ways to sign a rep in: a Symbo login tab opened from a click, or a silent sign-in where your server signs a JWT that Symbo verifies against the JWKS you publish.',
  })
}

/* -------------------------------------------------------- 6. the modes */

function modes() {
  const W = 1020
  const H = 360
  const PW = 320
  const b = []

  const panel = (x, name, size, frameDraw, yours, symbos) => {
    b.push(rect(x, 20, PW, H - 40, { fill: C.paper, stroke: C.line, rx: 10 }))
    b.push(text(x + 16, 46, name, { size: 14, weight: 700, mono: true }))
    b.push(text(x + 16, 64, size, { size: 11, fill: C.muted }))
    // your page
    b.push(rect(x + 16, 76, PW - 32, 168, { fill: C.youFill, stroke: C.you, dash: '5 4', rx: 8 }))
    b.push(eyebrow(x + 26, 92, 'your page', C.you))
    frameDraw(x + 16, 76)
    b.push(text(x + 16, 268, 'Yours to build', { size: 11, weight: 700, fill: C.you }))
    b.push(lines(x + 16, 284, yours, { size: 11, fill: C.ink, lh: 14 }))
    b.push(text(x + 170, 268, 'In the frame', { size: 11, weight: 700, fill: C.symbo }))
    b.push(lines(x + 170, 284, symbos, { size: 11, fill: C.ink, lh: 14 }))
  }

  panel(
    20,
    "mode: 'widget'",
    'the default · 420 × 485 unless you size it',
    (px, py) => {
      b.push(rect(px + 85, py + 26, 118, 132, { fill: C.symboFill, stroke: C.symbo, rx: 6 }))
      b.push(lines(px + 144, py + 46, ['Symbo’s dialer', { t: 'keypad', fill: C.muted }, { t: 'contact card', fill: C.muted }, { t: 'notes', fill: C.muted }, { t: 'outcome form', fill: C.muted }, { t: 'settings', fill: C.muted }], { size: 11, anchor: 'middle', fill: C.symbo, weight: 650, lh: 15 }))
    },
    ['a Call button', 'nothing else'],
    ['sign-in form', 'keypad, contact card', 'notes, outcome form', 'ringtone, toasts']
  )
  panel(
    350,
    "mode: 'compact'",
    'a status strip · 360 × 56, sized by the frame',
    (px, py) => {
      b.push(rect(px + 22, py + 36, 244, 34, { fill: C.symboFill, stroke: C.symbo, rx: 6 }))
      b.push(`<circle cx="${px + 38}" cy="${py + 53}" r="4" fill="${C.ok}"/>`)
      b.push(text(px + 48, py + 57, 'Sam Rep · device ready', { size: 11, fill: C.symbo, weight: 650 }))
      b.push(text(px + 252, py + 57, '⚙', { size: 12, anchor: 'end', fill: C.symbo }))
      b.push(rect(px + 22, py + 84, 244, 68, { fill: C.paper, stroke: C.you, rx: 6 }))
      b.push(lines(px + 144, py + 104, ['your queue', 'your post-call form', 'your inbound banner'], { size: 11, anchor: 'middle', fill: C.you, lh: 15 }))
    },
    ['queue, contact card', 'post-call form, keypad', 'inbound ringtone', 'show warnings'],
    ['signed-in user', 'device state, Sign in', 'audio and caller-id', 'ringback, connect tone']
  )
  panel(
    680,
    "mode: 'hidden'",
    '0 × 0 · nothing to see or focus',
    (px, py) => {
      b.push(rect(px + 22, py + 30, 244, 122, { fill: C.paper, stroke: C.you, rx: 6 }))
      b.push(lines(px + 144, py + 66, ['your queue', 'your post-call form', 'your inbound banner', 'your status line and warnings'], { size: 11, anchor: 'middle', fill: C.you, lh: 15 }))
      b.push(rect(px + 252, py + 134, 6, 6, { fill: C.symboFill, stroke: C.symbo, rx: 1, sw: 1 }))
      b.push(text(px + 246, py + 139, '0 × 0 frame', { size: 9.5, anchor: 'end', fill: C.symbo }))
    },
    ['everything on screen', 'sign-in button, or', 'a silent token', 'show every warning'],
    ['audio leg, device', 'realtime connection', 'ringback, connect tone', 'state as events only']
  )

  return svg(W, H, b.join('\n'), {
    label:
      'The three modes: widget shows Symbo’s whole dialer in the frame, compact shows a status strip with your UI around it, hidden renders nothing and sends every state change as an event.',
  })
}

/* ---------------------------------------------------------------- write */

mkdirSync(OUT, { recursive: true })
const figures = {
  'architecture.svg': architecture(),
  'integration-flow.svg': integrationFlow(),
  'round-sequence.svg': roundSequence(),
  'queued-call-states.svg': queuedCallStates(),
  'sign-in-paths.svg': signInPaths(),
  'modes.svg': modes(),
}
for (const [name, body] of Object.entries(figures)) {
  writeFileSync(join(OUT, name), body)
  console.log(`wrote docs/images/${name}`)
}
