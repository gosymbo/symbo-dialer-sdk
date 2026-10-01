// -----------------------------------------------------------------------------
// @symbo/dialer-embed — mounts the Symbo dialer inside a partner application.
//
// Standalone: this file imports nothing from the Symbo application. The
// message names below must match the Symbo app's embed protocol exactly;
// test/protocol.test.js pins them.
// -----------------------------------------------------------------------------

// Bumped when a message is removed or renamed, or a payload field changes
// meaning. Everything added for sessions, inbound calls, audio devices and
// warnings is additive, so it stays at 2.
export const PROTOCOL_VERSION = 2

const DEFAULT_APP_URL = 'https://app.symbo.ai'

// How the frame renders. `widget` is Symbo's own dialer, the same one the CRM
// plugins embed; `compact` is a small status strip (sign-in, device state,
// audio settings) that the iframe is sized to; `hidden` renders nothing at all
// and the same state reaches the page as events and commands. Every mode runs
// the same dialer underneath and answers the same commands.
export const MODES = Object.freeze({
  WIDGET: 'widget',
  COMPACT: 'compact',
  HIDDEN: 'hidden',
})

// What to size the frame to before it has told us anything. The frame's own
// `resize` events take over from here in compact mode; in widget mode it sends
// none, so this size stands unless the page styles the iframe itself.
const DEFAULT_SIZE = Object.freeze({
  [MODES.WIDGET]: Object.freeze({ width: 420, height: 485 }),
  [MODES.COMPACT]: Object.freeze({ width: 360, height: 56 }),
})

export const COMMANDS = Object.freeze({
  HELLO: 'symbo:hello',
  DIAL: 'symbo:dial',
  HANG_UP: 'symbo:hangUp',
  SET_CONTACT: 'symbo:setContact',
  GET_STATE: 'symbo:getState',
  SIGN_IN: 'symbo:signIn',
  SIGN_OUT: 'symbo:signOut',
  RELOAD: 'symbo:reload',
  ANSWER_INCOMING: 'symbo:answerIncoming',
  IGNORE_INCOMING: 'symbo:ignoreIncoming',
  LIST_AUDIO_DEVICES: 'symbo:listAudioDevices',
  SET_AUDIO_DEVICES: 'symbo:setAudioDevices',
  SET_MUTED: 'symbo:setMuted',
  SEND_DIGITS: 'symbo:sendDigits',
  CALL_SAVE_OUTCOME: 'symbo:call.saveOutcome',
  SESSION_START: 'symbo:session.start',
  SESSION_PAUSE: 'symbo:session.pause',
  SESSION_RESUME: 'symbo:session.resume',
  SESSION_END: 'symbo:session.end',
  SESSION_SKIP_CURRENT: 'symbo:session.skipCurrent',
  SESSION_REMOVE_QUEUED: 'symbo:session.removeQueued',
  SESSION_GET_QUEUE: 'symbo:session.getQueue',
  SESSION_SAVE_OUTCOME: 'symbo:session.saveOutcome',
  SESSION_SET_CONCURRENT_CALLS: 'symbo:session.setConcurrentCalls',
  SESSION_HOLD: 'symbo:session.hold',
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
  CALL_POST_CALL: 'symbo:call.postCall',
  CALL_COMPLETED: 'symbo:call.completed',
  CALL_MUTE_CHANGED: 'symbo:call.muteChanged',
  CONTACT_MATCHED: 'symbo:contact.matched',
  AUDIO_DEVICES_CHANGED: 'symbo:audio.devicesChanged',
  SESSION_STARTED: 'symbo:session.started',
  SESSION_PAUSED: 'symbo:session.paused',
  SESSION_RESUMED: 'symbo:session.resumed',
  SESSION_ENDED: 'symbo:session.ended',
  SESSION_HELD: 'symbo:session.held',
  SESSION_NO_MORE_CALLS: 'symbo:session.noMoreCalls',
  SESSION_LEG_RINGING: 'symbo:session.leg.ringing',
  SESSION_LEG_ANSWERED: 'symbo:session.leg.answered',
  SESSION_LEG_CONNECTED: 'symbo:session.leg.connected',
  SESSION_LEG_ENDED: 'symbo:session.leg.ended',
  SESSION_POST_CALL: 'symbo:session.postCall',
  SESSION_QUEUE_UPDATED: 'symbo:session.queue.updated',
  SESSION_ADMIN: 'symbo:session.admin',
  SESSION_CONCURRENT_CALLS_CHANGED: 'symbo:session.concurrentCallsChanged',
  UPDATE_AVAILABLE: 'symbo:update.available',
  RELOAD_REQUIRED: 'symbo:reload.required',
  FRAME_LEAVING: 'symbo:frame.leaving',
  RESIZE: 'symbo:resize',
  ERROR: 'symbo:error',
})

// Codes Symbo answers with. A refused command rejects with one of these on
// `err.code`; the `error` event carries one for refusals that were not an
// answer to anything. A command that failed unexpectedly inside the frame is
// answered with COMMAND_FAILED, which the frame keeps out of its own list, so
// this one mirrors it and leaves it out too.
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
  TOKEN_REJECTED: 'TOKEN_REJECTED',
  TOKEN_REQUIRED: 'TOKEN_REQUIRED',
  PROFILE_NOT_CONFIGURED: 'PROFILE_NOT_CONFIGURED',
  ORGANIZATION_ID_REQUIRED: 'ORGANIZATION_ID_REQUIRED',
  ORGANIZATION_MISMATCH: 'ORGANIZATION_MISMATCH',
  USER_NOT_PROVISIONED: 'USER_NOT_PROVISIONED',
  USER_NEEDS_FIRST_LOGIN: 'USER_NEEDS_FIRST_LOGIN',
  // signIn refusals Symbo carries through from its own login rules.
  EMBEDDED_DIALER_DISABLED: 'EMBEDDED_DIALER_DISABLED',
  ACCOUNT_SETUP_INCOMPLETE: 'ACCOUNT_SETUP_INCOMPLETE',
  OTP_REQUIRED: 'OTP_REQUIRED',
  ACCOUNT_SUSPENDED: 'ACCOUNT_SUSPENDED',
  ACCOUNT_INACTIVE: 'ACCOUNT_INACTIVE',
  SUBSCRIPTION_REQUIRED: 'SUBSCRIPTION_REQUIRED',
  RATE_LIMITED: 'RATE_LIMITED',
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
  CONCURRENT_CALLS_LOCKED: 'CONCURRENT_CALLS_LOCKED',
  INVALID_CONCURRENT_CALLS: 'INVALID_CONCURRENT_CALLS',
  // Mute and keypad.
  INVALID_MUTED: 'INVALID_MUTED',
  INVALID_DIGITS: 'INVALID_DIGITS',
})

// Codes the `warning` event carries. Each is cleared by a `warning.cleared`
// with the same code; `dialer.warnings` holds the ones currently raised.
export const WARNINGS = Object.freeze({
  NOT_SIGNED_IN: 'NOT_SIGNED_IN',
  REALTIME_DISCONNECTED: 'REALTIME_DISCONNECTED',
  DEVICE_NOT_READY: 'DEVICE_NOT_READY',
  DEVICE_ERROR: 'DEVICE_ERROR',
  DEVICE_ENDPOINT_FAILED: 'DEVICE_ENDPOINT_FAILED',
  SIGNED_OUT_ELSEWHERE: 'SIGNED_OUT_ELSEWHERE',
  MIC_PERMISSION_DENIED: 'MIC_PERMISSION_DENIED',
  EMBED_NOT_ENABLED: 'EMBED_NOT_ENABLED',
  ORIGIN_NOT_ALLOWED: 'ORIGIN_NOT_ALLOWED',
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
  FRAME_RELOADED: 'FRAME_RELOADED',
  NOT_SUPPORTED: 'NOT_SUPPORTED',
  UNKNOWN: 'UNKNOWN',
})

// Commands Symbo answers before anyone is signed in. Everything else waits for
// `ready`, because there is no user to act for until then.
const PRE_READY_COMMANDS = new Set([
  COMMANDS.SIGN_IN,
  COMMANDS.SIGN_OUT,
  COMMANDS.RELOAD,
  COMMANDS.GET_STATE,
])

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

// How many lines a session can ring at once.
const MIN_CONCURRENT_CALLS = 1
const MAX_CONCURRENT_CALLS = 4
const isConcurrentCalls = (value) =>
  Number.isInteger(value) &&
  value >= MIN_CONCURRENT_CALLS &&
  value <= MAX_CONCURRENT_CALLS
const CONCURRENT_CALLS_RULE = `a whole number of lines from ${MIN_CONCURRENT_CALLS} to ${MAX_CONCURRENT_CALLS}`

// How many queued calls one session.removeQueued list may name.
const MAX_QUEUED_CALL_IDS = 1000

// Keypad digits one sendDigits may carry: 0-9, * and #, up to 32 of them.
const DTMF_DIGITS = /^[0-9*#]{1,32}$/

// The frame plays digits one at a time, this far apart, and answers once the
// last has played. Keep equal to the frame's own gap between digits.
const DTMF_GAP_MS = 200

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
// callId. Keep this above the frame's own wait for the call id; the two move
// together. A frame that first waits for its calling device to register
// shortens its wait for the call id by that time, so it stays inside this.
const DIAL_TIMEOUT_MS = 25000

// signIn, likewise: the frame can hold it up to 8 s while it checks a session
// it already has, then sign in.
const SIGN_IN_TIMEOUT_MS = 25000

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

const isNonEmptyString = (value) => typeof value === 'string' && value !== ''

const notSupported = (what, capability) =>
  new SymboDialerError(
    CLIENT_ERRORS.NOT_SUPPORTED,
    `This Symbo release does not support ${what}; check dialer.hasCapability('${capability}').`
  )

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

    // What the frame has told us about itself. Filled from `ready`; the line
    // count also follows the session events.
    this.loginUrl = null
    this.user = null
    this.organization = null
    this.capabilities = []
    this.concurrentCalls = null
    this.concurrentCallsLocked = false
    this.updateAvailable = false
    this.deviceReady = false
    this.powerDialing = false
    // Whether the rep's microphone is muted on the call they are on. Follows
    // call.muteChanged, and the answers to setMuted() and getState().
    this.muted = false
    // Digits sent and not yet answered for, which the frame plays in order.
    this.pendingDigits = 0
    // Set when reload() was answered, so the load that follows is reported
    // as asked for.
    this.reloadRequested = false
    // Set when signIn() was answered { reloading: true }: the frame reloads to
    // finish signing in. signInUnconfirmed lasts until the next ready, so a
    // run of sign-ins that never take is heard afresh once, not every time.
    this.signInReload = false
    this.signInUnconfirmed = false
    // Iframe load events seen. The first belongs to the document mount()
    // created, which may already have answered.
    this.frameLoads = 0
    this.warnings = new Map()
    // The rep's session the frame could pick up, from `ready` and getState();
    // null while one is loaded.
    this.resumableSession = null
    // Why the frame needs to reload (reload.required); it reloads by itself
    // once nothing would be cut off.
    this.reloadRequired = null
    // What the last frame.leaving said, for the frame.reloaded that follows.
    this.leavingReason = null

    this.handleMessage = this.handleMessage.bind(this)

    this.session = {
      start: (options = {}) => {
        if (!options.dialSessionId) {
          return Promise.reject(invalid('session.start needs a dialSessionId.'))
        }
        const payload = { dialSessionId: options.dialSessionId }
        if (options.concurrentCalls !== undefined) {
          if (!isConcurrentCalls(options.concurrentCalls)) {
            return Promise.reject(
              invalid(`session.start's concurrentCalls must be ${CONCURRENT_CALLS_RULE}.`)
            )
          }
          payload.concurrentCalls = options.concurrentCalls
        }
        if (options.dial !== undefined) {
          if (typeof options.dial !== 'boolean') {
            return Promise.reject(invalid("session.start's dial must be true or false."))
          }
          // An older frame ignores dial: false and starts dialing.
          if (!options.dial) {
            const refused = this.unsupported('sessionLoad', 'session.start({ dial: false })')
            if (refused) return refused
          }
          payload.dial = options.dial
        }
        return this.send(COMMANDS.SESSION_START, payload).then((result) => {
          if (isFiniteNumber(result?.concurrentCalls)) {
            this.concurrentCalls = result.concurrentCalls
          }
          return result
        })
      },
      pause: () => this.send(COMMANDS.SESSION_PAUSE),
      resume: () => this.send(COMMANDS.SESSION_RESUME),
      // Park the session without ending it; session.start picks it up again.
      hold: () => this.send(COMMANDS.SESSION_HOLD),
      end: (options = {}) => {
        // Never sent: an older frame ignores the id and ends the loaded session.
        if (options.dialSessionId !== undefined) {
          return Promise.reject(
            invalid(
              'session.end takes no dialSessionId: only the session loaded here can be ended here; end another session from your server with POST /v1/dialSessions/{id}/actions/end.'
            )
          )
        }
        return this.send(COMMANDS.SESSION_END, { force: !!options.force })
      },
      skipCurrent: () => this.send(COMMANDS.SESSION_SKIP_CURRENT),
      // One id resolves {}; a list resolves { removedCount, skipped }, where
      // skipped names the calls left alone because they are being dialed.
      removeQueued: (arg) => {
        const queuedCallIds = Array.isArray(arg) ? arg : arg?.queuedCallIds
        if (queuedCallIds !== undefined) {
          if (
            !Array.isArray(queuedCallIds) ||
            queuedCallIds.length < 1 ||
            queuedCallIds.length > MAX_QUEUED_CALL_IDS ||
            !queuedCallIds.every(isNonEmptyString)
          ) {
            return Promise.reject(
              invalid(
                `session.removeQueued needs 1 to ${MAX_QUEUED_CALL_IDS} queuedCallIds, each a non-empty string.`
              )
            )
          }
          const refused = this.unsupported('removeQueuedCalls', 'removing a list of queued calls')
          if (refused) return refused
          return this.send(COMMANDS.SESSION_REMOVE_QUEUED, {
            queuedCallIds: [...queuedCallIds],
          })
        }
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
      // Ring this many lines from the next round. Lines already ringing are
      // neither hung up nor added to. session.concurrentCallsChanged is sent
      // only when the number changes. Refused with CONCURRENT_CALLS_LOCKED
      // when the organization locks a different number; check
      // hasCapability('concurrentCalls') against an older Symbo release.
      setConcurrentCalls: (arg) => {
        const concurrentCalls =
          arg && typeof arg === 'object' ? arg.concurrentCalls : arg
        if (!isConcurrentCalls(concurrentCalls)) {
          return Promise.reject(
            invalid(`session.setConcurrentCalls needs ${CONCURRENT_CALLS_RULE}.`)
          )
        }
        return this.send(COMMANDS.SESSION_SET_CONCURRENT_CALLS, {
          concurrentCalls,
        }).then((result) => {
          if (isFiniteNumber(result?.concurrentCalls)) {
            this.concurrentCalls = result.concurrentCalls
          }
          return result
        })
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
    if (DEFAULT_SIZE[this.mode]) this.applySize(DEFAULT_SIZE[this.mode])

    this.mountPromise = new Promise((resolve, reject) => {
      this.settleMount = { resolve, reject }
      this.mountTimer = setTimeout(() => this.onMountTimeout(), this.mountTimeoutMs)
    })

    window.addEventListener('message', this.handleMessage)
    // `load` is the natural moment to (re)start asking: it fires when the
    // frame's document is done, and again after an in-frame sign-in reloads
    // it.
    iframe.addEventListener('load', () => this.onFrameLoad())
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
    this.startSayingHello({ immediate: false })

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
    if (!this.iframe || this.mode === MODES.HIDDEN) return
    if (isFiniteNumber(width) && width >= 0) this.iframe.style.width = `${width}px`
    if (isFiniteNumber(height) && height >= 0) {
      this.iframe.style.height = `${height}px`
    }
  }

  /* ------------------------------------------------------------- handshake */

  startSayingHello({ immediate = true } = {}) {
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
    // Skipped only by the mount-time call. The frame is still on about:blank
    // there, whose origin is the string "null", so a post to the origin we
    // pinned is refused and the browser logs a warning the partner cannot
    // silence. Dropping just the leading hello keeps the safety net — the
    // interval still fires if `load` never does — without that noise in
    // every partner's console.
    if (immediate) hello()
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
    this.signInUnconfirmed = false
    this.loginUrl = null

    this.user = payload.user ?? null
    this.organization = payload.organization ?? null
    this.capabilities = Array.isArray(payload.capabilities)
      ? payload.capabilities.slice()
      : []
    this.concurrentCalls = isFiniteNumber(payload.concurrentCalls)
      ? payload.concurrentCalls
      : null
    this.concurrentCallsLocked = payload.concurrentCallsLocked === true
    this.updateAvailable = payload.updateAvailable === true
    this.deviceReady = !!payload.deviceReady
    this.powerDialing = !!payload.powerDialing
    this.resumableSession = payload.resumableSession ?? null
    this.leavingReason = null

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
      case 'session.started':
      case 'session.concurrentCallsChanged':
        if (name === 'session.started') this.resumableSession = null
        if (isFiniteNumber(payload.concurrentCalls)) {
          this.concurrentCalls = payload.concurrentCalls
        }
        if (typeof payload.concurrentCallsLocked === 'boolean') {
          this.concurrentCallsLocked = payload.concurrentCallsLocked
        }
        break
      case 'update.available':
        this.updateAvailable = true
        break
      case 'call.muteChanged':
        if (typeof payload.muted === 'boolean') this.muted = payload.muted
        break
      case 'session.ended':
      case 'session.held':
        // With no session running, the count is what a new one gets when
        // nobody sets it: the lock, which it already holds, or one line.
        if (!this.concurrentCallsLocked) this.concurrentCalls = MIN_CONCURRENT_CALLS
        break
      case 'reload.required':
        this.reloadRequired = payload.reason ?? null
        break
      case 'frame.leaving':
        this.leavingReason = payload.reason ?? null
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

  rejectPending(err) {
    this.pending.forEach(({ reject, timer }) => {
      clearTimeout(timer)
      reject(err)
    })
    this.pending.clear()
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
   * that are really ringing. While a power-dial session is paused with the
   * rep's line down, this places an ordinary call.
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
    return this.send(COMMANDS.GET_STATE).then((state) => {
      if (typeof state?.muted === 'boolean') this.muted = state.muted
      if (state?.resumableSession !== undefined) {
        this.resumableSession = state.resumableSession
      }
      return state
    })
  }

  /**
   * Answer the inbound call that is ringing. `{ endCurrent: true }` first
   * ends the call the rep is on, as Symbo's "End & Accept" does; without it
   * a call in front of the rep is refused.
   */
  answerIncoming(options = {}) {
    const endCurrent = options?.endCurrent
    if (endCurrent !== undefined && typeof endCurrent !== 'boolean') {
      return Promise.reject(invalid("answerIncoming's endCurrent must be true or false."))
    }
    return this.send(COMMANDS.ANSWER_INCOMING, endCurrent ? { endCurrent: true } : {})
  }

  /**
   * Save the outcome, note or call fields of a one-off or inbound call: the
   * one waiting in its post-call step, or the call `callId` names. Resolves
   * with `{ callId, outcomeId }`; `call.completed` follows for the call that
   * was waiting. A session's call is saved with session.saveOutcome, unless a
   * reload brought it back.
   */
  saveOutcome(options = {}) {
    const given = (key) => options[key] !== undefined && options[key] !== null
    if (!['outcomeId', 'outcomeValue', 'note', 'callFields'].some(given)) {
      return Promise.reject(
        invalid('saveOutcome needs an outcomeId or outcomeValue, a note, or callFields.')
      )
    }
    if (
      given('callFields') &&
      (typeof options.callFields !== 'object' || Array.isArray(options.callFields))
    ) {
      return Promise.reject(invalid("saveOutcome's callFields must be an object."))
    }
    const payload = {}
    for (const key of ['callId', 'outcomeId', 'outcomeValue', 'note', 'callFields']) {
      if (options[key] !== undefined) payload[key] = options[key]
    }
    return this.send(COMMANDS.CALL_SAVE_OUTCOME, payload)
  }

  ignoreIncoming() {
    return this.send(COMMANDS.IGNORE_INCOMING)
  }

  /**
   * Mute (`true`) or unmute (`false`) the rep's microphone on the call they
   * are on. Resolves with `{ muted }`; `call.muteChanged` follows when that
   * changed anything. Mute lasts as long as the rep's line, as in Symbo: in a
   * power-dial session that line can outlast a conversation, and drops when
   * the rep hangs up, pauses (unless a contact is on the line) or holds, or
   * the session ends. Refused with NO_ACTIVE_CALL while the rep's line is
   * down. Check `hasCapability('mute')` against an older Symbo release, which
   * answers UNKNOWN_COMMAND.
   */
  setMuted(arg) {
    const muted = arg && typeof arg === 'object' ? arg.muted : arg
    if (typeof muted !== 'boolean') {
      return Promise.reject(invalid('setMuted needs true or false.'))
    }
    return this.send(COMMANDS.SET_MUTED, { muted }).then((result) => {
      if (typeof result?.muted === 'boolean') this.muted = result.muted
      return result
    })
  }

  /**
   * Press keypad digits on the call, for a phone menu or an extension: a
   * string of 0-9, * and #, up to 32 at a time. They go to whoever answered:
   * the call, or a session's connected contact. The frame plays them one by
   * one, 200 ms apart, and a second call waits for the first. Resolves with
   * `{ digits }` once the last has played. Refused with NO_ACTIVE_CALL while
   * nobody has answered, and when that conversation ends part-way; the
   * message says how many were played. On a Symbo call `*` is also the hold
   * key (see the README). Check `hasCapability('dtmf')` against an older
   * Symbo release, which answers UNKNOWN_COMMAND.
   */
  sendDigits(arg) {
    const digits = arg && typeof arg === 'object' ? arg.digits : arg
    if (typeof digits !== 'string' || !DTMF_DIGITS.test(digits)) {
      return Promise.reject(
        invalid('sendDigits needs 1 to 32 keypad digits: 0-9, * and #.')
      )
    }
    // The answer comes after every digit already waiting has played, then
    // these. Budget for all of them, so a long string, or presses faster than
    // the frame plays them, does not time out while it is still playing.
    this.pendingDigits += digits.length
    const timeoutMs = this.commandTimeoutMs + DTMF_GAP_MS * this.pendingDigits
    const settled = () => {
      this.pendingDigits -= digits.length
    }
    return this.send(COMMANDS.SEND_DIGITS, { digits }, { timeoutMs }).then(
      (result) => {
        settled()
        return result
      },
      (err) => {
        settled()
        throw err
      }
    )
  }

  /**
   * Sign the rep in silently with a token your server signed.
   *
   * `token` is a short-lived RS256 JWT minted for the rep who is logged into
   * YOUR app — mint it for the current session's user, never for a user id
   * read from the request body. It must carry an `organization_id` claim
   * naming the Symbo organization the rep belongs to; one profile can serve
   * several, and the claim says which. `profileId` is the sign-in profile
   * id Symbo issued you; it is not a secret.
   *
   * Resolves with `{ user }`; a `ready` event follows. Works before mount()
   * has resolved, which is the point. Sessions last 8 hours — listen for
   * `auth.required` and call this again to renew silently.
   */
  signIn(options = {}) {
    if (!options.token) {
      return Promise.reject(invalid('signIn needs the token your server signed.'))
    }
    if (!options.profileId) {
      return Promise.reject(invalid('signIn needs the profileId Symbo issued you.'))
    }
    return this.send(
      COMMANDS.SIGN_IN,
      { token: options.token, profileId: options.profileId },
      { timeoutMs: Math.max(this.commandTimeoutMs, SIGN_IN_TIMEOUT_MS) }
    ).then((result) => {
      if (result?.reloading === true && !this.signInUnconfirmed)
        this.signInReload = true
      return result
    })
  }

  /**
   * Sign the rep out of Symbo in this frame, and forget the session.
   *
   * Call it when your own user logs out, and before signing a different rep
   * in: `signIn()` while someone is signed in answers with them rather than
   * switching. Resolves with `{ signedOut }` — false when nobody was signed
   * in. The frame then reloads signed out and says `auth.required`. Refused
   * with SESSION_ACTIVE while a power-dial session is loaded (hold or end it
   * first), CALL_IN_PROGRESS
   * while a call is up or ringing, and POSTCALL_DETAILS_REQUIRED while the
   * last call's required outcome is unsaved. Check `hasCapability('signOut')`
   * against an older Symbo release, which answers UNKNOWN_COMMAND.
   */
  signOut() {
    return this.send(COMMANDS.SIGN_OUT).then((result) => {
      if (result && result.signedOut) this.forgetFrame()
      return result
    })
  }

  /**
   * Reload the frame, for a newer Symbo build (`dialer.updateAvailable`, the
   * `update.available` event) or to recover it. The frame never reloads itself
   * for a new build, so this is how it gets one. The rep stays signed in;
   * `frame.reloaded { requested: true }` and a fresh `ready` follow. Refused,
   * like signOut, with SESSION_ACTIVE, CALL_IN_PROGRESS or
   * POSTCALL_DETAILS_REQUIRED while it would cut something off. Check
   * `hasCapability('reload')` against an older Symbo release. `{ hard: true }`
   * also fetches the Symbo build afresh, for a calling device that would not
   * register; an older frame does a plain reload.
   */
  reload(options = {}) {
    const hard = options?.hard
    if (hard !== undefined && typeof hard !== 'boolean') {
      return Promise.reject(invalid("reload's hard must be true or false."))
    }
    return this.send(COMMANDS.RELOAD, hard ? { hard: true } : {}).then((result) => {
      if (result && result.reloading) {
        this.reloadRequested = true
        this.forgetFrame()
      }
      return result
    })
  }

  // The frame's document finished loading. After the first load, a frame
  // that had said `ready` loading again has reloaded — asked for, or not (the
  // rep signed out in another tab, the browser discarded it) — and lost what
  // it held: a session loaded in it, a call waiting for its outcome. Say so
  // before its new `ready`, then start the handshake again.
  onFrameLoad() {
    this.frameLoads += 1
    // The first load is the mounted document's own, even if it has already
    // spoken: nothing was reloaded.
    const ownLoad = this.frameLoads === 1 && !this.reloadRequested
    if (!ownLoad && (this.ready || this.reloadRequested)) {
      const requested = this.reloadRequested
      // Read before forgetFrame() clears it. A reload asked for needs no reason.
      const reason = requested ? null : this.leavingReason
      this.reloadRequested = false
      if (this.ready) this.forgetFrame()
      // The old document will never answer what it was asked.
      this.rejectPending(
        new SymboDialerError(
          CLIENT_ERRORS.FRAME_RELOADED,
          'The dialer reloaded before answering. Send it again after "ready".'
        )
      )
      this.emit('frame.reloaded', { requested, reason })
    }
    // The document a sign-in reloads into speaks for itself: if it says
    // auth.required, that is news, not a repeat of the one before.
    if (this.signInReload) {
      this.signInReload = false
      this.signInUnconfirmed = true
      this.authPending = false
    }
    if (!ownLoad || !this.contacted) this.startSayingHello()
  }

  // The frame has signed the rep out and is reloading. Until the new document
  // speaks, treat it as a frame we have not heard from: commands wait for it,
  // and its auth.required is news rather than a repeat. What the old document
  // told us about the rep and its warnings goes with it.
  forgetFrame() {
    this.ready = false
    this.authPending = false
    this.signInUnconfirmed = false
    this.contacted = false
    this.user = null
    this.organization = null
    this.concurrentCalls = null
    this.concurrentCallsLocked = false
    this.updateAvailable = false
    this.deviceReady = false
    this.resumableSession = null
    this.reloadRequired = null
    this.leavingReason = null
    // The reload dropped the rep's line, and with it any mute. Said, so a
    // mute button drawn from call.muteChanged does not stay pressed.
    if (this.muted) {
      this.muted = false
      this.emit('call.muteChanged', { muted: false })
    }
    for (const code of [...this.warnings.keys()]) {
      this.warnings.delete(code)
      this.emit('warning.cleared', { code })
    }
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

  // For an option an older frame would misread rather than refuse: a
  // rejection when the ready frame lacks the capability, otherwise null.
  // Before ready, send() answers NOT_READY instead. A frame without 'session'
  // (a rep with no power dialing) answers every session command itself.
  unsupported(capability, what) {
    return this.ready && this.hasCapability('session') && !this.hasCapability(capability)
      ? Promise.reject(notSupported(what, capability))
      : null
  }

  destroy() {
    window.removeEventListener('message', this.handleMessage)
    this.stopSayingHello()
    this.clearMountTimer()
    this.iframe?.remove()

    // Anything still waiting on an answer never gets one now. Reject rather
    // than leave the caller's await hanging until the timeout.
    const err = destroyedError()
    this.rejectPending(err)
    this.flushAwaitingContact(err)
    this.rejectMount(err)

    this.destroyed = true
    this.ready = false
    this.contacted = false
    this.muted = false
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
    // `hidden: false` kept its old meaning rather than picking up the new
    // default: it was written when compact was the only other mode.
    return hidden ? MODES.HIDDEN : MODES.COMPACT
  }
  // No mode at all is the original `?embed=1`: Symbo's own dialer.
  if (mode === undefined) return MODES.WIDGET
  if (!Object.values(MODES).includes(mode)) {
    throw invalid(
      `mode must be 'widget', 'compact' or 'hidden', not ${JSON.stringify(mode)}.`
    )
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
