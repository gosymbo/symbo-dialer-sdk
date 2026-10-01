// -----------------------------------------------------------------------------
// Offline stub of the Symbo dialer frame.
//
// Plays the Symbo side of the embed protocol so the example page (and your own
// integration) can be built with no Symbo account and no network. It answers
// every command the SDK knows, replays a power-dial session (two lines unless
// you set another number) through three rounds of dialing, rings an inbound
// call while idle (and on request whenever the engine is not dialing), lists a
// pair of audio devices, mutes and plays keypad digits on the call that is
// up, and raises a warning on request. Add `lockLines=2` to the frame URL to
// play an organization that fixes every session's number of lines,
// `updateAfter=5000` to announce a newer Symbo build that many milliseconds
// after `ready`, `blockDialer=1` to play "Require & block dialer" (a one-off
// call's outcome must be saved before the next dial, and the last call still
// waiting for its outcome, a session's included, survives a reload), and
// `resumable=<id>` to report a session the rep could pick up.
//
// Timings are compressed: legs ring for a second or two, calls last a few
// seconds. Everything else — the message names, payload shapes, refusal codes
// and the order events arrive in — follows the contract the real frame
// implements. Where this file guesses at a detail the real frame decides (the
// exact prospect names, how long a call lasts), the guess is marked.
//
// Not a reference implementation of the frame, and not part of the package.
// -----------------------------------------------------------------------------

;(() => {
  const V = 2
  const params = new URLSearchParams(location.search)
  // Same rule as the real frame: an unknown mode, or none, is 'widget'.
  const MODES = ['widget', 'compact', 'hidden']
  const MODE = MODES.includes(params.get('mode')) ? params.get('mode') : 'widget'
  const SIZES = { widget: { width: 420, height: 485 }, compact: { width: 360, height: 56 } }
  const STORAGE_KEY = 'symbo-stub:signedIn'
  // What survives a reload: the last call still waiting for its outcome
  // under "Require & block dialer", one-off or the session's, and why the
  // last document left.
  const PENDING_CALL_KEY = 'symbo-stub:pendingCall'
  const LEAVING_KEY = 'symbo-stub:leavingReason'
  const MIN_LINES = 1
  const MAX_LINES = 4
  const isLines = (n) => Number.isInteger(n) && n >= MIN_LINES && n <= MAX_LINES
  // The organization's parallel-dial lock, or null. Every session rings this
  // many lines when it is set, whatever it asks for. Read from the frame URL,
  // or from the example page that embeds the stub (…/power-dial.html?lockLines=2).
  const embedderParams = (() => {
    try {
      return new URL(document.referrer).searchParams
    } catch {
      return new URLSearchParams()
    }
  })()
  const param = (name) => params.get(name) ?? embedderParams.get(name)
  const lockParam = param('lockLines')
  // A newer build, announced this long after ready (never, by default).
  const updateAfterMs = Number(param('updateAfter'))
  let updateAvailable = false
  const LOCKED_LINES = isLines(Number(lockParam)) ? Number(lockParam) : null
  // The organization's "Require & block dialer" setting.
  const BLOCK_DIALER = param('blockDialer') === '1'
  // Guess: the demo session was created with two lines. A session created
  // without a number rings one, which is what `ready` reports before one runs.
  const DEMO_SESSION_LINES = 2
  const concurrentCalls = () => LOCKED_LINES ?? session?.lines ?? MIN_LINES
  const MAX_QUEUED_CALL_IDS = 1000

  const USER = { id: 'u-1', name: 'Sam Rep', email: 'sam@partner.test' }
  const ORGANIZATION = { id: 'o-1', name: 'Acme Collections' }
  const FROM = '+13855550147'

  // The Symbo prospects behind the partner's records: the id is what the
  // partner stored when it synced its contacts (POST /prospects).
  const PROSPECTS = {
    'p-1001': { fullName: 'Jane Doe', number: '+12125550123' },
    'p-1002': { fullName: 'Marcus Bell', number: '+14155550142' },
    'p-1003': { fullName: 'Priya Anand', number: '+13125550168' },
    'p-1004': { fullName: 'Tom Okafor', number: '+16175550119' },
    'p-1005': { fullName: 'Lena Fischer', number: '+12065550177' },
    'p-1006': { fullName: 'Diego Ramos', number: '+17135550131' },
  }

  // Outcomes the partner created through the public API. `noteRequired`
  // mirrors an outcome configured to require a note.
  const OUTCOMES = {
    'o-connected': { name: 'Connected', group: 'answered' },
    'o-meeting': { name: 'Meeting booked', group: 'answered' },
    'o-callback': { name: 'Callback', group: 'answered', noteRequired: true },
    'o-not-interested': { name: 'Not interested', group: 'answered' },
    'o-no-answer': { name: 'No answer', group: 'unanswered' },
    'o-busy': { name: 'Busy', group: 'unanswered' },
  }
  const resolveOutcomeId = (outcomeId, outcomeValue) =>
    outcomeId ||
    Object.keys(OUTCOMES).find(
      (id) => OUTCOMES[id].name.toLowerCase() === String(outcomeValue || '').toLowerCase()
    )

  // What happens to each queued call once it is dialled: who picks up, and
  // after how long. With two lines the first round rings q-1 and q-2 and q-2
  // answers; the second rings q-3 and q-4 and nobody does; the third rings
  // q-5 and q-6 and q-5 answers.
  const SCRIPT = [
    { queuedCallId: 'q-1', prospectId: 'p-1001', fate: 'no_answer', after: 2600 },
    { queuedCallId: 'q-2', prospectId: 'p-1002', fate: 'answer', after: 1800 },
    { queuedCallId: 'q-3', prospectId: 'p-1003', fate: 'no_answer', after: 2500 },
    { queuedCallId: 'q-4', prospectId: 'p-1004', fate: 'busy', after: 1500 },
    { queuedCallId: 'q-5', prospectId: 'p-1005', fate: 'answer', after: 1200 },
    { queuedCallId: 'q-6', prospectId: 'p-1006', fate: 'no_answer', after: 3000 },
  ]

  const INBOUND = { from: '+12025550188', prospectId: 'p-1003' }
  const INBOUND_AFTER_IDLE_MS = 6000
  const INBOUND_REPEAT_MS = 40000
  const INBOUND_RING_MS = 20000
  const CONNECTED_CALL_MS = 6000
  // How long dial() waits for the calling device to register, and how often
  // a reload or sign-out that has to wait checks whether the rep is free.
  const DEVICE_WAIT_MS = 10000
  const IDLE_POLL_MS = 5000
  // The keypad: what one sendDigits may carry, and how far apart the frame
  // plays the digits.
  const DTMF_DIGITS = /^[0-9*#]{1,32}$/
  const DTMF_GAP_MS = 200

  /* ------------------------------------------------------------------ state */

  let signedIn = localStorage.getItem(STORAGE_KEY) === '1'
  let parentOrigin = null
  let authAnnounced = false
  let readyAnnounced = false
  let seq = 0
  let deviceReady = false
  let dialInFlight = false
  // Set once the frame has asked to reload (reload.required).
  let reloadRequired = null
  // 'reloading' or 'signingOut' once this document is on its way out. Like the
  // real frame, it then sends nothing but answers, and refuses every command
  // except the one already under way.
  let leaving = null
  // Why the last document left, for the first ready or auth.required of this one.
  let reloadReason = localStorage.getItem(LEAVING_KEY)
  localStorage.removeItem(LEAVING_KEY)
  const takeReloadReason = () => {
    const reason = reloadReason
    reloadReason = null
    return reason
  }

  const devices = {
    microphones: [
      { id: 'mic-default', label: 'Default - MacBook Pro Microphone' },
      { id: 'mic-headset', label: 'Jabra Evolve2 65' },
    ],
    speakers: [
      { id: 'spk-default', label: 'Default - MacBook Pro Speakers' },
      { id: 'spk-headset', label: 'Jabra Evolve2 65' },
    ],
    selected: { microphoneId: 'mic-default', speakerId: 'spk-default' },
  }

  const warnings = new Map()

  // One-off / inbound call, if any.
  let call = null
  let incoming = null
  // One-off calls that have ended, by id, so an outcome can be saved for any
  // of them; and the one still waiting for its outcome, if any.
  const endedCalls = new Map()
  let pendingOneOff = null
  if (BLOCK_DIALER) {
    try {
      pendingOneOff = JSON.parse(localStorage.getItem(PENDING_CALL_KEY))
    } catch {
      pendingOneOff = null
    }
    if (pendingOneOff) {
      pendingOneOff.restored = true
      endedCalls.set(pendingOneOff.callId, pendingOneOff)
    }
  }

  // The power-dial session, if any; sessions parked with session.hold(), by
  // id, which session.start picks up where they were; and the rep's session
  // ready reports as one they could pick up.
  let session = null
  const heldSessions = new Map()
  let resumable = param('resumable') ? { dialSessionId: param('resumable'), status: 'paused' } : null
  const resumableView = () => (session ? null : resumable)

  // The rep's line: a one-off or inbound call while it lasts or, in a
  // session, the rep's own leg. That leg drops when the rep hangs up, pauses
  // or holds, and when the session ends; resuming brings it back. Mute lasts
  // as long as the line.
  // Guess: it stays up when the contact hangs up, and drops on a skip.
  let sessionLine = false
  let muted = false
  // When the keypad can play its next digit.
  let keypadFreeAt = 0
  const lineUp = () => !!call || (!!session && sessionLine)
  // Who the keypad reaches: an answered call, or the connected contact.
  const conversation = () => {
    if (call) return call.status === 'connected' ? `call:${call.callId}` : null
    const leg = sessionLine && sessionConnected()
    return leg ? `leg:${leg.queuedCallId}` : null
  }

  const timers = new Set()
  const later = (ms, fn) => {
    const id = setTimeout(() => {
      timers.delete(id)
      fn()
    }, ms)
    timers.add(id)
    return id
  }
  // The session's own dialing, stopped when it ends or is held without
  // touching a one-off call's timers.
  const sessionTimers = new Set()
  const sessionLater = (ms, fn) => {
    const id = setTimeout(() => {
      sessionTimers.delete(id)
      fn()
    }, ms)
    sessionTimers.add(id)
    return id
  }
  const cancelSessionTimers = () => {
    sessionTimers.forEach(clearTimeout)
    sessionTimers.clear()
  }
  // Everything stops: the document is about to reload.
  const cancelTimers = () => {
    timers.forEach(clearTimeout)
    timers.clear()
    cancelSessionTimers()
    clearTimeout(inboundTimer)
  }

  const nextId = (prefix) => `${prefix}-${++seq}`

  /* --------------------------------------------------------------- posting */

  const post = (type, payload = {}) =>
    (!leaving || type === 'symbo:result') &&
    parent.postMessage({ type, payload, protocolVersion: V }, parentOrigin || '*')

  const ok = (msg, data = {}) =>
    msg.requestId &&
    post('symbo:result', { requestId: msg.requestId, ok: true, data })

  // The frame's own checks on a requested number of lines.
  const linesRefusal = (lines) => {
    if (!isLines(lines)) {
      return ['INVALID_CONCURRENT_CALLS', `concurrentCalls must be a whole number from ${MIN_LINES} to ${MAX_LINES}.`]
    }
    if (LOCKED_LINES !== null && lines !== LOCKED_LINES) {
      return ['CONCURRENT_CALLS_LOCKED', `Your organization sets every session to ${LOCKED_LINES} line${LOCKED_LINES === 1 ? '' : 's'}.`]
    }
    return null
  }

  const refuse = (msg, code, message) => {
    if (msg.requestId) {
      post('symbo:result', {
        requestId: msg.requestId,
        ok: false,
        error: { code, message },
      })
    } else {
      post('symbo:error', { code, message })
    }
  }

  // Like the real frame, a page that has not heard ready yet is told only
  // that nobody is signed in; other warnings wait for ready, and only the
  // ones the page heard are cleared to it.
  const sentWarnings = new Set()
  const raiseWarning = (code, message) => {
    warnings.set(code, message)
    if (readyAnnounced || code === 'NOT_SIGNED_IN') {
      sentWarnings.add(code)
      post('symbo:warning', { code, message })
    }
    render()
  }
  const clearWarning = (code) => {
    if (!warnings.delete(code)) return
    if (sentWarnings.delete(code)) post('symbo:warning.cleared', { code })
    render()
  }

  /* ------------------------------------------------------------- handshake */

  const announceReady = () => {
    // Like the real frame: ready goes out once per page load, however many
    // hellos arrive. The SDK stops asking as soon as it has heard us.
    if (readyAnnounced) return
    readyAnnounced = true
    post('symbo:ready', {
      protocolVersion: V,
      user: USER,
      organization: ORGANIZATION,
      mode: MODE,
      // Illustrative. The real frame's list is published with the Symbo
      // release that carries each feature.
      capabilities: [
        'dial',
        'session',
        'inbound',
        'audioDevices',
        'signIn',
        'signOut',
        'concurrentCalls',
        'reload',
        'mute',
        'dtmf',
        'callsWhilePaused',
        'sessionHold',
        'sessionLoad',
        'removeQueuedCalls',
        'callWaiting',
        'saveOutcome',
        'hardReload',
      ],
      deviceReady,
      powerDialing: true,
      concurrentCalls: concurrentCalls(),
      concurrentCallsLocked: LOCKED_LINES !== null,
      updateAvailable,
      resumableSession: resumableView(),
      reloadReason: takeReloadReason(),
    })
    warnings.forEach((message, code) => {
      sentWarnings.add(code)
      post('symbo:warning', { code, message })
    })
    // Like the real frame, a newer build is only announced: the page decides
    // when to reload for it.
    if (updateAfterMs > 0) {
      later(updateAfterMs, () => {
        updateAvailable = true
        post('symbo:update.available', {})
      })
    }
    if (SIZES[MODE]) post('symbo:resize', SIZES[MODE])
    // The call still waiting for its outcome when the last document left.
    if (pendingOneOff?.restored) post('symbo:call.postCall', postCallView(pendingOneOff))

    // The calling device registers a moment after sign-in.
    if (!deviceReady) {
      later(300, () => {
        deviceReady = true
        post('symbo:device.ready', {})
        clearWarning('DEVICE_NOT_READY')
        deviceWaiters.splice(0).forEach((settle) => settle(true))
        render()
      })
    }
    scheduleInbound(INBOUND_AFTER_IDLE_MS)
  }

  const announceAuthRequired = () => {
    // Once per unauthenticated state, whatever the SDK's hello loop does.
    if (authAnnounced) return
    authAnnounced = true
    const loginUrl = new URL(
      `../login/?guest=${Math.random().toString(36).slice(2, 10)}`,
      location.href
    ).href
    post('symbo:auth.required', { loginUrl, reloadReason: takeReloadReason() })
    raiseWarning('NOT_SIGNED_IN', 'No Symbo user is signed in.')
  }

  // The login tab tells us it finished, the way the guest channel relays the
  // session to the real frame. The real frame reloads itself at this point,
  // which is worth replaying: it is what restarts the SDK's hello loop.
  new BroadcastChannel('symbo-stub').addEventListener('message', (e) => {
    if (e.data === 'signed-in') location.reload()
  })

  /* --------------------------------------------------------------- leaving */

  // What leaving this document would cut off, as [code, message], or null. A
  // reload in compact or hidden mode is not held up by an unsaved outcome:
  // the reloaded frame brings that call back.
  const busyRefusal = (doing, { reloading = false } = {}) => {
    if (session) return ['SESSION_ACTIVE', `A power-dial session is running. End it before ${doing}.`]
    if (call || incoming) {
      return ['CALL_IN_PROGRESS', `A call is active or ringing. Hang up or ignore it before ${doing}.`]
    }
    if (BLOCK_DIALER && pendingOneOff && !(reloading && MODE !== 'widget')) {
      return ['POSTCALL_DETAILS_REQUIRED', `The last call still needs an outcome. Save it before ${doing}.`]
    }
    return null
  }

  // Run `go` once `blocked()` is false: now, or on a poll, like the real frame.
  const whenFree = (blocked, go) => {
    const poll = () => (blocked() ? later(IDLE_POLL_MS, poll) : go())
    poll()
  }

  // A reload or sign-out nobody asked for: announced, with how long until it
  // happens, and remembered for the next document's ready or auth.required.
  const leave = (reason, inMs) => {
    post('symbo:frame.leaving', { reason, inMs })
    leaving = reason === 'plan_changed' ? 'reloading' : 'signingOut'
    localStorage.setItem(LEAVING_KEY, reason)
    cancelTimers()
    later(inMs, () => location.reload())
  }

  // The rep's plan or seats changed: the frame has to reload, and does so by
  // itself once nothing would be cut off, a dial being placed included.
  // reload() from the page also works.
  const requireReload = (reason) => {
    if (!signedIn || reloadRequired) return
    reloadRequired = reason
    post('symbo:reload.required', { reason })
    whenFree(
      () => dialInFlight || !!busyRefusal('reloading', { reloading: true }),
      () => leave(reason, 1000)
    )
  }

  // Another Symbo frame on the site signed the rep out. Followed at once when
  // the rep is free, otherwise once the call or session is over.
  let followingSignOut = false
  const signedOutElsewhere = () => {
    if (!signedIn || followingSignOut) return
    followingSignOut = true
    const blocked = () => dialInFlight || !!busyRefusal('following a sign-out')
    if (blocked()) {
      raiseWarning(
        'SIGNED_OUT_ELSEWHERE',
        'The rep signed out of Symbo in another frame on this site. This frame signs out once the current call or session is over.'
      )
    }
    whenFree(blocked, () => {
      localStorage.removeItem(STORAGE_KEY)
      leave('signed_out_elsewhere', 600)
    })
  }

  // The rep signs out from the strip: Symbo's own logout.
  const signOutFromStrip = () => {
    localStorage.removeItem(STORAGE_KEY)
    leave('logout', 600)
  }

  /* ------------------------------------------------------------ state view */

  const noCounts = () => ({
    queued: 0,
    dialing: 0,
    attempted: 0,
    completed: 0,
    cancelled: 0,
    removed: 0,
    remaining: 0,
  })

  const counts = () => {
    const c = noCounts()
    if (!session) return c
    session.queue.forEach((row) => {
      c[row.status] = (c[row.status] || 0) + 1
    })
    c.remaining = c.queued
    return c
  }

  const queueView = () =>
    session.queue.map((row) => ({
      queuedCallId: row.queuedCallId,
      prospectId: row.prospectId,
      prospectName: PROSPECTS[row.prospectId].fullName,
      number: PROSPECTS[row.prospectId].number,
      status: row.status,
      order: row.order,
      attempts: row.attempts,
      lastCallId: row.lastCallId,
      lastOutcomeId: row.lastOutcomeId,
    }))

  const legView = (leg, extra = {}) => ({
    dialSessionId: session.dialSessionId,
    callId: leg.callId,
    queuedCallId: leg.queuedCallId,
    prospectId: leg.prospectId,
    prospectName: PROSPECTS[leg.prospectId].fullName,
    number: PROSPECTS[leg.prospectId].number,
    from: FROM,
    status: leg.status,
    reason: leg.reason ?? null,
    ...extra,
  })

  // A one-off call in its post-call step. `dialedAt` is only sent for a call
  // a reload brought back.
  const postCallView = (pending) => ({
    callId: pending.callId,
    prospectId: pending.prospectId,
    answered: pending.answered,
    durationSeconds: pending.durationSeconds,
    outcomeRequired: true,
    blocksDialing: BLOCK_DIALER,
    restored: !!pending.restored,
    dialedAt: pending.restored ? pending.dialedAt : null,
  })

  const stateView = () => ({
    signedIn,
    deviceReady,
    mode: MODE,
    powerDialing: true,
    concurrentCalls: concurrentCalls(),
    concurrentCallsLocked: LOCKED_LINES !== null,
    updateAvailable,
    session: session
      ? {
          dialSessionId: session.dialSessionId,
          // As the frame reports it: on a call, then waiting for its outcome
          status: session.postCall ? 'post_call' : sessionConnected() ? 'connected' : session.status,
          concurrentCalls: concurrentCalls(),
          counts: counts(),
          legs: [...session.legs.values()].map((leg) => legView(leg)),
        }
      : null,
    call: call
      ? {
          callId: call.callId,
          status: call.status,
          prospectId: call.prospectId,
          number: call.number,
        }
      : pendingOneOff
        ? {
            callId: pendingOneOff.callId,
            status: 'post_call',
            prospectId: pendingOneOff.prospectId,
            number: pendingOneOff.number,
            durationSeconds: pendingOneOff.durationSeconds,
            dialedAt: pendingOneOff.restored ? pendingOneOff.dialedAt : null,
            blocksDialing: BLOCK_DIALER,
            restored: !!pendingOneOff.restored,
          }
        : null,
    muted,
    incoming: incoming
      ? {
          callId: incoming.callId,
          from: incoming.from,
          prospectId: incoming.prospectId,
          prospectName: incoming.prospectName,
        }
      : null,
    warnings: [...warnings.keys()],
    resumableSession: resumableView(),
    reloadRequired,
  })

  // Every change reaches the page, whoever made it.
  const setMuted = (next) => {
    if (muted === next) return
    muted = next
    post('symbo:call.muteChanged', { muted })
    render()
  }

  // A one-off call placed while the session's line was down keeps its mute.
  const dropSessionLine = () => {
    sessionLine = false
    if (!call) setMuted(false)
  }

  const queueUpdated = () =>
    post('symbo:session.queue.updated', {
      dialSessionId: session.dialSessionId,
      counts: counts(),
    })

  /* --------------------------------------------------------------- session */

  const sessionConnected = () =>
    session && [...session.legs.values()].find((l) => l.status === 'connected')

  const sessionRinging = () =>
    session ? [...session.legs.values()].filter((l) => l.status === 'ringing') : []

  // The session has the rep's line: it is dialing, or one of its calls is in
  // front of the rep (connected, or waiting for its outcome).
  const sessionOwnsLine = () =>
    !!session && (session.status === 'dialing' || !!sessionConnected() || !!session.postCall)

  const endLeg = (leg, reason, rowStatus) => {
    session.legs.delete(leg.queuedCallId)
    const row = session.queue.find((r) => r.queuedCallId === leg.queuedCallId)
    row.status = rowStatus
    leg.status = 'ended'
    leg.reason = reason
    post('symbo:session.leg.ended', legView(leg))
  }

  // Asked to dial, the engine dismisses an inbound call still ringing before
  // it looks at the queue.
  const dismissIncoming = () => {
    if (!incoming) return
    const dismissed = incoming
    incoming = null
    post('symbo:call.ended', { callId: dismissed.callId, reason: 'cancelled', durationSeconds: 0 })
  }

  // What the engine does before it dials: an inbound call still ringing is
  // dismissed, and a one-off call's unsaved post-call step is dropped.
  const clearTheWayToDial = () => {
    dismissIncoming()
    clearPendingOneOff()
  }

  // `dial: false` loads the session paused, its line down, as Symbo does on
  // page load; a resume dials it.
  const startSession = (dialSessionId, lines, { dial = true, queue } = {}) => {
    session = {
      dialSessionId,
      lines,
      status: 'paused',
      legs: new Map(),
      postCall: null,
      queue:
        queue ??
        SCRIPT.map((s, i) => ({
          queuedCallId: s.queuedCallId,
          prospectId: s.prospectId,
          status: 'queued',
          order: i + 1,
          attempts: 0,
          lastCallId: null,
          lastOutcomeId: null,
        })),
    }
    if (resumable?.dialSessionId === dialSessionId) resumable = null
    if (dial) dismissIncoming()
    const dialing = dial && session.queue.some((r) => r.status === 'queued')
    if (dialing) {
      clearPendingOneOff()
      sessionLine = true
      session.status = 'dialing'
    } else if (dial) {
      // An empty queue: session.noMoreCalls goes out before session.started.
      dialNextRound()
    }
    post('symbo:session.started', {
      dialSessionId,
      concurrentCalls: concurrentCalls(),
      concurrentCallsLocked: LOCKED_LINES !== null,
      dialing,
    })
    queueUpdated()
    if (dialing) dialNextRound()
    render()
    return dialing
  }

  // Dial on. A queue that has run out is announced by noMoreCalls alone: the
  // engine never resumed.
  const resumeDialing = () => {
    if (session.queue.some((r) => r.status === 'queued')) {
      clearTheWayToDial()
      sessionLine = true
      post('symbo:session.resumed', { dialSessionId: session.dialSessionId })
    }
    dialNextRound()
  }

  // Ring the next `concurrentCalls` queued rows at once, read afresh every
  // round, so a change applies from the next one. The engine decides what
  // happens to each leg; the SCRIPT above stands in for that.
  const dialNextRound = () => {
    if (!session) return
    const rows = session.queue.filter((r) => r.status === 'queued').slice(0, concurrentCalls())

    if (rows.length === 0) {
      // The session stays loaded and paused, its contacts still reserved,
      // until it is ended or held. The rep's line drops.
      session.status = 'paused'
      post('symbo:session.noMoreCalls', {
        dialSessionId: session.dialSessionId,
        counts: counts(),
        sessionOpen: true,
      })
      dropSessionLine()
      render()
      return
    }

    session.status = 'dialing'
    render()

    rows.forEach((row, i) => {
      const script = SCRIPT.find((s) => s.queuedCallId === row.queuedCallId)
      const leg = {
        callId: nextId('call'),
        queuedCallId: row.queuedCallId,
        prospectId: row.prospectId,
        status: 'ringing',
        reason: null,
        startedAt: null,
        dialedAt: new Date().toISOString(),
      }
      row.status = 'dialing'
      row.attempts += 1
      row.lastCallId = leg.callId
      session.legs.set(row.queuedCallId, leg)

      sessionLater(200 * i, () => {
        if (!session || !session.legs.has(leg.queuedCallId)) return
        post('symbo:session.leg.ringing', legView(leg))
      })

      sessionLater(200 * i + script.after, () => {
        if (!session || session.legs.get(leg.queuedCallId) !== leg) return
        if (leg.status !== 'ringing') return

        if (script.fate === 'answer') {
          connectLeg(leg)
        } else {
          endLeg(leg, script.fate, 'attempted')
          queueUpdated()
          afterLegSettled()
        }
      })
    })
    queueUpdated()
  }

  // First answer wins: the rep is bridged to it, every other ringing leg is
  // hung up, and the engine pauses until the rep resumes.
  const connectLeg = (leg) => {
    leg.status = 'answered'
    post('symbo:session.leg.answered', legView(leg))
    leg.status = 'connected'
    leg.startedAt = Date.now()
    post('symbo:session.leg.connected', legView(leg))

    sessionRinging().forEach((other) => endLeg(other, 'answered_elsewhere', 'attempted'))

    session.status = 'paused'
    post('symbo:session.paused', {
      dialSessionId: session.dialSessionId,
      reason: 'connected',
    })
    queueUpdated()
    render()

    // The far end hangs up after a while if the rep does not.
    sessionLater(CONNECTED_CALL_MS, () => {
      if (session && sessionConnected() === leg) hangUpConnectedLeg('completed')
    })
  }

  const hangUpConnectedLeg = (reason) => {
    const leg = sessionConnected()
    if (!leg) return
    const durationSeconds = Math.round((Date.now() - leg.startedAt) / 1000)
    endLeg(leg, reason, 'attempted')
    session.postCall = {
      dialSessionId: session.dialSessionId,
      callId: leg.callId,
      queuedCallId: leg.queuedCallId,
      prospectId: leg.prospectId,
      answered: true,
      durationSeconds,
      outcomeRequired: true,
    }
    post('symbo:session.postCall', session.postCall)
    // A reload brings it back like a one-off call, as the real frame does.
    if (BLOCK_DIALER) {
      localStorage.setItem(
        PENDING_CALL_KEY,
        JSON.stringify({
          callId: leg.callId,
          prospectId: leg.prospectId,
          number: PROSPECTS[leg.prospectId].number,
          externalId: null,
          answered: true,
          durationSeconds,
          dialedAt: leg.dialedAt,
          restored: false,
        })
      )
    }
    queueUpdated()
    render()
  }

  // Nobody ringing, nobody connected, nothing awaiting an outcome: the engine
  // moves on to the next round by itself (it only pauses on a connected call).
  const afterLegSettled = () => {
    if (!session || session.status !== 'dialing') return
    if (sessionRinging().length > 0 || sessionConnected()) return
    sessionLater(400, dialNextRound)
  }

  // The session is over, or parked: its dialing stops, and the rep's line
  // drops after the event that says so.
  const unloadSession = (event, payload) => {
    session = null
    cancelSessionTimers()
    post(event, payload)
    dropSessionLine()
    render()
    scheduleInbound(INBOUND_AFTER_IDLE_MS)
  }

  const finishSession = () => {
    const payload = { dialSessionId: session.dialSessionId, counts: counts() }
    session.status = 'ended'
    unloadSession('symbo:session.ended', payload)
  }

  /* ---------------------------------------------------------------- inbound */

  let inboundTimer = null
  const scheduleInbound = (ms) => {
    clearTimeout(inboundTimer)
    inboundTimer = setTimeout(() => ringInbound({ auto: true }), ms)
  }

  // The demo rings by itself only while the rep is idle. On request it rings
  // whenever the real frame would offer the call: during a call or a paused
  // session, but not while the engine is dialing, and one at a time.
  const ringInbound = ({ auto = false } = {}) => {
    const busy = auto ? !!(session || call) : session?.status === 'dialing'
    if (!signedIn || incoming || busy) {
      scheduleInbound(INBOUND_REPEAT_MS)
      return
    }
    incoming = {
      callId: nextId('call'),
      from: INBOUND.from,
      prospectId: INBOUND.prospectId,
      prospectName: PROSPECTS[INBOUND.prospectId].fullName,
    }
    post('symbo:call.incoming', { ...incoming })
    render()

    const ringing = incoming
    later(INBOUND_RING_MS, () => {
      if (incoming !== ringing) return
      incoming = null
      post('symbo:call.ended', { callId: ringing.callId, reason: 'cancelled', durationSeconds: 0 })
      render()
      scheduleInbound(INBOUND_REPEAT_MS)
    })
  }

  /* --------------------------------------------------------- one-off calls */

  const clearPendingOneOff = () => {
    pendingOneOff = null
    localStorage.removeItem(PENDING_CALL_KEY)
  }

  // The call ends in its post-call step. Its outcome is saved with
  // call.saveOutcome (dialer.saveOutcome() in the SDK), which sends
  // call.completed, or from the partner's server with PUT /calls/{id}. Under
  // "Require & block dialer" it survives a reload until then.
  const finishOneOffCall = (reason) => {
    const ended = call
    call = null
    const durationSeconds = ended.startedAt
      ? Math.round((Date.now() - ended.startedAt) / 1000)
      : 0
    post('symbo:call.ended', { callId: ended.callId, reason, durationSeconds })
    pendingOneOff = {
      callId: ended.callId,
      prospectId: ended.prospectId,
      number: ended.number,
      externalId: ended.externalId,
      answered: !!ended.startedAt,
      durationSeconds,
      dialedAt: ended.dialedAt,
      restored: false,
    }
    endedCalls.set(ended.callId, pendingOneOff)
    if (BLOCK_DIALER) localStorage.setItem(PENDING_CALL_KEY, JSON.stringify(pendingOneOff))
    post('symbo:call.postCall', postCallView(pendingOneOff))
    setMuted(false)
    render()
    scheduleInbound(INBOUND_AFTER_IDLE_MS)
  }

  // Why a dial cannot go out now, as [code, message], or null.
  const dialRefusal = () => {
    if (sessionOwnsLine()) {
      return [
        'SESSION_ACTIVE',
        'A power-dial session is dialing or has a call in front of the rep. Pause the session, or finish its post-call step, before dialing.',
      ]
    }
    if (lineUp()) return ['CALL_IN_PROGRESS', 'A call is already active. Hang up before dialing again.']
    if (BLOCK_DIALER && pendingOneOff) {
      return ['POSTCALL_DETAILS_REQUIRED', 'Save the outcome of the last call before dialing again.']
    }
    return null
  }

  // dial() before the device has registered waits for it, up to
  // DEVICE_WAIT_MS, as the real frame does.
  const deviceWaiters = []
  const waitForDevice = (done) => {
    const timer = setTimeout(() => settle(false), DEVICE_WAIT_MS)
    const settle = (ready) => {
      clearTimeout(timer)
      const i = deviceWaiters.indexOf(settle)
      if (i >= 0) deviceWaiters.splice(i, 1)
      done(ready)
    }
    deviceWaiters.push(settle)
  }

  const placeCall = (msg, target, externalId) => {
    // Under plain "Require" the next dial drops the last call's unsaved
    // post-call step.
    clearPendingOneOff()
    call = {
      callId: nextId('call'),
      status: 'dialing',
      externalId: externalId ?? null,
      startedAt: null,
      dialedAt: new Date().toISOString(),
      ...target,
    }
    const { callId } = call
    ok(msg, { callId })
    post('symbo:call.started', {
      callId,
      number: call.number,
      from: FROM,
      externalId: call.externalId,
      prospectId: call.prospectId,
    })
    render()

    const thisCall = call
    later(400, () => {
      if (call !== thisCall) return
      call.status = 'ringing'
      post('symbo:call.ringing', { callId, number: call.number, from: FROM })
    })
    later(1600, () => {
      if (call !== thisCall) return
      call.status = 'connected'
      call.startedAt = Date.now()
      post('symbo:call.answered', { callId })
      render()
    })
    // Symbo recognising a number it was not told the prospect for.
    if (!call.prospectId) {
      later(2000, () => {
        if (call !== thisCall) return
        call.prospectId = 'p-1001'
        post('symbo:contact.matched', {
          number: call.number,
          externalId: call.externalId,
          prospect: { id: 'p-1001', fullName: PROSPECTS['p-1001'].fullName },
        })
      })
    }
    later(1600 + CONNECTED_CALL_MS, () => {
      if (call === thisCall) finishOneOffCall('completed')
    })
  }

  /* -------------------------------------------------------------- commands */

  const OTHER_CALL_MESSAGE = 'Another call is in progress. Resume the session once it has ended.'
  const DIAL_PENDING_MESSAGE = 'A dial is already being placed.'

  const handlers = {
    'symbo:hello'() {
      if (signedIn) announceReady()
      else announceAuthRequired()
    },

    'symbo:signIn'(msg) {
      const token = String(msg.payload.token || '')
      const profileId = String(msg.payload.profileId || '')
      if (!token) {
        return refuse(msg, 'TOKEN_REQUIRED', 'A sign-in token is required.')
      }
      if (!profileId) {
        return refuse(msg, 'PROFILE_NOT_CONFIGURED', 'A profileId is required.')
      }
      // The stub does no crypto: 'expired' stands in for anything Symbo would
      // refuse, and any other non-empty token is accepted.
      if (token === 'expired') {
        return refuse(msg, 'TOKEN_REJECTED', 'This sign-in token was not accepted.')
      }
      localStorage.setItem(STORAGE_KEY, '1')
      signedIn = true
      authAnnounced = false
      ok(msg, { user: USER })
      clearWarning('NOT_SIGNED_IN')
      announceReady()
      render()
    },

    'symbo:signOut'(msg) {
      if (!signedIn) return ok(msg, { signedOut: false })
      const busy = busyRefusal('signing out')
      if (busy) return refuse(msg, ...busy)
      ok(msg, { signedOut: true })
      // The real frame runs Symbo's logout, which forgets the session at once
      // and reloads it signed out; the reloaded frame is the one that says
      // auth.required, and the reload restarts the SDK's hello loop. Asked
      // for, so no frame.leaving.
      leaving = 'signingOut'
      localStorage.removeItem(STORAGE_KEY)
      signedIn = false
      cancelTimers()
      render()
      later(300, () => location.reload())
    },

    // Load afresh, for a newer build or to recover. Refused for the same
    // reasons as signOut, except that compact and hidden mode bring a call
    // waiting for its outcome back after the reload; the rep stays signed in.
    'symbo:reload'(msg) {
      const busy = busyRefusal('reloading', { reloading: true })
      if (busy) return refuse(msg, ...busy)
      ok(msg, msg.payload.hard === true ? { reloading: true, hard: true } : { reloading: true })
      leaving = 'reloading'
      cancelTimers()
      later(300, () => location.reload())
    },

    'symbo:getState'(msg) {
      ok(msg, stateView())
    },

    'symbo:dial'(msg) {
      const { number, prospectId, externalId } = msg.payload
      if (!signedIn) return refuse(msg, 'NOT_SIGNED_IN', 'Sign in first.')
      if (dialInFlight) return refuse(msg, 'CALL_IN_PROGRESS', DIAL_PENDING_MESSAGE)
      const refusal = dialRefusal()
      if (refusal) return refuse(msg, ...refusal)
      let target
      if (prospectId) {
        if (!PROSPECTS[prospectId]) {
          return refuse(msg, 'PROSPECT_NOT_FOUND', `No prospect ${prospectId}.`)
        }
        target = { prospectId, number: PROSPECTS[prospectId].number }
      } else {
        if (typeof number !== 'string' || !number.trim()) {
          return refuse(msg, 'INVALID_NUMBER', 'number or prospectId is required.')
        }
        target = { prospectId: null, number: number.trim() }
      }

      if (deviceReady) return placeCall(msg, target, externalId)
      dialInFlight = true
      waitForDevice((ready) => {
        dialInFlight = false
        if (!ready) {
          return refuse(msg, 'DEVICE_NOT_READY', 'The calling device did not register in time. Try again, or reload the frame.')
        }
        // The rep's state may have moved while we waited.
        const late = dialRefusal()
        if (late) return refuse(msg, ...late)
        placeCall(msg, target, externalId)
      })
    },

    'symbo:hangUp'(msg) {
      if (call) {
        ok(msg)
        return finishOneOffCall('hangup')
      }
      if (session) {
        // The rep hanging up drops the rep's own line with the call.
        if (sessionConnected()) {
          ok(msg)
          hangUpConnectedLeg('completed')
          dropSessionLine()
          return
        }
        const ringing = sessionRinging()
        if (ringing.length) {
          ok(msg)
          ringing.forEach((leg) => endLeg(leg, 'cancelled', 'cancelled'))
          dropSessionLine()
          session.status = 'paused'
          post('symbo:session.paused', { dialSessionId: session.dialSessionId, reason: 'requested' })
          queueUpdated()
          render()
          return
        }
      }
      return refuse(msg, 'NO_ACTIVE_CALL', 'Nothing to hang up.')
    },

    'symbo:setContact'(msg) {
      ok(msg)
    },

    // The answer goes out before the event, as the real frame sends them.
    'symbo:setMuted'(msg) {
      if (typeof msg.payload.muted !== 'boolean') {
        return refuse(msg, 'INVALID_MUTED', 'setMuted needs { muted: true } or { muted: false }.')
      }
      if (!lineUp()) return refuse(msg, 'NO_ACTIVE_CALL', 'There is no active call.')
      const next = msg.payload.muted
      ok(msg, { muted: next })
      setMuted(next)
    },

    // Played one at a time after any digits still waiting, each only while
    // the conversation they were sent to is still up, and answered once the
    // last has played. Plain timers rather than later(): ending the session
    // cancels those, and this still owes the page an answer.
    'symbo:sendDigits'(msg) {
      const digits = typeof msg.payload.digits === 'string' ? msg.payload.digits : ''
      if (!DTMF_DIGITS.test(digits)) {
        return refuse(msg, 'INVALID_DIGITS', 'digits must be 1 to 32 of 0-9, * and #.')
      }
      const to = conversation()
      if (!to) {
        return refuse(msg, 'NO_ACTIVE_CALL', lineUp() ? 'Nobody has answered to hear the digits.' : 'There is no active call.')
      }
      const first = Math.max(Date.now(), keypadFreeAt)
      keypadFreeAt = first + DTMF_GAP_MS * digits.length
      let played = 0
      let stopped = false
      ;[...digits].forEach((digit, i) =>
        setTimeout(() => {
          if (stopped) return
          if (conversation() !== to) {
            stopped = true
            return refuse(msg, 'NO_ACTIVE_CALL', `The call ended after ${played} of ${digits.length} digits.`)
          }
          played += 1
          if (played === digits.length) ok(msg, { digits })
        }, first + DTMF_GAP_MS * i - Date.now())
      )
    },

    // Taken whenever the line is free. With { endCurrent: true } the call in
    // front of the rep is ended first, Symbo's "End & Accept": a connected
    // session call goes to its post-call step and the session pauses.
    'symbo:answerIncoming'(msg) {
      if (!incoming) return refuse(msg, 'NO_INCOMING_CALL', 'No call is ringing.')
      if (session?.status === 'dialing') {
        return refuse(msg, 'SESSION_ACTIVE', 'A power-dial session is dialing. Pause it before answering.')
      }
      const sessionCall = sessionOwnsLine()
      if (msg.payload.endCurrent !== true) {
        if (sessionCall) {
          return refuse(
            msg,
            'SESSION_ACTIVE',
            'A power-dial session call is in front of the rep. Answer with { endCurrent: true } to end it and take this call.'
          )
        }
        if (call) {
          return refuse(msg, 'CALL_IN_PROGRESS', 'A call is already active. Hang up, or answer with { endCurrent: true }.')
        }
      } else {
        if (sessionCall || (session && sessionLine)) {
          const connected = sessionConnected()
          if (connected) hangUpConnectedLeg('completed')
          if (connected || sessionLine) {
            dropSessionLine()
            session.status = 'paused'
            post('symbo:session.paused', { dialSessionId: session.dialSessionId, reason: 'incoming' })
          }
        }
        // Also with a session call in its post-call step and the line down.
        if (call) finishOneOffCall('hangup')
      }
      // Answering drops a one-off call's unsaved post-call step, as in
      // Symbo; dialer.saveOutcome({ callId }) can still save it.
      clearPendingOneOff()
      call = {
        callId: incoming.callId,
        status: 'connected',
        prospectId: incoming.prospectId,
        number: incoming.from,
        externalId: null,
        startedAt: Date.now(),
        dialedAt: new Date().toISOString(),
      }
      incoming = null
      ok(msg, { callId: call.callId })
      post('symbo:call.answered', { callId: call.callId })
      render()
      const thisCall = call
      later(CONNECTED_CALL_MS, () => {
        if (call === thisCall) finishOneOffCall('completed')
      })
    },

    'symbo:ignoreIncoming'(msg) {
      if (!incoming) return refuse(msg, 'NO_INCOMING_CALL', 'No call is ringing.')
      const ignored = incoming
      incoming = null
      ok(msg)
      post('symbo:call.ended', { callId: ignored.callId, reason: 'cancelled', durationSeconds: 0 })
      render()
      scheduleInbound(INBOUND_REPEAT_MS)
    },

    // The outcome of a one-off or inbound call: the one waiting in its
    // post-call step, or any ended call named by id. Only the waiting one
    // sends call.completed, before the answer, as the real frame sends them.
    'symbo:call.saveOutcome'(msg) {
      const { callId, outcomeId, outcomeValue, note, callFields } = msg.payload
      const pendingCallId = pendingOneOff?.callId ?? null
      const targetCallId = callId || pendingCallId
      if (!targetCallId) {
        return refuse(msg, 'NO_CALL_TO_SAVE', 'There is no call waiting for an outcome. Pass the callId of the call to save.')
      }
      if (session && targetCallId === (session.postCall?.callId ?? sessionConnected()?.callId)) {
        return refuse(msg, 'NO_CALL_TO_SAVE', "This is the power-dial session's call; save it with session.saveOutcome.")
      }
      const hasOutcome = !!(outcomeId || outcomeValue)
      const hasNote = note !== undefined && note !== null
      if (!hasOutcome && !hasNote && !(callFields && typeof callFields === 'object')) {
        return refuse(msg, 'OUTCOME_UNKNOWN', 'Send an outcomeId or outcomeValue, a note, or callFields.')
      }
      const resolvedId = hasOutcome ? resolveOutcomeId(outcomeId, outcomeValue) : null
      const outcome = OUTCOMES[resolvedId]
      if (hasOutcome && !outcome) return refuse(msg, 'OUTCOME_UNKNOWN', `Unknown outcome ${outcomeId || outcomeValue}`)
      if (outcome?.noteRequired && !note) {
        return refuse(msg, 'NOTE_REQUIRED', `"${outcome.name}" needs a note.`)
      }
      const isPending = targetCallId === pendingCallId
      // Every one-off post-call step in the stub asks for an outcome.
      if (isPending && !outcome) return refuse(msg, 'OUTCOME_PENDING', 'An outcome is required for this call.')
      const target = endedCalls.get(targetCallId)
      if (!target) return refuse(msg, 'NO_CALL_TO_SAVE', 'Call not found')

      if (isPending) {
        clearPendingOneOff()
        post('symbo:call.completed', {
          callId: target.callId,
          externalId: target.externalId ?? null,
          prospectId: target.prospectId,
          outcomeId: resolvedId,
          outcome: outcome.name,
          disposition: outcome.name,
          dispositionGroup: outcome.group,
          note: note ?? null,
          durationSeconds: target.durationSeconds,
        })
        render()
      }
      ok(msg, { callId: targetCallId, outcomeId: resolvedId ?? null })
    },

    'symbo:listAudioDevices'(msg) {
      if (!deviceReady) return refuse(msg, 'DEVICE_NOT_READY', 'The calling device is still registering.')
      ok(msg, devices)
    },

    'symbo:setAudioDevices'(msg) {
      const { microphoneId, speakerId } = msg.payload
      if (microphoneId && !devices.microphones.some((d) => d.id === microphoneId)) {
        return refuse(msg, 'AUDIO_DEVICE_NOT_FOUND', `No microphone ${microphoneId}.`)
      }
      if (speakerId && !devices.speakers.some((d) => d.id === speakerId)) {
        return refuse(msg, 'AUDIO_DEVICE_NOT_FOUND', `No speaker ${speakerId}.`)
      }
      if (microphoneId) devices.selected.microphoneId = microphoneId
      if (speakerId) devices.selected.speakerId = speakerId
      ok(msg, devices)
      post('symbo:audio.devicesChanged', devices)
    },

    // Not refused while the device registers: like the real frame, the
    // engine dials once it can.
    'symbo:session.start'(msg) {
      const { dialSessionId, concurrentCalls: lines } = msg.payload
      const dial = msg.payload.dial !== false
      if (!signedIn) return refuse(msg, 'NOT_SIGNED_IN', 'Sign in first.')
      if (warnings.has('REALTIME_DISCONNECTED')) {
        return refuse(msg, 'REALTIME_DISCONNECTED', 'Realtime is disconnected; try again in a moment.')
      }
      if (session) return refuse(msg, 'SESSION_ALREADY_ACTIVE', `Session ${session.dialSessionId} is active.`)
      // Loading without dialing leaves the line alone.
      if (dial && call) return refuse(msg, 'CALL_IN_PROGRESS', 'A call is active. Hang up before starting a session.')
      if (dial && dialInFlight) return refuse(msg, 'CALL_IN_PROGRESS', DIAL_PENDING_MESSAGE)
      if (!dialSessionId || /missing/i.test(dialSessionId)) {
        return refuse(msg, 'SESSION_NOT_FOUND', `No dial session ${dialSessionId}.`)
      }
      if (/ended|done/i.test(dialSessionId)) {
        return refuse(msg, 'SESSION_NOT_STARTABLE', `Session ${dialSessionId} has ended.`)
      }
      if (lines !== undefined) {
        const refusal = linesRefusal(lines)
        if (refusal) return refuse(msg, ...refusal)
      }
      clearTimeout(inboundTimer)
      const held = heldSessions.get(dialSessionId)
      heldSessions.delete(dialSessionId)
      // Like the real frame, session.started goes out before the answer.
      const dialing = startSession(dialSessionId, lines ?? held?.lines ?? DEMO_SESSION_LINES, {
        dial,
        queue: held?.queue,
      })
      ok(msg, {
        dialSessionId,
        concurrentCalls: concurrentCalls(),
        concurrentCallsLocked: LOCKED_LINES !== null,
        dialing,
      })
    },

    // Hangs up ringing legs (they get the cancelled default outcome) and
    // drops the rep's line; a connected call is never cut. In the post-call
    // step the call stays in front until its outcome is saved.
    'symbo:session.pause'(msg) {
      if (!session) return refuse(msg, 'NO_ACTIVE_SESSION', 'No session is active.')
      ok(msg)
      const ringing = sessionRinging()
      ringing.forEach((leg) => endLeg(leg, 'cancelled', 'cancelled'))
      if (!sessionConnected()) dropSessionLine()
      session.status = 'paused'
      session.pausedByRequest = true
      post('symbo:session.paused', { dialSessionId: session.dialSessionId, reason: 'requested' })
      queueUpdated()
      render()
    },

    'symbo:session.resume'(msg) {
      if (!session) return refuse(msg, 'NO_ACTIVE_SESSION', 'No session is active.')
      if (warnings.has('REALTIME_DISCONNECTED')) {
        return refuse(msg, 'REALTIME_DISCONNECTED', 'Realtime is disconnected; try again in a moment.')
      }
      if (session.status === 'dialing') return ok(msg)
      if (call) return refuse(msg, 'CALL_IN_PROGRESS', OTHER_CALL_MESSAGE)
      if (dialInFlight) return refuse(msg, 'CALL_IN_PROGRESS', DIAL_PENDING_MESSAGE)
      if (sessionConnected()) return refuse(msg, 'CALL_IN_PROGRESS', 'A call is in progress')
      if (session.postCall) return refuse(msg, 'OUTCOME_PENDING', 'Save an outcome for the last call first.')
      ok(msg)
      session.pausedByRequest = false
      dismissIncoming()
      resumeDialing()
    },

    // Only the session loaded here; the partner's server ends any other.
    'symbo:session.end'(msg) {
      const { force, dialSessionId } = msg.payload
      if (dialSessionId !== undefined && dialSessionId !== null && dialSessionId !== session?.dialSessionId) {
        return refuse(
          msg,
          'SESSION_NOT_FOUND',
          'Only the session loaded here can be ended here; end another session from your server with POST /v1/dialSessions/{id}/actions/end.'
        )
      }
      if (!session) return refuse(msg, 'NO_ACTIVE_SESSION', 'No session is active.')
      const connected = sessionConnected()
      if (connected && !force) {
        return refuse(msg, 'CALL_IN_PROGRESS', 'A call is connected. Pass force: true to end anyway.')
      }
      sessionRinging().forEach((leg) => endLeg(leg, 'cancelled', 'cancelled'))
      if (connected) endLeg(connected, 'completed', 'attempted')
      ok(msg, { dialSessionId: session.dialSessionId, counts: counts() })
      finishSession()
    },

    // Park the session without ending it: ringing legs are hung up, the
    // rep's line drops, a call waiting for its outcome is closed without one,
    // and its cancelled calls go back on the queue, as Symbo's hold does.
    // session.start picks it up again.
    'symbo:session.hold'(msg) {
      if (!session) return refuse(msg, 'NO_ACTIVE_SESSION', 'No session is active.')
      if (sessionConnected()) {
        return refuse(msg, 'CALL_IN_PROGRESS', 'A call is connected. Hold the session once it has ended.')
      }
      const payload = { dialSessionId: session.dialSessionId, counts: counts() }
      sessionRinging().forEach((leg) => endLeg(leg, 'cancelled', 'cancelled'))
      session.queue.forEach((row) => {
        if (row.status === 'cancelled') row.status = 'queued'
      })
      heldSessions.set(session.dialSessionId, { queue: session.queue, lines: session.lines })
      dropSessionLine()
      unloadSession('symbo:session.held', payload)
      ok(msg, payload)
    },

    'symbo:session.skipCurrent'(msg) {
      if (!session) return refuse(msg, 'NO_ACTIVE_SESSION', 'No session is active.')
      const connected = sessionConnected()
      if (!connected) return refuse(msg, 'NO_ACTIVE_CALL', 'No call is connected.')
      ok(msg)
      // Skipped before hang-up, so no outcome is asked for and the engine
      // does not stamp the cancelled default on it.
      endLeg(connected, 'cancelled', 'cancelled')
      dropSessionLine()
      queueUpdated()
      render()
    },

    // One queued call (queuedCallId) or a list (queuedCallIds), removed the
    // way Symbo's bulk remove does, ids in any case: a call being dialed is
    // left alone, and the list form says how many went and which were skipped.
    'symbo:session.removeQueued'(msg) {
      if (!session) return refuse(msg, 'NO_ACTIVE_SESSION', 'No session is active.')
      const { queuedCallId, queuedCallIds } = msg.payload
      const listForm = Array.isArray(queuedCallIds)
      let ids
      if (listForm) {
        ids = [...new Set(queuedCallIds.filter((id) => typeof id === 'string' && id).map((id) => id.toLowerCase()))]
        if (!ids.length) return refuse(msg, 'QUEUED_CALL_NOT_FOUND', 'queuedCallIds is required')
        if (ids.length > MAX_QUEUED_CALL_IDS) {
          return refuse(msg, 'QUEUED_CALL_NOT_FOUND', `queuedCallIds takes at most ${MAX_QUEUED_CALL_IDS} ids`)
        }
      } else {
        if (!queuedCallId) return refuse(msg, 'QUEUED_CALL_NOT_FOUND', 'queuedCallId is required')
        ids = [String(queuedCallId).toLowerCase()]
        const row = session.queue.find((r) => r.queuedCallId === ids[0])
        if (row?.status === 'dialing') return refuse(msg, 'QUEUED_CALL_DIALING', 'This call is being dialed')
        if (!row) return refuse(msg, 'QUEUED_CALL_NOT_FOUND', 'Queued call not found')
        if (row.status === 'removed') return refuse(msg, 'QUEUED_CALL_NOT_FOUND', 'This call is no longer queued')
      }

      let removedCount = 0
      const skipped = []
      ids.forEach((id) => {
        const row = session.queue.find((r) => r.queuedCallId === id)
        if (row?.status === 'dialing') return skipped.push({ queuedCallId: id, reason: 'dialing' })
        if (!row || row.status === 'removed') return
        row.status = 'removed'
        removedCount += 1
      })

      ok(msg, listForm ? { removedCount, skipped } : {})
      if (removedCount) queueUpdated()
    },

    // Like the real frame, the event goes out before the answer, and only when
    // the number actually changes.
    'symbo:session.setConcurrentCalls'(msg) {
      if (!session) return refuse(msg, 'NO_ACTIVE_SESSION', 'No session is active.')
      const lines = msg.payload.concurrentCalls
      const refusal = linesRefusal(lines)
      if (refusal) return refuse(msg, ...refusal)
      if (lines !== concurrentCalls()) {
        session.lines = lines
        post('symbo:session.concurrentCallsChanged', {
          dialSessionId: session.dialSessionId,
          concurrentCalls: concurrentCalls(),
          concurrentCallsLocked: LOCKED_LINES !== null,
        })
        render()
      }
      ok(msg, { dialSessionId: session.dialSessionId, concurrentCalls: concurrentCalls() })
    },

    'symbo:session.getQueue'(msg) {
      if (!session) return refuse(msg, 'NO_ACTIVE_SESSION', 'No session is active.')
      ok(msg, { dialSessionId: session.dialSessionId, counts: counts(), queue: queueView() })
    },

    'symbo:session.saveOutcome'(msg) {
      if (!session) return refuse(msg, 'NO_ACTIVE_SESSION', 'No session is active.')
      const { callId, outcomeId, outcomeValue, note, then } = msg.payload
      const postCall = session.postCall
      if (!postCall || (callId && callId !== postCall.callId)) {
        return refuse(msg, 'NO_CALL_TO_SAVE', 'There is no call waiting for an outcome.')
      }
      const resolvedId = resolveOutcomeId(outcomeId, outcomeValue)
      const outcome = OUTCOMES[resolvedId]
      if (!outcome) return refuse(msg, 'OUTCOME_UNKNOWN', `No outcome ${outcomeId || outcomeValue}.`)
      if (outcome.noteRequired && !note) {
        return refuse(msg, 'NOTE_REQUIRED', `"${outcome.name}" needs a note.`)
      }
      // Refused before the write, as session.resume is refused
      if (then === 'resume' && warnings.has('REALTIME_DISCONNECTED')) {
        return refuse(msg, 'REALTIME_DISCONNECTED', 'Realtime is disconnected; try again in a moment.')
      }
      if (then === 'resume' && call) return refuse(msg, 'CALL_IN_PROGRESS', OTHER_CALL_MESSAGE)

      const row = session.queue.find((r) => r.queuedCallId === postCall.queuedCallId)
      row.status = 'completed'
      row.lastOutcomeId = resolvedId
      session.postCall = null
      if (JSON.parse(localStorage.getItem(PENDING_CALL_KEY))?.callId === postCall.callId) {
        localStorage.removeItem(PENDING_CALL_KEY)
      }
      ok(msg, { callId: postCall.callId, outcomeId: resolvedId })

      post('symbo:call.completed', {
        callId: postCall.callId,
        externalId: null,
        prospectId: postCall.prospectId,
        outcomeId: resolvedId,
        outcome: outcome.name,
        disposition: outcome.name,
        dispositionGroup: outcome.group,
        note: note ?? null,
        durationSeconds: postCall.durationSeconds,
      })
      queueUpdated()

      if (then === 'end') return finishSession()
      if (then === 'pause') {
        // The call view's Back: the call leaves the rep's view and the rep's
        // line drops.
        dropSessionLine()
        session.status = 'paused'
        session.pausedByRequest = true
        post('symbo:session.paused', { dialSessionId: session.dialSessionId, reason: 'requested' })
        render()
        return
      }
      resumeDialing()
    },
  }

  // Controls for the demo only. Not part of the protocol: the example page
  // pokes the stub with them to ring an inbound call, break realtime, sign
  // the rep out from another frame, or change the rep's plan.
  const demoHandlers = {
    'stub:ringInbound': () => ringInbound(),
    'stub:realtimeBlip': () => {
      raiseWarning('REALTIME_DISCONNECTED', 'Lost the realtime connection; reconnecting…')
      later(3000, () => clearWarning('REALTIME_DISCONNECTED'))
    },
    'stub:signOut': signedOutElsewhere,
    'stub:planChanged': () => requireReload('plan_changed'),
  }

  addEventListener('message', (e) => {
    const msg = e.data
    if (!msg || typeof msg.type !== 'string') return

    if (demoHandlers[msg.type]) return demoHandlers[msg.type]()
    if (!msg.type.startsWith('symbo:')) return

    if (msg.type === 'symbo:hello') {
      parentOrigin = e.origin && e.origin !== 'null' ? e.origin : null
    }
    msg.payload = msg.payload && typeof msg.payload === 'object' ? msg.payload : {}

    if (leaving) {
      if (msg.type === 'symbo:hello') return
      if (leaving === 'reloading' && msg.type === 'symbo:reload') return ok(msg, { reloading: true })
      if (leaving === 'signingOut' && msg.type === 'symbo:signOut') return ok(msg, { signedOut: true })
      return refuse(msg, 'NOT_SIGNED_IN', leaving === 'reloading' ? 'The frame is reloading.' : 'The rep is being signed out.')
    }

    const handler = handlers[msg.type]
    if (!handler) return refuse(msg, 'UNKNOWN_COMMAND', `Unknown command ${msg.type}.`)
    if (!signedIn && !['symbo:hello', 'symbo:signIn', 'symbo:signOut', 'symbo:reload', 'symbo:getState'].includes(msg.type)) {
      return refuse(msg, 'NOT_SIGNED_IN', 'Sign in first.')
    }
    handler(msg)
  })

  /* ------------------------------------------------------------- the strip */

  const el = (id) => document.getElementById(id)

  function render() {
    if (MODE === 'hidden') return
    const connected = sessionConnected()
    let state = 'idle'
    if (!signedIn) state = 'sign in to start'
    else if (!deviceReady) state = 'registering device…'
    else if (incoming) state = `incoming from ${incoming.prospectName}`
    else if (call) state = `${call.status} · ${call.number}`
    else if (session?.postCall) state = 'log the outcome'
    else if (connected) state = `on call · ${PROSPECTS[connected.prospectId].fullName}`
    else if (session?.status === 'dialing') state = `dialing ${sessionRinging().length} contact(s)…`
    else if (session) state = 'session paused'
    else if (pendingOneOff) state = 'log the outcome'
    if (muted) state += ' · muted'
    if (warnings.has('REALTIME_DISCONNECTED')) state += ' · realtime down'

    el('who').textContent = signedIn ? USER.name : 'Stub dialer'
    el('state').textContent = state
    el('dot').className = `dot ${!signedIn ? '' : warnings.size ? 'warn' : 'ok'}`
    el('auth').textContent = signedIn ? 'Sign out' : 'Sign in'
  }

  if (MODE !== 'hidden') {
    el('ring').addEventListener('click', () => ringInbound())
    el('blip').addEventListener('click', demoHandlers['stub:realtimeBlip'])
    el('auth').addEventListener('click', () => {
      if (signedIn) return signOutFromStrip()
      // The strip's own Sign in button: the real one opens the login tab
      // from inside the frame.
      window.open(new URL('../login/', location.href).href, '_blank', 'noopener')
    })
    render()
  } else {
    document.body.innerHTML = ''
  }
})()
