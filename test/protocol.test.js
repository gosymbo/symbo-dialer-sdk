import { describe, it, expect } from 'vitest'

import {
  COMMANDS,
  EVENTS,
  RESULT,
  PROTOCOL_VERSION,
  SymboDialer,
  SymboDialerError,
} from '../src/index.js'

// -----------------------------------------------------------------------------
// The contract, written out longhand.
//
// This package and the Symbo application each declare these names separately —
// that is the cost of the SDK not depending on the app. Drift between the two
// is silent: both sides keep working while a partner stops receiving an event
// nobody noticed was renamed.
//
// So neither side is allowed to change quietly. This literal is duplicated in
// symbo-ui (tests/services/stateful/dialer/embedContract.test.js). Editing the
// protocol on either side fails that side's build until the literal is updated,
// and updating the literal is the moment you are meant to remember the other
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
  },
  events: {
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
  },
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

  it('matches the pinned result message', () => {
    expect(RESULT).toBe(CONTRACT.result)
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
    const names = [
      ...Object.values(COMMANDS),
      ...Object.values(EVENTS),
      RESULT,
    ]

    expect(names.length).toBeGreaterThan(0)
    names.forEach((name) => expect(name.startsWith('symbo:')).toBe(true))
  })

  it('gives every message a distinct name', () => {
    const names = [
      ...Object.values(COMMANDS),
      ...Object.values(EVENTS),
      RESULT,
    ]
    expect(new Set(names).size).toBe(names.length)
  })
})

describe('mount', () => {
  it('refuses to mount without a container rather than failing later', () => {
    expect(() => SymboDialer.mount({})).toThrow(SymboDialerError)
    expect(() => SymboDialer.mount({})).toThrow(/container is required/)
  })

  it('reports a usable code on the error it throws', () => {
    try {
      SymboDialer.mount({})
    } catch (err) {
      expect(err.code).toBe('INVALID_OPTIONS')
      expect(err.name).toBe('SymboDialerError')
    }
  })
})

