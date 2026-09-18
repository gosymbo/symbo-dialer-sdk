// A hand-rolled stand-in for the four things the SDK touches in a browser:
// document.createElement('iframe'), window.addEventListener('message'),
// window.open, and the iframe's contentWindow.postMessage.
//
// Deliberately not jsdom. What the tests need is to see every message the SDK
// posts into the frame and to play Symbo's replies back at it, with the
// origin and source checks intact — a few dozen lines of double do that
// without a DOM implementation in the dev dependencies.

export const APP_URL = 'https://app.symbo.ai'

export function installFakeDom({ openResult = 'window' } = {}) {
  const messageListeners = new Set()
  const iframes = []
  const opened = []
  let openReturns = openResult

  const createIframe = () => {
    const listeners = new Map()
    const posted = []
    const iframe = {
      tagName: 'IFRAME',
      src: '',
      title: '',
      allow: '',
      style: {},
      attributes: {},
      parent: null,
      removed: false,
      posted,
      contentWindow: {
        postMessage: (data, targetOrigin) => posted.push({ data, targetOrigin }),
      },
      setAttribute(name, value) {
        this.attributes[name] = String(value)
      },
      getAttribute(name) {
        return this.attributes[name] ?? null
      },
      addEventListener(type, fn) {
        if (!listeners.has(type)) listeners.set(type, [])
        listeners.get(type).push(fn)
      },
      dispatch(type) {
        ;(listeners.get(type) || []).forEach((fn) => fn({ type }))
      },
      remove() {
        this.removed = true
        if (this.parent) {
          this.parent.children = this.parent.children.filter((c) => c !== this)
        }
      },
    }
    return iframe
  }

  globalThis.document = {
    createElement(tag) {
      if (tag !== 'iframe') throw new Error(`fake DOM only makes iframes, not ${tag}`)
      const el = createIframe()
      iframes.push(el)
      return el
    },
  }

  globalThis.window = {
    addEventListener(type, fn) {
      if (type === 'message') messageListeners.add(fn)
    },
    removeEventListener(type, fn) {
      messageListeners.delete(fn)
    },
    open(url, target, features) {
      opened.push({ url, target, features })
      return openReturns === 'window' ? { closed: false } : null
    },
  }

  const makeContainer = () => ({
    children: [],
    appendChild(el) {
      this.children.push(el)
      el.parent = this
    },
  })

  // Deliver a message as if the frame had posted it.
  const deliver = (
    iframe,
    data,
    { origin = APP_URL, source = iframe.contentWindow } = {}
  ) => {
    ;[...messageListeners].forEach((fn) => fn({ origin, source, data }))
  }

  return {
    iframes,
    opened,
    messageListeners,
    makeContainer,
    deliver,
    setOpenResult: (value) => (openReturns = value),
    uninstall() {
      delete globalThis.document
      delete globalThis.window
    },
  }
}

// Plays the Symbo side of the protocol against one mounted client.
export function fakeSymbo(env, dialer) {
  const iframe = () => dialer.iframe
  const posted = () => iframe().posted

  const commandsOf = (type) =>
    posted()
      .map((p) => p.data)
      .filter((d) => d.type === type)

  return {
    iframe,
    posted,
    commandsOf,
    lastCommand: () => posted()[posted().length - 1]?.data,
    load: () => iframe().dispatch('load'),
    event: (type, payload = {}) =>
      env.deliver(iframe(), { type, payload, protocolVersion: 2 }),
    ready: (payload = {}) =>
      env.deliver(iframe(), {
        type: 'symbo:ready',
        payload: {
          protocolVersion: 2,
          user: { id: 'u-1', name: 'Sam Rep', email: 'sam@example.test' },
          organization: { id: 'o-1', name: 'Acme' },
          mode: 'compact',
          capabilities: ['session', 'inbound', 'audioDevices', 'signIn'],
          deviceReady: true,
          powerDialing: true,
          concurrentCalls: 2,
          ...payload,
        },
        protocolVersion: 2,
      }),
    authRequired: (loginUrl = 'https://app.symbo.ai/login?guest=abc') =>
      env.deliver(iframe(), {
        type: 'symbo:auth.required',
        payload: { loginUrl },
        protocolVersion: 2,
      }),
    answer: (requestId, data) =>
      env.deliver(iframe(), {
        type: 'symbo:result',
        payload: { requestId, ok: true, data },
        protocolVersion: 2,
      }),
    refuse: (requestId, code, message) =>
      env.deliver(iframe(), {
        type: 'symbo:result',
        payload: { requestId, ok: false, error: { code, message } },
        protocolVersion: 2,
      }),
  }
}

// Mount a client and walk it to ready, so a test can start from a dialer that
// can take commands.
export async function readyDialer(env, SymboDialer, options = {}) {
  const dialer = SymboDialer.create({
    container: env.makeContainer(),
    appUrl: APP_URL,
    ...options,
  })
  const mounting = dialer.mount()
  const symbo = fakeSymbo(env, dialer)
  symbo.load()
  symbo.ready()
  await mounting
  return { dialer, symbo }
}
