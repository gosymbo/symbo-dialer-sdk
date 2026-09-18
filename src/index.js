// -----------------------------------------------------------------------------
// @symbo/dialer-embed — mounts the Symbo dialer inside a partner application.
//
// Everything this does is available over raw postMessage; the package exists so
// the protocol stays ours to change. A partner that hand-rolls the message
// plumbing pins us to today's message names forever.
//
// Standalone by design: this file imports nothing from the Symbo application,
// which is why it lives in its own repository.
//
// The price of that independence is that the message names below are declared
// twice — here, and in the application's own embed/protocol.js. They must agree
// exactly. Drift between them is the worst failure this package has, because it
// is silent: both sides keep working while a partner quietly stops receiving an
// event nobody noticed was renamed.
//
// test/protocol.test.js pins the contract on this side; symbo-ui has a matching
// test on the other. Both assert against the same literal, so changing one side
// fails that side's build until the other is changed to match.
// -----------------------------------------------------------------------------

// Bumped when a message is removed or renamed, or a payload field changes
// meaning. Everything added for sessions, inbound calls, audio devices and
// warnings is additive, so it stays at 2.
export const PROTOCOL_VERSION = 2

const DEFAULT_APP_URL = 'https://app.symbo.ai'

// How the frame renders. `compact` is a small Symbo status strip (sign-in,
// device state, audio settings) that the iframe is sized to; `hidden` renders
// nothing at all and the same state reaches the page as events and commands.
export const MODES = Object.freeze({
  COMPACT: 'compact',
  HIDDEN: 'hidden',
})

// The strip's size before the frame has told us anything. Only used in compact
// mode; the frame's own `resize` events take over from here.
const COMPACT_SIZE = Object.freeze({ width: 360, height: 56 })

export const COMMANDS = Object.freeze({
  HELLO: 'symbo:hello',
  DIAL: 'symbo:dial',
  HANG_UP: 'symbo:hangUp',
  SET_CONTACT: 'symbo:setContact',
  GET_STATE: 'symbo:getState',
  SIGN_IN: 'symbo:signIn',
  ANSWER_INCOMING: 'symbo:answerIncoming',
  IGNORE_INCOMING: 'symbo:ignoreIncoming',
  LIST_AUDIO_DEVICES: 'symbo:listAudioDevices',
  SET_AUDIO_DEVICES: 'symbo:setAudioDevices',
  SESSION_START: 'symbo:session.start',
  SESSION_PAUSE: 'symbo:session.pause',
  SESSION_RESUME: 'symbo:session.resume',
  SESSION_END: 'symbo:session.end',
  SESSION_SKIP_CURRENT: 'symbo:session.skipCurrent',
  SESSION_REMOVE_QUEUED: 'symbo:session.removeQueued',
  SESSION_GET_QUEUE: 'symbo:session.getQueue',
  SESSION_SAVE_OUTCOME: 'symbo:session.saveOutcome',
})

// Symbo's answer to a command. Not a public event — it settles the promise the
// command returned and is never delivered to an on() handler. Exported so the
// contract test can pin it alongside the commands and events.
export const RESULT = 'symbo:result'

export const EVENTS = Object.freeze({
  READY: 'symbo:ready',
  AUTH_REQUIRED: 'symbo:auth.required',
  DEVICE_READY: 'symbo:device.ready',
  DEVICE_ERROR: 'symbo:device.error',
  PERMISSION_DENIED: 'symbo:permission.denied',
  WARNING: 'symbo:warning',
  WARNING_CLEARED: 'symbo:warning.cleared',
  CALL_STARTED: 'symbo:call.started',
  CALL_RINGING: 'symbo:call.ringing',
  CALL_INCOMING: 'symbo:call.incoming',
  CALL_ANSWERED: 'symbo:call.answered',
  CALL_ENDED: 'symbo:call.ended',
  CALL_WRAP: 'symbo:call.wrap',
  CALL_COMPLETED: 'symbo:call.completed',
  CONTACT_MATCHED: 'symbo:contact.matched',
  AUDIO_DEVICES_CHANGED: 'symbo:audio.devicesChanged',
  SESSION_STARTED: 'symbo:session.started',
  SESSION_PAUSED: 'symbo:session.paused',
  SESSION_RESUMED: 'symbo:session.resumed',
  SESSION_ENDED: 'symbo:session.ended',
  SESSION_NO_MORE_CALLS: 'symbo:session.noMoreCalls',
  SESSION_LEG_RINGING: 'symbo:session.leg.ringing',
  SESSION_LEG_ANSWERED: 'symbo:session.leg.answered',
  SESSION_LEG_CONNECTED: 'symbo:session.leg.connected',
  SESSION_LEG_ENDED: 'symbo:session.leg.ended',
  SESSION_WRAP: 'symbo:session.wrap',
  SESSION_QUEUE_UPDATED: 'symbo:session.queue.updated',
  SESSION_ADMIN: 'symbo:session.admin',
  RESIZE: 'symbo:resize',
  ERROR: 'symbo:error',
})

// Codes Symbo answers with. A refused command rejects with one of these on
// `err.code`; the `error` event carries one for refusals that were not an
// answer to anything.
export const ERRORS = Object.freeze({
  NOT_SIGNED_IN: 'NOT_SIGNED_IN',
  CALLING_NOT_ENABLED: 'CALLING_NOT_ENABLED',
  INVALID_NUMBER: 'INVALID_NUMBER',
  CALL_IN_PROGRESS: 'CALL_IN_PROGRESS',
  UNKNOWN_COMMAND: 'UNKNOWN_COMMAND',
  POSTCALL_DETAILS_REQUIRED: 'POSTCALL_DETAILS_REQUIRED',
  NEEDS_SETUP: 'NEEDS_SETUP',
  EMBED_NOT_ENABLED: 'EMBED_NOT_ENABLED',
  ORIGIN_NOT_ALLOWED: 'ORIGIN_NOT_ALLOWED',
  HIJACK_MODE: 'HIJACK_MODE',
  DEVICE_NOT_READY: 'DEVICE_NOT_READY',
  MIC_PERMISSION_DENIED: 'MIC_PERMISSION_DENIED',
  PROSPECT_NOT_FOUND: 'PROSPECT_NOT_FOUND',
  NO_ACTIVE_CALL: 'NO_ACTIVE_CALL',
  NO_INCOMING_CALL: 'NO_INCOMING_CALL',
  SESSION_ACTIVE: 'SESSION_ACTIVE',
  AUDIO_DEVICE_NOT_FOUND: 'AUDIO_DEVICE_NOT_FOUND',
  SIGN_IN_CODE_INVALID: 'SIGN_IN_CODE_INVALID',
  SIGN_IN_CODE_EXPIRED: 'SIGN_IN_CODE_EXPIRED',
  POWER_DIALING_NOT_ENABLED: 'POWER_DIALING_NOT_ENABLED',
  REALTIME_DISCONNECTED: 'REALTIME_DISCONNECTED',
  NO_ACTIVE_SESSION: 'NO_ACTIVE_SESSION',
  SESSION_ALREADY_ACTIVE: 'SESSION_ALREADY_ACTIVE',
  SESSION_NOT_FOUND: 'SESSION_NOT_FOUND',
  SESSION_NOT_STARTABLE: 'SESSION_NOT_STARTABLE',
  OUTCOME_PENDING: 'OUTCOME_PENDING',
  OUTCOME_UNKNOWN: 'OUTCOME_UNKNOWN',
  NOTE_REQUIRED: 'NOTE_REQUIRED',
  NO_CALL_TO_SAVE: 'NO_CALL_TO_SAVE',
  QUEUED_CALL_NOT_FOUND: 'QUEUED_CALL_NOT_FOUND',
  QUEUED_CALL_DIALING: 'QUEUED_CALL_DIALING',
})

// Codes the `warning` event carries. Each is cleared by a `warning.cleared`
// with the same code; `dialer.warnings` holds the ones currently raised.
export const WARNINGS = Object.freeze({
  NOT_SIGNED_IN: 'NOT_SIGNED_IN',
  REALTIME_DISCONNECTED: 'REALTIME_DISCONNECTED',
  DEVICE_NOT_READY: 'DEVICE_NOT_READY',
  DEVICE_ERROR: 'DEVICE_ERROR',
  MIC_PERMISSION_DENIED: 'MIC_PERMISSION_DENIED',
  EMBED_NOT_ENABLED: 'EMBED_NOT_ENABLED',
  POWER_DIALING_NOT_ENABLED: 'POWER_DIALING_NOT_ENABLED',
  HIJACK_MODE: 'HIJACK_MODE',
})

// Codes raised by this package itself, before anything reached Symbo. They
// never travel over postMessage, which is why they are not in ERRORS.
export const CLIENT_ERRORS = Object.freeze({
  INVALID_OPTIONS: 'INVALID_OPTIONS',
  NOT_MOUNTED: 'NOT_MOUNTED',
  NOT_READY: 'NOT_READY',
  DESTROYED: 'DESTROYED',
  MOUNT_TIMEOUT: 'MOUNT_TIMEOUT',
  COMMAND_TIMEOUT: 'COMMAND_TIMEOUT',
  NO_LOGIN_URL: 'NO_LOGIN_URL',
  POPUP_BLOCKED: 'POPUP_BLOCKED',
  UNKNOWN: 'UNKNOWN',
})

// Commands Symbo answers before anyone is signed in. Everything else waits for
// `ready`, because there is no user to act for until then.
const PRE_READY_COMMANDS = new Set([COMMANDS.SIGN_IN, COMMANDS.GET_STATE])

// The two codes Symbo answers the handshake with when it will not talk to this
// page at all: the organisation does not have the embedded dialer, or this
// origin is not on its list. They arrive as an `error` and a `warning` with no
// requestId to answer, and nothing the page does will change them, so mount()
// rejects with the code instead of waiting out its timer.
const HANDSHAKE_REFUSALS = new Set([
  ERRORS.EMBED_NOT_ENABLED,
  ERRORS.ORIGIN_NOT_ALLOWED,
])

const SAVE_OUTCOME_THEN = new Set(['resume', 'pause', 'end'])

// How long to wait for an answer before giving up. Only reachable if Symbo
// fails to reply at all; a refusal comes back fast.
const DEFAULT_COMMAND_TIMEOUT_MS = 15000

// `dial` is the one command that cannot share that budget. The frame answers
// it only once the Symbo call id arrives — the carrier reporting remote
// ringing — or after its own 15 s wait for one, and that clock starts after
// the message has crossed and, for a prospectId, after a prospect lookup. A
// 15 s budget here therefore expires first on any slow-ringing call: the
// promise rejects with COMMAND_TIMEOUT, the frame's answer arrives to a
// pending entry that is already gone, and the partner has a live call with no
// callId. Keep this above the frame's CALL_ID_TIMEOUT_MS (symbo-ui
// EmbedBridge.js); the two move together.
const DIAL_TIMEOUT_MS = 25000

// How long mount() waits for the frame to say anything. Cleared the moment
// Symbo answers, with `ready` or with `auth.required` — a user taking their
// time over a sign-in is not a timeout.
const DEFAULT_MOUNT_TIMEOUT_MS = 30000

// How often to repeat the opening hello until Symbo answers.
//
// The handshake has no recovery: Symbo records the origin that said hello and
// replies to it, and a hello that arrives before its listener is attached is
// dropped with nothing to retry it. The iframe's `load` event is not a reliable
// moment to speak — it fires when the document is done, which can beat the
// application's own startup on a cold cache, and a document that never settles
// never fires it at all (see mount()). So keep saying it until we are heard,
// and stop the moment we are. The frame reloads itself after an in-frame
// sign-in, which fires `load` again and restarts the loop.
const HELLO_RETRY_MS = 400

// The public event names, minus the namespace: callers write
// dialer.on('call.ended'), not dialer.on('symbo:call.ended').
const publicName = (type) => type.replace(/^symbo:/, '')

// Handlers registered under this name receive every event, as (name, payload).
const WILDCARD = '*'

export class SymboDialerError extends Error {
  constructor(code, message) {
    super(message || code)
    this.name = 'SymboDialerError'
    this.code = code
  }
}

const invalid = (message) =>
  new SymboDialerError(CLIENT_ERRORS.INVALID_OPTIONS, message)

const isElement = (value) =>
  !!value && typeof value === 'object' && typeof value.appendChild === 'function'

const isFiniteNumber = (value) => typeof value === 'number' && Number.isFinite(value)

let warnedAboutHiddenOption = false

class SymboDialerClient {
  constructor(options = {}) {
    const {
      container,
      appUrl,
      mode,
      hidden,
      mountTimeoutMs,
      commandTimeoutMs,
    } = options

    if (!isElement(container)) {
      throw invalid('container is required and must be a DOM element.')
    }

    this.appUrl = (appUrl || DEFAULT_APP_URL).replace(/\/$/, '')
    try {
      this.origin = new URL(this.appUrl).origin
    } catch {
      throw invalid(`appUrl must be an origin such as ${DEFAULT_APP_URL}.`)
    }

    this.mode = resolveMode(mode, hidden)
    this.container = container
    this.mountTimeoutMs = mountTimeoutMs ?? DEFAULT_MOUNT_TIMEOUT_MS
    this.commandTimeoutMs = commandTimeoutMs ?? DEFAULT_COMMAND_TIMEOUT_MS

    this.iframe = null
    this.helloTimer = null
    this.listeners = new Map()
    this.pending = new Map()
    this.requestSeq = 0

    // Lifecycle. `contacted` flips on the first message from the frame (ready
    // or auth.required); `ready` on ready, and back off if the session later
    // expires. `authPending` is true between an auth.required and the ready
    // that answers it, which is what lets repeats of auth.required be dropped.
    this.mountPromise = null
    this.mountTimer = null
    this.settleMount = null
    this.contacted = false
    this.ready = false
    this.authPending = false
    this.destroyed = false
    this.awaitingContact = []

    // What the frame has told us about itself. Filled from `ready`.
    this.loginUrl = null
    this.user = null
    this.organization = null
    this.capabilities = []
    this.concurrentCalls = null
    this.deviceReady = false
    this.powerDialing = false
    this.warnings = new Map()

    this.handleMessage = this.handleMessage.bind(this)

    this.session = {
      start: (options = {}) => {
        if (!options.dialSessionId) {
          return Promise.reject(invalid('session.start needs a dialSessionId.'))
        }
        return this.send(COMMANDS.SESSION_START, {
          dialSessionId: options.dialSessionId,
        })
      },
      pause: () => this.send(COMMANDS.SESSION_PAUSE),
      resume: () => this.send(COMMANDS.SESSION_RESUME),
      end: (options = {}) =>
        this.send(COMMANDS.SESSION_END, { force: !!options.force }),
      skipCurrent: () => this.send(COMMANDS.SESSION_SKIP_CURRENT),
      removeQueued: (arg) => {
        const queuedCallId =
          arg && typeof arg === 'object' ? arg.queuedCallId : arg
        if (!queuedCallId) {
          return Promise.reject(
            invalid('session.removeQueued needs a queuedCallId.')
          )
        }
        return this.send(COMMANDS.SESSION_REMOVE_QUEUED, { queuedCallId })
      },
      getQueue: () => this.send(COMMANDS.SESSION_GET_QUEUE),
      saveOutcome: (options = {}) => {
        if (!SAVE_OUTCOME_THEN.has(options.then)) {
          return Promise.reject(
            invalid(
              "session.saveOutcome needs `then`: 'resume', 'pause' or 'end'."
            )
          )
        }
        return this.send(COMMANDS.SESSION_SAVE_OUTCOME, options)
      },
    }

    this.audio = {
      list: () => this.send(COMMANDS.LIST_AUDIO_DEVICES),
      set: (options = {}) => {
        if (!options.microphoneId && !options.speakerId) {
          return Promise.reject(
            invalid('audio.set needs a microphoneId, a speakerId, or both.')
          )
        }
        return this.send(COMMANDS.SET_AUDIO_DEVICES, options)
      },
    }
  }

  /* ----------------------------------------------------------------- mount */

  /**
   * Create the iframe and resolve once the dialer can place calls.
   *
   * Resolution waits on a signed-in dialer, so a first-time user has to sign
   * in before this settles. The timeout only covers the frame never answering
   * at all; once Symbo has said `auth.required` the promise waits as long as
   * the sign-in takes.
   *
   * Calling it twice returns the same promise.
   */
  mount() {
    if (this.destroyed) {
      return Promise.reject(destroyedError())
    }
    if (this.mountPromise) return this.mountPromise

    const iframe = document.createElement('iframe')
    iframe.src = `${this.appUrl}/dial?embed=1&mode=${this.mode}`
    iframe.title = 'Symbo dialer'
    // Without this the dialer cannot reach the microphone: a cross-origin
    // frame only gets it when the embedding page delegates it. Autoplay is
    // for ringback and the connect tone, which play inside the frame.
    iframe.allow = 'microphone; autoplay'
    iframe.style.display = 'block'
    iframe.style.border = '0'

    if (this.mode === MODES.HIDDEN) {
      // Nothing to see, nothing to focus, nothing for a screen reader. Kept
      // in the document (not display:none) so the frame keeps running.
      iframe.style.width = '0'
      iframe.style.height = '0'
      iframe.style.position = 'absolute'
      iframe.style.visibility = 'hidden'
      iframe.style.overflow = 'hidden'
      iframe.style.pointerEvents = 'none'
      iframe.setAttribute('aria-hidden', 'true')
      iframe.setAttribute('tabindex', '-1')
    }

    this.iframe = iframe
    if (this.mode === MODES.COMPACT) this.applySize(COMPACT_SIZE)

    this.mountPromise = new Promise((resolve, reject) => {
      this.settleMount = { resolve, reject }
      this.mountTimer = setTimeout(() => this.onMountTimeout(), this.mountTimeoutMs)
    })

    window.addEventListener('message', this.handleMessage)
    // `load` is the natural moment to (re)start asking: it fires when the
    // frame's document is done, and again after an in-frame sign-in reloads
    // it.
    iframe.addEventListener('load', () => this.startSayingHello())
    this.container.appendChild(iframe)

    // But do not depend on it. A document that never settles never fires
    // `load` at all — one runaway media error handler retrying a source it
    // can never fetch is enough — and the handshake would then never start:
    // no hello, no answer, and the partner left with MOUNT_TIMEOUT and
    // nothing naming the cause. The frame is in the document now, so start
    // now. It costs nothing: a hello posted before the frame is listening is
    // dropped, the loop repeats every HELLO_RETRY_MS, and startSayingHello()
    // clears its own timer before arming the next, so the `load` call above
    // cannot leave a second one running.
    this.startSayingHello()

    return this.mountPromise
  }

  onMountTimeout() {
    this.mountTimer = null
    this.stopSayingHello()
    // We have been saying hello since the frame entered the document, so
    // this is the frame never answering, not a handshake that never started.
    // Usually a wrong appUrl, an unreachable environment, or a Symbo build
    // without the embed surface. Name those, so nobody starts by debugging
    // their own code.
    const err = new SymboDialerError(
      CLIENT_ERRORS.MOUNT_TIMEOUT,
      `The dialer at ${this.appUrl} did not respond. Check the appUrl is reachable and that it supports embedding.`
    )
    this.rejectMount(err)
    this.flushAwaitingContact(err)
  }

  clearMountTimer() {
    if (this.mountTimer) clearTimeout(this.mountTimer)
    this.mountTimer = null
  }

  resolveMount() {
    if (!this.settleMount) return
    this.settleMount.resolve(this)
    this.settleMount = null
  }

  rejectMount(err) {
    if (!this.settleMount) return
    this.settleMount.reject(err)
    this.settleMount = null
  }

  applySize({ width, height } = {}) {
    if (!this.iframe || this.mode !== MODES.COMPACT) return
    if (isFiniteNumber(width) && width >= 0) this.iframe.style.width = `${width}px`
    if (isFiniteNumber(height) && height >= 0) {
      this.iframe.style.height = `${height}px`
    }
  }

  /* ------------------------------------------------------------- handshake */

  startSayingHello() {
    const hello = () =>
      this.iframe?.contentWindow?.postMessage(
        {
          type: COMMANDS.HELLO,
          payload: { protocolVersion: PROTOCOL_VERSION },
          protocolVersion: PROTOCOL_VERSION,
        },
        this.origin
      )

    // Arm the repeat before the first hello: a frame that answers on the
    // spot would otherwise stop a timer that does not exist yet and leave
    // the one created after it running.
    this.stopSayingHello()
    this.helloTimer = setInterval(hello, HELLO_RETRY_MS)
    hello()
  }

  stopSayingHello() {
    if (this.helloTimer) clearInterval(this.helloTimer)
    this.helloTimer = null
  }

  // Symbo has spoken. Whatever it said, the hello loop and the mount timer
  // have done their job, and commands that were waiting for a frame to talk
  // to can go. Called for every message the frame sends, so it has to stay
  // cheap and repeatable; a second call is a no-op.
  markContacted() {
    this.stopSayingHello()
    this.clearMountTimer()
    this.contacted = true
    if (this.awaitingContact.length) this.flushAwaitingContact()
  }

  onReady(payload) {
    this.ready = true
    this.authPending = false
    this.loginUrl = null

    this.user = payload.user ?? null
    this.organization = payload.organization ?? null
    this.capabilities = Array.isArray(payload.capabilities)
      ? payload.capabilities.slice()
      : []
    this.concurrentCalls = isFiniteNumber(payload.concurrentCalls)
      ? payload.concurrentCalls
      : null
    this.deviceReady = !!payload.deviceReady
    this.powerDialing = !!payload.powerDialing

    // Older frames size themselves on ready rather than through resize.
    if (payload.sizeInfo) this.applySize(payload.sizeInfo)

    this.resolveMount()
  }

  /**
   * Returns false when this is a repeat that should not reach listeners.
   *
   * The frame answers every hello it hears with auth.required until a session
   * exists, and it reloads itself after an in-frame sign-in, so a page can see
   * several for one unauthenticated state. One is the truth; the rest are
   * noise. A fresh auth.required after `ready` is not a repeat — the session
   * expired — and goes through.
   */
  onAuthRequired(payload) {
    const repeat = this.authPending && !this.ready
    this.ready = false
    this.authPending = true
    if (payload.loginUrl) this.loginUrl = payload.loginUrl
    return !repeat
  }

  /* ---------------------------------------------------------------- events */

  on(event, handler) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set())
    this.listeners.get(event).add(handler)

    return () => this.off(event, handler)
  }

  once(event, handler) {
    const wrapped = (...args) => {
      this.off(event, wrapped)
      handler(...args)
    }
    return this.on(event, wrapped)
  }

  off(event, handler) {
    this.listeners.get(event)?.delete(handler)
  }

  emit(event, payload) {
    const call = (handler, args) => {
      try {
        handler(...args)
      } catch (err) {
        // One partner's broken handler must not stop the others, or stop us
        // processing the next message.
        console.error(`[symbo] listener for "${event}" threw`, err)
      }
    }
    this.listeners.get(event)?.forEach((handler) => call(handler, [payload]))
    this.listeners
      .get(WILDCARD)
      ?.forEach((handler) => call(handler, [event, payload]))
  }

  handleMessage(event) {
    if (this.destroyed) return
    if (event.origin !== this.origin) return
    if (event.source !== this.iframe?.contentWindow) return

    const data = event.data
    if (!data || typeof data.type !== 'string') return

    const isResult = data.type === RESULT
    if (!isResult && !Object.values(EVENTS).includes(data.type)) return

    // Anything the frame says at all — ready, auth.required, an answer, or a
    // refusal of the handshake — proves it is listening and has recorded our
    // origin, which is the whole job of the hello loop and the mount timer.
    // Before the handshake completes the frame only ever posts in answer to
    // our own hello, so there is no message here that is not contact.
    this.markContacted()

    if (isResult) {
      this.settle(data.payload || {})
      return
    }

    this.receive(publicName(data.type), data.payload || {})
  }

  // Update what the client knows before listeners run, so a handler that
  // reads `dialer.user` or `dialer.warnings` sees the state the event
  // describes.
  receive(name, payload) {
    // A refused handshake arrives as both an `error` and a `warning` with the
    // same code; the warning is the one that always carries a sentence. Keyed
    // on the code rather than the event name, so an unrelated pre-ready error
    // cannot kill a mount that would still have gone ready. rejectMount()
    // forgets the promise, so the pair and any repeat cost nothing, and a
    // refusal arriving after `ready` leaves the resolved mount alone.
    if (
      !this.ready &&
      (name === 'error' || name === 'warning') &&
      HANDSHAKE_REFUSALS.has(payload.code)
    ) {
      this.rejectMount(
        new SymboDialerError(payload.code, payload.message || payload.code)
      )
    }

    switch (name) {
      case 'ready':
        this.onReady(payload)
        break
      case 'auth.required':
        if (!this.onAuthRequired(payload)) return
        break
      case 'resize':
        this.applySize(payload)
        break
      case 'warning':
        if (payload.code) this.warnings.set(payload.code, payload.message ?? '')
        break
      case 'warning.cleared':
        this.warnings.delete(payload.code)
        break
      case 'device.ready':
        this.deviceReady = true
        break
      case 'device.error':
        this.deviceReady = false
        break
      default:
        break
    }

    this.emit(name, payload)
  }

  /* -------------------------------------------------------------- commands */

  /**
   * Settle the promise a command returned.
   *
   * Symbo answers every command with exactly one of these. A refusal rejects,
   * so the blockers that stop a dial — no outcome saved on the last call, the
   * dialer not set up, calling not enabled — reach the caller as a catch on
   * the dial() they wrote, rather than as an event they had to know to listen
   * for. Success resolves with the answer's `data`.
   */
  settle(payload) {
    const entry = this.pending.get(payload.requestId)
    if (!entry) return

    this.pending.delete(payload.requestId)
    clearTimeout(entry.timer)

    if (payload.ok) {
      entry.resolve(payload.data ?? {})
      return
    }

    // `error: { code, message }` is the shape; a flat `code` / `message` is
    // what the first embed build sent, and costs nothing to keep reading.
    const error = payload.error || payload
    entry.reject(
      new SymboDialerError(error.code || CLIENT_ERRORS.UNKNOWN, error.message)
    )
  }

  send(type, payload = {}, { timeoutMs } = {}) {
    if (this.destroyed) return Promise.reject(destroyedError())

    if (!this.mountPromise) {
      return Promise.reject(
        new SymboDialerError(
          CLIENT_ERRORS.NOT_MOUNTED,
          'The dialer is not mounted. Call mount() first.'
        )
      )
    }

    if (!this.ready && !PRE_READY_COMMANDS.has(type)) {
      return Promise.reject(
        new SymboDialerError(
          CLIENT_ERRORS.NOT_READY,
          'The dialer is not ready yet. Wait for mount() to resolve, or for the "ready" event.'
        )
      )
    }

    const budget = timeoutMs ?? this.commandTimeoutMs

    return new Promise((resolve, reject) => {
      const post = () => {
        const requestId = `r${++this.requestSeq}`

        const timer = setTimeout(() => {
          this.pending.delete(requestId)
          reject(
            new SymboDialerError(
              CLIENT_ERRORS.COMMAND_TIMEOUT,
              `Symbo did not answer "${publicName(type)}" within ${budget}ms.`
            )
          )
        }, budget)

        this.pending.set(requestId, { resolve, reject, timer })

        this.iframe.contentWindow.postMessage(
          { type, payload, requestId, protocolVersion: PROTOCOL_VERSION },
          this.origin
        )
      }

      // A pre-ready command sent before the frame has said anything (signIn
      // straight after mount, typically) waits for the first word from it
      // rather than being dropped on a frame that isn't listening yet.
      if (this.contacted) post()
      else this.awaitingContact.push({ post, reject })
    })
  }

  flushAwaitingContact(err) {
    const waiting = this.awaitingContact
    this.awaitingContact = []
    waiting.forEach(({ post, reject }) => (err ? reject(err) : post()))
  }

  /**
   * Place a call. Either `number` (any format your records hold) or
   * `prospectId` (a Symbo prospect, optionally with the `phoneNumberId` to
   * dial). Resolves with `{ callId }` — `callId` is `null` when the carrier
   * never reported the call ringing; the `call.*` events carry the id once it
   * is known.
   *
   * The frame waits up to 15 s for that id, so this is the one command
   * `commandTimeoutMs` does not shorten: a small one would time out calls
   * that are really ringing.
   */
  dial(options = {}) {
    if (!options.number && !options.prospectId) {
      return Promise.reject(invalid('dial needs a number or a prospectId.'))
    }
    return this.send(COMMANDS.DIAL, options, {
      timeoutMs: Math.max(this.commandTimeoutMs, DIAL_TIMEOUT_MS),
    })
  }

  hangUp() {
    return this.send(COMMANDS.HANG_UP)
  }

  setContact(options = {}) {
    return this.send(COMMANDS.SET_CONTACT, options)
  }

  getState() {
    return this.send(COMMANDS.GET_STATE)
  }

  answerIncoming() {
    return this.send(COMMANDS.ANSWER_INCOMING)
  }

  ignoreIncoming() {
    return this.send(COMMANDS.IGNORE_INCOMING)
  }

  /**
   * Sign the rep in silently with a code your server minted
   * (POST /v1/embedSignInCodes). Resolves with `{ user }`; a `ready` event
   * follows. Works before mount() has resolved, which is the point.
   */
  signIn(options = {}) {
    if (!options.code) {
      return Promise.reject(invalid('signIn needs the code your server minted.'))
    }
    return this.send(COMMANDS.SIGN_IN, { code: options.code })
  }

  /**
   * Open Symbo's sign-in page in a new tab, for the rep to sign in by hand.
   *
   * Call it from a click handler: browsers block new tabs opened any other
   * way. The URL comes from `auth.required`, so there is nothing to open
   * until that has arrived — listen for it and show your button then. When
   * the sign-in completes the frame picks it up and `ready` follows.
   *
   * The returned Window is for closing or focusing the tab, nothing more.
   * A page served with `Cross-Origin-Opener-Policy: same-origin` has its
   * handle severed the moment the login document commits, after which
   * `closed` reads true: wait for `ready`, not for the tab to close.
   */
  openSignIn() {
    if (!this.loginUrl) {
      throw new SymboDialerError(
        CLIENT_ERRORS.NO_LOGIN_URL,
        'Symbo has not asked for a sign-in. Wait for the "auth.required" event.'
      )
    }

    // Not the `noopener` feature: per the HTML window-open steps it makes
    // window.open() return null even when the tab opens, which is
    // indistinguishable from a blocked popup. Open, then disown by hand.
    let opened = null
    try {
      opened = window.open(this.loginUrl, '_blank')
    } catch {
      // A sandboxed iframe without allow-popups throws rather than returning
      // null. Same story for the caller: there is no tab.
      opened = null
    }

    if (!opened) {
      throw new SymboDialerError(
        CLIENT_ERRORS.POPUP_BLOCKED,
        'The browser blocked the sign-in tab. Call openSignIn() from a click handler.'
      )
    }

    // What `noopener` was there for: the login tab must not be able to
    // navigate the partner's page through window.opener.
    try {
      opened.opener = null
    } catch {
      // Some engines refuse the cross-origin set; the tab is open either way.
    }

    return opened
  }

  hasCapability(name) {
    return this.capabilities.includes(name)
  }

  destroy() {
    window.removeEventListener('message', this.handleMessage)
    this.stopSayingHello()
    this.clearMountTimer()
    this.iframe?.remove()

    // Anything still waiting on an answer never gets one now. Reject rather
    // than leave the caller's await hanging until the timeout.
    const err = destroyedError()
    this.pending.forEach(({ reject, timer }) => {
      clearTimeout(timer)
      reject(err)
    })
    this.pending.clear()
    this.flushAwaitingContact(err)
    this.rejectMount(err)

    this.destroyed = true
    this.ready = false
    this.contacted = false
    this.iframe = null
    this.listeners.clear()
  }
}

const destroyedError = () =>
  new SymboDialerError(CLIENT_ERRORS.DESTROYED, 'This dialer has been destroyed.')

function resolveMode(mode, hidden) {
  if (mode === undefined && hidden !== undefined) {
    if (!warnedAboutHiddenOption) {
      warnedAboutHiddenOption = true
      console.warn(
        "[symbo] the `hidden` option is deprecated; pass mode: 'hidden' instead."
      )
    }
    return hidden ? MODES.HIDDEN : MODES.COMPACT
  }
  if (mode === undefined) return MODES.COMPACT
  if (!Object.values(MODES).includes(mode)) {
    throw invalid(`mode must be 'compact' or 'hidden', not ${JSON.stringify(mode)}.`)
  }
  return mode
}

export const SymboDialer = {
  /**
   * Create a client without mounting it. Subscribe to `auth.required` and
   * `warning`, wire up your sign-in button, then call `mount()`.
   */
  create(options = {}) {
    return new SymboDialerClient(options)
  },

  /**
   * `create(options).mount()`: mount the dialer into `container` and resolve
   * with the client once it can place calls.
   */
  mount(options = {}) {
    return SymboDialer.create(options).mount()
  },
}

export default SymboDialer
