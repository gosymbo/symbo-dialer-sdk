// Runs example/stub/dial/stub.js inside a vm sandbox and wires it to a client
// mounted on the fake DOM: what the SDK posts into the iframe reaches the
// stub's message listener, and what the stub posts to `parent` reaches the
// SDK's window listener, with origins and sources set the way a browser would.
//
// This is how the stub is exercised without a browser. It also makes the stub
// a second, executable statement of the contract: a session replayed through
// it has to produce the events the SDK delivers under the names the SDK
// exposes.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

const STUB_PATH = fileURLToPath(new URL('../../example/stub/dial/stub.js', import.meta.url))
const STUB_ORIGIN = 'http://localhost:3000'
const PARTNER_ORIGIN = 'http://localhost:3000'

export function loadStub(env, dialer, { signedIn = true, mode = 'compact' } = {}) {
  const iframe = dialer.iframe
  const stubListeners = []
  const storage = new Map(signedIn ? [['symbo-stub:signedIn', '1']] : [])
  const broadcast = []
  const reloads = []
  const opened = []

  const elements = new Map()
  const element = (id) => {
    if (!elements.has(id)) {
      elements.set(id, {
        id,
        textContent: '',
        className: '',
        listeners: {},
        addEventListener(type, fn) {
          this.listeners[type] = fn
        },
        click() {
          this.listeners.click?.()
        },
      })
    }
    return elements.get(id)
  }

  const sandbox = {
    console,
    setTimeout,
    clearTimeout,
    Math,
    Date,
    String,
    Object,
    Map,
    Set,
    Array,
    RegExp,
    JSON,
    URL,
    URLSearchParams,
    location: { search: `?embed=1&mode=${mode}`, href: `${STUB_ORIGIN}/example/stub/dial/`, reload: () => reloads.push(1) },
    localStorage: {
      getItem: (k) => storage.get(k) ?? null,
      setItem: (k, v) => storage.set(k, String(v)),
      removeItem: (k) => storage.delete(k),
    },
    parent: {
      postMessage(data, targetOrigin) {
        // What the stub sends must be structured-cloneable; JSON round-trip
        // catches a function or a Map slipping into a payload.
        const cloned = JSON.parse(JSON.stringify(data))
        env.deliver(iframe, cloned, { origin: STUB_ORIGIN })
        broadcast.push({ data: cloned, targetOrigin })
      },
    },
    addEventListener(type, fn) {
      if (type === 'message') stubListeners.push(fn)
    },
    BroadcastChannel: class {
      addEventListener() {}
      postMessage() {}
    },
    document: {
      getElementById: element,
      body: { innerHTML: '' },
    },
    window: { open: (url) => opened.push(url) },
  }
  sandbox.globalThis = sandbox
  sandbox.window.open = sandbox.window.open

  // The SDK posts into the iframe's contentWindow; route that into the stub.
  iframe.contentWindow.postMessage = (data, targetOrigin) => {
    iframe.posted.push({ data, targetOrigin })
    const cloned = JSON.parse(JSON.stringify(data))
    stubListeners.forEach((fn) => fn({ data: cloned, origin: PARTNER_ORIGIN }))
  }

  vm.runInNewContext(readFileSync(STUB_PATH, 'utf8'), sandbox, { filename: STUB_PATH })

  return {
    sent: broadcast,
    sentOfType: (type) => broadcast.filter((m) => m.data.type === type).map((m) => m.data.payload),
    element,
    storage,
    reloads,
    opened,
    poke: (type) => stubListeners.forEach((fn) => fn({ data: { type }, origin: PARTNER_ORIGIN })),
  }
}
