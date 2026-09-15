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

export const PROTOCOL_VERSION = 2

const DEFAULT_APP_URL = 'https://app.symbo.ai'

export const COMMANDS = {
  HELLO: 'symbo:hello',
  DIAL: 'symbo:dial',
  HANG_UP: 'symbo:hangUp',
  SET_CONTACT: 'symbo:setContact',
}

// Symbo's answer to a command. Not a public event — it settles the promise the
// command returned and is never delivered to an on() handler. Exported so the
// contract test can pin it alongside the commands and events.
export const RESULT = 'symbo:result'

// How long to wait for that answer before giving up. Only reachable if Symbo
// fails to reply at all; a refusal comes back fast.
const COMMAND_TIMEOUT_MS = 15000

// How often to repeat the opening hello until Symbo answers.
//
// The handshake has no recovery: Symbo records the origin that said hello and
// replies to it, and a hello that arrives before its listener is attached is
// dropped with nothing to retry it. The iframe's `load` event is not a reliable
// moment to speak — it fires when the document is done, which can beat the
// application's own startup on a cold cache. So keep saying it until we are
// heard, and stop the moment we are.
const HELLO_RETRY_MS = 400

export const EVENTS = {
  READY: 'symbo:ready',
  AUTH_REQUIRED: 'symbo:auth.required',
  CALL_STARTED: 'symbo:call.started',
  CALL_INCOMING: 'symbo:call.incoming',
  CALL_ANSWERED: 'symbo:call.answered',
  CALL_ENDED: 'symbo:call.ended',
  CALL_COMPLETED: 'symbo:call.completed',
  CONTACT_MATCHED: 'symbo:contact.matched',
  RESIZE: 'symbo:resize',
  ERROR: 'symbo:error',
}

// The public event names, minus the namespace: callers write
// dialer.on('call.ended'), not dialer.on('symbo:call.ended').
const publicName = (type) => type.replace(/^symbo:/, '')

export class SymboDialerError extends Error {
  constructor(code, message) {
    super(message || code)
    this.name = 'SymboDialerError'
    this.code = code
  }
}

class SymboDialerClient {
  constructor({ container, appUrl, mountTimeoutMs }) {
    this.appUrl = (appUrl || DEFAULT_APP_URL).replace(/\/$/, '')
    this.origin = new URL(this.appUrl).origin
    this.container = container
    this.mountTimeoutMs = mountTimeoutMs ?? 30000

    this.iframe = null
    this.helloTimer = null
    this.listeners = new Map()
    this.pending = new Map()
    this.requestSeq = 0
    this.ready = false
    this.destroyed = false

    this.handleMessage = this.handleMessage.bind(this)
  }

  mount() {
    const iframe = document.createElement('iframe')
    iframe.src = `${this.appUrl}/dial?embed=1`
    iframe.title = 'Symbo dialer'
    // Without this the dialer cannot reach the microphone: a cross-origin
    // frame only gets it when the embedding page delegates it.
    iframe.allow = 'microphone'
    iframe.style.border = '0'
    iframe.style.width = '420px'
    iframe.style.height = '485px'

    this.iframe = iframe
    window.addEventListener('message', this.handleMessage)
    this.container.appendChild(iframe)

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.stopSayingHello()
        // Usually a wrong appUrl, an unreachable environment, or a Symbo
        // build without the embed surface. Name those, so nobody starts by
        // debugging their own code.
        reject(
          new SymboDialerError(
            'MOUNT_TIMEOUT',
            `The dialer at ${this.appUrl} did not respond. Check the appUrl is reachable and that it supports embedding.`
          )
        )
      }, this.mountTimeoutMs)

      // `once` so a later re-ready (the user signs out and back in) doesn't
      // try to resolve a settled promise.
      this.once(publicName(EVENTS.READY), () => {
        clearTimeout(timer)
        this.stopSayingHello()
        this.ready = true
        resolve(this)
      })

      // auth.required is also an answer: Symbo heard us and is waiting on a
      // sign-in. Stop repeating, or we would keep asking through however long
      // the user takes to log in.
      this.once(publicName(EVENTS.AUTH_REQUIRED), () => this.stopSayingHello())

      iframe.addEventListener('load', () => this.startSayingHello())
    })
  }

  /* ------------------------------------------------------------- handshake */

  startSayingHello() {
    const hello = () =>
      this.iframe?.contentWindow?.postMessage(
        { type: COMMANDS.HELLO, payload: {}, protocolVersion: PROTOCOL_VERSION },
        this.origin
      )

    hello()
    this.stopSayingHello()
    this.helloTimer = setInterval(hello, HELLO_RETRY_MS)
  }

  stopSayingHello() {
    if (this.helloTimer) clearInterval(this.helloTimer)
    this.helloTimer = null
  }

  /* ---------------------------------------------------------------- events */

  on(event, handler) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set())
    this.listeners.get(event).add(handler)

    return () => this.off(event, handler)
  }

  once(event, handler) {
    const wrapped = (payload) => {
      this.off(event, wrapped)
      handler(payload)
    }
    return this.on(event, wrapped)
  }

  off(event, handler) {
    this.listeners.get(event)?.delete(handler)
  }

  emit(event, payload) {
    this.listeners.get(event)?.forEach((handler) => {
      try {
        handler(payload)
      } catch (err) {
        // One partner's broken handler must not stop the others, or stop us
        // processing the next message.
        console.error(`[symbo] listener for "${event}" threw`, err)
      }
    })
  }

  handleMessage(event) {
    if (this.destroyed) return
    if (event.origin !== this.origin) return
    if (event.source !== this.iframe?.contentWindow) return

    const data = event.data
    if (!data || typeof data.type !== 'string') return

    if (data.type === RESULT) {
      this.settle(data.payload || {})
      return
    }

    if (!Object.values(EVENTS).includes(data.type)) return

    this.emit(publicName(data.type), data.payload || {})
  }

  /* -------------------------------------------------------------- commands */

  /**
   * Settle the promise a command returned.
   *
   * Symbo answers every command with exactly one of these. A refusal rejects,
   * so the blockers that stop a dial — no outcome saved on the last call, the
   * dialer not set up, calling not enabled — reach the caller as a catch on
   * the dial() they wrote, rather than as an event they had to know to listen
   * for.
   */
  settle({ requestId, ok, code, message }) {
    const entry = this.pending.get(requestId)
    if (!entry) return

    this.pending.delete(requestId)
    clearTimeout(entry.timer)

    if (ok) entry.resolve()
    else entry.reject(new SymboDialerError(code || 'UNKNOWN', message))
  }

  send(type, payload = {}) {
    if (this.destroyed) {
      return Promise.reject(
        new SymboDialerError('DESTROYED', 'This dialer has been destroyed.')
      )
    }
    if (!this.ready) {
      return Promise.reject(
        new SymboDialerError(
          'NOT_READY',
          'The dialer is not ready yet. Wait for mount() to resolve, or for the "ready" event.'
        )
      )
    }

    const requestId = `r${++this.requestSeq}`

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId)
        reject(
          new SymboDialerError(
            'COMMAND_TIMEOUT',
            `Symbo did not answer "${publicName(type)}" within ${COMMAND_TIMEOUT_MS}ms.`
          )
        )
      }, COMMAND_TIMEOUT_MS)

      this.pending.set(requestId, { resolve, reject, timer })

      this.iframe.contentWindow.postMessage(
        { type, payload, requestId, protocolVersion: PROTOCOL_VERSION },
        this.origin
      )
    })
  }

  dial(options = {}) {
    return this.send(COMMANDS.DIAL, options)
  }

  hangUp() {
    return this.send(COMMANDS.HANG_UP)
  }

  setContact(options = {}) {
    return this.send(COMMANDS.SET_CONTACT, options)
  }

  destroy() {
    window.removeEventListener('message', this.handleMessage)
    this.stopSayingHello()
    this.iframe?.remove()

    // Anything still waiting on an answer never gets one now. Reject rather
    // than leave the caller's await hanging until the timeout.
    this.pending.forEach(({ reject, timer }) => {
      clearTimeout(timer)
      reject(
        new SymboDialerError('DESTROYED', 'This dialer has been destroyed.')
      )
    })
    this.pending.clear()

    this.destroyed = true
    this.ready = false
    this.iframe = null
    this.listeners.clear()
  }
}

export const SymboDialer = {
  /**
   * Mount the dialer into `container` and resolve once it can place calls.
   *
   * Resolution waits on a signed-in dialer, so a first-time user has to
   * complete sign-in inside the frame before this settles. Listen for
   * `auth.required` if you need to react to that sooner — for instance to
   * expand a dialer your layout keeps collapsed.
   */
  mount(options = {}) {
    if (!options.container) {
      throw new SymboDialerError(
        'INVALID_OPTIONS',
        'container is required and must be a DOM element.'
      )
    }

    return new SymboDialerClient(options).mount()
  },
}

export default SymboDialer
