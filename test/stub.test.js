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
    })
    await expect(dialer.session.start({ dialSessionId: 'ds-demo' })).rejects.toMatchObject({
      code: 'SESSION_ALREADY_ACTIVE',
    })
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

    // Nothing left: resuming runs out of calls and the session ends. The
    // engine never resumed, so there is no session.resumed.
    seen.length = 0
    expect(await dialer.session.resume()).toEqual({})
    expect(names()).toEqual(['session.noMoreCalls', 'session.ended'])
    expect(seen[1][1].counts).toMatchObject({
      queued: 0,
      remaining: 0,
      completed: 1,
      cancelled: 1,
      attempted: 4,
    })
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
    // call.postCall: its outcome is saved by the partner's server, so no
    // call.completed follows in the page.
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
    // call.postCall is the last word on a one-off call: embed mode has no
    // outcome form and no command to save one, so the page never sees
    // call.completed for it.
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
})
