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

const PROFILE_ID = 'profile-test-0001'

// -----------------------------------------------------------------------------
// The contract, written out longhand.
//
// This package and the Symbo application each declare these names separately —
// that is the cost of the SDK not depending on the app. Drift between the two
// is silent: both sides keep working while a partner stops receiving an event
// nobody noticed was renamed.
//
// So neither side is allowed to change quietly. The Symbo application declares
// the same names in its embed protocol.js, which must stay identical to this
// literal. Editing the protocol here fails this build until the literal is
// updated, and updating the literal is the moment you are meant to remember
// the other repository exists.
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
    'TOKEN_REJECTED',
    'TOKEN_REQUIRED',
    'PROFILE_NOT_CONFIGURED',
    'ORGANIZATION_ID_REQUIRED',
    'ORGANIZATION_MISMATCH',
    'USER_NOT_PROVISIONED',
    'USER_NEEDS_FIRST_LOGIN',
    'EMBEDDED_DIALER_DISABLED',
    'ACCOUNT_SETUP_INCOMPLETE',
    'OTP_REQUIRED',
    'ACCOUNT_SUSPENDED',
    'ACCOUNT_INACTIVE',
    'SUBSCRIPTION_REQUIRED',
    'RATE_LIMITED',
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
    'CONCURRENT_CALLS_LOCKED',
    'INVALID_CONCURRENT_CALLS',
    'INVALID_MUTED',
    'INVALID_DIGITS',
  ],
  warnings: [
    'NOT_SIGNED_IN',
    'REALTIME_DISCONNECTED',
    'DEVICE_NOT_READY',
    'DEVICE_ERROR',
    'DEVICE_ENDPOINT_FAILED',
    'SIGNED_OUT_ELSEWHERE',
    'MIC_PERMISSION_DENIED',
    'EMBED_NOT_ENABLED',
    'ORIGIN_NOT_ALLOWED',
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

// The period of the hello loop. src/index.js keeps HELLO_RETRY_MS private, so
// the tests restate it here rather than scattering a bare 400 through the
// counts below; if the source constant moves, move this one with it.
const HELLO_RETRY_MS = 400

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
    expect(iframe.src).toBe(`${APP_URL}/dial?embed=1&mode=widget`)
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

  it('says hello as soon as the frame can hear it, pinned to the origin, and repeats until Symbo answers', async () => {
    const dialer = SymboDialer.create({
      container: env.makeContainer(),
      appUrl: APP_URL,
    })
    const mounting = dialer.mount()
    const symbo = fakeSymbo(env, dialer)

    // Appending the frame posts no hello, and that is deliberate rather than
    // an accident of ordering: the frame is still on about:blank, whose
    // origin is the string "null", so a post to the origin we pinned is
    // refused and the browser logs a warning the partner cannot silence. The
    // loop is armed from mount all the same — the two tests below named for
    // a frame that never fires `load` hold that end.
    expect(symbo.posted()).toHaveLength(0)

    // `load` is the first moment the frame can hear us, and it says hello
    // there and then.
    symbo.load()
    expect(symbo.posted()).toHaveLength(1)
    expect(symbo.posted()[0].targetOrigin).toBe(APP_URL)
    expect(symbo.posted()[0].data).toEqual({
      type: COMMANDS.HELLO,
      payload: { protocolVersion: PROTOCOL_VERSION },
      protocolVersion: PROTOCOL_VERSION,
    })

    // It restarted the loop rather than adding a second one: three periods,
    // three more hellos. A timer left over from mount would double this
    // count and every one after it.
    await vi.advanceTimersByTimeAsync(HELLO_RETRY_MS * 3)
    expect(symbo.commandsOf(COMMANDS.HELLO)).toHaveLength(4)
    symbo.posted().forEach(({ data, targetOrigin }) => {
      expect(targetOrigin).toBe(APP_URL)
      expect(data.protocolVersion).toBe(PROTOCOL_VERSION)
      expect(data.payload).toEqual({ protocolVersion: PROTOCOL_VERSION })
    })

    symbo.ready()
    await mounting
    await vi.advanceTimersByTimeAsync(HELLO_RETRY_MS * 10)
    expect(symbo.commandsOf(COMMANDS.HELLO)).toHaveLength(4)
  })

  it('does not leave the hello loop running when the frame answers on the spot', async () => {
    const dialer = SymboDialer.create({
      container: env.makeContainer(),
      appUrl: APP_URL,
    })
    const mounting = dialer.mount()
    const symbo = fakeSymbo(env, dialer)

    // A frame whose listener is already attached replies inside the same
    // tick as the hello it heard. Appending the frame posted none — it was
    // still on about:blank — so the hello `load` posts is the only one, and
    // an answer arriving during it must leave no timer behind.
    dialer.iframe.contentWindow.postMessage = (data, targetOrigin) => {
      dialer.iframe.posted.push({ data, targetOrigin })
      if (data.type === COMMANDS.HELLO) symbo.ready()
    }
    symbo.load()
    await mounting

    await vi.advanceTimersByTimeAsync(HELLO_RETRY_MS * 8)
    expect(symbo.commandsOf(COMMANDS.HELLO)).toHaveLength(1)
  })

  it('stops the hello loop on auth.required too, and restarts it when the frame reloads', async () => {
    const dialer = SymboDialer.create({
      container: env.makeContainer(),
      appUrl: APP_URL,
    })
    dialer.mount()
    const symbo = fakeSymbo(env, dialer)

    // One hello when `load` says the frame can hear us — appending it posted
    // none — and then silence once the frame has answered.
    symbo.load()
    symbo.authRequired()
    await vi.advanceTimersByTimeAsync(HELLO_RETRY_MS * 5)
    expect(symbo.commandsOf(COMMANDS.HELLO)).toHaveLength(1)

    // The in-frame sign-in reloads the frame: load fires again, we must ask
    // again, and an auth.required repeat must stop us again.
    symbo.load()
    expect(symbo.commandsOf(COMMANDS.HELLO)).toHaveLength(2)
    symbo.authRequired()
    await vi.advanceTimersByTimeAsync(HELLO_RETRY_MS * 5)
    expect(symbo.commandsOf(COMMANDS.HELLO)).toHaveLength(2)
  })

  // A frame whose document never settles never fires `load`: one media error
  // handler that reassigns a source it can never fetch, and re-fires on the
  // error that reassignment causes, is enough. While the handshake waited on
  // that event, such a frame was never sent a single hello, and the partner
  // sat at MOUNT_TIMEOUT for the whole budget with nothing naming the cause.
  it('keeps saying hello to a frame that never fires load, and still reaches ready', async () => {
    const dialer = SymboDialer.create({
      container: env.makeContainer(),
      appUrl: APP_URL,
      mountTimeoutMs: 5000,
    })
    const mounting = dialer.mount()
    const symbo = fakeSymbo(env, dialer)
    const rejected = vi.fn()
    mounting.catch(rejected)

    // Note what this test never calls: symbo.load(). Appending the frame
    // posts nothing either — that leading hello is skipped so the browser
    // does not log an about:blank origin warning — so every hello counted
    // here comes from the interval armed at mount, which is the net itself.
    expect(symbo.posted()).toHaveLength(0)

    await vi.advanceTimersByTimeAsync(HELLO_RETRY_MS)
    expect(symbo.commandsOf(COMMANDS.HELLO)).toHaveLength(1)
    expect(symbo.posted()[0].targetOrigin).toBe(APP_URL)
    expect(symbo.posted()[0].data).toEqual({
      type: COMMANDS.HELLO,
      payload: { protocolVersion: PROTOCOL_VERSION },
      protocolVersion: PROTOCOL_VERSION,
    })

    // And it keeps asking for as long as the frame stays silent.
    await vi.advanceTimersByTimeAsync(HELLO_RETRY_MS * 2)
    expect(symbo.commandsOf(COMMANDS.HELLO)).toHaveLength(3)

    // The frame's listener attaches on its own schedule and answers the
    // hello it eventually hears.
    symbo.ready()
    expect(await mounting).toBe(dialer)
    expect(dialer.ready).toBe(true)

    // Answered, so the loop stops and the mount timeout never fires.
    await vi.advanceTimersByTimeAsync(10000)
    expect(symbo.commandsOf(COMMANDS.HELLO)).toHaveLength(3)
    expect(rejected).not.toHaveBeenCalled()
  })

  it('reaches auth.required on a frame that never fires load, and waits out the sign-in', async () => {
    const dialer = SymboDialer.create({
      container: env.makeContainer(),
      appUrl: APP_URL,
      mountTimeoutMs: 5000,
    })
    const mounting = dialer.mount()
    const symbo = fakeSymbo(env, dialer)
    const rejected = vi.fn()
    mounting.catch(rejected)
    const authRequired = vi.fn()
    dialer.on('auth.required', authRequired)

    // No load here either, and no hello from the append itself: the interval
    // armed at mount is the only thing keeping this frame in earshot.
    expect(symbo.posted()).toHaveLength(0)

    await vi.advanceTimersByTimeAsync(HELLO_RETRY_MS * 3)
    expect(symbo.commandsOf(COMMANDS.HELLO)).toHaveLength(3)

    symbo.authRequired('https://app.symbo.ai/login?guest=abc')
    expect(authRequired).toHaveBeenCalledTimes(1)
    expect(dialer.loginUrl).toBe('https://app.symbo.ai/login?guest=abc')

    // Contact stops the clock, and the rep can take as long as they like.
    await vi.advanceTimersByTimeAsync(20000)
    expect(rejected).not.toHaveBeenCalled()
    expect(symbo.commandsOf(COMMANDS.HELLO)).toHaveLength(3)

    symbo.ready()
    expect(await mounting).toBe(dialer)
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

  it('takes a refused handshake as contact: no more hellos, and mount rejects with the code', async () => {
    const dialer = SymboDialer.create({
      container: env.makeContainer(),
      appUrl: APP_URL,
      mountTimeoutMs: 5000,
    })
    const mounting = dialer.mount()
    const settled = vi.fn()
    mounting.catch(settled)
    const symbo = fakeSymbo(env, dialer)
    const errors = vi.fn()
    const warnings = vi.fn()
    dialer.on('error', errors)
    dialer.on('warning', warnings)

    symbo.load()
    // What the frame answers a hello with when the page's origin is not on
    // the organisation's list: an error and a warning, neither answering a
    // requestId. It has heard us — there is nothing left to say hello about.
    symbo.event(EVENTS.ERROR, {
      code: ERRORS.ORIGIN_NOT_ALLOWED,
      message: 'This page may not embed the dialer.',
    })
    symbo.event(EVENTS.WARNING, {
      code: ERRORS.ORIGIN_NOT_ALLOWED,
      message: 'This page may not embed the dialer.',
    })

    await vi.advanceTimersByTimeAsync(10000)
    // The one hello `load` posted — appending the frame posts none — and
    // nothing at all after the refusal.
    expect(symbo.commandsOf(COMMANDS.HELLO)).toHaveLength(1)
    expect(symbo.posted()).toHaveLength(1)
    expect(errors).toHaveBeenCalledTimes(1)
    expect(warnings).toHaveBeenCalledTimes(1)
    expect(dialer.warnings.get(ERRORS.ORIGIN_NOT_ALLOWED)).toBe(
      'This page may not embed the dialer.'
    )

    expect(settled).toHaveBeenCalledTimes(1)
    const err = settled.mock.calls[0][0]
    expect(err).toBeInstanceOf(SymboDialerError)
    expect(err.code).toBe(ERRORS.ORIGIN_NOT_ALLOWED)
    expect(err.message).toBe('This page may not embed the dialer.')
    expect(err.message).not.toContain('did not respond')
  })

  it('posts what was queued before a refused handshake, and settles it from the frame', async () => {
    const dialer = SymboDialer.create({
      container: env.makeContainer(),
      appUrl: APP_URL,
      mountTimeoutMs: 5000,
    })
    const mounting = dialer.mount()
    const settled = vi.fn()
    mounting.catch(settled)
    const symbo = fakeSymbo(env, dialer)

    const asking = dialer.getState()
    symbo.load()
    expect(symbo.commandsOf(COMMANDS.GET_STATE)).toHaveLength(0)

    symbo.event(EVENTS.ERROR, {
      code: ERRORS.EMBED_NOT_ENABLED,
      message: 'This organisation does not have the embedded dialer.',
    })

    // The frame answers getState in this state, so the queued command goes
    // out and gets a real answer rather than a MOUNT_TIMEOUT.
    const [sent] = symbo.commandsOf(COMMANDS.GET_STATE)
    expect(sent).toBeTruthy()
    symbo.answer(sent.requestId, {
      signedIn: false,
      warnings: [ERRORS.EMBED_NOT_ENABLED],
    })
    expect(await asking).toMatchObject({ signedIn: false })

    await vi.advanceTimersByTimeAsync(10000)
    expect(settled.mock.calls[0][0].code).toBe(ERRORS.EMBED_NOT_ENABLED)
  })

  it('leaves a resolved mount alone when a refusal code arrives after ready', async () => {
    const { dialer, symbo } = await readyDialer(env, SymboDialer)

    symbo.event(EVENTS.ERROR, {
      code: ERRORS.ORIGIN_NOT_ALLOWED,
      message: 'too late to matter',
    })

    // mount() hands back the same promise it already resolved.
    expect(await dialer.mount()).toBe(dialer)
    expect(dialer.ready).toBe(true)
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
    // No `noopener` feature: it makes window.open() return null even when
    // the tab opened, which would be read here as a blocked popup. The
    // opener is severed by hand instead.
    expect(env.opened).toEqual([
      { url: 'https://app.symbo.ai/login?guest=abc', target: '_blank' },
    ])
    expect(tab.opener).toBeNull()

    env.setOpenResult(null)
    try {
      dialer.openSignIn()
      throw new Error('should have thrown')
    } catch (err) {
      expect(err.code).toBe(CLIENT_ERRORS.POPUP_BLOCKED)
    }
  })

  it('openSignIn() reports POPUP_BLOCKED when window.open throws', () => {
    const dialer = SymboDialer.create({
      container: env.makeContainer(),
      appUrl: APP_URL,
    })
    dialer.mount()
    const symbo = fakeSymbo(env, dialer)
    symbo.load()
    symbo.authRequired('https://app.symbo.ai/login?guest=abc')

    // A sandboxed iframe without allow-popups throws a DOMException rather
    // than returning null; the documented code has to hold there too.
    env.setOpenResult('throw')
    try {
      dialer.openSignIn()
      throw new Error('should have thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(SymboDialerError)
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

    const signingIn = dialer.signIn({ token: 'abc123', profileId: PROFILE_ID })
    symbo.load()
    // Nothing but hello has gone out: the frame has not said it is listening.
    expect(symbo.commandsOf(COMMANDS.SIGN_IN)).toHaveLength(0)

    symbo.authRequired()
    const [sent] = symbo.commandsOf(COMMANDS.SIGN_IN)
    expect(sent.payload).toEqual({ token: 'abc123', profileId: PROFILE_ID })
    expect(sent.requestId).toBeTruthy()

    symbo.answer(sent.requestId, { user: { id: 'u-1' } })
    expect(await signingIn).toEqual({ user: { id: 'u-1' } })

    symbo.ready()
    await mounting
  })

  it('signOut() works before ready, and is posted once the frame speaks', async () => {
    const dialer = SymboDialer.create({
      container: env.makeContainer(),
      appUrl: APP_URL,
    })
    dialer.mount().catch(() => {})
    const symbo = fakeSymbo(env, dialer)

    const signingOut = dialer.signOut()
    symbo.load()
    symbo.authRequired()
    const [sent] = symbo.commandsOf(COMMANDS.SIGN_OUT)
    expect(sent.requestId).toBeTruthy()
    symbo.answer(sent.requestId, { signedOut: false })
    expect(await signingOut).toEqual({ signedOut: false })
    dialer.destroy()
  })

  it('after signOut, the reloaded frame is heard afresh: its auth.required arrives and a signIn waits for it', async () => {
    const { dialer, symbo } = await readyDialer(env, SymboDialer)
    const authRequired = vi.fn()
    const cleared = vi.fn()
    dialer.on('auth.required', authRequired)
    dialer.on('warning.cleared', cleared)
    symbo.event('symbo:warning', { code: 'REALTIME_DISCONNECTED', message: 'down' })
    expect(dialer.warnings.has('REALTIME_DISCONNECTED')).toBe(true)

    const signingOut = dialer.signOut()
    const [sent] = symbo.commandsOf(COMMANDS.SIGN_OUT)
    symbo.answer(sent.requestId, { signedOut: true })
    expect(await signingOut).toEqual({ signedOut: true })

    // The old document's rep and warnings go with it.
    expect(dialer.ready).toBe(false)
    expect(dialer.user).toBe(null)
    expect(dialer.warnings.size).toBe(0)
    expect(cleared).toHaveBeenCalledWith({ code: 'REALTIME_DISCONNECTED' })

    // A signIn sent now must not reach the document that is reloading.
    const before = symbo.commandsOf(COMMANDS.SIGN_IN).length
    const signingIn = dialer.signIn({ token: 'next-rep', profileId: PROFILE_ID })
    expect(symbo.commandsOf(COMMANDS.SIGN_IN)).toHaveLength(before)

    // The frame reloads and speaks: its auth.required is news, and the
    // waiting signIn goes to it.
    symbo.load()
    symbo.authRequired()
    expect(authRequired).toHaveBeenCalledTimes(1)
    const [signIn] = symbo.commandsOf(COMMANDS.SIGN_IN).slice(before)
    expect(signIn.payload.token).toBe('next-rep')
    symbo.answer(signIn.requestId, { user: { id: 'u-2' } })
    expect(await signingIn).toEqual({ user: { id: 'u-2' } })
  })

  it('tells the page when a ready frame reloads on its own, and hears it afresh', async () => {
    const { dialer, symbo } = await readyDialer(env, SymboDialer)
    const seen = []
    dialer.on('frame.reloaded', (payload) => seen.push([payload, dialer.ready]))
    const ready = vi.fn()
    dialer.on('ready', ready)

    // The frame's document loads again without anyone asking.
    symbo.load()
    expect(seen).toEqual([[{ requested: false, reason: null }, false]])
    expect(dialer.user).toBe(null)

    // It says ready again, and the page carries on.
    symbo.ready()
    expect(ready).toHaveBeenCalledTimes(1)
    expect(dialer.ready).toBe(true)
  })

  it('does not call a load before the first ready, or a sign-in reload, a frame reload', async () => {
    const dialer = SymboDialer.create({ container: env.makeContainer(), appUrl: APP_URL })
    dialer.mount().catch(() => {})
    const symbo = fakeSymbo(env, dialer)
    const reloaded = vi.fn()
    dialer.on('frame.reloaded', reloaded)
    symbo.load()
    symbo.authRequired()
    symbo.load() // the in-frame sign-in reloads the document
    symbo.ready()
    expect(reloaded).not.toHaveBeenCalled()
    dialer.destroy()
  })

  it('rejects commands a reloading frame will never answer, at once rather than on the timeout', async () => {
    const { dialer, symbo } = await readyDialer(env, SymboDialer)
    const settled = vi.fn()
    const starting = dialer.session.start({ dialSessionId: 'ds-1' })
    starting.catch(settled)

    // The frame reloads with session.start unanswered.
    symbo.load()
    await vi.advanceTimersByTimeAsync(0)
    expect(settled).toHaveBeenCalledTimes(1)
    expect(settled.mock.calls[0][0]).toMatchObject({ code: CLIENT_ERRORS.FRAME_RELOADED })
    expect(dialer.pending.size).toBe(0)

    // A late answer from the old document changes nothing.
    const [sent] = symbo.commandsOf(COMMANDS.SESSION_START)
    symbo.answer(sent.requestId, { dialSessionId: 'ds-1' })
    await vi.advanceTimersByTimeAsync(20000)
    expect(settled).toHaveBeenCalledTimes(1)
  })

  it('hears the document a sign-in reloads into afresh, once per run of sign-ins that never reach ready', async () => {
    const dialer = SymboDialer.create({ container: env.makeContainer(), appUrl: APP_URL })
    dialer.mount().catch(() => {})
    const symbo = fakeSymbo(env, dialer)
    const authRequired = vi.fn()
    dialer.on('auth.required', authRequired)
    const signIn = async (answer) => {
      const signingIn = dialer.signIn({ token: 'abc123', profileId: PROFILE_ID })
      const sent = symbo.commandsOf(COMMANDS.SIGN_IN).pop()
      symbo.answer(sent.requestId, answer)
      await signingIn
    }

    symbo.load()
    symbo.authRequired()
    expect(authRequired).toHaveBeenCalledTimes(1)

    // The frame reloads to finish signing in. Not a frame reload to the page:
    // it never said ready.
    await signIn({ user: { id: 'u-1' }, reloading: true })
    const reloaded = vi.fn()
    dialer.on('frame.reloaded', reloaded)
    symbo.load()
    expect(reloaded).not.toHaveBeenCalled()

    // Its session turned out unusable: the page hears it.
    symbo.authRequired()
    expect(authRequired).toHaveBeenCalledTimes(2)

    // Signing in again, still without a ready: the same failure is not heard
    // a third time, so a page that signs in on auth.required cannot loop.
    await signIn({ user: { id: 'u-1' }, reloading: true })
    symbo.load()
    symbo.authRequired()
    expect(authRequired).toHaveBeenCalledTimes(2)

    // A ready ends the run.
    symbo.ready()
    symbo.authRequired()
    expect(authRequired).toHaveBeenCalledTimes(3)
    dialer.destroy()
  })

  it('keeps the dedupe when signIn did not reload the frame', async () => {
    const dialer = SymboDialer.create({ container: env.makeContainer(), appUrl: APP_URL })
    dialer.mount().catch(() => {})
    const symbo = fakeSymbo(env, dialer)
    const authRequired = vi.fn()
    dialer.on('auth.required', authRequired)
    symbo.load()
    symbo.authRequired()
    // An older frame, or one that already held the rep: plain { user }.
    const signingIn = dialer.signIn({ token: 'abc123', profileId: PROFILE_ID })
    symbo.answer(symbo.commandsOf(COMMANDS.SIGN_IN)[0].requestId, { user: { id: 'u-1' } })
    await signingIn
    symbo.load()
    symbo.authRequired()
    expect(authRequired).toHaveBeenCalledTimes(1)
    dialer.destroy()
  })

  it('does not reject commands on the first load, even when the frame said ready before it', async () => {
    const dialer = SymboDialer.create({ container: env.makeContainer(), appUrl: APP_URL })
    const mounting = dialer.mount()
    const symbo = fakeSymbo(env, dialer)
    await vi.advanceTimersByTimeAsync(HELLO_RETRY_MS)
    symbo.ready()
    await mounting
    const reloaded = vi.fn()
    dialer.on('frame.reloaded', reloaded)
    const dialing = dialer.dial({ number: '+15551234567' })
    const [sent] = symbo.commandsOf(COMMANDS.DIAL)
    const hellos = symbo.commandsOf(COMMANDS.HELLO).length
    symbo.load() // the same document's own load event, arriving late
    expect(dialer.ready).toBe(true)
    expect(reloaded).not.toHaveBeenCalled()
    expect(symbo.commandsOf(COMMANDS.HELLO)).toHaveLength(hellos)
    symbo.answer(sent.requestId, { callId: 'c-1' })
    expect(await dialing).toEqual({ callId: 'c-1' })
    dialer.destroy()
  })

  it('counts an answer to nothing as the frame being there: mount waits past its timer', async () => {
    const dialer = SymboDialer.create({ container: env.makeContainer(), appUrl: APP_URL, mountTimeoutMs: 5000 })
    const mounting = dialer.mount()
    const settled = vi.fn()
    mounting.then(settled, settled)
    const symbo = fakeSymbo(env, dialer)
    symbo.load()
    // The frame is checking a session it holds: heard, nothing more yet.
    symbo.answer(null)
    const hellos = symbo.commandsOf(COMMANDS.HELLO).length
    await vi.advanceTimersByTimeAsync(10000)
    expect(settled).not.toHaveBeenCalled()
    expect(symbo.commandsOf(COMMANDS.HELLO)).toHaveLength(hellos)
    symbo.ready()
    expect(await mounting).toBe(dialer)
  })

  it('gives signIn more than a short command timeout, since the frame may wait on a check first', async () => {
    const dialer = SymboDialer.create({ container: env.makeContainer(), appUrl: APP_URL, commandTimeoutMs: 2000 })
    dialer.mount().catch(() => {})
    const symbo = fakeSymbo(env, dialer)
    symbo.load()
    symbo.answer(null)
    const settled = vi.fn()
    dialer.signIn({ token: 'abc123', profileId: PROFILE_ID }).then(settled, settled)
    await vi.advanceTimersByTimeAsync(24000)
    expect(settled).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1000)
    expect(settled.mock.calls[0][0]).toMatchObject({ code: CLIENT_ERRORS.COMMAND_TIMEOUT })
    dialer.destroy()
  })

  it('reload() reloads the frame on request, reported as asked for', async () => {
    const { dialer, symbo } = await readyDialer(env, SymboDialer, {})
    const reloaded = vi.fn()
    dialer.on('frame.reloaded', reloaded)

    const reloading = dialer.reload()
    const [sent] = symbo.commandsOf(COMMANDS.RELOAD)
    symbo.answer(sent.requestId, { reloading: true })
    expect(await reloading).toEqual({ reloading: true })
    expect(dialer.ready).toBe(false)

    symbo.load()
    expect(reloaded).toHaveBeenCalledWith({ requested: true, reason: null })
    symbo.ready()
    expect(dialer.ready).toBe(true)

    // Refused like signOut while it would cut something off.
    const busy = dialer.reload()
    symbo.refuse(symbo.lastCommand().requestId, ERRORS.CALL_IN_PROGRESS, 'A call is active.')
    await expect(busy).rejects.toMatchObject({ code: 'CALL_IN_PROGRESS' })
    expect(dialer.ready).toBe(true)
  })

  it('reload() works before ready, for a frame stuck before it could say so', async () => {
    const dialer = SymboDialer.create({ container: env.makeContainer(), appUrl: APP_URL })
    dialer.mount().catch(() => {})
    const symbo = fakeSymbo(env, dialer)
    const reloading = dialer.reload()
    symbo.load()
    symbo.authRequired()
    const [sent] = symbo.commandsOf(COMMANDS.RELOAD)
    symbo.answer(sent.requestId, { reloading: true })
    expect(await reloading).toEqual({ reloading: true })
    dialer.destroy()
  })

  it('tracks whether a newer Symbo build is waiting', async () => {
    const { dialer, symbo } = await readyDialer(env, SymboDialer)
    expect(dialer.updateAvailable).toBe(false)
    const available = vi.fn()
    dialer.on('update.available', available)
    symbo.event('symbo:update.available', {})
    expect(available).toHaveBeenCalled()
    expect(dialer.updateAvailable).toBe(true)

    // A reloaded frame runs the newer build.
    symbo.load()
    expect(dialer.updateAvailable).toBe(false)
    symbo.ready({ updateAvailable: true })
    expect(dialer.updateAvailable).toBe(true)
  })

  it('signIn() without a token, and non-pre-ready commands before ready, are refused locally', async () => {
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
    expect(dialer.concurrentCallsLocked).toBe(false)
    expect(dialer.deviceReady).toBe(true)
    expect(dialer.powerDialing).toBe(true)
    expect(dialer.mode).toBe(MODES.WIDGET)
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

  it('widget: the default — the Symbo dialer itself, sized to the card', async () => {
    const { dialer } = await readyDialer(env, SymboDialer)
    const style = dialer.iframe.style

    expect(dialer.mode).toBe(MODES.WIDGET)
    expect(dialer.iframe.src).toBe(`${APP_URL}/dial?embed=1&mode=widget`)
    expect(style.width).toBe('420px')
    expect(style.height).toBe('485px')
    expect(style.visibility).toBeUndefined()
    expect(dialer.iframe.getAttribute('aria-hidden')).toBeNull()
  })

  it('widget: honours a sizeInfo on ready, and a later resize', async () => {
    const dialer = SymboDialer.create({ container: env.makeContainer(), appUrl: APP_URL })
    const mounting = dialer.mount()
    const symbo = fakeSymbo(env, dialer)
    symbo.load()
    symbo.ready({ sizeInfo: { width: 480, height: 600 } })
    await mounting
    expect(dialer.iframe.style.width).toBe('480px')
    expect(dialer.iframe.style.height).toBe('600px')

    symbo.event('symbo:resize', { width: 420, height: 485 })
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

  // The frame's answer to a command that failed unexpectedly. It is outside
  // the contract's codes, so ERRORS leaves it out, but it must still arrive.
  it('passes COMMAND_FAILED through though ERRORS does not list it', async () => {
    const { dialer, symbo } = await readyDialer(env, SymboDialer)
    const holding = dialer.session.hold()
    symbo.refuse(
      symbo.lastCommand().requestId,
      'COMMAND_FAILED',
      'Request failed with status code 500'
    )
    await expect(holding).rejects.toMatchObject({
      code: 'COMMAND_FAILED',
      message: 'Request failed with status code 500',
    })
    expect(ERRORS).not.toHaveProperty('COMMAND_FAILED')
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
    const hangingUp = dialer.hangUp()
    const settled = vi.fn()
    hangingUp.catch(settled)

    await vi.advanceTimersByTimeAsync(1999)
    expect(settled).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(settled.mock.calls[0][0].code).toBe(CLIENT_ERRORS.COMMAND_TIMEOUT)
    expect(settled.mock.calls[0][0].message).toContain('"hangUp"')
  })

  it('waits longer than the frame does for the call id, whatever commandTimeoutMs says', async () => {
    const { dialer, symbo } = await readyDialer(env, SymboDialer, {
      commandTimeoutMs: 2000,
    })
    const dialing = dialer.dial({ number: '+1' })
    const settled = vi.fn()
    dialing.then(settled, settled)

    // The frame answers dial only once the carrier reports the call ringing,
    // or after its own 15 s wait for the id — a clock that starts after the
    // message has crossed. A short commandTimeoutMs must not pre-empt it and
    // reject a call that has really been placed.
    await vi.advanceTimersByTimeAsync(20000)
    expect(settled).not.toHaveBeenCalled()

    symbo.answer(symbo.lastCommand().requestId, { callId: 'c-1' })
    expect(await dialing).toEqual({ callId: 'c-1' })
  })

  it('still times out a dial the frame never answers, on the dial budget', async () => {
    const { dialer } = await readyDialer(env, SymboDialer)
    const dialing = dialer.dial({ number: '+1' })
    const settled = vi.fn()
    dialing.catch(settled)

    await vi.advanceTimersByTimeAsync(24999)
    expect(settled).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(settled.mock.calls[0][0].code).toBe(CLIENT_ERRORS.COMMAND_TIMEOUT)
    expect(settled.mock.calls[0][0].message).toContain('"dial"')
    expect(settled.mock.calls[0][0].message).toContain('25000ms')
  })

  it('resolves dial with a null callId when the frame never learned one', async () => {
    const { dialer, symbo } = await readyDialer(env, SymboDialer)
    const dialing = dialer.dial({ prospectId: 'p-1001' })
    symbo.answer(symbo.lastCommand().requestId, { callId: null })
    expect(await dialing).toEqual({ callId: null })
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

  it('session.start with a line count, and setConcurrentCalls', async () => {
    const { dialer, symbo } = await readyDialer(env, SymboDialer)

    await roundTrip(
      symbo,
      dialer.session.start({ dialSessionId: 'ds-1', concurrentCalls: 3 }),
      COMMANDS.SESSION_START,
      { dialSessionId: 'ds-1', concurrentCalls: 3 },
      { dialSessionId: 'ds-1', concurrentCalls: 3 }
    )
    await roundTrip(
      symbo,
      dialer.session.setConcurrentCalls(4),
      COMMANDS.SESSION_SET_CONCURRENT_CALLS,
      { concurrentCalls: 4 },
      { dialSessionId: 'ds-1', concurrentCalls: 4 }
    )
    expect(dialer.concurrentCalls).toBe(4)
    await roundTrip(
      symbo,
      dialer.session.setConcurrentCalls({ concurrentCalls: 1 }),
      COMMANDS.SESSION_SET_CONCURRENT_CALLS,
      { concurrentCalls: 1 },
      { dialSessionId: 'ds-1', concurrentCalls: 1 }
    )
    expect(dialer.concurrentCalls).toBe(1)
  })

  it('follows the line count through session.started and session.concurrentCallsChanged', async () => {
    const { dialer, symbo } = await readyDialer(env, SymboDialer)
    const seen = []
    // A handler reading the property already sees the new count.
    dialer.on('session.concurrentCallsChanged', (payload) =>
      seen.push([payload, dialer.concurrentCalls, dialer.concurrentCallsLocked])
    )

    symbo.event('symbo:session.started', { dialSessionId: 'ds-1', concurrentCalls: 3 })
    expect(dialer.concurrentCalls).toBe(3)

    // Ended with no lock: back to what a session gets when nobody sets it.
    symbo.event('symbo:session.ended', { dialSessionId: 'ds-1', counts: {} })
    expect(dialer.concurrentCalls).toBe(1)

    const locked = { dialSessionId: 'ds-1', concurrentCalls: 2, concurrentCallsLocked: true }
    symbo.event('symbo:session.concurrentCallsChanged', locked)
    expect(seen).toEqual([[locked, 2, true]])
    expect(dialer.concurrentCallsLocked).toBe(true)

    // Locked, it keeps the locked number; a lock change between sessions
    // arrives with no session id.
    symbo.event('symbo:session.ended', { dialSessionId: 'ds-1', counts: {} })
    expect(dialer.concurrentCalls).toBe(2)
    symbo.event('symbo:session.concurrentCallsChanged', {
      dialSessionId: null,
      concurrentCalls: 1,
      concurrentCallsLocked: false,
    })
    expect([dialer.concurrentCalls, dialer.concurrentCallsLocked]).toEqual([1, false])
  })

  it('takes the line count from session.start whichever message lands first', async () => {
    const { dialer, symbo } = await readyDialer(env, SymboDialer)
    const starting = dialer.session.start({ dialSessionId: 'ds-1' })
    symbo.answer(symbo.lastCommand().requestId, { dialSessionId: 'ds-1', concurrentCalls: 4 })
    await starting
    expect(dialer.concurrentCalls).toBe(4)
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
    for (const bad of [undefined, 0, 5, 2.5, '2', {}, { concurrentCalls: 9 }]) {
      await expect(dialer.session.setConcurrentCalls(bad)).rejects.toMatchObject({
        code: CLIENT_ERRORS.INVALID_OPTIONS,
      })
    }
    await expect(
      dialer.session.start({ dialSessionId: 'ds-1', concurrentCalls: 0 })
    ).rejects.toMatchObject({ code: CLIENT_ERRORS.INVALID_OPTIONS })

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

    const changing = dialer.session.setConcurrentCalls(3)
    symbo.refuse(
      symbo.lastCommand().requestId,
      ERRORS.CONCURRENT_CALLS_LOCKED,
      'Your organization sets every session to 2 lines'
    )
    await expect(changing).rejects.toMatchObject({ code: 'CONCURRENT_CALLS_LOCKED' })
    expect(dialer.concurrentCalls).toBe(2)
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

  it('setMuted and sendDigits', async () => {
    const { dialer, symbo } = await readyDialer(env, SymboDialer)

    await roundTrip(symbo, dialer.setMuted(true), COMMANDS.SET_MUTED, { muted: true }, { muted: true })
    expect(dialer.muted).toBe(true)
    await roundTrip(
      symbo,
      dialer.setMuted({ muted: false }),
      COMMANDS.SET_MUTED,
      { muted: false },
      { muted: false }
    )
    expect(dialer.muted).toBe(false)

    await roundTrip(symbo, dialer.sendDigits('1'), COMMANDS.SEND_DIGITS, { digits: '1' }, { digits: '1' })
    await roundTrip(
      symbo,
      dialer.sendDigits({ digits: '0#*9' }),
      COMMANDS.SEND_DIGITS,
      { digits: '0#*9' },
      { digits: '0#*9' }
    )
  })

  it('refuses a malformed setMuted or sendDigits locally', async () => {
    const { dialer, symbo } = await readyDialer(env, SymboDialer)
    const before = symbo.posted().length

    for (const bad of [undefined, 'true', 1, null, {}, { muted: 'yes' }]) {
      await expect(dialer.setMuted(bad)).rejects.toMatchObject({
        code: CLIENT_ERRORS.INVALID_OPTIONS,
      })
    }
    for (const bad of [undefined, '', 123, '12a', '1 2', '+1', 'A', '1'.repeat(33), {}, { digits: 5 }]) {
      await expect(dialer.sendDigits(bad)).rejects.toMatchObject({
        code: CLIENT_ERRORS.INVALID_OPTIONS,
      })
    }

    expect(symbo.posted().length).toBe(before)
  })

  it('follows mute through call.muteChanged, getState and the reload that forgets the frame', async () => {
    const { dialer, symbo } = await readyDialer(env, SymboDialer)
    const seen = []
    // A handler reading the property already sees the new value.
    dialer.on('call.muteChanged', (payload) => seen.push([payload, dialer.muted]))

    symbo.event('symbo:call.muteChanged', { muted: true })
    expect(seen).toEqual([[{ muted: true }, true]])

    const state = dialer.getState()
    symbo.answer(symbo.lastCommand().requestId, { signedIn: true, call: null, muted: false })
    await state
    expect(dialer.muted).toBe(false)

    // A reload drops the rep's line: the unmute is announced, so a button
    // drawn from the event does not stay pressed. Not muted, nothing to say.
    symbo.event('symbo:call.muteChanged', { muted: true })
    seen.length = 0
    const reloading = dialer.reload()
    symbo.answer(symbo.lastCommand().requestId, { reloading: true })
    await reloading
    expect(dialer.muted).toBe(false)
    expect(seen).toEqual([[{ muted: false }, false]])
    symbo.load()
    expect(seen).toHaveLength(1)
  })

  it('surfaces a mute or keypad refusal as the rejection of the call that caused it', async () => {
    const { dialer, symbo } = await readyDialer(env, SymboDialer)

    const muting = dialer.setMuted(true)
    symbo.refuse(symbo.lastCommand().requestId, ERRORS.NO_ACTIVE_CALL, 'There is no active call.')
    await expect(muting).rejects.toMatchObject({ code: 'NO_ACTIVE_CALL' })
    expect(dialer.muted).toBe(false)

    const pressing = dialer.sendDigits('1234')
    symbo.refuse(
      symbo.lastCommand().requestId,
      ERRORS.NO_ACTIVE_CALL,
      'The call ended after 2 of 4 digits.'
    )
    await expect(pressing).rejects.toMatchObject({
      code: 'NO_ACTIVE_CALL',
      message: 'The call ended after 2 of 4 digits.',
    })
  })

  it('gives sendDigits time to play every digit waiting, not just the command budget', async () => {
    const { dialer, symbo } = await readyDialer(env, SymboDialer, { commandTimeoutMs: 2000 })
    const settled = vi.fn()

    // 32 digits, then 3 more queued behind them: the second answer can only
    // come once all 35 have played, 200 ms apart.
    dialer.sendDigits('1'.repeat(32)).catch(settled)
    const second = dialer.sendDigits('123')
    second.catch(settled)

    await vi.advanceTimersByTimeAsync(2000 + 200 * 32 - 1)
    expect(settled).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(settled).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(200 * 3)
    expect(settled).toHaveBeenCalledTimes(2)
    expect(settled.mock.calls[1][0].code).toBe(CLIENT_ERRORS.COMMAND_TIMEOUT)

    // Settled or timed out, they no longer count against the next one.
    const next = dialer.sendDigits('9')
    const [, , third] = symbo.commandsOf(COMMANDS.SEND_DIGITS)
    symbo.answer(third.requestId, { digits: '9' })
    expect(await next).toEqual({ digits: '9' })
    expect(dialer.pendingDigits).toBe(0)
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
      'session.postCall',
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
    symbo.event('symbo:session.postCall', {
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
      'session.postCall',
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
      'call.postCall',
      'call.completed',
      'call.muteChanged',
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
      'call.postCall',
      'call.completed',
      'call.muteChanged',
      'contact.matched',
      'audio.devicesChanged',
      'error',
    ])
  })
})

/* -------------------------------------------------------------------------- */

describe('calls during a session, hold, one-off outcomes and reloads', () => {
  let env

  beforeEach(() => {
    vi.useFakeTimers()
    env = installFakeDom()
  })

  afterEach(() => {
    env.uninstall()
    vi.useRealTimers()
  })

  const roundTrip = async (symbo, promise, expectedType, expectedPayload, data) => {
    const sent = symbo.lastCommand()
    expect(sent.type).toBe(expectedType)
    expect(sent.payload).toEqual(expectedPayload)
    symbo.answer(sent.requestId, data)
    expect(await promise).toEqual(data)
  }

  // The capabilities a frame with this release advertises to a rep who can
  // power dial.
  const CURRENT = [
    'session',
    'inbound',
    'audioDevices',
    'signIn',
    'callsWhilePaused',
    'sessionHold',
    'sessionLoad',
    'removeQueuedCalls',
    'callWaiting',
    'saveOutcome',
    'hardReload',
  ]
  const currentDialer = async () => {
    const ready = await readyDialer(env, SymboDialer)
    ready.symbo.ready({ capabilities: CURRENT })
    return ready
  }

  it('session.hold: posts the command and resets the line count on session.held', async () => {
    const { dialer, symbo } = await readyDialer(env, SymboDialer)
    symbo.event('symbo:session.started', { dialSessionId: 'ds-1', concurrentCalls: 3 })
    const held = vi.fn()
    dialer.on('session.held', (payload) => held(payload, dialer.concurrentCalls))

    const counts = { queued: 4, remaining: 4 }
    await roundTrip(
      symbo,
      dialer.session.hold(),
      COMMANDS.SESSION_HOLD,
      {},
      { dialSessionId: 'ds-1', counts }
    )
    symbo.event('symbo:session.held', { dialSessionId: 'ds-1', counts })
    expect(held).toHaveBeenCalledWith({ dialSessionId: 'ds-1', counts }, 1)
  })

  it('session.start({ dial: false }) loads without dialing, where the frame supports it', async () => {
    const { dialer, symbo } = await currentDialer()
    await roundTrip(
      symbo,
      dialer.session.start({ dialSessionId: 'ds-1', dial: false }),
      COMMANDS.SESSION_START,
      { dialSessionId: 'ds-1', dial: false },
      { dialSessionId: 'ds-1', concurrentCalls: 2, concurrentCallsLocked: false, dialing: false }
    )
    await roundTrip(
      symbo,
      dialer.session.start({ dialSessionId: 'ds-2', dial: true }),
      COMMANDS.SESSION_START,
      { dialSessionId: 'ds-2', dial: true },
      { dialSessionId: 'ds-2', concurrentCalls: 2, concurrentCallsLocked: false, dialing: true }
    )
  })

  it('refuses dial: false locally on a frame without sessionLoad, which would dial at once', async () => {
    const { dialer, symbo } = await readyDialer(env, SymboDialer)
    const before = symbo.posted().length

    const refused = dialer.session.start({ dialSessionId: 'ds-1', dial: false })
    await expect(refused).rejects.toMatchObject({
      code: CLIENT_ERRORS.NOT_SUPPORTED,
      message:
        "This Symbo release does not support session.start({ dial: false }); check dialer.hasCapability('sessionLoad').",
    })
    await expect(refused).rejects.toBeInstanceOf(SymboDialerError)
    await expect(
      dialer.session.start({ dialSessionId: 'ds-1', dial: 'no' })
    ).rejects.toMatchObject({ code: CLIENT_ERRORS.INVALID_OPTIONS })
    expect(symbo.posted().length).toBe(before)

    // dial: true means what an older frame already does.
    dialer.session.start({ dialSessionId: 'ds-1', dial: true })
    expect(symbo.lastCommand().payload).toEqual({ dialSessionId: 'ds-1', dial: true })
  })

  it('refuses session.end({ dialSessionId }) locally, which an older frame would read as ending the loaded session', async () => {
    for (const ready of [currentDialer, () => readyDialer(env, SymboDialer)]) {
      const { dialer, symbo } = await ready()
      const before = symbo.posted().length
      for (const id of ['ds-other', '', null]) {
        await expect(dialer.session.end({ dialSessionId: id })).rejects.toMatchObject({
          code: CLIENT_ERRORS.INVALID_OPTIONS,
          message:
            'session.end takes no dialSessionId: only the session loaded here can be ended here; end another session from your server with POST /v1/dialSessions/{id}/actions/end.',
        })
      }
      expect(symbo.posted().length).toBe(before)

      dialer.session.end({ force: true })
      expect(symbo.lastCommand().payload).toEqual({ force: true })
    }
  })

  it('session.removeQueued takes a list, and answers how many were removed and which were skipped', async () => {
    const { dialer, symbo } = await currentDialer()
    const result = {
      removedCount: 2,
      skipped: [{ queuedCallId: 'q-2', reason: 'dialing' }],
    }
    await roundTrip(
      symbo,
      dialer.session.removeQueued(['q-1', 'q-2', 'q-3', 'q-9']),
      COMMANDS.SESSION_REMOVE_QUEUED,
      { queuedCallIds: ['q-1', 'q-2', 'q-3', 'q-9'] },
      result
    )
    await roundTrip(
      symbo,
      dialer.session.removeQueued({ queuedCallIds: ['q-4'] }),
      COMMANDS.SESSION_REMOVE_QUEUED,
      { queuedCallIds: ['q-4'] },
      { removedCount: 1, skipped: [] }
    )
    // The single form is unchanged.
    await roundTrip(
      symbo,
      dialer.session.removeQueued('q-5'),
      COMMANDS.SESSION_REMOVE_QUEUED,
      { queuedCallId: 'q-5' },
      {}
    )

    const before = symbo.posted().length
    const tooMany = Array.from({ length: 1001 }, (_, i) => `q-${i}`)
    for (const bad of [[], ['q-1', ''], ['q-1', 7], tooMany, { queuedCallIds: 'q-1' }, { queuedCallIds: [] }]) {
      await expect(dialer.session.removeQueued(bad)).rejects.toMatchObject({
        code: CLIENT_ERRORS.INVALID_OPTIONS,
      })
    }
    expect(symbo.posted().length).toBe(before)

    // 1000 is allowed.
    dialer.session.removeQueued(tooMany.slice(0, 1000))
    expect(symbo.lastCommand().payload.queuedCallIds).toHaveLength(1000)
  })

  it('refuses a list removal locally on a frame without removeQueuedCalls', async () => {
    const { dialer, symbo } = await readyDialer(env, SymboDialer)
    const before = symbo.posted().length
    await expect(dialer.session.removeQueued(['q-1'])).rejects.toMatchObject({
      code: CLIENT_ERRORS.NOT_SUPPORTED,
    })
    await expect(dialer.session.removeQueued({ queuedCallIds: ['q-1'] })).rejects.toMatchObject({
      code: CLIENT_ERRORS.NOT_SUPPORTED,
    })
    expect(symbo.posted().length).toBe(before)
  })

  it('sends these options to a frame without sessions, which answers them itself', async () => {
    // A rep without power dialing: the frame drops every session capability,
    // so a missing one says nothing about the release.
    const { dialer, symbo } = await readyDialer(env, SymboDialer)
    symbo.ready({ capabilities: ['inbound', 'audioDevices', 'signIn'], powerDialing: false })

    const start = dialer.session.start({ dialSessionId: 'ds-1', dial: false })
    let sent = symbo.lastCommand()
    expect(sent).toMatchObject({ type: COMMANDS.SESSION_START, payload: { dialSessionId: 'ds-1', dial: false } })
    symbo.refuse(sent.requestId, ERRORS.POWER_DIALING_NOT_ENABLED, 'Power dialing is not enabled')
    await expect(start).rejects.toMatchObject({ code: ERRORS.POWER_DIALING_NOT_ENABLED })

    const removal = dialer.session.removeQueued(['q-1'])
    sent = symbo.lastCommand()
    expect(sent).toMatchObject({ type: COMMANDS.SESSION_REMOVE_QUEUED, payload: { queuedCallIds: ['q-1'] } })
    symbo.refuse(sent.requestId, ERRORS.NO_ACTIVE_SESSION, 'No dial session is loaded')
    await expect(removal).rejects.toMatchObject({ code: ERRORS.NO_ACTIVE_SESSION })
  })

  it('answers NOT_READY rather than NOT_SUPPORTED before the frame has said what it supports', async () => {
    const dialer = SymboDialer.create({ container: env.makeContainer(), appUrl: APP_URL })
    dialer.mount().catch(() => {})
    fakeSymbo(env, dialer).load()
    await expect(
      dialer.session.start({ dialSessionId: 'ds-1', dial: false })
    ).rejects.toMatchObject({ code: CLIENT_ERRORS.NOT_READY })
    await expect(dialer.session.removeQueued(['q-1'])).rejects.toMatchObject({
      code: CLIENT_ERRORS.NOT_READY,
    })
    dialer.destroy()
  })

  it('answerIncoming({ endCurrent }) sends endCurrent only when it is true', async () => {
    const { dialer, symbo } = await readyDialer(env, SymboDialer)
    await roundTrip(
      symbo,
      dialer.answerIncoming({ endCurrent: true }),
      COMMANDS.ANSWER_INCOMING,
      { endCurrent: true },
      { callId: 'c-in' }
    )
    await roundTrip(
      symbo,
      dialer.answerIncoming({ endCurrent: false }),
      COMMANDS.ANSWER_INCOMING,
      {},
      { callId: 'c-in' }
    )

    const before = symbo.posted().length
    await expect(dialer.answerIncoming({ endCurrent: 'yes' })).rejects.toMatchObject({
      code: CLIENT_ERRORS.INVALID_OPTIONS,
    })
    expect(symbo.posted().length).toBe(before)

    // An older frame does not know endCurrent and refuses with a call up, so
    // there is nothing to gate.
    const answering = dialer.answerIncoming({ endCurrent: true })
    symbo.refuse(symbo.lastCommand().requestId, ERRORS.SESSION_ACTIVE, 'A power-dial session is active.')
    await expect(answering).rejects.toMatchObject({ code: ERRORS.SESSION_ACTIVE })
  })

  it('saveOutcome saves a one-off call, sending only the keys given', async () => {
    const { dialer, symbo } = await readyDialer(env, SymboDialer)
    await roundTrip(
      symbo,
      dialer.saveOutcome({ outcomeId: 'o-1' }),
      COMMANDS.CALL_SAVE_OUTCOME,
      { outcomeId: 'o-1' },
      { callId: 'c-1', outcomeId: 'o-1' }
    )
    const full = {
      callId: 'c-2',
      outcomeValue: 'MEETING_BOOKED',
      note: 'Friday 10:00',
      callFields: { c_meeting_at: '2026-10-02T10:00:00Z' },
    }
    await roundTrip(
      symbo,
      dialer.saveOutcome(full),
      COMMANDS.CALL_SAVE_OUTCOME,
      full,
      { callId: 'c-2', outcomeId: 'o-2' }
    )
    // A note alone, or call fields alone, is something to write.
    await roundTrip(symbo, dialer.saveOutcome({ note: '' }), COMMANDS.CALL_SAVE_OUTCOME, { note: '' }, { callId: 'c-1', outcomeId: null })
    await roundTrip(
      symbo,
      dialer.saveOutcome({ callFields: {} }),
      COMMANDS.CALL_SAVE_OUTCOME,
      { callFields: {} },
      { callId: 'c-1', outcomeId: null }
    )

    const before = symbo.posted().length
    for (const bad of [
      undefined,
      {},
      { callId: 'c-1' },
      { outcomeId: null, note: null },
      { outcomeId: 'o-1', callFields: 'x' },
      { outcomeId: 'o-1', callFields: ['x'] },
      { callFields: 5 },
    ]) {
      await expect(dialer.saveOutcome(bad)).rejects.toMatchObject({
        code: CLIENT_ERRORS.INVALID_OPTIONS,
      })
    }
    expect(symbo.posted().length).toBe(before)

    const saving = dialer.saveOutcome({ outcomeId: 'o-1' })
    symbo.refuse(symbo.lastCommand().requestId, ERRORS.OUTCOME_PENDING, 'An outcome is required for this call.')
    await expect(saving).rejects.toMatchObject({ code: ERRORS.OUTCOME_PENDING })
  })

  it('reload({ hard }) sends hard only when it is true', async () => {
    const { dialer, symbo } = await readyDialer(env, SymboDialer)
    const reloaded = vi.fn()
    dialer.on('frame.reloaded', reloaded)

    const before = symbo.posted().length
    await expect(dialer.reload({ hard: 1 })).rejects.toMatchObject({
      code: CLIENT_ERRORS.INVALID_OPTIONS,
    })
    expect(symbo.posted().length).toBe(before)

    const softly = dialer.reload({ hard: false })
    expect(symbo.lastCommand().payload).toEqual({})
    symbo.refuse(symbo.lastCommand().requestId, ERRORS.CALL_IN_PROGRESS, 'A call is active.')
    await expect(softly).rejects.toMatchObject({ code: ERRORS.CALL_IN_PROGRESS })

    await roundTrip(
      symbo,
      dialer.reload({ hard: true }),
      COMMANDS.RELOAD,
      { hard: true },
      { reloading: true, hard: true }
    )
    expect(dialer.ready).toBe(false)
    symbo.load()
    expect(reloaded).toHaveBeenCalledWith({ requested: true, reason: null })
  })

  it('tracks reload.required until the frame reloads', async () => {
    const { dialer, symbo } = await readyDialer(env, SymboDialer)
    expect(dialer.reloadRequired).toBeNull()
    const seen = []
    dialer.on('reload.required', (payload) => seen.push([payload, dialer.reloadRequired]))

    symbo.event('symbo:reload.required', { reason: 'plan_changed' })
    expect(seen).toEqual([[{ reason: 'plan_changed' }, 'plan_changed']])

    symbo.load()
    expect(dialer.reloadRequired).toBeNull()
  })

  it('reports why an unasked reload happened, from the frame.leaving before it', async () => {
    const { dialer, symbo } = await readyDialer(env, SymboDialer)
    const seen = []
    dialer.on('frame.leaving', (payload) => seen.push(['frame.leaving', payload]))
    dialer.on('frame.reloaded', (payload) => seen.push(['frame.reloaded', payload]))

    symbo.event('symbo:frame.leaving', { reason: 'plan_changed', inMs: 1000 })
    expect(dialer.leavingReason).toBe('plan_changed')
    symbo.load()
    expect(seen).toEqual([
      ['frame.leaving', { reason: 'plan_changed', inMs: 1000 }],
      ['frame.reloaded', { requested: false, reason: 'plan_changed' }],
    ])
    expect(dialer.leavingReason).toBeNull()

    // The new document passes on why it was loaded; ready forgets the notice.
    const ready = vi.fn()
    dialer.on('ready', ready)
    symbo.ready({ reloadReason: 'plan_changed' })
    expect(ready.mock.calls[0][0].reloadReason).toBe('plan_changed')

    // A reload nobody announced has no reason.
    seen.length = 0
    symbo.load()
    expect(seen).toEqual([['frame.reloaded', { requested: false, reason: null }]])

    // Nor does one the page asked for, whatever was said around it.
    symbo.ready()
    const reloading = dialer.reload()
    symbo.answer(symbo.lastCommand().requestId, { reloading: true })
    await reloading
    symbo.event('symbo:frame.leaving', { reason: 'logout', inMs: 600 })
    seen.length = 0
    symbo.load()
    expect(seen).toEqual([['frame.reloaded', { requested: true, reason: null }]])
  })

  it('carries the reloadReason on auth.required through to the page', async () => {
    const dialer = SymboDialer.create({ container: env.makeContainer(), appUrl: APP_URL })
    dialer.mount().catch(() => {})
    const symbo = fakeSymbo(env, dialer)
    const authRequired = vi.fn()
    dialer.on('auth.required', authRequired)
    symbo.load()
    env.deliver(symbo.iframe(), {
      type: 'symbo:auth.required',
      payload: { loginUrl: 'https://app.symbo.ai/login?guest=abc', reloadReason: 'logout' },
      protocolVersion: 2,
    })
    expect(authRequired).toHaveBeenCalledWith({
      loginUrl: 'https://app.symbo.ai/login?guest=abc',
      reloadReason: 'logout',
    })
    dialer.destroy()
  })

  it('follows the resumable session through ready, getState and session.started', async () => {
    const dialer = SymboDialer.create({ container: env.makeContainer(), appUrl: APP_URL })
    const mounting = dialer.mount()
    const symbo = fakeSymbo(env, dialer)
    expect(dialer.resumableSession).toBeNull()
    symbo.load()
    const resumable = { dialSessionId: 'ds-7', status: 'paused' }
    symbo.ready({ capabilities: CURRENT, resumableSession: resumable })
    await mounting
    expect(dialer.resumableSession).toEqual(resumable)

    // Started: nothing left to pick up.
    symbo.event('symbo:session.started', { dialSessionId: 'ds-7', concurrentCalls: 2, dialing: false })
    expect(dialer.resumableSession).toBeNull()

    // getState says what is resumable now; an older frame's state does not
    // carry the key, and leaves the property alone.
    const asking = dialer.getState()
    symbo.answer(symbo.lastCommand().requestId, { signedIn: true, resumableSession: { dialSessionId: 'ds-8', status: 'new' } })
    await asking
    expect(dialer.resumableSession).toEqual({ dialSessionId: 'ds-8', status: 'new' })
    const older = dialer.getState()
    symbo.answer(symbo.lastCommand().requestId, { signedIn: true })
    await older
    expect(dialer.resumableSession).toEqual({ dialSessionId: 'ds-8', status: 'new' })

    // A frame that reloads takes it with it, and an older frame's ready has none.
    symbo.load()
    expect(dialer.resumableSession).toBeNull()
    symbo.ready()
    expect(dialer.resumableSession).toBeNull()
  })

  it('keeps the warning codes and the new client code where they belong', () => {
    expect(WARNINGS.DEVICE_ENDPOINT_FAILED).toBe('DEVICE_ENDPOINT_FAILED')
    expect(WARNINGS.SIGNED_OUT_ELSEWHERE).toBe('SIGNED_OUT_ELSEWHERE')
    // Warning-only: never a refusal.
    expect(ERRORS).not.toHaveProperty('DEVICE_ENDPOINT_FAILED')
    expect(ERRORS).not.toHaveProperty('SIGNED_OUT_ELSEWHERE')
    expect(CLIENT_ERRORS.NOT_SUPPORTED).toBe('NOT_SUPPORTED')
    expect(ERRORS).not.toHaveProperty('NOT_SUPPORTED')
  })
})
