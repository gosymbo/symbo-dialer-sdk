import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

import { SymboDialer } from '../src/index.js'
import { installFakeDom } from './helpers/fakeDom.js'
import { loadStub } from './helpers/stubFrame.js'

const PROFILE_ID = 'profile-test-0001'

// The example's offline stub, driven through the real client. Nothing here
// tests the stub for its own sake: it checks that a partner following the
// README against the stub sees the sequence the README promises, so the
// example keeps demonstrating the contract rather than a version of it.

const STUB_ORIGIN = 'http://localhost:3000'

describe('the offline stub, driven through the SDK', () => {
  let env

  beforeEach(() => {
    vi.useFakeTimers()
    env = installFakeDom()
  })

  afterEach(() => {
    env.uninstall()
    vi.useRealTimers()
  })

  // `before` runs with the client mounted but the frame not yet loaded, for
  // listeners that must be in place before the stub's first (synchronous)
  // answer.
  const mountOnStub = async ({ signedIn = true, mode = 'compact', query, before } = {}) => {
    const dialer = SymboDialer.create({
      container: env.makeContainer(),
      appUrl: STUB_ORIGIN,
      mode,
    })
    const mounting = dialer.mount()
    const stub = loadStub(env, dialer, { signedIn, mode, query })
    before?.(dialer)
    dialer.iframe.dispatch('load')
    return { dialer, stub, mounting }
  }

  it('answers hello with ready, then registers the device', async () => {
    const { dialer, stub, mounting } = await mountOnStub()
    const deviceReady = vi.fn()
    dialer.on('device.ready', deviceReady)

    expect(await mounting).toBe(dialer)
    expect(dialer.user.name).toBe('Sam Rep')
    expect(dialer.organization.name).toBe('Acme Collections')
    // No session yet: what one gets when nobody sets its number of lines.
    expect(dialer.concurrentCalls).toBe(1)
    expect(dialer.concurrentCallsLocked).toBe(false)
    expect(dialer.hasCapability('session')).toBe(true)
    expect(dialer.hasCapability('concurrentCalls')).toBe(true)
    expect(dialer.deviceReady).toBe(false)

    await vi.advanceTimersByTimeAsync(300)
    expect(deviceReady).toHaveBeenCalled()
    expect(dialer.deviceReady).toBe(true)
    expect(stub.sentOfType('symbo:resize')).toEqual([{ width: 360, height: 56 }])
  })

  it('asks for a sign-in once, accepts a signed token, and refuses bad ones', async () => {
    const authRequired = vi.fn()
    const warning = vi.fn()
    const { dialer, stub, mounting } = await mountOnStub({
      signedIn: false,
      before: (d) => {
        d.on('auth.required', authRequired)
        d.on('warning', warning)
      },
    })

    // The SDK keeps saying hello until it is answered; the stub answers once.
    await vi.advanceTimersByTimeAsync(2000)
    expect(authRequired).toHaveBeenCalledTimes(1)
    expect(authRequired.mock.calls[0][0].loginUrl).toContain('/example/stub/login/?guest=')
    expect(warning).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'NOT_SIGNED_IN' })
    )
    expect(dialer.ready).toBe(false)

    await expect(
      dialer.signIn({ token: 'expired', profileId: PROFILE_ID })
    ).rejects.toMatchObject({
      code: 'TOKEN_REJECTED',
    })
    // A missing profileId never reaches the frame: the SDK refuses it locally.
    await expect(
      dialer.signIn({ token: 'abc', profileId: '' })
    ).rejects.toMatchObject({
      code: 'INVALID_OPTIONS',
    })
    await expect(dialer.dial({ number: '+1' })).rejects.toMatchObject({ code: 'NOT_READY' })

    const result = await dialer.signIn({
      token: 'demo-token',
      profileId: PROFILE_ID,
    })
    expect(result.user.name).toBe('Sam Rep')
    expect(await mounting).toBe(dialer)
    expect(dialer.warnings.has('NOT_SIGNED_IN')).toBe(false)
    expect(stub.storage.get('symbo-stub:signedIn')).toBe('1')
  })

  it('signs the rep out and forgets them, so a different rep can sign in', async () => {
    const { dialer, stub, mounting } = await mountOnStub()
    await mounting
    expect(dialer.hasCapability('signOut')).toBe(true)

    expect(await dialer.signOut()).toEqual({ signedOut: true })
    // Forgotten at once, and the frame reloads signed out, as Symbo's logout
    // does; the reloaded frame is what says auth.required.
    expect(stub.storage.has('symbo-stub:signedIn')).toBe(false)
    await vi.advanceTimersByTimeAsync(300)
    expect(stub.reloads).toHaveLength(1)
  })

  it('answers signedOut: false when nobody is signed in', async () => {
    const { dialer } = await mountOnStub({ signedIn: false })
    await vi.advanceTimersByTimeAsync(2000)
    expect(dialer.ready).toBe(false)
    // Allowed before ready, like signIn: signing out is how a page gets back
    // to a clean frame whatever state it is in.
    expect(await dialer.signOut()).toEqual({ signedOut: false })
  })

  it('will not sign out over a running session', async () => {
    const { dialer, stub, mounting } = await mountOnStub()
    await mounting
    await vi.advanceTimersByTimeAsync(300)
    await dialer.session.start({ dialSessionId: 'ds-demo' })

    await expect(dialer.signOut()).rejects.toMatchObject({ code: 'SESSION_ACTIVE' })
    expect(stub.storage.get('symbo-stub:signedIn')).toBe('1')
  })

  it('replays a two-line session: ringing x2, one connected, post-call, save, resume', async () => {
    const { dialer, mounting } = await mountOnStub()
    await mounting
    await vi.advanceTimersByTimeAsync(300)

    const seen = []
    dialer.on('*', (name, payload) => {
      if (name.startsWith('session.') || name === 'call.completed') seen.push([name, payload])
    })
    const names = () => seen.map(([n]) => n)

    expect(await dialer.session.start({ dialSessionId: 'ds-demo' })).toEqual({
      dialSessionId: 'ds-demo',
      concurrentCalls: 2,
      concurrentCallsLocked: false,
      dialing: true,
    })
    await expect(dialer.session.start({ dialSessionId: 'ds-demo' })).rejects.toMatchObject({
      code: 'SESSION_ALREADY_ACTIVE',
    })
    // The engine is dialing: the line is the session's.
    await expect(dialer.dial({ number: '+1' })).rejects.toMatchObject({ code: 'SESSION_ACTIVE' })

    // Round one: two legs ring, the second answers, the first is cancelled.
    await vi.advanceTimersByTimeAsync(2100)
    expect(names()).toEqual([
      'session.started',
      'session.queue.updated',
      'session.queue.updated',
      'session.leg.ringing',
      'session.leg.ringing',
      'session.leg.answered',
      'session.leg.connected',
      'session.leg.ended',
      'session.paused',
      'session.queue.updated',
    ])
    const ringing = seen.filter(([n]) => n === 'session.leg.ringing').map(([, p]) => p.queuedCallId)
    expect(ringing).toEqual(['q-1', 'q-2'])
    const connected = seen.find(([n]) => n === 'session.leg.connected')[1]
    expect(connected).toMatchObject({
      dialSessionId: 'ds-demo',
      queuedCallId: 'q-2',
      prospectId: 'p-1002',
      prospectName: 'Marcus Bell',
      status: 'connected',
    })
    expect(seen.find(([n]) => n === 'session.leg.ended')[1]).toMatchObject({
      queuedCallId: 'q-1',
      reason: 'answered_elsewhere',
    })
    expect(seen.find(([n]) => n === 'session.paused')[1]).toEqual({
      dialSessionId: 'ds-demo',
      reason: 'connected',
    })

    const state = await dialer.getState()
    expect(state.session.status).toBe('connected')
    expect(state.session.legs).toHaveLength(1)
    expect(state.session.counts).toMatchObject({ dialing: 1, attempted: 1, queued: 4, remaining: 4 })

    // The rep hangs up: the leg ends and the frame asks for an outcome.
    seen.length = 0
    await vi.advanceTimersByTimeAsync(1000)
    expect(await dialer.hangUp()).toEqual({})
    expect(names()).toEqual(['session.leg.ended', 'session.postCall', 'session.queue.updated'])
    const postCall = seen[1][1]
    expect(postCall).toMatchObject({
      dialSessionId: 'ds-demo',
      callId: connected.callId,
      queuedCallId: 'q-2',
      prospectId: 'p-1002',
      answered: true,
      outcomeRequired: true,
    })
    expect(postCall.durationSeconds).toBeGreaterThanOrEqual(1)

    // Nothing moves until the outcome is saved.
    await expect(dialer.session.resume()).rejects.toMatchObject({ code: 'OUTCOME_PENDING' })
    await expect(dialer.hangUp()).rejects.toMatchObject({ code: 'NO_ACTIVE_CALL' })
    await expect(
      dialer.session.saveOutcome({ outcomeId: 'o-nope', then: 'resume' })
    ).rejects.toMatchObject({ code: 'OUTCOME_UNKNOWN' })
    await expect(
      dialer.session.saveOutcome({ outcomeId: 'o-callback', then: 'resume' })
    ).rejects.toMatchObject({ code: 'NOTE_REQUIRED' })

    seen.length = 0
    expect(
      await dialer.session.saveOutcome({
        callId: postCall.callId,
        outcomeId: 'o-meeting',
        note: 'Thursday 10am',
        then: 'resume',
      })
    ).toEqual({ callId: postCall.callId, outcomeId: 'o-meeting' })
    expect(names().slice(0, 3)).toEqual(['call.completed', 'session.queue.updated', 'session.resumed'])
    expect(seen[0][1]).toMatchObject({
      callId: postCall.callId,
      prospectId: 'p-1002',
      outcomeId: 'o-meeting',
      outcome: 'Meeting booked',
      dispositionGroup: 'answered',
      note: 'Thursday 10am',
    })
    await expect(
      dialer.session.saveOutcome({ outcomeId: 'o-meeting', then: 'resume' })
    ).rejects.toMatchObject({ code: 'NO_CALL_TO_SAVE' })

    // Round two: q-3 and q-4 ring, nobody answers, the engine moves on by
    // itself to round three, where q-5 answers.
    seen.length = 0
    await vi.advanceTimersByTimeAsync(6000)
    const endedReasons = seen
      .filter(([n]) => n === 'session.leg.ended')
      .map(([, p]) => [p.queuedCallId, p.reason])
    expect(endedReasons).toEqual([
      ['q-4', 'busy'],
      ['q-3', 'no_answer'],
      ['q-6', 'answered_elsewhere'],
    ])
    expect(seen.find(([n]) => n === 'session.leg.connected')[1].queuedCallId).toBe('q-5')

    const queue = await dialer.session.getQueue()
    expect(queue.dialSessionId).toBe('ds-demo')
    expect(queue.queue.map((r) => [r.queuedCallId, r.status])).toEqual([
      ['q-1', 'attempted'],
      ['q-2', 'completed'],
      ['q-3', 'attempted'],
      ['q-4', 'attempted'],
      ['q-5', 'dialing'],
      ['q-6', 'attempted'],
    ])

    // Skip the connected call: no outcome asked for.
    seen.length = 0
    expect(await dialer.session.skipCurrent()).toEqual({})
    expect(names()).toEqual(['session.leg.ended', 'session.queue.updated'])
    expect(seen[0][1]).toMatchObject({ queuedCallId: 'q-5', reason: 'cancelled' })

    // Nothing left: resuming runs out of calls. The engine never resumed, so
    // there is no session.resumed, and nothing ends the session: it stays
    // loaded and paused, its line down, until it is ended or held.
    seen.length = 0
    expect(await dialer.session.resume()).toEqual({})
    expect(names()).toEqual(['session.noMoreCalls'])
    expect(seen[0][1]).toMatchObject({ dialSessionId: 'ds-demo', sessionOpen: true })
    expect(seen[0][1].counts).toMatchObject({
      queued: 0,
      remaining: 0,
      completed: 1,
      cancelled: 1,
      attempted: 4,
    })
    const open = await dialer.getState()
    expect(open.session.status).toBe('paused')
    await expect(dialer.setMuted(true)).rejects.toMatchObject({ code: 'NO_ACTIVE_CALL' })

    seen.length = 0
    const ended = await dialer.session.end()
    expect(names()).toEqual(['session.ended'])
    expect(ended).toEqual({ dialSessionId: 'ds-demo', counts: open.session.counts })
    await expect(dialer.session.pause()).rejects.toMatchObject({ code: 'NO_ACTIVE_SESSION' })
  })

  it('a save that stays paused says so; a save that resumes waits for realtime', async () => {
    const { dialer, stub, mounting } = await mountOnStub()
    await mounting
    await vi.advanceTimersByTimeAsync(300)
    const seen = []
    dialer.on('*', (name, payload) => seen.push([name, payload]))
    const names = () => seen.map(([n]) => n)

    await dialer.session.start({ dialSessionId: 'ds-demo' })
    await vi.advanceTimersByTimeAsync(3100)
    await dialer.hangUp()
    expect((await dialer.getState()).session.status).toBe('post_call')
    stub.poke('stub:realtimeBlip')

    await expect(
      dialer.session.saveOutcome({ outcomeId: 'o-meeting', then: 'resume' })
    ).rejects.toMatchObject({ code: 'REALTIME_DISCONNECTED' })

    seen.length = 0
    await dialer.session.saveOutcome({ outcomeId: 'o-meeting', then: 'pause' })
    expect(names()).toEqual(['call.completed', 'session.queue.updated', 'session.paused'])
    expect(seen[2][1]).toEqual({ dialSessionId: 'ds-demo', reason: 'requested' })
    expect((await dialer.getState()).session.status).toBe('paused')

    await vi.advanceTimersByTimeAsync(3000)
    seen.length = 0
    await dialer.session.resume()
    expect(names()[0]).toBe('session.resumed')
  })

  it('pause hangs up ringing legs, end refuses over a connected call unless forced', async () => {
    const { dialer, mounting } = await mountOnStub()
    await mounting
    await vi.advanceTimersByTimeAsync(300)
    const seen = []
    dialer.on('*', (name, payload) => seen.push([name, payload]))

    await dialer.session.start({ dialSessionId: 'ds-demo' })
    await vi.advanceTimersByTimeAsync(500)
    seen.length = 0

    await dialer.session.pause()
    expect(seen.map(([n]) => n)).toEqual([
      'session.leg.ended',
      'session.leg.ended',
      'session.paused',
      'session.queue.updated',
    ])
    expect(seen[0][1].reason).toBe('cancelled')
    expect(seen[2][1]).toEqual({ dialSessionId: 'ds-demo', reason: 'requested' })

    await expect(dialer.session.removeQueued('q-nope')).rejects.toMatchObject({
      code: 'QUEUED_CALL_NOT_FOUND',
    })
    await dialer.session.removeQueued('q-6')

    // Round two (q-3, q-4) goes unanswered; round three connects q-5.
    seen.length = 0
    await dialer.session.resume()
    await vi.advanceTimersByTimeAsync(5000)
    expect(seen.map(([n]) => n)).toContain('session.leg.connected')
    await expect(dialer.session.removeQueued('q-5')).rejects.toMatchObject({
      code: 'QUEUED_CALL_DIALING',
    })

    await expect(dialer.session.end()).rejects.toMatchObject({ code: 'CALL_IN_PROGRESS' })
    seen.length = 0
    const { counts } = await dialer.session.end({ force: true })
    expect(counts.removed).toBe(1)
    expect(seen.map(([n]) => n)).toEqual(['session.leg.ended', 'session.ended'])
    expect((await dialer.getState()).session).toBeNull()
  })

  it('rings an inbound call while idle and lets the page answer or ignore it', async () => {
    const { dialer, stub, mounting } = await mountOnStub()
    await mounting
    const seen = []
    dialer.on('*', (name, payload) => seen.push([name, payload]))

    await expect(dialer.answerIncoming()).rejects.toMatchObject({ code: 'NO_INCOMING_CALL' })

    await vi.advanceTimersByTimeAsync(6000)
    const incoming = seen.find(([n]) => n === 'call.incoming')
    expect(incoming[1]).toMatchObject({
      from: '+12025550188',
      prospectId: 'p-1003',
      prospectName: 'Priya Anand',
    })
    expect((await dialer.getState()).incoming.callId).toBe(incoming[1].callId)

    seen.length = 0
    await dialer.ignoreIncoming()
    expect(seen.map(([n]) => n)).toEqual(['call.ended'])
    expect(seen[0][1]).toMatchObject({ callId: incoming[1].callId, reason: 'ignored' })

    // The example page pokes the stub to ring again; answer this one.
    seen.length = 0
    stub.poke('stub:ringInbound')
    const second = seen.find(([n]) => n === 'call.incoming')[1]
    expect(await dialer.answerIncoming()).toEqual({ callId: second.callId })
    // The far end hangs up after 6 s. An answered inbound call ends at
    // call.postCall, like a one-off call; call.completed only follows a save.
    await vi.advanceTimersByTimeAsync(8000)
    expect(seen.map(([n]) => n)).toEqual([
      'call.incoming',
      'call.answered',
      'call.ended',
      'call.postCall',
    ])
    expect(seen[3][1]).toMatchObject({ callId: second.callId, answered: true, outcomeRequired: true })
  })

  it('places a one-off call by prospect and by number', async () => {
    const { dialer, mounting } = await mountOnStub()
    await mounting
    await vi.advanceTimersByTimeAsync(300)
    const seen = []
    dialer.on('*', (name, payload) => seen.push([name, payload]))

    await expect(dialer.dial({ prospectId: 'p-9' })).rejects.toMatchObject({
      code: 'PROSPECT_NOT_FOUND',
    })
    const { callId } = await dialer.dial({ prospectId: 'p-1004' })
    expect(seen[0]).toEqual([
      'call.started',
      { callId, number: '+16175550119', from: '+13855550147', externalId: null, prospectId: 'p-1004' },
    ])
    await expect(dialer.dial({ number: '+1' })).rejects.toMatchObject({ code: 'CALL_IN_PROGRESS' })

    await vi.advanceTimersByTimeAsync(2000)
    expect(await dialer.hangUp()).toEqual({})
    await vi.advanceTimersByTimeAsync(2000)
    // call.postCall ends a one-off call; call.completed only follows a save
    // (dialer.saveOutcome).
    expect(seen.map(([n]) => n)).toEqual([
      'call.started',
      'call.ringing',
      'call.answered',
      'call.ended',
      'call.postCall',
    ])
    expect(seen[3][1]).toMatchObject({ callId, reason: 'hangup' })

    seen.length = 0
    await dialer.dial({ number: '+12125550123', externalId: 'case-1' })
    await vi.advanceTimersByTimeAsync(2500)
    expect(seen.map(([n]) => n)).toEqual([
      'call.started',
      'call.ringing',
      'call.answered',
      'contact.matched',
    ])
    expect(seen[3][1].prospect).toEqual({ id: 'p-1001', fullName: 'Jane Doe' })
  })

  it('mutes and plays keypad digits on the call that is up, and unmutes when it ends', async () => {
    const { dialer, mounting } = await mountOnStub()
    await mounting
    await vi.advanceTimersByTimeAsync(300)
    expect(dialer.hasCapability('mute')).toBe(true)
    expect(dialer.hasCapability('dtmf')).toBe(true)
    const seen = []
    dialer.on('*', (name, payload) => seen.push([name, payload]))

    await expect(dialer.setMuted(true)).rejects.toMatchObject({ code: 'NO_ACTIVE_CALL' })
    await expect(dialer.sendDigits('1')).rejects.toMatchObject({ code: 'NO_ACTIVE_CALL' })

    await dialer.dial({ prospectId: 'p-1004' })
    await vi.advanceTimersByTimeAsync(2000)
    seen.length = 0

    expect(await dialer.setMuted(true)).toEqual({ muted: true })
    expect(dialer.muted).toBe(true)
    // Already muted: answered, and no event, since nothing changed.
    expect(await dialer.setMuted(true)).toEqual({ muted: true })
    expect(seen).toEqual([['call.muteChanged', { muted: true }]])
    expect((await dialer.getState()).muted).toBe(true)

    // Played 200 ms apart, the second call after the first.
    const menu = dialer.sendDigits('12#')
    const extension = dialer.sendDigits('4')
    const answered = vi.fn()
    menu.then(answered)
    extension.then(answered)
    await vi.advanceTimersByTimeAsync(399)
    expect(answered).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(answered).toHaveBeenLastCalledWith({ digits: '12#' })
    await vi.advanceTimersByTimeAsync(200)
    expect(answered).toHaveBeenLastCalledWith({ digits: '4' })

    seen.length = 0
    await dialer.hangUp()
    expect(seen.map(([n]) => n)).toEqual(['call.ended', 'call.postCall', 'call.muteChanged'])
    expect(seen[2][1]).toEqual({ muted: false })
    expect(dialer.muted).toBe(false)
  })

  it("keeps mute for as long as the rep's line in a session, and sends digits only to whoever answered", async () => {
    const { dialer, mounting } = await mountOnStub()
    await mounting
    await vi.advanceTimersByTimeAsync(300)
    const seen = []
    dialer.on('call.muteChanged', (payload) => seen.push(payload))

    // Muted while the first round rings: nobody has answered to hear digits.
    await dialer.session.start({ dialSessionId: 'ds-demo' })
    await dialer.setMuted(true)
    await expect(dialer.sendDigits('1')).rejects.toMatchObject({
      code: 'NO_ACTIVE_CALL',
      message: 'Nobody has answered to hear the digits.',
    })

    // q-2 connects: still muted, and the keypad reaches it.
    await vi.advanceTimersByTimeAsync(2100)
    expect((await dialer.getState()).muted).toBe(true)
    const pressing = dialer.sendDigits('12')
    await vi.advanceTimersByTimeAsync(200)
    expect(await pressing).toEqual({ digits: '12' })

    // The contact hangs up part-way through a string: the rest are dropped.
    // The rep's line stays up, and so does mute.
    await vi.advanceTimersByTimeAsync(5400)
    const late = dialer.sendDigits('3456')
    late.catch(() => {})
    await vi.advanceTimersByTimeAsync(1000)
    await expect(late).rejects.toMatchObject({ code: 'NO_ACTIVE_CALL', message: 'The call ended after 2 of 4 digits.' })
    expect((await dialer.getState()).muted).toBe(true)
    expect(seen).toEqual([{ muted: true }])

    // Saved and dialing on, still muted; the rep hanging up the next contact
    // drops the rep's line and the mute with it.
    await dialer.session.saveOutcome({ outcomeId: 'o-connected', then: 'resume' })
    await vi.advanceTimersByTimeAsync(3000)
    await vi.advanceTimersByTimeAsync(3000)
    expect(dialer.muted).toBe(true)
    await dialer.hangUp()
    expect(seen).toEqual([{ muted: true }, { muted: false }])
    await expect(dialer.setMuted(true)).rejects.toMatchObject({ code: 'NO_ACTIVE_CALL' })

    // That was the last contact. A new session brings the line back,
    // unmuted, and pausing it while lines ring drops it again.
    await dialer.session.saveOutcome({ outcomeId: 'o-connected', then: 'end' })
    await dialer.session.start({ dialSessionId: 'ds-demo-2' })
    expect(dialer.muted).toBe(false)
    expect(await dialer.setMuted(true)).toEqual({ muted: true })
    await dialer.session.pause()
    expect(dialer.muted).toBe(false)
    await expect(dialer.sendDigits('1')).rejects.toMatchObject({ code: 'NO_ACTIVE_CALL', message: 'There is no active call.' })
  })

  it('lists and switches audio devices, and raises warnings the page can act on', async () => {
    const { dialer, stub, mounting } = await mountOnStub()
    await mounting
    await expect(dialer.audio.list()).rejects.toMatchObject({ code: 'DEVICE_NOT_READY' })

    await vi.advanceTimersByTimeAsync(300)
    const devices = await dialer.audio.list()
    expect(devices.microphones).toHaveLength(2)
    expect(devices.selected).toEqual({ microphoneId: 'mic-default', speakerId: 'spk-default' })

    const changed = vi.fn()
    dialer.on('audio.devicesChanged', changed)
    const after = await dialer.audio.set({ speakerId: 'spk-headset' })
    expect(after.selected.speakerId).toBe('spk-headset')
    expect(changed).toHaveBeenCalledWith(after)
    await expect(dialer.audio.set({ microphoneId: 'mic-nope' })).rejects.toMatchObject({
      code: 'AUDIO_DEVICE_NOT_FOUND',
    })

    const warning = vi.fn()
    const cleared = vi.fn()
    dialer.on('warning', warning)
    dialer.on('warning.cleared', cleared)
    stub.poke('stub:realtimeBlip')
    expect(warning).toHaveBeenCalledWith(expect.objectContaining({ code: 'REALTIME_DISCONNECTED' }))
    await expect(dialer.session.start({ dialSessionId: 'ds-1' })).rejects.toMatchObject({
      code: 'REALTIME_DISCONNECTED',
    })
    await vi.advanceTimersByTimeAsync(3000)
    expect(cleared).toHaveBeenCalledWith({ code: 'REALTIME_DISCONNECTED' })
    expect(dialer.warnings.size).toBe(0)
  })

  it('renders nothing in hidden mode', async () => {
    const { stub, mounting } = await mountOnStub({ mode: 'hidden' })
    await mounting
    expect(stub.sentOfType('symbo:resize')).toEqual([])
    expect(stub.element('state').textContent).toBe('')
  })
  it('changes the number of lines mid-session, from the next round', async () => {
    const { dialer, stub, mounting } = await mountOnStub()
    await mounting
    await vi.advanceTimersByTimeAsync(300)
    const seen = []
    dialer.on('*', (name, payload) => {
      if (name.startsWith('session.')) seen.push([name, payload])
    })

    await dialer.session.start({ dialSessionId: 'ds-demo' })
    expect(dialer.concurrentCalls).toBe(2)
    // As from the frame: session.started first, then the answer.
    const posted = stub.sent.map((m) => m.data.type)
    expect(posted.indexOf('symbo:session.started')).toBeLessThan(posted.lastIndexOf('symbo:result'))

    // Round one is ringing two lines; the change leaves it alone.
    expect(await dialer.session.setConcurrentCalls(3)).toEqual({ dialSessionId: 'ds-demo', concurrentCalls: 3 })
    expect(seen.filter(([n]) => n === 'session.concurrentCallsChanged').map(([, p]) => p)).toEqual([
      { dialSessionId: 'ds-demo', concurrentCalls: 3, concurrentCallsLocked: false },
    ])
    expect(dialer.concurrentCalls).toBe(3)
    expect((await dialer.getState()).session.concurrentCalls).toBe(3)

    // The same number again changes nothing and says nothing.
    seen.length = 0
    await dialer.session.setConcurrentCalls(3)
    expect(seen.filter(([n]) => n === 'session.concurrentCallsChanged')).toEqual([])

    await vi.advanceTimersByTimeAsync(2100)
    const ringing = () => seen.filter(([n]) => n === 'session.leg.ringing').map(([, p]) => p.queuedCallId)
    expect(ringing()).toEqual(['q-1', 'q-2'])

    // After the conversation, the next round rings three.
    await vi.advanceTimersByTimeAsync(1000)
    await dialer.hangUp()
    seen.length = 0
    await dialer.session.saveOutcome({ outcomeId: 'o-meeting', then: 'resume' })
    await vi.advanceTimersByTimeAsync(500)
    expect(ringing()).toEqual(['q-3', 'q-4', 'q-5'])

    await dialer.session.end({ force: true })
    await expect(dialer.session.setConcurrentCalls(2)).rejects.toMatchObject({ code: 'NO_ACTIVE_SESSION' })
  })

  it('holds every session to the organization lock', async () => {
    const { dialer, mounting } = await mountOnStub({ query: 'lockLines=2' })
    await mounting
    await vi.advanceTimersByTimeAsync(300)
    expect(dialer.concurrentCalls).toBe(2)
    expect(dialer.concurrentCallsLocked).toBe(true)

    await expect(
      dialer.session.start({ dialSessionId: 'ds-demo', concurrentCalls: 3 })
    ).rejects.toMatchObject({ code: 'CONCURRENT_CALLS_LOCKED' })
    expect(await dialer.session.start({ dialSessionId: 'ds-demo', concurrentCalls: 2 })).toEqual({
      dialSessionId: 'ds-demo',
      concurrentCalls: 2,
      concurrentCallsLocked: true,
      dialing: true,
    })
    await expect(dialer.session.setConcurrentCalls(4)).rejects.toMatchObject({ code: 'CONCURRENT_CALLS_LOCKED' })
    expect(await dialer.session.setConcurrentCalls(2)).toEqual({ dialSessionId: 'ds-demo', concurrentCalls: 2 })
    expect(dialer.concurrentCalls).toBe(2)
  })
  it('reloads on request, but not while a session runs, and announces a newer build', async () => {
    const { dialer, stub, mounting } = await mountOnStub({ query: 'updateAfter=1000' })
    await mounting
    await vi.advanceTimersByTimeAsync(300)
    expect(dialer.hasCapability('reload')).toBe(true)
    expect(dialer.updateAvailable).toBe(false)

    const available = vi.fn()
    dialer.on('update.available', available)
    await vi.advanceTimersByTimeAsync(1000)
    expect(available).toHaveBeenCalledTimes(1)
    expect(dialer.updateAvailable).toBe(true)

    await dialer.session.start({ dialSessionId: 'ds-demo' })
    await expect(dialer.reload()).rejects.toMatchObject({ code: 'SESSION_ACTIVE' })
    expect(stub.reloads).toHaveLength(0)

    await dialer.session.end({ force: true })
    expect(await dialer.reload()).toEqual({ reloading: true })
    await vi.advanceTimersByTimeAsync(300)
    expect(stub.reloads).toHaveLength(1)
  })

  it('reloads hard on request', async () => {
    const { dialer, stub, mounting } = await mountOnStub()
    await mounting
    expect(dialer.hasCapability('hardReload')).toBe(true)
    expect(await dialer.reload({ hard: true })).toEqual({ reloading: true, hard: true })
    await vi.advanceTimersByTimeAsync(300)
    expect(stub.reloads).toHaveLength(1)
  })

  /* ------------------------------------------------ calls during a session */

  // A client on the stub, device registered, every event recorded.
  const readyOnStub = async (options) => {
    const { dialer, stub, mounting } = await mountOnStub(options)
    await mounting
    await vi.advanceTimersByTimeAsync(300)
    const seen = []
    dialer.on('*', (name, payload) => seen.push([name, payload]))
    const names = () => seen.map(([n]) => n)
    const last = (name) => seen.filter(([n]) => n === name).pop()?.[1]
    return { dialer, stub, seen, names, last }
  }

  it('places and answers calls while a paused session has its line down, and not while the session has it', async () => {
    const { dialer, stub, seen, names, last } = await readyOnStub()
    expect(dialer.hasCapability('callsWhilePaused')).toBe(true)

    // Dialing: the line is the session's, and no inbound call is offered.
    await dialer.session.start({ dialSessionId: 'ds-demo' })
    await expect(dialer.dial({ number: '+1' })).rejects.toMatchObject({
      code: 'SESSION_ACTIVE',
      message:
        'A power-dial session is dialing or has a call in front of the rep. Pause the session, or finish its post-call step, before dialing.',
    })
    stub.poke('stub:ringInbound')
    expect(names()).not.toContain('call.incoming')

    // Paused: an ordinary call goes out, and the session waits for it.
    await dialer.session.pause()
    seen.length = 0
    const { callId } = await dialer.dial({ number: '+12125550123' })
    expect(names()).toEqual(['call.started'])
    const state = await dialer.getState()
    expect(state.session.status).toBe('paused')
    expect(state.call).toMatchObject({ callId, status: 'dialing' })
    await expect(dialer.session.resume()).rejects.toMatchObject({
      code: 'CALL_IN_PROGRESS',
      message: 'Another call is in progress. Resume the session once it has ended.',
    })
    await vi.advanceTimersByTimeAsync(2000)
    seen.length = 0
    await dialer.hangUp()
    expect(names()).toEqual(['call.ended', 'call.postCall'])

    // An inbound call rings while the session is paused, and is taken.
    stub.poke('stub:ringInbound')
    const ring = last('call.incoming')
    expect(await dialer.answerIncoming()).toEqual({ callId: ring.callId })
    await expect(dialer.dial({ number: '+1' })).rejects.toMatchObject({ code: 'CALL_IN_PROGRESS' })
    await dialer.hangUp()

    // The line is free again: the session dials on.
    seen.length = 0
    await dialer.session.resume()
    expect(names()[0]).toBe('session.resumed')
  })

  it("answers over a session's connected call with endCurrent, Symbo's End & Accept", async () => {
    const { dialer, stub, seen, names, last } = await readyOnStub()
    expect(dialer.hasCapability('callWaiting')).toBe(true)
    await dialer.session.start({ dialSessionId: 'ds-demo' })
    await vi.advanceTimersByTimeAsync(2100)
    await dialer.setMuted(true)

    // Offered during the conversation, but not taken over it unasked.
    stub.poke('stub:ringInbound')
    const ring = last('call.incoming')
    await expect(dialer.answerIncoming()).rejects.toMatchObject({
      code: 'SESSION_ACTIVE',
      message:
        'A power-dial session call is in front of the rep. Answer with { endCurrent: true } to end it and take this call.',
    })

    seen.length = 0
    expect(await dialer.answerIncoming({ endCurrent: true })).toEqual({ callId: ring.callId })
    expect(names()).toEqual([
      'session.leg.ended',
      'session.postCall',
      'session.queue.updated',
      'call.muteChanged',
      'session.paused',
      'call.answered',
    ])
    expect(seen[1][1]).toMatchObject({ queuedCallId: 'q-2', outcomeRequired: true })
    expect(seen[4][1]).toEqual({ dialSessionId: 'ds-demo', reason: 'incoming' })
    const state = await dialer.getState()
    expect(state.session.status).toBe('post_call')
    expect(state.call).toMatchObject({ callId: ring.callId, status: 'connected' })

    // The session waits for the inbound call, then for its own outcome.
    await expect(dialer.session.resume()).rejects.toMatchObject({ code: 'CALL_IN_PROGRESS' })
    await dialer.hangUp()
    await expect(dialer.session.resume()).rejects.toMatchObject({ code: 'OUTCOME_PENDING' })
    seen.length = 0
    await dialer.session.saveOutcome({ outcomeId: 'o-connected', then: 'resume' })
    expect(names()).toContain('session.resumed')
  })

  it('answers over a one-off call with endCurrent; the ended call is saved by id', async () => {
    const { dialer, stub, seen, names, last } = await readyOnStub()
    const { callId: first } = await dialer.dial({ prospectId: 'p-1004' })
    await vi.advanceTimersByTimeAsync(2000)
    stub.poke('stub:ringInbound')
    const ring = last('call.incoming')
    await expect(dialer.answerIncoming()).rejects.toMatchObject({
      code: 'CALL_IN_PROGRESS',
      message: 'A call is already active. Hang up, or answer with { endCurrent: true }.',
    })

    seen.length = 0
    expect(await dialer.answerIncoming({ endCurrent: true })).toEqual({ callId: ring.callId })
    expect(names()).toEqual(['call.ended', 'call.postCall', 'call.answered'])
    expect(seen[0][1]).toMatchObject({ callId: first, reason: 'hangup' })

    // Answering dropped that call's post-call step, as End & Accept does in
    // Symbo; its outcome is still saved by id, quietly.
    seen.length = 0
    expect(
      await dialer.saveOutcome({ callId: first, outcomeId: 'o-callback', note: 'Ring back Monday' })
    ).toEqual({ callId: first, outcomeId: 'o-callback' })
    expect(names()).toEqual([])
  })

  it("pauses from the post-call step by dropping the rep's line; the call stays until it is saved", async () => {
    const { dialer, seen, names } = await readyOnStub()
    await dialer.session.start({ dialSessionId: 'ds-demo' })
    await vi.advanceTimersByTimeAsync(2100)
    await dialer.setMuted(true)
    // The contact hangs up; the rep's line stays up.
    await vi.advanceTimersByTimeAsync(6000)
    expect((await dialer.getState()).session.status).toBe('post_call')
    expect(dialer.muted).toBe(true)

    seen.length = 0
    expect(await dialer.session.pause()).toEqual({})
    expect(names()).toEqual(['call.muteChanged', 'session.paused', 'session.queue.updated'])
    expect(seen[1][1]).toEqual({ dialSessionId: 'ds-demo', reason: 'requested' })
    expect((await dialer.getState()).session.status).toBe('post_call')
    await expect(dialer.setMuted(true)).rejects.toMatchObject({ code: 'NO_ACTIVE_CALL' })
    await expect(dialer.dial({ number: '+1' })).rejects.toMatchObject({ code: 'SESSION_ACTIVE' })

    seen.length = 0
    await dialer.session.saveOutcome({ outcomeId: 'o-meeting', then: 'pause' })
    expect(names()).toEqual(['call.completed', 'session.queue.updated', 'session.paused'])
    expect((await dialer.getState()).session.status).toBe('paused')
    // The call has left the rep's view: the line is free.
    expect((await dialer.dial({ number: '+12125550123' })).callId).toBeTruthy()
  })

  it("a save that pauses closes the call and drops the rep's line", async () => {
    const { dialer, seen, names } = await readyOnStub()
    await dialer.session.start({ dialSessionId: 'ds-demo' })
    await vi.advanceTimersByTimeAsync(2100)
    await dialer.setMuted(true)
    await vi.advanceTimersByTimeAsync(6000)

    seen.length = 0
    await dialer.session.saveOutcome({ outcomeId: 'o-meeting', then: 'pause' })
    expect(names()).toEqual(['call.completed', 'session.queue.updated', 'call.muteChanged', 'session.paused'])
    expect(dialer.muted).toBe(false)
    expect((await dialer.getState()).session.status).toBe('paused')
  })

  it('holds the session, and session.start picks it up where it was', async () => {
    const { dialer, seen, names } = await readyOnStub()
    expect(dialer.hasCapability('sessionHold')).toBe(true)
    await dialer.session.start({ dialSessionId: 'ds-demo', concurrentCalls: 3 })
    await vi.advanceTimersByTimeAsync(500)
    expect(dialer.concurrentCalls).toBe(3)

    seen.length = 0
    const held = await dialer.session.hold()
    expect(names()).toEqual(['session.leg.ended', 'session.leg.ended', 'session.leg.ended', 'session.held'])
    expect(seen[0][1].reason).toBe('cancelled')
    expect(held).toEqual(seen[3][1])
    expect(held).toMatchObject({ dialSessionId: 'ds-demo', counts: { dialing: 3, queued: 3 } })
    expect(dialer.concurrentCalls).toBe(1)
    expect((await dialer.getState()).session).toBeNull()
    await expect(dialer.session.hold()).rejects.toMatchObject({ code: 'NO_ACTIVE_SESSION' })

    // Picked up again, the calls the hold hung up are back on the queue.
    await dialer.session.start({ dialSessionId: 'ds-demo' })
    expect(dialer.concurrentCalls).toBe(3)
    const { queue } = await dialer.session.getQueue()
    expect(queue.map((r) => [r.queuedCallId, r.status, r.attempts])).toEqual([
      ['q-1', 'dialing', 2],
      ['q-2', 'dialing', 2],
      ['q-3', 'dialing', 2],
      ['q-4', 'queued', 0],
      ['q-5', 'queued', 0],
      ['q-6', 'queued', 0],
    ])

    // Not over a connected call; from its post-call step, without an outcome.
    await vi.advanceTimersByTimeAsync(2100)
    await expect(dialer.session.hold()).rejects.toMatchObject({
      code: 'CALL_IN_PROGRESS',
      message: 'A call is connected. Hold the session once it has ended.',
    })
    await dialer.hangUp()
    expect((await dialer.session.hold()).dialSessionId).toBe('ds-demo')
  })

  it('loads a session without dialing, reports the resumable one, and resume dials it', async () => {
    const { dialer, seen, names } = await readyOnStub({ query: 'resumable=ds-demo' })
    expect(dialer.hasCapability('sessionLoad')).toBe(true)
    expect(dialer.resumableSession).toEqual({ dialSessionId: 'ds-demo', status: 'paused' })
    expect((await dialer.getState()).resumableSession).toEqual({ dialSessionId: 'ds-demo', status: 'paused' })

    expect(await dialer.session.start({ dialSessionId: 'ds-demo', dial: false })).toEqual({
      dialSessionId: 'ds-demo',
      concurrentCalls: 2,
      concurrentCallsLocked: false,
      dialing: false,
    })
    expect(names()).toEqual(['session.started', 'session.queue.updated'])
    expect(seen[0][1]).toMatchObject({ dialSessionId: 'ds-demo', dialing: false })
    expect(dialer.resumableSession).toBeNull()

    await vi.advanceTimersByTimeAsync(3000)
    expect(names()).not.toContain('session.leg.ringing')
    const state = await dialer.getState()
    expect(state.session.status).toBe('paused')
    expect(state.resumableSession).toBeNull()
    await expect(dialer.setMuted(true)).rejects.toMatchObject({ code: 'NO_ACTIVE_CALL' })

    seen.length = 0
    await dialer.session.resume()
    await vi.advanceTimersByTimeAsync(300)
    expect(names()).toEqual(['session.resumed', 'session.queue.updated', 'session.leg.ringing', 'session.leg.ringing'])
  })

  it('ends a ringing inbound call with call.ended when the engine starts or resumes dialing', async () => {
    const { dialer, stub, seen, names, last } = await readyOnStub()
    stub.poke('stub:ringInbound')
    const first = last('call.incoming')
    seen.length = 0
    await dialer.session.start({ dialSessionId: 'ds-demo' })
    expect(names().slice(0, 2)).toEqual(['call.ended', 'session.started'])
    expect(seen[0][1]).toEqual({ callId: first.callId, reason: 'cancelled', durationSeconds: 0 })

    await dialer.session.pause()
    stub.poke('stub:ringInbound')
    const second = last('call.incoming')
    seen.length = 0
    await dialer.session.resume()
    expect(names().slice(0, 2)).toEqual(['call.ended', 'session.resumed'])
    expect(seen[0][1]).toMatchObject({ callId: second.callId, reason: 'cancelled' })
  })

  /* ------------------------------------------------------ one-off outcomes */

  it("saves a one-off call's outcome from the page: call.completed follows, and the call is done", async () => {
    const { dialer, seen, names, last } = await readyOnStub()
    expect(dialer.hasCapability('saveOutcome')).toBe(true)
    const { callId } = await dialer.dial({ prospectId: 'p-1004', externalId: 'case-9' })
    await vi.advanceTimersByTimeAsync(2000)
    await dialer.hangUp()
    const postCall = last('call.postCall')
    expect(postCall).toEqual({
      callId,
      prospectId: 'p-1004',
      answered: true,
      durationSeconds: expect.any(Number),
      outcomeRequired: true,
      blocksDialing: false,
      restored: false,
      dialedAt: null,
    })
    expect((await dialer.getState()).call).toMatchObject({
      callId,
      status: 'post_call',
      blocksDialing: false,
      restored: false,
      dialedAt: null,
    })

    await expect(dialer.saveOutcome({ note: 'No outcome yet' })).rejects.toMatchObject({
      code: 'OUTCOME_PENDING',
    })
    await expect(dialer.saveOutcome({ outcomeId: 'o-nope' })).rejects.toMatchObject({
      code: 'OUTCOME_UNKNOWN',
    })
    await expect(dialer.saveOutcome({ outcomeId: 'o-callback' })).rejects.toMatchObject({
      code: 'NOTE_REQUIRED',
    })
    await expect(
      dialer.saveOutcome({ callId: 'call-nope', outcomeId: 'o-meeting' })
    ).rejects.toMatchObject({ code: 'NO_CALL_TO_SAVE', message: 'Call not found' })

    seen.length = 0
    expect(
      await dialer.saveOutcome({ outcomeValue: 'Meeting booked', note: 'Friday 10:00' })
    ).toEqual({ callId, outcomeId: 'o-meeting' })
    expect(seen).toEqual([
      [
        'call.completed',
        {
          callId,
          externalId: 'case-9',
          prospectId: 'p-1004',
          outcomeId: 'o-meeting',
          outcome: 'Meeting booked',
          disposition: 'Meeting booked',
          dispositionGroup: 'answered',
          note: 'Friday 10:00',
          durationSeconds: postCall.durationSeconds,
        },
      ],
    ])
    expect((await dialer.getState()).call).toBeNull()

    // Nothing waits now; an ended call can still be written to by id.
    await expect(dialer.saveOutcome({ outcomeId: 'o-meeting' })).rejects.toMatchObject({
      code: 'NO_CALL_TO_SAVE',
    })
    expect(await dialer.saveOutcome({ callId, note: 'Moved to Monday' })).toEqual({
      callId,
      outcomeId: null,
    })
    expect(names()).toEqual(['call.completed'])

    // A session's call is saved with session.saveOutcome.
    await dialer.session.start({ dialSessionId: 'ds-demo' })
    await vi.advanceTimersByTimeAsync(2100)
    await dialer.hangUp()
    const sessionCall = last('session.postCall')
    await expect(
      dialer.saveOutcome({ callId: sessionCall.callId, outcomeId: 'o-meeting' })
    ).rejects.toMatchObject({
      code: 'NO_CALL_TO_SAVE',
      message: "This is the power-dial session's call; save it with session.saveOutcome.",
    })
  })

  it('"Require & block dialer": the next dial waits for the outcome, and a reload brings the call back', async () => {
    const { dialer, stub, mounting } = await mountOnStub({ query: 'blockDialer=1' })
    await mounting
    await vi.advanceTimersByTimeAsync(300)
    const { callId } = await dialer.dial({ prospectId: 'p-1004' })
    await vi.advanceTimersByTimeAsync(2000)
    await dialer.hangUp()
    expect(stub.sentOfType('symbo:call.postCall').at(-1)).toMatchObject({
      callId,
      blocksDialing: true,
      restored: false,
    })
    await expect(dialer.dial({ number: '+1' })).rejects.toMatchObject({ code: 'POSTCALL_DETAILS_REQUIRED' })
    await expect(dialer.signOut()).rejects.toMatchObject({ code: 'POSTCALL_DETAILS_REQUIRED' })

    // Compact mode reloads all the same: the reloaded frame brings the call back.
    expect(await dialer.reload()).toEqual({ reloading: true })
    await vi.advanceTimersByTimeAsync(300)
    expect(stub.reloads).toHaveLength(1)

    const seen = []
    dialer.on('*', (name, payload) => seen.push([name, payload]))
    loadStub(env, dialer, { mode: 'compact', query: 'blockDialer=1', storage: stub.storage })
    dialer.iframe.dispatch('load')
    expect(seen.map(([n]) => n).slice(0, 4)).toEqual(['frame.reloaded', 'ready', 'resize', 'call.postCall'])
    expect(seen[0][1]).toEqual({ requested: true, reason: null })
    const restored = seen[3][1]
    expect(restored).toMatchObject({
      callId,
      prospectId: 'p-1004',
      answered: true,
      outcomeRequired: true,
      blocksDialing: true,
      restored: true,
    })
    expect(Number.isNaN(Date.parse(restored.dialedAt))).toBe(false)
    expect((await dialer.getState()).call).toMatchObject({
      callId,
      status: 'post_call',
      restored: true,
      dialedAt: restored.dialedAt,
    })

    await vi.advanceTimersByTimeAsync(300)
    await expect(dialer.dial({ number: '+1' })).rejects.toMatchObject({ code: 'POSTCALL_DETAILS_REQUIRED' })
    await dialer.saveOutcome({ outcomeId: 'o-connected' })
    expect(seen.map(([n]) => n)).toContain('call.completed')
    expect((await dialer.dial({ number: '+12125550123' })).callId).toBeTruthy()
  })

  it('"Require & block dialer" in widget mode: reload waits for the outcome as well', async () => {
    const { dialer, mounting } = await mountOnStub({ mode: 'widget', query: 'blockDialer=1' })
    await mounting
    await vi.advanceTimersByTimeAsync(300)
    await dialer.dial({ prospectId: 'p-1004' })
    await dialer.hangUp()
    await expect(dialer.reload()).rejects.toMatchObject({ code: 'POSTCALL_DETAILS_REQUIRED' })
  })

  /* ------------------------------------------------------------ the queue */

  it('removes a list of queued calls, leaving the ones being dialed', async () => {
    const { dialer, seen, names } = await readyOnStub()
    expect(dialer.hasCapability('removeQueuedCalls')).toBe(true)
    await dialer.session.start({ dialSessionId: 'ds-demo' })
    await vi.advanceTimersByTimeAsync(500)

    seen.length = 0
    expect(await dialer.session.removeQueued(['q-2', 'q-3', 'q-nope', 'q-3'])).toEqual({
      removed: ['q-3'],
      skipped: [
        { queuedCallId: 'q-2', reason: 'dialing' },
        { queuedCallId: 'q-nope', reason: 'not_found' },
      ],
    })
    expect(names()).toEqual(['session.queue.updated'])
    expect(await dialer.session.removeQueued({ queuedCallIds: ['q-3', 'q-4'] })).toEqual({
      removed: ['q-4'],
      skipped: [{ queuedCallId: 'q-3', reason: 'already_removed' }],
    })
    await expect(dialer.session.removeQueued('q-3')).rejects.toMatchObject({
      code: 'QUEUED_CALL_NOT_FOUND',
      message: 'This call is no longer queued',
    })
    await expect(dialer.session.removeQueued('q-1')).rejects.toMatchObject({
      code: 'QUEUED_CALL_DIALING',
    })
    const { counts } = await dialer.session.getQueue()
    expect(counts).toMatchObject({ dialing: 2, removed: 2, queued: 2 })
  })

  it('ends a session that is not loaded by its id, with no session.ended', async () => {
    const { dialer, seen, names } = await readyOnStub()
    expect(dialer.hasCapability('sessionEndById')).toBe(true)
    expect(await dialer.session.end({ dialSessionId: 'ds-old' })).toEqual({
      dialSessionId: 'ds-old',
      counts: { queued: 0, dialing: 0, attempted: 0, completed: 0, cancelled: 0, removed: 0, remaining: 0 },
    })

    await dialer.session.start({ dialSessionId: 'ds-demo', dial: false })
    seen.length = 0
    expect((await dialer.session.end({ dialSessionId: 'ds-other' })).dialSessionId).toBe('ds-other')
    await expect(dialer.session.end({ dialSessionId: 'ds-missing' })).rejects.toMatchObject({
      code: 'SESSION_NOT_FOUND',
    })
    expect(names()).toEqual([])
    expect((await dialer.getState()).session.dialSessionId).toBe('ds-demo')

    // The loaded session's own id ends it like end() does.
    await dialer.session.end({ dialSessionId: 'ds-demo' })
    expect(names()).toEqual(['session.ended'])
  })

  /* --------------------------------------------------- the calling device */

  it('waits for the calling device before dialing', async () => {
    const { dialer, mounting } = await mountOnStub()
    await mounting
    expect(dialer.deviceReady).toBe(false)
    const seen = []
    dialer.on('*', (name, payload) => seen.push([name, payload]))

    const dialing = dialer.dial({ number: '+12125550123' })
    await expect(dialer.dial({ number: '+1' })).rejects.toMatchObject({
      code: 'CALL_IN_PROGRESS',
      message: 'A dial is already being placed.',
    })
    expect(seen).toEqual([])
    await vi.advanceTimersByTimeAsync(300)
    const { callId } = await dialing
    expect(seen.map(([n]) => n).slice(0, 2)).toEqual(['device.ready', 'call.started'])
    expect(seen[1][1].callId).toBe(callId)
  })

  it('starts a session before the device has registered', async () => {
    const { dialer, mounting } = await mountOnStub()
    await mounting
    expect(dialer.deviceReady).toBe(false)
    expect((await dialer.session.start({ dialSessionId: 'ds-demo' })).dialing).toBe(true)
    expect(dialer.warnings.has('DEVICE_NOT_READY')).toBe(false)
  })

  /* ------------------------------------------------- reloads nobody asked for */

  it('announces a plan change, and reloads by itself once the rep is free', async () => {
    const { dialer, stub, seen, names, last } = await readyOnStub()
    await dialer.session.start({ dialSessionId: 'ds-demo', dial: false })
    stub.poke('stub:planChanged')
    expect(last('reload.required')).toEqual({ reason: 'plan_changed' })
    expect(dialer.reloadRequired).toBe('plan_changed')
    expect((await dialer.getState()).reloadRequired).toBe('plan_changed')

    // A session is loaded: nothing happens until it is over.
    await vi.advanceTimersByTimeAsync(10000)
    expect(names()).not.toContain('frame.leaving')
    expect(stub.reloads).toHaveLength(0)

    await dialer.session.hold()
    await vi.advanceTimersByTimeAsync(5000)
    expect(last('frame.leaving')).toEqual({ reason: 'plan_changed', inMs: 1000 })
    await vi.advanceTimersByTimeAsync(1000)
    expect(stub.reloads).toHaveLength(1)

    // The reloaded frame: the page hears why.
    seen.length = 0
    loadStub(env, dialer, { mode: 'compact', storage: stub.storage })
    dialer.iframe.dispatch('load')
    expect(seen[0]).toEqual(['frame.reloaded', { requested: false, reason: 'plan_changed' }])
    expect(seen[1][0]).toBe('ready')
    expect(seen[1][1].reloadReason).toBe('plan_changed')
    expect(dialer.reloadRequired).toBeNull()
  })

  it('follows a sign-out in another frame once the call is over, and says why', async () => {
    const { dialer, stub, seen, names, last } = await readyOnStub()
    await dialer.dial({ prospectId: 'p-1004' })
    stub.poke('stub:signOut')
    expect(dialer.warnings.has('SIGNED_OUT_ELSEWHERE')).toBe(true)
    await vi.advanceTimersByTimeAsync(1000)
    expect(names()).not.toContain('frame.leaving')

    await dialer.hangUp()
    await vi.advanceTimersByTimeAsync(5000)
    expect(last('frame.leaving')).toEqual({ reason: 'signed_out_elsewhere', inMs: 600 })
    expect(stub.reloads).toHaveLength(1)
    expect(stub.storage.has('symbo-stub:signedIn')).toBe(false)

    seen.length = 0
    loadStub(env, dialer, { mode: 'compact', storage: stub.storage })
    dialer.iframe.dispatch('load')
    expect(last('frame.reloaded')).toEqual({ requested: false, reason: 'signed_out_elsewhere' })
    expect(last('auth.required')).toMatchObject({ reloadReason: 'signed_out_elsewhere' })
  })
})
