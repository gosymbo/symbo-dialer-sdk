import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

import {
  COMMANDS,
  EVENTS,
  ERRORS,
  WARNINGS,
  CLIENT_ERRORS,
  MODES,
  RESULT,
  PROTOCOL_VERSION,
  SymboDialer,
  SymboDialerError,
} from '../src/index.js'

import {
  APP_URL,
  installFakeDom,
  fakeSymbo,
  readyDialer,
} from './helpers/fakeDom.js'

// -----------------------------------------------------------------------------
// The contract, written out longhand.
//
// This package and the Symbo application each declare these names separately —
// that is the cost of the SDK not depending on the app. Drift between the two
// is silent: both sides keep working while a partner stops receiving an event
// nobody noticed was renamed.
//
// So neither side is allowed to change quietly. This literal is duplicated in
// symbo-ui (src/services/stateful/dialer/embed/protocol.js, pinned by
// tests/services/stateful/dialer/embedContract.test.js). Editing the protocol
// on either side fails that side's build until the literal is updated, and
// updating the literal is the moment you are meant to remember the other
// repository exists.
//
// Adding an event or an optional payload field is additive and does not bump
// PROTOCOL_VERSION. Removing a message, renaming one, or changing what a
// payload field means does.
// -----------------------------------------------------------------------------
const CONTRACT = Object.freeze({
  version: 2,
  commands: {
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
  },
  events: {
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
  },
  errors: [
    'NOT_SIGNED_IN',
    'CALLING_NOT_ENABLED',
    'INVALID_NUMBER',
    'CALL_IN_PROGRESS',
    'UNKNOWN_COMMAND',
    'POSTCALL_DETAILS_REQUIRED',
    'NEEDS_SETUP',
    'EMBED_NOT_ENABLED',
    'ORIGIN_NOT_ALLOWED',
    'HIJACK_MODE',
    'DEVICE_NOT_READY',
    'MIC_PERMISSION_DENIED',
    'PROSPECT_NOT_FOUND',
    'NO_ACTIVE_CALL',
    'NO_INCOMING_CALL',
    'SESSION_ACTIVE',
    'AUDIO_DEVICE_NOT_FOUND',
    'SIGN_IN_CODE_INVALID',
    'SIGN_IN_CODE_EXPIRED',
    'POWER_DIALING_NOT_ENABLED',
    'REALTIME_DISCONNECTED',
    'NO_ACTIVE_SESSION',
    'SESSION_ALREADY_ACTIVE',
    'SESSION_NOT_FOUND',
    'SESSION_NOT_STARTABLE',
    'OUTCOME_PENDING',
    'OUTCOME_UNKNOWN',
    'NOTE_REQUIRED',
    'NO_CALL_TO_SAVE',
    'QUEUED_CALL_NOT_FOUND',
    'QUEUED_CALL_DIALING',
  ],
  warnings: [
    'NOT_SIGNED_IN',
    'REALTIME_DISCONNECTED',
    'DEVICE_NOT_READY',
    'DEVICE_ERROR',
    'MIC_PERMISSION_DENIED',
    'EMBED_NOT_ENABLED',
    'POWER_DIALING_NOT_ENABLED',
    'HIJACK_MODE',
  ],
  // Not an event: Symbo's answer to one command, carrying back its requestId.
  // It settles the promise the command returned and never reaches an on()
  // handler, which is why it is pinned separately from the events above.
  result: 'symbo:result',
})

describe('wire protocol', () => {
  it('matches the pinned protocol version', () => {
    expect(PROTOCOL_VERSION).toBe(CONTRACT.version)
  })

  it('matches the pinned command names', () => {
    expect(COMMANDS).toEqual(CONTRACT.commands)
  })

  it('matches the pinned event names', () => {
    expect(EVENTS).toEqual(CONTRACT.events)
  })

  it('matches the pinned error codes', () => {
    expect(Object.keys(ERRORS).sort()).toEqual([...CONTRACT.errors].sort())
    Object.entries(ERRORS).forEach(([key, value]) => expect(value).toBe(key))
  })

  it('matches the pinned warning codes', () => {
    expect(Object.keys(WARNINGS).sort()).toEqual([...CONTRACT.warnings].sort())
    Object.entries(WARNINGS).forEach(([key, value]) => expect(value).toBe(key))
  })

  it('matches the pinned result message', () => {
    expect(RESULT).toBe(CONTRACT.result)
  })

  it('keeps the protocol at version 2: every change above is additive', () => {
    // The first release's surface, which a 0.1.x integration depends on.
    const v2Commands = ['symbo:hello', 'symbo:dial', 'symbo:hangUp', 'symbo:setContact']
    const v2Events = [
      'symbo:ready',
      'symbo:auth.required',
      'symbo:call.started',
      'symbo:call.incoming',
      'symbo:call.answered',
      'symbo:call.ended',
      'symbo:call.completed',
      'symbo:contact.matched',
      'symbo:resize',
      'symbo:error',
    ]
    v2Commands.forEach((c) => expect(Object.values(COMMANDS)).toContain(c))
    v2Events.forEach((e) => expect(Object.values(EVENTS)).toContain(e))
  })

  // The result is not an event. If it ever leaks into EVENTS it would be
  // delivered to on() handlers as well as settling a promise, and a partner
  // would see every command answered twice.
  it('keeps the result out of the public events', () => {
    expect(Object.values(EVENTS)).not.toContain(RESULT)
  })

  // A name without the namespace would collide with the application's older,
  // separate postMessage surface. Keep the two disjoint.
  it('namespaces every message', () => {
    const names = [...Object.values(COMMANDS), ...Object.values(EVENTS), RESULT]

    expect(names.length).toBeGreaterThan(0)
    names.forEach((name) => expect(name.startsWith('symbo:')).toBe(true))
  })

  it('gives every message a distinct name', () => {
    const names = [...Object.values(COMMANDS), ...Object.values(EVENTS), RESULT]
    expect(new Set(names).size).toBe(names.length)
  })

  // A code raised locally must never be mistaken for one Symbo answered with.
  it('keeps client-side codes disjoint from the wire codes', () => {
    Object.values(CLIENT_ERRORS).forEach((code) =>
      expect(ERRORS).not.toHaveProperty(code)
    )
  })
})

/* -------------------------------------------------------------------------- */

describe('create and mount', () => {
  let env

  beforeEach(() => {
    vi.useFakeTimers()
    env = installFakeDom()
  })

  afterEach(() => {
    env.uninstall()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('refuses to create without a container rather than failing later', () => {
    expect(() => SymboDialer.create({})).toThrow(SymboDialerError)
    expect(() => SymboDialer.create({})).toThrow(/container is required/)
    expect(() => SymboDialer.mount({})).toThrow(/container is required/)
  })

  it('reports a usable code on the error it throws', () => {
    try {
      SymboDialer.mount({})
    } catch (err) {
      expect(err.code).toBe(CLIENT_ERRORS.INVALID_OPTIONS)
      expect(err.name).toBe('SymboDialerError')
    }
  })

  it('refuses an unknown mode and a malformed appUrl', () => {
    const container = env.makeContainer()
    expect(() => SymboDialer.create({ container, mode: 'popup' })).toThrow(
      /mode must be/
    )
    expect(() =>
      SymboDialer.create({ container, appUrl: 'not a url' })
    ).toThrow(/appUrl must be an origin/)
  })

  it('create() returns a client that has not touched the page yet', () => {
    const container = env.makeContainer()
    const dialer = SymboDialer.create({ container, appUrl: APP_URL })

    expect(dialer.iframe).toBeNull()
    expect(container.children).toHaveLength(0)
    expect(env.messageListeners.size).toBe(0)
    expect(dialer.ready).toBe(false)

    // Listeners can be attached before mount — that is what create() is for.
    const handler = vi.fn()
    expect(typeof dialer.on('auth.required', handler)).toBe('function')
  })

  it('mount() builds the iframe with the frame URL, the permissions and the origin pinned', () => {
    const container = env.makeContainer()
    const dialer = SymboDialer.create({ container, appUrl: `${APP_URL}/` })
    const promise = dialer.mount()

    const iframe = dialer.iframe
    expect(container.children).toEqual([iframe])
    expect(iframe.src).toBe(`${APP_URL}/dial?embed=1&mode=compact`)
    expect(iframe.allow).toBe('microphone; autoplay')
    expect(iframe.title).toBe('Symbo dialer')
    expect(dialer.origin).toBe(APP_URL)

    // Calling it again is harmless: same iframe, same promise.
    expect(dialer.mount()).toBe(promise)
    expect(container.children).toHaveLength(1)
  })

  it('SymboDialer.mount() is create().mount()', async () => {
    const container = env.makeContainer()
    const mounting = SymboDialer.mount({ container, appUrl: APP_URL })
    const iframe = env.iframes[0]

    iframe.dispatch('load')
    env.deliver(iframe, {
      type: 'symbo:ready',
      payload: { protocolVersion: 2, user: { id: 'u-1' } },
    })

    const dialer = await mounting
    expect(dialer.iframe).toBe(iframe)
    expect(dialer.ready).toBe(true)
    expect(dialer.user).toEqual({ id: 'u-1' })
  })

  it('says hello on load, pinned to the origin, and repeats until Symbo answers', async () => {
    const dialer = SymboDialer.create({
      container: env.makeContainer(),
      appUrl: APP_URL,
    })
    const mounting = dialer.mount()
    const symbo = fakeSymbo(env, dialer)

    expect(symbo.posted()).toHaveLength(0)
    symbo.load()

    expect(symbo.posted()).toHaveLength(1)
    expect(symbo.posted()[0].targetOrigin).toBe(APP_URL)
    expect(symbo.posted()[0].data).toEqual({
      type: COMMANDS.HELLO,
      payload: { protocolVersion: PROTOCOL_VERSION },
      protocolVersion: PROTOCOL_VERSION,
    })

    await vi.advanceTimersByTimeAsync(1000)
    expect(symbo.commandsOf(COMMANDS.HELLO)).toHaveLength(3)

    symbo.ready()
    await mounting
    await vi.advanceTimersByTimeAsync(2000)
    expect(symbo.commandsOf(COMMANDS.HELLO)).toHaveLength(3)
  })

  it('does not leave the hello loop running when the frame answers on the spot', async () => {
    const dialer = SymboDialer.create({
      container: env.makeContainer(),
      appUrl: APP_URL,
    })
    const mounting = dialer.mount()
    const symbo = fakeSymbo(env, dialer)

    // A frame whose listener is already attached replies inside the same
    // tick as the hello it heard.
    dialer.iframe.contentWindow.postMessage = (data, targetOrigin) => {
      dialer.iframe.posted.push({ data, targetOrigin })
      if (data.type === COMMANDS.HELLO) symbo.ready()
    }
    symbo.load()
    await mounting

    await vi.advanceTimersByTimeAsync(3000)
    expect(symbo.commandsOf(COMMANDS.HELLO)).toHaveLength(1)
  })

  it('stops the hello loop on auth.required too, and restarts it when the frame reloads', async () => {
    const dialer = SymboDialer.create({
      container: env.makeContainer(),
      appUrl: APP_URL,
    })
    dialer.mount()
    const symbo = fakeSymbo(env, dialer)

    symbo.load()
    symbo.authRequired()
    await vi.advanceTimersByTimeAsync(2000)
    expect(symbo.commandsOf(COMMANDS.HELLO)).toHaveLength(1)

    // The in-frame sign-in reloads the frame: load fires again, we must ask
    // again, and an auth.required repeat must stop us again.
    symbo.load()
    expect(symbo.commandsOf(COMMANDS.HELLO)).toHaveLength(2)
    symbo.authRequired()
    await vi.advanceTimersByTimeAsync(2000)
    expect(symbo.commandsOf(COMMANDS.HELLO)).toHaveLength(2)
  })

  it('rejects with MOUNT_TIMEOUT when the frame never answers', async () => {
    const dialer = SymboDialer.create({
      container: env.makeContainer(),
      appUrl: APP_URL,
      mountTimeoutMs: 5000,
    })
    const mounting = dialer.mount()
    fakeSymbo(env, dialer).load()

    const settled = vi.fn()
    mounting.catch(settled)

    await vi.advanceTimersByTimeAsync(4999)
    expect(settled).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1)
    expect(settled).toHaveBeenCalledTimes(1)
    const err = settled.mock.calls[0][0]
    expect(err).toBeInstanceOf(SymboDialerError)
    expect(err.code).toBe(CLIENT_ERRORS.MOUNT_TIMEOUT)
    expect(err.message).toContain(APP_URL)
  })

  it('stops the mount timer on auth.required and resolves on the ready that follows', async () => {
    const dialer = SymboDialer.create({
      container: env.makeContainer(),
      appUrl: APP_URL,
      mountTimeoutMs: 5000,
    })
    const mounting = dialer.mount()
    const symbo = fakeSymbo(env, dialer)
    const settled = vi.fn()
    mounting.then(settled, settled)

    symbo.load()
    symbo.authRequired()

    // A user can take as long as they like over a sign-in.
    await vi.advanceTimersByTimeAsync(60000)
    expect(settled).not.toHaveBeenCalled()

    symbo.ready()
    expect(await mounting).toBe(dialer)
    expect(dialer.ready).toBe(true)
  })

  it('delivers auth.required once per unauthenticated state, dropping repeats', async () => {
    const dialer = SymboDialer.create({
      container: env.makeContainer(),
      appUrl: APP_URL,
    })
    const mounting = dialer.mount()
    const symbo = fakeSymbo(env, dialer)
    const handler = vi.fn()
    dialer.on('auth.required', handler)

    symbo.load()
    symbo.authRequired('https://app.symbo.ai/login?guest=one')
    symbo.authRequired('https://app.symbo.ai/login?guest=two')
    symbo.authRequired('https://app.symbo.ai/login?guest=two')

    expect(handler).toHaveBeenCalledTimes(1)
    expect(handler).toHaveBeenCalledWith({
      loginUrl: 'https://app.symbo.ai/login?guest=one',
    })
    // The freshest URL is kept for openSignIn(), even when the event is not
    // repeated.
    expect(dialer.loginUrl).toBe('https://app.symbo.ai/login?guest=two')

    // After ready, a new auth.required is a session expiring: not a repeat.
    symbo.ready()
    await mounting
    expect(dialer.loginUrl).toBeNull()

    symbo.authRequired('https://app.symbo.ai/login?guest=three')
    expect(handler).toHaveBeenCalledTimes(2)
    expect(dialer.ready).toBe(false)
  })

  it('openSignIn() opens the login tab from auth.required, and says so when there is none', () => {
    const dialer = SymboDialer.create({
      container: env.makeContainer(),
      appUrl: APP_URL,
    })
    dialer.mount()
    const symbo = fakeSymbo(env, dialer)

    expect(() => dialer.openSignIn()).toThrow(SymboDialerError)
    try {
      dialer.openSignIn()
    } catch (err) {
      expect(err.code).toBe(CLIENT_ERRORS.NO_LOGIN_URL)
    }

    symbo.load()
    symbo.authRequired('https://app.symbo.ai/login?guest=abc')

    const tab = dialer.openSignIn()
    expect(tab).toBeTruthy()
    expect(env.opened).toEqual([
      {
        url: 'https://app.symbo.ai/login?guest=abc',
        target: '_blank',
        features: 'noopener',
      },
    ])

    env.setOpenResult(null)
    try {
      dialer.openSignIn()
      throw new Error('should have thrown')
    } catch (err) {
      expect(err.code).toBe(CLIENT_ERRORS.POPUP_BLOCKED)
    }
  })

  it('signIn() works before ready and waits for the frame to speak before posting', async () => {
    const dialer = SymboDialer.create({
      container: env.makeContainer(),
      appUrl: APP_URL,
    })
    const mounting = dialer.mount()
    const symbo = fakeSymbo(env, dialer)

    const signingIn = dialer.signIn({ code: 'abc123' })
    symbo.load()
    // Nothing but hello has gone out: the frame has not said it is listening.
    expect(symbo.commandsOf(COMMANDS.SIGN_IN)).toHaveLength(0)

    symbo.authRequired()
    const [sent] = symbo.commandsOf(COMMANDS.SIGN_IN)
    expect(sent.payload).toEqual({ code: 'abc123' })
    expect(sent.requestId).toBeTruthy()

    symbo.answer(sent.requestId, { user: { id: 'u-1' } })
    expect(await signingIn).toEqual({ user: { id: 'u-1' } })

    symbo.ready()
    await mounting
  })

  it('signIn() without a code, and non-pre-ready commands before ready, are refused locally', async () => {
    const dialer = SymboDialer.create({
      container: env.makeContainer(),
      appUrl: APP_URL,
    })

    await expect(dialer.dial({ number: '+1' })).rejects.toMatchObject({
      code: CLIENT_ERRORS.NOT_MOUNTED,
    })

    dialer.mount()
    fakeSymbo(env, dialer).load()

    await expect(dialer.signIn({})).rejects.toMatchObject({
      code: CLIENT_ERRORS.INVALID_OPTIONS,
    })
    await expect(dialer.dial({ number: '+1' })).rejects.toMatchObject({
      code: CLIENT_ERRORS.NOT_READY,
    })
    await expect(dialer.session.start({ dialSessionId: 's' })).rejects.toMatchObject({
      code: CLIENT_ERRORS.NOT_READY,
    })
  })

  it('a pre-ready command waiting on a silent frame fails with the mount timeout', async () => {
    const dialer = SymboDialer.create({
      container: env.makeContainer(),
      appUrl: APP_URL,
      mountTimeoutMs: 1000,
    })
    const mounting = dialer.mount()
    mounting.catch(() => {})
    const rejected = expect(dialer.getState()).rejects.toMatchObject({
      code: CLIENT_ERRORS.MOUNT_TIMEOUT,
    })

    await vi.advanceTimersByTimeAsync(1000)
    await rejected
  })

  it('exposes what ready says about the user, the organisation and the surface', async () => {
    const { dialer } = await readyDialer(env, SymboDialer)

    expect(dialer.user).toEqual({ id: 'u-1', name: 'Sam Rep', email: 'sam@example.test' })
    expect(dialer.organization).toEqual({ id: 'o-1', name: 'Acme' })
    expect(dialer.capabilities).toEqual(['session', 'inbound', 'audioDevices', 'signIn'])
    expect(dialer.hasCapability('session')).toBe(true)
    expect(dialer.hasCapability('sms')).toBe(false)
    expect(dialer.concurrentCalls).toBe(2)
    expect(dialer.deviceReady).toBe(true)
    expect(dialer.powerDialing).toBe(true)
    expect(dialer.mode).toBe(MODES.COMPACT)
  })

  it('maps the deprecated hidden option onto mode: hidden, with a warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const dialer = SymboDialer.create({
      container: env.makeContainer(),
      appUrl: APP_URL,
      hidden: true,
    })
    expect(dialer.mode).toBe(MODES.HIDDEN)
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('deprecated'))
  })

  it('ignores messages from another origin, another window, or of unknown shape', async () => {
    const { dialer, symbo } = await readyDialer(env, SymboDialer)
    const handler = vi.fn()
    dialer.on('call.started', handler)

    const message = { type: 'symbo:call.started', payload: { callId: 'c-1' } }
    env.deliver(symbo.iframe(), message, { origin: 'https://evil.example' })
    env.deliver(symbo.iframe(), message, { source: {} })
    env.deliver(symbo.iframe(), 'not an object')
    env.deliver(symbo.iframe(), { type: 'symbo:not.a.thing', payload: {} })
    expect(handler).not.toHaveBeenCalled()

    env.deliver(symbo.iframe(), message)
    expect(handler).toHaveBeenCalledWith({ callId: 'c-1' })
  })

  it('offers a wildcard listener and survives a listener that throws', async () => {
    const { dialer, symbo } = await readyDialer(env, SymboDialer)
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const all = vi.fn()
    const after = vi.fn()

    dialer.on('*', all)
    dialer.on('call.ringing', () => {
      throw new Error('boom')
    })
    dialer.on('call.ringing', after)

    symbo.event('symbo:call.ringing', { callId: 'c-1' })

    expect(after).toHaveBeenCalledWith({ callId: 'c-1' })
    expect(all).toHaveBeenCalledWith('call.ringing', { callId: 'c-1' })
    expect(error).toHaveBeenCalled()
  })

  it('once() and the unsubscribe from on() both stop delivery', async () => {
    const { dialer, symbo } = await readyDialer(env, SymboDialer)
    const once = vi.fn()
    const repeat = vi.fn()

    dialer.once('call.ended', once)
    const off = dialer.on('call.ended', repeat)

    symbo.event('symbo:call.ended', { callId: 'c-1' })
    off()
    symbo.event('symbo:call.ended', { callId: 'c-2' })

    expect(once).toHaveBeenCalledTimes(1)
    expect(repeat).toHaveBeenCalledTimes(1)
  })
})

/* -------------------------------------------------------------------------- */

describe('mount modes', () => {
  let env

  beforeEach(() => {
    vi.useFakeTimers()
    env = installFakeDom()
  })

  afterEach(() => {
    env.uninstall()
    vi.useRealTimers()
  })

  it('compact: sizes the frame to the strip and follows resize', async () => {
    const { dialer, symbo } = await readyDialer(env, SymboDialer, {
      mode: 'compact',
    })
    const style = dialer.iframe.style

    expect(dialer.iframe.src).toContain('mode=compact')
    expect(style.width).toBe('360px')
    expect(style.height).toBe('56px')
    expect(style.border).toBe('0')
    expect(style.display).toBe('block')
    expect(style.visibility).toBeUndefined()

    const resized = vi.fn()
    dialer.on('resize', resized)
    symbo.event('symbo:resize', { width: 360, height: 320 })
    expect(style.width).toBe('360px')
    expect(style.height).toBe('320px')
    expect(resized).toHaveBeenCalledWith({ width: 360, height: 320 })

    // A height alone is fine; garbage is ignored.
    symbo.event('symbo:resize', { height: 56 })
    expect(style.height).toBe('56px')
    symbo.event('symbo:resize', { width: 'wide', height: -4 })
    expect(style.width).toBe('360px')
    expect(style.height).toBe('56px')
  })

  it('compact: also honours a sizeInfo on ready, as the first embed build sends', async () => {
    const dialer = SymboDialer.create({ container: env.makeContainer(), appUrl: APP_URL })
    const mounting = dialer.mount()
    const symbo = fakeSymbo(env, dialer)
    symbo.load()
    symbo.ready({ sizeInfo: { width: 420, height: 485 } })
    await mounting
    expect(dialer.iframe.style.width).toBe('420px')
    expect(dialer.iframe.style.height).toBe('485px')
  })

  it('hidden: 0x0, invisible, out of the accessibility tree, and deaf to resize', async () => {
    const { dialer, symbo } = await readyDialer(env, SymboDialer, {
      mode: 'hidden',
    })
    const iframe = dialer.iframe

    expect(iframe.src).toBe(`${APP_URL}/dial?embed=1&mode=hidden`)
    expect(iframe.allow).toBe('microphone; autoplay')
    expect(iframe.style.width).toBe('0')
    expect(iframe.style.height).toBe('0')
    expect(iframe.style.visibility).toBe('hidden')
    expect(iframe.getAttribute('aria-hidden')).toBe('true')
    expect(iframe.getAttribute('tabindex')).toBe('-1')

    symbo.event('symbo:resize', { width: 360, height: 320 })
    expect(iframe.style.width).toBe('0')
    expect(iframe.style.height).toBe('0')
  })
})

/* -------------------------------------------------------------------------- */

describe('commands settle on the answer', () => {
  let env

  beforeEach(() => {
    vi.useFakeTimers()
    env = installFakeDom()
  })

  afterEach(() => {
    env.uninstall()
    vi.useRealTimers()
  })

  it('resolves with the data Symbo answered with', async () => {
    const { dialer, symbo } = await readyDialer(env, SymboDialer)

    const dialing = dialer.dial({ number: '+12125550123', externalId: 'case-1' })
    const sent = symbo.lastCommand()
    expect(sent.type).toBe(COMMANDS.DIAL)
    expect(sent.payload).toEqual({ number: '+12125550123', externalId: 'case-1' })
    expect(sent.protocolVersion).toBe(PROTOCOL_VERSION)

    symbo.answer(sent.requestId, { callId: 'c-9' })
    expect(await dialing).toEqual({ callId: 'c-9' })
  })

  it('resolves with an empty object when the answer carries no data', async () => {
    const { dialer, symbo } = await readyDialer(env, SymboDialer)
    const hangingUp = dialer.hangUp()
    symbo.answer(symbo.lastCommand().requestId)
    expect(await hangingUp).toEqual({})
  })

  it('rejects a refusal with an Error carrying the code and message', async () => {
    const { dialer, symbo } = await readyDialer(env, SymboDialer)

    const dialing = dialer.dial({ number: '+1' })
    symbo.refuse(
      symbo.lastCommand().requestId,
      ERRORS.POSTCALL_DETAILS_REQUIRED,
      'Save an outcome for the last call first.'
    )

    let caught
    try {
      await dialing
    } catch (err) {
      caught = err
    }
    expect(caught).toBeInstanceOf(Error)
    expect(caught).toBeInstanceOf(SymboDialerError)
    expect(caught.code).toBe('POSTCALL_DETAILS_REQUIRED')
    expect(caught.message).toBe('Save an outcome for the last call first.')
  })

  it('still reads the flat { code, message } refusal of the first embed build', async () => {
    const { dialer, symbo } = await readyDialer(env, SymboDialer)
    const dialing = dialer.dial({ number: '+1' })
    env.deliver(symbo.iframe(), {
      type: RESULT,
      payload: {
        requestId: symbo.lastCommand().requestId,
        ok: false,
        code: 'CALL_IN_PROGRESS',
        message: 'A call is already active.',
      },
    })
    await expect(dialing).rejects.toMatchObject({
      code: 'CALL_IN_PROGRESS',
      message: 'A call is already active.',
    })
  })

  it('falls back to UNKNOWN when a refusal names no code', async () => {
    const { dialer, symbo } = await readyDialer(env, SymboDialer)
    const dialing = dialer.dial({ number: '+1' })
    env.deliver(symbo.iframe(), {
      type: RESULT,
      payload: { requestId: symbo.lastCommand().requestId, ok: false },
    })
    await expect(dialing).rejects.toMatchObject({ code: CLIENT_ERRORS.UNKNOWN })
  })

  it('gives each command its own requestId and ignores answers to nothing', async () => {
    const { dialer, symbo } = await readyDialer(env, SymboDialer)
    const first = dialer.getState()
    const second = dialer.getState()
    const [a, b] = symbo.commandsOf(COMMANDS.GET_STATE)
    expect(a.requestId).not.toBe(b.requestId)

    symbo.answer('r-nobody', { signedIn: false })
    symbo.answer(b.requestId, { signedIn: true, second: true })
    symbo.answer(a.requestId, { signedIn: true, first: true })

    expect(await first).toMatchObject({ first: true })
    expect(await second).toMatchObject({ second: true })
  })

  it('rejects with COMMAND_TIMEOUT when Symbo never answers', async () => {
    const { dialer } = await readyDialer(env, SymboDialer, { commandTimeoutMs: 2000 })
    const dialing = dialer.dial({ number: '+1' })
    const settled = vi.fn()
    dialing.catch(settled)

    await vi.advanceTimersByTimeAsync(1999)
    expect(settled).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(settled.mock.calls[0][0].code).toBe(CLIENT_ERRORS.COMMAND_TIMEOUT)
    expect(settled.mock.calls[0][0].message).toContain('"dial"')
  })

  it('destroy() removes the frame, rejects what was pending, and refuses what follows', async () => {
    const { dialer, symbo } = await readyDialer(env, SymboDialer)
    const iframe = symbo.iframe()
    const container = iframe.parent
    const dialing = dialer.dial({ number: '+1' })
    const handler = vi.fn()
    dialer.on('call.started', handler)

    dialer.destroy()

    await expect(dialing).rejects.toMatchObject({ code: CLIENT_ERRORS.DESTROYED })
    expect(iframe.removed).toBe(true)
    expect(container.children).toHaveLength(0)
    expect(env.messageListeners.size).toBe(0)
    expect(dialer.iframe).toBeNull()

    await expect(dialer.hangUp()).rejects.toMatchObject({ code: CLIENT_ERRORS.DESTROYED })
    await expect(dialer.mount()).rejects.toMatchObject({ code: CLIENT_ERRORS.DESTROYED })

    env.deliver(iframe, { type: 'symbo:call.started', payload: {} })
    expect(handler).not.toHaveBeenCalled()
  })

  it('destroy() before ready rejects the mount promise instead of leaving it hanging', async () => {
    const dialer = SymboDialer.create({ container: env.makeContainer(), appUrl: APP_URL })
    const mounting = dialer.mount()
    dialer.destroy()
    await expect(mounting).rejects.toMatchObject({ code: CLIENT_ERRORS.DESTROYED })
  })
})

/* -------------------------------------------------------------------------- */

describe('session, inbound, audio and state API', () => {
  let env

  beforeEach(() => {
    vi.useFakeTimers()
    env = installFakeDom()
  })

  afterEach(() => {
    env.uninstall()
    vi.useRealTimers()
  })

  // Each method posts exactly the command and payload the contract names, and
  // hands back exactly the data the answer carried.
  const roundTrip = async (symbo, promise, expectedType, expectedPayload, data) => {
    const sent = symbo.lastCommand()
    expect(sent.type).toBe(expectedType)
    expect(sent.payload).toEqual(expectedPayload)
    symbo.answer(sent.requestId, data)
    expect(await promise).toEqual(data)
  }

  it('session.start / pause / resume / end / skipCurrent', async () => {
    const { dialer, symbo } = await readyDialer(env, SymboDialer)

    await roundTrip(
      symbo,
      dialer.session.start({ dialSessionId: 'ds-1' }),
      COMMANDS.SESSION_START,
      { dialSessionId: 'ds-1' },
      { dialSessionId: 'ds-1', concurrentCalls: 2 }
    )
    await roundTrip(symbo, dialer.session.pause(), COMMANDS.SESSION_PAUSE, {}, {})
    await roundTrip(symbo, dialer.session.resume(), COMMANDS.SESSION_RESUME, {}, {})
    await roundTrip(symbo, dialer.session.skipCurrent(), COMMANDS.SESSION_SKIP_CURRENT, {}, {})
    await roundTrip(
      symbo,
      dialer.session.end(),
      COMMANDS.SESSION_END,
      { force: false },
      { counts: { queued: 0, remaining: 0 } }
    )
    await roundTrip(
      symbo,
      dialer.session.end({ force: true }),
      COMMANDS.SESSION_END,
      { force: true },
      { counts: { queued: 0, remaining: 0 } }
    )
  })

  it('session.removeQueued / getQueue / saveOutcome', async () => {
    const { dialer, symbo } = await readyDialer(env, SymboDialer)

    await roundTrip(
      symbo,
      dialer.session.removeQueued('q-7'),
      COMMANDS.SESSION_REMOVE_QUEUED,
      { queuedCallId: 'q-7' },
      {}
    )
    await roundTrip(
      symbo,
      dialer.session.removeQueued({ queuedCallId: 'q-8' }),
      COMMANDS.SESSION_REMOVE_QUEUED,
      { queuedCallId: 'q-8' },
      {}
    )

    const queue = {
      dialSessionId: 'ds-1',
      counts: { queued: 1, remaining: 1 },
      queue: [{ queuedCallId: 'q-1', prospectId: 'p-1', status: 'queued', order: 1 }],
    }
    await roundTrip(symbo, dialer.session.getQueue(), COMMANDS.SESSION_GET_QUEUE, {}, queue)

    const outcome = {
      callId: 'c-1',
      outcomeId: 'o-1',
      note: 'Calling back Thursday',
      callFields: { meeting_at: '2026-09-20T10:00:00Z' },
      then: 'resume',
    }
    await roundTrip(
      symbo,
      dialer.session.saveOutcome(outcome),
      COMMANDS.SESSION_SAVE_OUTCOME,
      outcome,
      { callId: 'c-1', outcomeId: 'o-1' }
    )
  })

  it('refuses malformed session calls locally, before anything reaches Symbo', async () => {
    const { dialer, symbo } = await readyDialer(env, SymboDialer)
    const before = symbo.posted().length

    await expect(dialer.session.start()).rejects.toMatchObject({
      code: CLIENT_ERRORS.INVALID_OPTIONS,
    })
    await expect(dialer.session.removeQueued()).rejects.toMatchObject({
      code: CLIENT_ERRORS.INVALID_OPTIONS,
    })
    await expect(
      dialer.session.saveOutcome({ outcomeId: 'o-1' })
    ).rejects.toMatchObject({ code: CLIENT_ERRORS.INVALID_OPTIONS })
    await expect(
      dialer.session.saveOutcome({ outcomeId: 'o-1', then: 'continue' })
    ).rejects.toMatchObject({ code: CLIENT_ERRORS.INVALID_OPTIONS })
    await expect(dialer.dial({})).rejects.toMatchObject({
      code: CLIENT_ERRORS.INVALID_OPTIONS,
    })
    await expect(dialer.audio.set({})).rejects.toMatchObject({
      code: CLIENT_ERRORS.INVALID_OPTIONS,
    })

    expect(symbo.posted().length).toBe(before)
  })

  it('surfaces a session refusal as the rejection of the call that caused it', async () => {
    const { dialer, symbo } = await readyDialer(env, SymboDialer)
    const resuming = dialer.session.resume()
    symbo.refuse(symbo.lastCommand().requestId, ERRORS.OUTCOME_PENDING, 'Save the outcome first.')
    await expect(resuming).rejects.toMatchObject({
      code: 'OUTCOME_PENDING',
      message: 'Save the outcome first.',
    })
  })

  it('dial by prospect, getState, answerIncoming, ignoreIncoming, setContact', async () => {
    const { dialer, symbo } = await readyDialer(env, SymboDialer)

    await roundTrip(
      symbo,
      dialer.dial({ prospectId: 'p-1', phoneNumberId: 'pn-2' }),
      COMMANDS.DIAL,
      { prospectId: 'p-1', phoneNumberId: 'pn-2' },
      { callId: 'c-1' }
    )

    const state = {
      signedIn: true,
      deviceReady: true,
      mode: 'compact',
      powerDialing: true,
      concurrentCalls: 2,
      session: null,
      call: null,
      incoming: { callId: 'c-in', from: '+1', prospectId: 'p-2', prospectName: 'Dana' },
      warnings: [],
    }
    await roundTrip(symbo, dialer.getState(), COMMANDS.GET_STATE, {}, state)
    await roundTrip(symbo, dialer.answerIncoming(), COMMANDS.ANSWER_INCOMING, {}, { callId: 'c-in' })
    await roundTrip(symbo, dialer.ignoreIncoming(), COMMANDS.IGNORE_INCOMING, {}, {})
    await roundTrip(
      symbo,
      dialer.setContact({ number: '+1', fullName: 'Dana' }),
      COMMANDS.SET_CONTACT,
      { number: '+1', fullName: 'Dana' },
      {}
    )
  })

  it('audio.list and audio.set', async () => {
    const { dialer, symbo } = await readyDialer(env, SymboDialer)
    const devices = {
      microphones: [{ id: 'm-1', label: 'Built-in' }],
      speakers: [{ id: 's-1', label: 'Headset' }],
      selected: { microphoneId: 'm-1', speakerId: 's-1' },
    }
    await roundTrip(symbo, dialer.audio.list(), COMMANDS.LIST_AUDIO_DEVICES, {}, devices)
    await roundTrip(
      symbo,
      dialer.audio.set({ speakerId: 's-1' }),
      COMMANDS.SET_AUDIO_DEVICES,
      { speakerId: 's-1' },
      devices
    )
  })

  it('delivers the per-leg session events, several legs at a time', async () => {
    const { dialer, symbo } = await readyDialer(env, SymboDialer)
    const seen = []
    ;[
      'session.started',
      'session.leg.ringing',
      'session.leg.answered',
      'session.leg.connected',
      'session.leg.ended',
      'session.paused',
      'session.wrap',
      'session.queue.updated',
      'session.resumed',
      'session.noMoreCalls',
      'session.ended',
      'session.admin',
    ].forEach((name) => dialer.on(name, (p) => seen.push([name, p])))

    const leg = (queuedCallId, extra) => ({
      dialSessionId: 'ds-1',
      callId: `c-${queuedCallId}`,
      queuedCallId,
      prospectId: `p-${queuedCallId}`,
      prospectName: 'Someone',
      number: '+1',
      from: '+2',
      ...extra,
    })

    symbo.event('symbo:session.started', { dialSessionId: 'ds-1', concurrentCalls: 2 })
    symbo.event('symbo:session.leg.ringing', leg('q-1', { status: 'ringing' }))
    symbo.event('symbo:session.leg.ringing', leg('q-2', { status: 'ringing' }))
    symbo.event('symbo:session.leg.answered', leg('q-2', { status: 'answered' }))
    symbo.event('symbo:session.leg.connected', leg('q-2', { status: 'connected' }))
    symbo.event('symbo:session.leg.ended', leg('q-1', { status: 'ended', reason: 'answered_elsewhere' }))
    symbo.event('symbo:session.paused', { dialSessionId: 'ds-1', reason: 'connected' })
    symbo.event('symbo:session.wrap', {
      dialSessionId: 'ds-1',
      callId: 'c-q-2',
      queuedCallId: 'q-2',
      prospectId: 'p-q-2',
      answered: true,
      durationSeconds: 42,
      outcomeRequired: true,
    })
    symbo.event('symbo:session.queue.updated', { dialSessionId: 'ds-1', counts: { remaining: 2 } })
    symbo.event('symbo:session.resumed', { dialSessionId: 'ds-1' })
    symbo.event('symbo:session.noMoreCalls', { dialSessionId: 'ds-1', counts: {} })
    symbo.event('symbo:session.ended', { dialSessionId: 'ds-1', counts: {} })
    symbo.event('symbo:session.admin', { dialSessionId: 'ds-1', action: 'end' })

    expect(seen.map(([name]) => name)).toEqual([
      'session.started',
      'session.leg.ringing',
      'session.leg.ringing',
      'session.leg.answered',
      'session.leg.connected',
      'session.leg.ended',
      'session.paused',
      'session.wrap',
      'session.queue.updated',
      'session.resumed',
      'session.noMoreCalls',
      'session.ended',
      'session.admin',
    ])
    expect(seen[1][1].queuedCallId).toBe('q-1')
    expect(seen[2][1].queuedCallId).toBe('q-2')
    expect(seen[5][1].reason).toBe('answered_elsewhere')
  })

  it('tracks warnings and device state from the events', async () => {
    const { dialer, symbo } = await readyDialer(env, SymboDialer)
    const warned = vi.fn()
    const cleared = vi.fn()
    dialer.on('warning', warned)
    dialer.on('warning.cleared', cleared)

    symbo.event('symbo:warning', { code: 'REALTIME_DISCONNECTED', message: 'Reconnecting…' })
    expect(warned).toHaveBeenCalledWith({ code: 'REALTIME_DISCONNECTED', message: 'Reconnecting…' })
    expect([...dialer.warnings.keys()]).toEqual(['REALTIME_DISCONNECTED'])

    symbo.event('symbo:warning.cleared', { code: 'REALTIME_DISCONNECTED' })
    expect(cleared).toHaveBeenCalledWith({ code: 'REALTIME_DISCONNECTED' })
    expect(dialer.warnings.size).toBe(0)

    symbo.event('symbo:device.error', { code: 'DEVICE_ERROR', message: 'Registration failed' })
    expect(dialer.deviceReady).toBe(false)
    symbo.event('symbo:device.ready', {})
    expect(dialer.deviceReady).toBe(true)
  })

  it('delivers the inbound and one-off call events by their public names', async () => {
    const { dialer, symbo } = await readyDialer(env, SymboDialer)
    const seen = []
    ;[
      'call.incoming',
      'call.ringing',
      'call.started',
      'call.answered',
      'call.ended',
      'call.wrap',
      'call.completed',
      'contact.matched',
      'permission.denied',
      'audio.devicesChanged',
      'error',
    ].forEach((name) => dialer.on(name, () => seen.push(name)))

    Object.values(EVENTS).forEach((type) => symbo.event(type, {}))

    expect(seen).toEqual([
      'permission.denied',
      'call.started',
      'call.ringing',
      'call.incoming',
      'call.answered',
      'call.ended',
      'call.wrap',
      'call.completed',
      'contact.matched',
      'audio.devicesChanged',
      'error',
    ])
  })
})
