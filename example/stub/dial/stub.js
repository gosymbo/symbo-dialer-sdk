// -----------------------------------------------------------------------------
// Offline stub of the Symbo dialer frame.
//
// Plays the Symbo side of the embed protocol so the example page (and your own
// integration) can be built with no Symbo account and no network. It answers
// every command the SDK knows, replays a two-line power-dial session through
// three rounds of dialing, rings an inbound call while idle, lists a pair of
// audio devices, and raises a warning on request.
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
  const MODE = params.get('mode') === 'hidden' ? 'hidden' : 'compact'
  const STORAGE_KEY = 'symbo-stub:signedIn'
  const CONCURRENT_CALLS = 2

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

  /* ------------------------------------------------------------------ state */

  let signedIn = localStorage.getItem(STORAGE_KEY) === '1'
  let parentOrigin = null
  let authAnnounced = false
  let readyAnnounced = false
  let seq = 0
  let deviceReady = false

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

  // The power-dial session, if any.
  let session = null

  const timers = new Set()
  const later = (ms, fn) => {
    const id = setTimeout(() => {
      timers.delete(id)
      fn()
    }, ms)
    timers.add(id)
    return id
  }
  const cancelTimers = () => {
    timers.forEach(clearTimeout)
    timers.clear()
  }

  const nextId = (prefix) => `${prefix}-${++seq}`

  /* --------------------------------------------------------------- posting */

  const post = (type, payload = {}) =>
    parent.postMessage({ type, payload, protocolVersion: V }, parentOrigin || '*')

  const ok = (msg, data = {}) =>
    msg.requestId &&
    post('symbo:result', { requestId: msg.requestId, ok: true, data })

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

  const raiseWarning = (code, message) => {
    warnings.set(code, message)
    post('symbo:warning', { code, message })
    render()
  }
  const clearWarning = (code) => {
    if (!warnings.delete(code)) return
    post('symbo:warning.cleared', { code })
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
      capabilities: ['dial', 'session', 'inbound', 'audioDevices', 'signIn'],
      deviceReady,
      powerDialing: true,
      concurrentCalls: CONCURRENT_CALLS,
    })
    if (MODE === 'compact') post('symbo:resize', { width: 360, height: 56 })

    // The calling device registers a moment after sign-in.
    if (!deviceReady) {
      later(300, () => {
        deviceReady = true
        post('symbo:device.ready', {})
        clearWarning('DEVICE_NOT_READY')
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
    post('symbo:auth.required', { loginUrl })
    raiseWarning('NOT_SIGNED_IN', 'No Symbo user is signed in.')
  }

  // The login tab tells us it finished, the way the guest channel relays the
  // session to the real frame. The real frame reloads itself at this point,
  // which is worth replaying: it is what restarts the SDK's hello loop.
  new BroadcastChannel('symbo-stub').addEventListener('message', (e) => {
    if (e.data === 'signed-in') location.reload()
  })

  const signOut = () => {
    localStorage.removeItem(STORAGE_KEY)
    location.reload()
  }

  /* ------------------------------------------------------------ state view */

  const counts = () => {
    const c = {
      queued: 0,
      dialing: 0,
      attempted: 0,
      completed: 0,
      cancelled: 0,
      removed: 0,
      outcomes_saved: 0,
      remaining: 0,
    }
    if (!session) return c
    session.queue.forEach((row) => {
      c[row.status] = (c[row.status] || 0) + 1
      if (row.lastOutcomeId) c.outcomes_saved += 1
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

  const stateView = () => ({
    signedIn,
    deviceReady,
    mode: MODE,
    powerDialing: true,
    concurrentCalls: CONCURRENT_CALLS,
    session: session
      ? {
          dialSessionId: session.dialSessionId,
          status: session.status,
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
      : null,
    incoming: incoming
      ? {
          callId: incoming.callId,
          from: incoming.from,
          prospectId: incoming.prospectId,
          prospectName: incoming.prospectName,
        }
      : null,
    warnings: [...warnings.keys()],
  })

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

  const endLeg = (leg, reason, rowStatus) => {
    session.legs.delete(leg.queuedCallId)
    const row = session.queue.find((r) => r.queuedCallId === leg.queuedCallId)
    row.status = rowStatus
    leg.status = 'ended'
    leg.reason = reason
    post('symbo:session.leg.ended', legView(leg))
  }

  const startSession = (dialSessionId) => {
    session = {
      dialSessionId,
      status: 'dialing',
      legs: new Map(),
      wrap: null,
      queue: SCRIPT.map((s, i) => ({
        queuedCallId: s.queuedCallId,
        prospectId: s.prospectId,
        status: 'queued',
        order: i + 1,
        attempts: 0,
        lastCallId: null,
        lastOutcomeId: null,
      })),
    }
    post('symbo:session.started', {
      dialSessionId,
      concurrentCalls: CONCURRENT_CALLS,
    })
    queueUpdated()
    dialNextRound()
  }

  // Ring the next `concurrentCalls` queued rows at once. The engine decides
  // what happens to each leg; the SCRIPT above stands in for that.
  const dialNextRound = () => {
    if (!session) return
    const rows = session.queue.filter((r) => r.status === 'queued').slice(0, CONCURRENT_CALLS)

    if (rows.length === 0) {
      const dialSessionId = session.dialSessionId
      post('symbo:session.noMoreCalls', { dialSessionId, counts: counts() })
      finishSession()
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
      }
      row.status = 'dialing'
      row.attempts += 1
      row.lastCallId = leg.callId
      session.legs.set(row.queuedCallId, leg)

      later(200 * i, () => {
        if (!session || !session.legs.has(leg.queuedCallId)) return
        post('symbo:session.leg.ringing', legView(leg))
      })

      later(200 * i + script.after, () => {
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
    later(CONNECTED_CALL_MS, () => {
      if (session && sessionConnected() === leg) hangUpConnectedLeg('completed')
    })
  }

  const hangUpConnectedLeg = (reason) => {
    const leg = sessionConnected()
    if (!leg) return
    const durationSeconds = Math.round((Date.now() - leg.startedAt) / 1000)
    endLeg(leg, reason, 'attempted')
    session.wrap = {
      dialSessionId: session.dialSessionId,
      callId: leg.callId,
      queuedCallId: leg.queuedCallId,
      prospectId: leg.prospectId,
      answered: true,
      durationSeconds,
      outcomeRequired: true,
    }
    post('symbo:session.wrap', session.wrap)
    queueUpdated()
    render()
  }

  // Nobody ringing, nobody connected, nothing to wrap up: the engine moves on
  // to the next round by itself (it only pauses on a connected call).
  const afterLegSettled = () => {
    if (!session || session.status !== 'dialing') return
    if (sessionRinging().length > 0 || sessionConnected()) return
    later(400, dialNextRound)
  }

  const finishSession = () => {
    const payload = { dialSessionId: session.dialSessionId, counts: counts() }
    session.status = 'ended'
    post('symbo:session.ended', payload)
    session = null
    cancelTimers()
    render()
    scheduleInbound(INBOUND_AFTER_IDLE_MS)
  }

  /* ---------------------------------------------------------------- inbound */

  let inboundTimer = null
  const scheduleInbound = (ms) => {
    clearTimeout(inboundTimer)
    inboundTimer = setTimeout(ringInbound, ms)
  }

  const ringInbound = () => {
    // The frame ignores inbound calls while a session is active or a call is
    // up; they follow the rep's normal no-answer routing instead.
    if (!signedIn || session || call || incoming) {
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
      post('symbo:call.ended', { callId: ringing.callId, reason: 'missed', durationSeconds: 0 })
      render()
      scheduleInbound(INBOUND_REPEAT_MS)
    })
  }

  /* --------------------------------------------------------- one-off calls */

  const finishOneOffCall = (reason) => {
    const ended = call
    call = null
    const durationSeconds = ended.startedAt
      ? Math.round((Date.now() - ended.startedAt) / 1000)
      : 0
    post('symbo:call.ended', { callId: ended.callId, reason, durationSeconds })
    post('symbo:call.wrap', {
      callId: ended.callId,
      prospectId: ended.prospectId,
      answered: !!ended.startedAt,
      durationSeconds,
      outcomeRequired: true,
    })
    render()

    // A one-off call's outcome is saved from the partner's server
    // (PUT /calls/:id) or in Symbo; call.completed follows that save. The
    // stub pretends it happened.
    later(1500, () =>
      post('symbo:call.completed', {
        callId: ended.callId,
        externalId: ended.externalId ?? null,
        prospectId: ended.prospectId,
        outcomeId: 'o-connected',
        outcome: 'Connected',
        disposition: 'Connected',
        dispositionGroup: 'answered',
        note: null,
        durationSeconds,
      })
    )
    scheduleInbound(INBOUND_AFTER_IDLE_MS)
  }

  /* -------------------------------------------------------------- commands */

  const handlers = {
    'symbo:hello'() {
      if (signedIn) announceReady()
      else announceAuthRequired()
    },

    'symbo:signIn'(msg) {
      const code = String(msg.payload.code || '')
      if (code === 'expired') {
        return refuse(msg, 'SIGN_IN_CODE_EXPIRED', 'That sign-in code has expired.')
      }
      if (!/^[a-z0-9-]{4,}$/i.test(code)) {
        return refuse(msg, 'SIGN_IN_CODE_INVALID', 'That sign-in code is not valid.')
      }
      localStorage.setItem(STORAGE_KEY, '1')
      signedIn = true
      authAnnounced = false
      ok(msg, { user: USER })
      clearWarning('NOT_SIGNED_IN')
      announceReady()
      render()
    },

    'symbo:getState'(msg) {
      ok(msg, stateView())
    },

    'symbo:dial'(msg) {
      const { number, prospectId, externalId } = msg.payload
      if (!signedIn) return refuse(msg, 'NOT_SIGNED_IN', 'Sign in first.')
      if (!deviceReady) {
        return refuse(msg, 'DEVICE_NOT_READY', 'The calling device is still registering.')
      }
      if (session) {
        return refuse(msg, 'SESSION_ACTIVE', 'A power-dial session is active. End it before dialing by hand.')
      }
      if (call) {
        return refuse(msg, 'CALL_IN_PROGRESS', 'A call is already active. Hang up before dialing again.')
      }
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

      call = {
        callId: nextId('call'),
        status: 'dialing',
        externalId: externalId ?? null,
        startedAt: null,
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
    },

    'symbo:hangUp'(msg) {
      if (session) {
        if (sessionConnected()) {
          ok(msg)
          hangUpConnectedLeg('completed')
          return
        }
        const ringing = sessionRinging()
        if (ringing.length) {
          ok(msg)
          ringing.forEach((leg) => endLeg(leg, 'cancelled', 'cancelled'))
          session.status = 'paused'
          post('symbo:session.paused', { dialSessionId: session.dialSessionId, reason: 'requested' })
          queueUpdated()
          render()
          return
        }
        return refuse(msg, 'NO_ACTIVE_CALL', 'Nothing to hang up.')
      }
      if (!call) return refuse(msg, 'NO_ACTIVE_CALL', 'Nothing to hang up.')
      ok(msg)
      finishOneOffCall('hangup')
    },

    'symbo:setContact'(msg) {
      ok(msg)
    },

    'symbo:answerIncoming'(msg) {
      if (!incoming) return refuse(msg, 'NO_INCOMING_CALL', 'No call is ringing.')
      if (call) return refuse(msg, 'CALL_IN_PROGRESS', 'A call is already active.')
      if (session) return refuse(msg, 'SESSION_ACTIVE', 'A power-dial session is active.')
      call = {
        callId: incoming.callId,
        status: 'connected',
        prospectId: incoming.prospectId,
        number: incoming.from,
        externalId: null,
        startedAt: Date.now(),
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
      post('symbo:call.ended', { callId: ignored.callId, reason: 'ignored', durationSeconds: 0 })
      render()
      scheduleInbound(INBOUND_REPEAT_MS)
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

    'symbo:session.start'(msg) {
      const { dialSessionId } = msg.payload
      if (!signedIn) return refuse(msg, 'NOT_SIGNED_IN', 'Sign in first.')
      if (!deviceReady) return refuse(msg, 'DEVICE_NOT_READY', 'The calling device is still registering.')
      if (warnings.has('REALTIME_DISCONNECTED')) {
        return refuse(msg, 'REALTIME_DISCONNECTED', 'Realtime is disconnected; try again in a moment.')
      }
      if (session) return refuse(msg, 'SESSION_ALREADY_ACTIVE', `Session ${session.dialSessionId} is active.`)
      if (call) return refuse(msg, 'CALL_IN_PROGRESS', 'A call is active. Hang up before starting a session.')
      if (!dialSessionId || /missing/i.test(dialSessionId)) {
        return refuse(msg, 'SESSION_NOT_FOUND', `No dial session ${dialSessionId}.`)
      }
      if (/ended|done/i.test(dialSessionId)) {
        return refuse(msg, 'SESSION_NOT_STARTABLE', `Session ${dialSessionId} has ended.`)
      }
      clearTimeout(inboundTimer)
      ok(msg, { dialSessionId, concurrentCalls: CONCURRENT_CALLS })
      startSession(dialSessionId)
    },

    'symbo:session.pause'(msg) {
      if (!session) return refuse(msg, 'NO_ACTIVE_SESSION', 'No session is active.')
      ok(msg)
      // Pausing while legs ring hangs them up; they get the cancelled default
      // outcome. A connected call is never cut by a pause.
      const ringing = sessionRinging()
      ringing.forEach((leg) => endLeg(leg, 'cancelled', 'cancelled'))
      if (session.status !== 'paused' || ringing.length) {
        session.status = 'paused'
        post('symbo:session.paused', { dialSessionId: session.dialSessionId, reason: 'requested' })
      }
      session.pausedByRequest = true
      queueUpdated()
      render()
    },

    'symbo:session.resume'(msg) {
      if (!session) return refuse(msg, 'NO_ACTIVE_SESSION', 'No session is active.')
      if (session.wrap) return refuse(msg, 'OUTCOME_PENDING', 'Save an outcome for the last call first.')
      if (warnings.has('REALTIME_DISCONNECTED')) {
        return refuse(msg, 'REALTIME_DISCONNECTED', 'Realtime is disconnected; try again in a moment.')
      }
      ok(msg)
      // With a call connected there is nothing to resume yet: the engine
      // moves on once that call ends and its outcome is saved.
      if (sessionConnected() || session.status === 'dialing') return
      session.pausedByRequest = false
      post('symbo:session.resumed', { dialSessionId: session.dialSessionId })
      dialNextRound()
    },

    'symbo:session.end'(msg) {
      if (!session) return refuse(msg, 'NO_ACTIVE_SESSION', 'No session is active.')
      const connected = sessionConnected()
      if (connected && !msg.payload.force) {
        return refuse(msg, 'CALL_IN_PROGRESS', 'A call is connected. Pass force: true to end anyway.')
      }
      sessionRinging().forEach((leg) => endLeg(leg, 'cancelled', 'cancelled'))
      if (connected) endLeg(connected, 'completed', 'attempted')
      ok(msg, { counts: counts() })
      finishSession()
    },

    'symbo:session.skipCurrent'(msg) {
      if (!session) return refuse(msg, 'NO_ACTIVE_SESSION', 'No session is active.')
      const connected = sessionConnected()
      if (!connected) return refuse(msg, 'NO_ACTIVE_CALL', 'No call is connected.')
      ok(msg)
      // Skipped before hang-up, so no outcome is asked for and the engine
      // does not stamp the cancelled default on it.
      endLeg(connected, 'cancelled', 'cancelled')
      queueUpdated()
      render()
    },

    'symbo:session.removeQueued'(msg) {
      if (!session) return refuse(msg, 'NO_ACTIVE_SESSION', 'No session is active.')
      const row = session.queue.find((r) => r.queuedCallId === msg.payload.queuedCallId)
      if (!row) return refuse(msg, 'QUEUED_CALL_NOT_FOUND', `No queued call ${msg.payload.queuedCallId}.`)
      if (row.status === 'dialing') {
        return refuse(msg, 'QUEUED_CALL_DIALING', 'That call is already being dialled.')
      }
      row.status = 'removed'
      ok(msg)
      queueUpdated()
    },

    'symbo:session.getQueue'(msg) {
      if (!session) return refuse(msg, 'NO_ACTIVE_SESSION', 'No session is active.')
      ok(msg, { dialSessionId: session.dialSessionId, counts: counts(), queue: queueView() })
    },

    'symbo:session.saveOutcome'(msg) {
      if (!session) return refuse(msg, 'NO_ACTIVE_SESSION', 'No session is active.')
      const { callId, outcomeId, outcomeValue, note, then } = msg.payload
      const wrap = session.wrap
      if (!wrap || (callId && callId !== wrap.callId)) {
        return refuse(msg, 'NO_CALL_TO_SAVE', 'There is no call waiting for an outcome.')
      }
      const resolvedId =
        outcomeId ||
        Object.keys(OUTCOMES).find(
          (id) => OUTCOMES[id].name.toLowerCase() === String(outcomeValue || '').toLowerCase()
        )
      const outcome = OUTCOMES[resolvedId]
      if (!outcome) return refuse(msg, 'OUTCOME_UNKNOWN', `No outcome ${outcomeId || outcomeValue}.`)
      if (outcome.noteRequired && !note) {
        return refuse(msg, 'NOTE_REQUIRED', `"${outcome.name}" needs a note.`)
      }

      const row = session.queue.find((r) => r.queuedCallId === wrap.queuedCallId)
      row.status = 'completed'
      row.lastOutcomeId = resolvedId
      session.wrap = null
      ok(msg, { callId: wrap.callId, outcomeId: resolvedId })

      post('symbo:call.completed', {
        callId: wrap.callId,
        externalId: null,
        prospectId: wrap.prospectId,
        outcomeId: resolvedId,
        outcome: outcome.name,
        disposition: outcome.name,
        dispositionGroup: outcome.group,
        note: note ?? null,
        durationSeconds: wrap.durationSeconds,
      })
      queueUpdated()

      if (then === 'end') return finishSession()
      if (then === 'pause') {
        session.pausedByRequest = true
        render()
        return
      }
      post('symbo:session.resumed', { dialSessionId: session.dialSessionId })
      dialNextRound()
    },
  }

  // Controls for the demo only. Not part of the protocol: the example page
  // pokes the stub with them to ring an inbound call or break realtime.
  const demoHandlers = {
    'stub:ringInbound': ringInbound,
    'stub:realtimeBlip': () => {
      raiseWarning('REALTIME_DISCONNECTED', 'Lost the realtime connection; reconnecting…')
      later(3000, () => clearWarning('REALTIME_DISCONNECTED'))
    },
    'stub:signOut': signOut,
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

    const handler = handlers[msg.type]
    if (!handler) return refuse(msg, 'UNKNOWN_COMMAND', `Unknown command ${msg.type}.`)
    if (!signedIn && !['symbo:hello', 'symbo:signIn', 'symbo:getState'].includes(msg.type)) {
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
    else if (session?.wrap) state = 'log the outcome'
    else if (connected) state = `on call · ${PROSPECTS[connected.prospectId].fullName}`
    else if (session?.status === 'dialing') state = `dialing ${sessionRinging().length} contact(s)…`
    else if (session) state = 'session paused'
    if (warnings.has('REALTIME_DISCONNECTED')) state += ' · realtime down'

    el('who').textContent = signedIn ? USER.name : 'Stub dialer'
    el('state').textContent = state
    el('dot').className = `dot ${!signedIn ? '' : warnings.size ? 'warn' : 'ok'}`
    el('auth').textContent = signedIn ? 'Sign out' : 'Sign in'
  }

  if (MODE === 'compact') {
    el('ring').addEventListener('click', ringInbound)
    el('blip').addEventListener('click', demoHandlers['stub:realtimeBlip'])
    el('auth').addEventListener('click', () => {
      if (signedIn) return signOut()
      // The strip's own Sign in button: the real one opens the login tab
      // from inside the frame.
      window.open(new URL('../login/', location.href).href, '_blank', 'noopener')
    })
    render()
  } else {
    document.body.innerHTML = ''
  }
})()
