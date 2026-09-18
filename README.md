# @symbo/dialer-embed

Embed the Symbo dialer in your own application: one-off calls, inbound calls,
and power-dial sessions that ring several contacts at once — all from your
page, with Symbo's own dialer either reduced to a small status strip or hidden
entirely.

```bash
npm install @symbo/dialer-embed
```

```js
import { SymboDialer } from '@symbo/dialer-embed'

const dialer = SymboDialer.create({
  container: document.getElementById('symbo-dialer'),
  mode: 'compact', // or 'hidden'
})

dialer.on('auth.required', () => showSignInButton())
dialer.on('warning', ({ code, message }) => showBanner(code, message))

await dialer.mount() // resolves once someone is signed in and calls can be placed

await dialer.dial({ prospectId: 'p-1001' })
```

Not using a bundler? A script tag gives you the same thing on `window`:

```html
<script src="https://cdn.jsdelivr.net/npm/@symbo/dialer-embed@0.2/dist/symbo-dialer.min.js"></script>
<script>
  const dialer = SymboDialer.create({ container: document.getElementById('symbo-dialer') })
  dialer.mount()
</script>
```

The SDK creates the iframe itself, with `allow="microphone; autoplay"` set, the
target origin pinned, and the frame URL carrying the mode. Those are the things
that are easy to get wrong by hand and fail in ways that are hard to diagnose,
which is most of why this package exists rather than a page of copy-paste
`postMessage`.

> **Which Symbo release you need** is at the [end](#sdk-versions-and-symbo-releases).
> The session, inbound, audio and sign-in commands in 0.2.0 need the Symbo
> release that carries the power-dial embed; against an earlier one they
> reject with `UNKNOWN_COMMAND`, and `dialer.capabilities` tells you before you
> try.

## Contents

- [Try it](#try-it)
- [Two modes: compact and hidden](#two-modes-compact-and-hidden)
- [Signing in](#signing-in)
- [Power-dial sessions](#power-dial-sessions)
- [One-off calls](#one-off-calls)
- [Inbound calls](#inbound-calls)
- [Audio devices](#audio-devices)
- [Warnings](#warnings)
- [API](#api)
- [Events](#events)
- [Error codes](#error-codes)
- [Hidden-mode checklist](#hidden-mode-checklist)
- [SDK versions and Symbo releases](#sdk-versions-and-symbo-releases)

## Try it

[**Open the live example**](https://gosymbo.github.io/symbo-dialer-sdk/example/)
— a pretend collections tool with a queue that lights up as lines ring and
connect, a wrap-up panel, an inbound banner, an audio-device picker, a
compact/hidden switch and a live log of everything the dialer sends back.

The source is in [`example/`](example), and it runs locally too:

```bash
npm install
npm run demo
```

That serves the repo and opens the example, pointed at your Symbo account. It
also ships a stub that plays the Symbo side of the protocol, so you can watch a
two-line session and an inbound call flow with no account and no network:

```
?appUrl=http://localhost:3000/example/stub    the offline stub
?appUrl=https://<your-environment>            any other Symbo environment
?mode=hidden                                  start in hidden mode
```

`appUrl` is an **origin**, not a path — the SDK appends `/dial?embed=1&mode=…`.

## Two modes: compact and hidden

Reps still complete a handshake with Symbo before a call can be placed: sign
in, the microphone permission, the calling device registering. Where that
state is shown is your choice.

| | `mode: 'compact'` (default) | `mode: 'hidden'` |
| --- | --- | --- |
| The frame | A small Symbo strip — signed-in user, device state, a settings panel for audio and caller id. The SDK sizes the iframe to it and follows the frame's `resize` events | 0×0, `visibility: hidden`, `aria-hidden`. Nothing to see or focus |
| Sign-in | A **Sign in** button in the strip opens Symbo's login tab | Your button calls `dialer.openSignIn()`, or your server mints a code for `dialer.signIn({ code })` |
| Device / mic / realtime state | Shown in the strip, and sent as events | Sent as events only: `ready`, `auth.required`, `warning`, `warning.cleared`, `device.*`, `permission.denied` |
| Audio settings | The strip's panel, and `dialer.audio.*` | `dialer.audio.*` only |

Neither mode shows a keypad, contact card, notes or outcome form: those are
yours. Ringback while lines ring and the connect tone play inside the frame in
both modes. Hidden mode has a [checklist](#hidden-mode-checklist) of things
that only matter when there is nothing on screen.

The 0.1.x `hidden: true` option still works and maps onto `mode: 'hidden'`
with a deprecation warning.

## Signing in

`mount()` resolves once a user is signed in inside the frame. Until then Symbo
says `auth.required`, and the mount timer stops — a rep taking their time is
not a timeout. There are two ways through.

**A Symbo login tab.** `auth.required` carries a `loginUrl`. In compact mode
the strip's own button opens it; in hidden mode, or if you want your own
button, call `openSignIn()` **from a click handler** (browsers block tabs
opened any other way). When the rep finishes, the frame picks the session up
by itself and `ready` follows.

```js
const dialer = SymboDialer.create({ container, mode: 'hidden' })

dialer.on('auth.required', () => {
  signInButton.hidden = false
})
signInButton.addEventListener('click', () => dialer.openSignIn())

dialer.on('ready', () => {
  signInButton.hidden = true
})

dialer.mount()
```

**Silently, with a code.** Your server mints a single-use code for a rep with
`POST /v1/embedSignInCodes` (an org-admin API token; 60-second TTL; see the
Symbo API guide), hands it to your page, and the page exchanges it:

```js
dialer.on('auth.required', async () => {
  const { code } = await fetch('/my-server/symbo-sign-in-code').then((r) => r.json())
  try {
    await dialer.signIn({ code }) // resolves with { user }; `ready` follows
  } catch (err) {
    // SIGN_IN_CODE_INVALID, SIGN_IN_CODE_EXPIRED, EMBED_NOT_ENABLED
  }
})
```

`signIn()` and `getState()` work before `ready`; every other command rejects
with `NOT_READY` until then. If the session expires mid-day, `auth.required`
is sent again and `dialer.ready` goes back to `false`.

`mountTimeoutMs` (default 30 000) only covers the frame never saying anything
at all — a wrong `appUrl`, an unreachable environment, a Symbo build without
the embed surface — and rejects `mount()` with `MOUNT_TIMEOUT`.

## Power-dial sessions

The engine that dials lives on Symbo's servers. It rings your organisation's
number of lines at once (1–4, fixed per org; `dialer.concurrentCalls` tells
you), bridges the rep to the first answer, hangs up the rest, and pauses until
you say otherwise. You own the queue, the order, which of a contact's numbers
is dialled, the outcome UI and what happens after each call.

### 1. Your server creates the session

Every contact in a queue is a Symbo prospect first. Sync your contacts once
(`POST /prospects`, then `PUT` for changes), keep the returned prospect id on
your record, and build sessions from those ids:

```http
POST /v1/dialSessions
{
  "name": "Tuesday follow-ups",
  "owner": "<rep user id>",
  "contacts": [
    { "prospect_id": "p-1001", "phone_number_id": "pn-1" },
    { "prospect_id": "p-1002" }
  ],
  "max_attempts": 2
}
```

The response carries the session id and its `queued_calls`. Hand the id to
your page.

### 2. The page starts it

```js
const { dialSessionId, concurrentCalls } = await dialer.session.start({
  dialSessionId,
})
```

The frame takes the session off hold, joins the rep's audio leg, and the
engine dials. From here on you render events.

### 3. What a round of dialing looks like

With two lines:

```
session.started { dialSessionId, concurrentCalls: 2 }
session.queue.updated { counts }

  session.leg.ringing   { queuedCallId: q-1, prospectId: p-1001, number, from }   ─┐ several
  session.leg.ringing   { queuedCallId: q-2, prospectId: p-1002, number, from }   ─┘ at once

  session.leg.answered  { queuedCallId: q-2 }
  session.leg.connected { queuedCallId: q-2, callId }        ← the rep is talking
  session.leg.ended     { queuedCallId: q-1, reason: 'answered_elsewhere' }
  session.paused        { reason: 'connected' }              ← the engine waits

  … the call …

  session.leg.ended     { queuedCallId: q-2, reason: 'completed' }
  session.wrap          { callId, queuedCallId: q-2, prospectId, answered: true,
                          durationSeconds, outcomeRequired }

  ↓ you render your wrap-up and save the outcome

  session.saveOutcome({ callId, outcomeId, note, then: 'resume' })
  call.completed        { callId, outcomeId, outcome, disposition, note, … }
  session.resumed
  session.leg.ringing   { queuedCallId: q-3 }  session.leg.ringing { queuedCallId: q-4 } …
```

A round where nobody answers needs nothing from you: each leg ends with its
reason (`no_answer`, `busy`, `failed`), Symbo records the attempt with the
rep's default outcome, and the engine moves on to the next round by itself.
When the queue runs out you get `session.noMoreCalls` and then `session.ended
{ counts }`.

Every `session.leg.*` payload names the queued call (`queuedCallId`), the
prospect (`prospectId`, `prospectName`), the number, the `from` number and —
once a call exists — the `callId`. Key your rows on `queuedCallId`; join to
your records on `prospectId`; join to Symbo's call webhooks on `callId`.

### 4. Pause, resume, skip, end

| You call | What happens |
| --- | --- |
| `session.pause()` | Lines that are ringing are hung up (they get the cancelled default outcome). A connected call is **never** cut. The engine stays paused after the call until you resume |
| `session.resume()` | Dials the next round. Refused with `OUTCOME_PENDING` while a call is waiting for its outcome, and with `CALL_IN_PROGRESS` while a contact is still on the line (hang up or `skipCurrent()` first) |
| `session.saveOutcome({ …, then })` | Saves the outcome and note on the call, then `'resume'` (next round), `'pause'` (stay paused) or `'end'` |
| `session.skipCurrent()` | Hangs up the connected call and skips its outcome |
| `hangUp()` | Hangs up the connected call (→ `session.wrap`), or cancels ringing lines |
| `session.removeQueued(queuedCallId)` | Drops a queued contact from this session. Best-effort once it is dialing (`QUEUED_CALL_DIALING`) |
| `session.end({ force })` | Ends the session. Refused with `CALL_IN_PROGRESS` over a connected call unless `force: true` |
| `session.getQueue()` | `{ dialSessionId, counts, queue: [{ queuedCallId, prospectId, prospectName, number, status, order, attempts, lastCallId, lastOutcomeId }] }` |
| `getState()` | Everything at once: `{ signedIn, deviceReady, mode, powerDialing, concurrentCalls, session, call, incoming, warnings }` |

"Try again later" and other queue edits are made from your server
(`PUT /v1/dialSessionQueuedCalls/:id` with `status`, `retry_at` and
`retry_position: 'top' | 'bottom'`); the frame learns of them and sends
`session.queue.updated`.

Things the engine decides on its own, and that you should expect: it retries
per the session's `max_attempts` / `retry_on`; it skips contacts outside the
session's timezone and phone-type filters; unanswered and cancelled legs get
the rep's default outcomes; a session can also be driven from inside Symbo by
the rep or an admin, in which case you see the same events (and
`session.admin`).

### Counts

`counts` on `session.queue.updated`, `session.ended` and `getState()`:
`{ queued, dialing, attempted, completed, cancelled, removed, outcomes_saved, remaining }`.

## One-off calls

For a "Call" button on a single contact, outside a session:

```js
const { callId } = await dialer.dial({ prospectId: 'p-1001', phoneNumberId: 'pn-2' })
// or, for a number you hold no Symbo record for:
const { callId } = await dialer.dial({ number: '+12125550123', externalId: 'case-48211' })
```

Events: `call.started` → `call.ringing` → `call.answered` (far-end pickup) →
`call.ended { reason, durationSeconds }` → `call.wrap` → `call.completed` once
the outcome is saved (in Symbo, or by your server with `PUT /calls/:id`).
`contact.matched` fires when Symbo recognises a number you dialled without a
prospect. `dial()` is refused with `SESSION_ACTIVE` while a session runs: the
rep's line is busy for the whole session.

`externalId` comes back on the call events and on the `call.*` webhooks, which
is how a call lands against your record without a prospect. Prefer
`prospectId` when you have one.

## Inbound calls

The frame plays **no** ringtone in embed mode. Play your own on
`call.incoming`, and stop it when the call is answered, ignored, or ends:

```js
dialer.on('call.incoming', ({ callId, from, prospectId, prospectName }) => {
  ringtone.play()
  showBanner(prospectName || from, {
    answer: () => dialer.answerIncoming(), // → { callId }; then call.answered …
    ignore: () => dialer.ignoreIncoming(),
  })
})
dialer.on('call.ended', ({ callId }) => {
  if (callId === ringingCallId) ringtone.pause()
})
```

An inbound call that arrives while a session is active, or while a call is
up, is not offered to the page: it follows the rep's normal no-answer routing
(voicemail, forwarding). One inbound call rings at a time.

## Audio devices

```js
const { microphones, speakers, selected } = await dialer.audio.list()
await dialer.audio.set({ microphoneId: microphones[1].id }) // resolves with the same shape
dialer.on('audio.devicesChanged', renderPicker) // a headset was plugged in
```

Device labels are only available once the microphone permission has been
granted; before that the lists are empty or unnamed, and `audio.list()` can
be refused with `DEVICE_NOT_READY`. The rep's choice persists inside Symbo, so
it matches the strip's settings panel in compact mode and survives reloads.

## Warnings

Anything the compact strip would show as a problem arrives as a `warning`
with a code, and is withdrawn with `warning.cleared`. `dialer.warnings` is a
`Map` of the ones currently raised.

| Code | Meaning |
| --- | --- |
| `NOT_SIGNED_IN` | No user session in the frame (`auth.required` says how to fix it) |
| `REALTIME_DISCONNECTED` | The frame lost its realtime connection. `session.start` / `resume` are refused until it is back |
| `DEVICE_NOT_READY` / `DEVICE_ERROR` | The calling device is not registered, or failed to |
| `MIC_PERMISSION_DENIED` | The microphone permission was denied. `permission.denied` fires at the same time |
| `EMBED_NOT_ENABLED` | Embedding is not enabled for this organisation |
| `POWER_DIALING_NOT_ENABLED` | This rep has no power-dialing seat |
| `HIJACK_MODE` | The rep's calling is in an admin-controlled state |

## API

### Creating a client

| | |
| --- | --- |
| `SymboDialer.create(options)` | Returns a client without touching the page. Attach listeners, then `mount()` |
| `SymboDialer.mount(options)` | `create(options).mount()` |
| `dialer.mount()` | Creates the iframe. Resolves with the client on `ready`; rejects with `MOUNT_TIMEOUT` if the frame never answers; calling it again returns the same promise |
| `dialer.destroy()` | Removes the iframe and its listeners; anything still pending rejects with `DESTROYED` |

Options: `container` (required), `appUrl` (an origin; default
`https://app.symbo.ai`), `mode` (`'compact'` \| `'hidden'`), `mountTimeoutMs`
(default 30 000), `commandTimeoutMs` (default 15 000).

### Commands

Every command returns a promise that settles on Symbo's answer: it resolves
with the answer's data, or rejects with a `SymboDialerError` whose `.code` is
one of the [error codes](#error-codes) and whose `.message` says why.

| Command | Resolves with |
| --- | --- |
| `dial({ number \| prospectId, phoneNumberId?, externalId?, externalObjectType?, fullName? })` | `{ callId }` |
| `hangUp()` | `{}` |
| `setContact({ … })` | `{}` |
| `getState()` | the state object above |
| `signIn({ code })` | `{ user }` |
| `openSignIn()` | the opened `Window` (synchronous; throws `NO_LOGIN_URL` / `POPUP_BLOCKED`) |
| `answerIncoming()` | `{ callId }` |
| `ignoreIncoming()` | `{}` |
| `audio.list()` | `{ microphones, speakers, selected }` |
| `audio.set({ microphoneId?, speakerId? })` | same as `audio.list()` |
| `session.start({ dialSessionId })` | `{ dialSessionId, concurrentCalls }` |
| `session.pause()` / `session.resume()` / `session.skipCurrent()` | `{}` |
| `session.end({ force? })` | `{ counts }` |
| `session.removeQueued(queuedCallId)` | `{}` |
| `session.getQueue()` | `{ dialSessionId, counts, queue }` |
| `session.saveOutcome({ callId?, outcomeId?, outcomeValue?, note?, callFields?, then })` | `{ callId, outcomeId }` |

### Listening

`on(event, handler)` returns an unsubscribe function; `once(event, handler)`
and `off(event, handler)` do what they say. `on('*', (name, payload) => …)`
receives everything.

### Properties, filled from `ready`

`dialer.ready`, `dialer.user { id, name, email }`, `dialer.organization { id, name }`,
`dialer.capabilities` (with `dialer.hasCapability(name)`), `dialer.concurrentCalls`,
`dialer.deviceReady`, `dialer.powerDialing`, `dialer.mode`, `dialer.warnings`,
`dialer.loginUrl` (from the last `auth.required`).

### Exports

`SymboDialer`, `SymboDialerError`, `COMMANDS`, `EVENTS`, `ERRORS`, `WARNINGS`,
`CLIENT_ERRORS`, `MODES`, `RESULT`, `PROTOCOL_VERSION`.

## Events

| Event | Payload |
| --- | --- |
| `ready` | `{ protocolVersion, user, organization, mode, capabilities, deviceReady, powerDialing, concurrentCalls }` |
| `auth.required` | `{ loginUrl }` — once per unauthenticated state; again if the session expires |
| `device.ready` / `device.error` | `{}` / `{ code, message }` |
| `permission.denied` | `{ permission: 'microphone' }` |
| `warning` / `warning.cleared` | `{ code, message }` / `{ code }` |
| `call.started` | `{ callId, number, from, externalId, prospectId }` |
| `call.ringing` | `{ callId, number, from }` |
| `call.incoming` | `{ callId, from, prospectId, prospectName }` |
| `call.answered` | `{ callId }` — the far end picked up |
| `call.ended` | `{ callId, reason, durationSeconds }` |
| `call.wrap` | `{ callId, prospectId, answered, durationSeconds, outcomeRequired }` |
| `call.completed` | `{ callId, externalId, prospectId, outcomeId, outcome, disposition, dispositionGroup, note, durationSeconds }` — after the outcome save succeeded |
| `contact.matched` | `{ number, externalId, prospect: { id, fullName } }` |
| `audio.devicesChanged` | same shape as `audio.list()` |
| `session.started` | `{ dialSessionId, concurrentCalls }` |
| `session.paused` | `{ dialSessionId, reason: 'connected' \| 'requested' \| 'admin' \| 'outcome_pending' }` |
| `session.resumed` | `{ dialSessionId }` |
| `session.ended` / `session.noMoreCalls` | `{ dialSessionId, counts }` |
| `session.leg.ringing` / `.answered` / `.connected` / `.ended` | `{ dialSessionId, callId, queuedCallId, prospectId, prospectName, number, from, status, reason }` — `reason` on ended: `answered_elsewhere \| no_answer \| busy \| cancelled \| failed \| completed` |
| `session.wrap` | `{ dialSessionId, callId, queuedCallId, prospectId, answered, durationSeconds, outcomeRequired }` |
| `session.queue.updated` | `{ dialSessionId, counts }` |
| `session.admin` | `{ dialSessionId, action }` |
| `resize` | `{ width, height }` — followed in compact mode, ignored in hidden |
| `error` | `{ code, message }` — a refusal that was not an answer to a command |

Events are good for driving your UI in the moment. For anything you need to
keep, take it from Symbo's webhooks (`call.created`, `call.completed`,
`call.updated`) — events in a page are not durable.

## Error codes

A refused command rejects with a `SymboDialerError` carrying one of these on
`.code`. They are exported as `ERRORS`.

| Code | Meaning |
| --- | --- |
| `NOT_SIGNED_IN` | No user in the frame |
| `CALLING_NOT_ENABLED` / `POWER_DIALING_NOT_ENABLED` | The rep's seat lacks calling / power dialing |
| `EMBED_NOT_ENABLED` / `ORIGIN_NOT_ALLOWED` | Embedding is off for the org, or your origin is not on its list |
| `NEEDS_SETUP` | No activated outbound number, or no calling device |
| `DEVICE_NOT_READY` / `MIC_PERMISSION_DENIED` | The device is not registered / the microphone was denied |
| `HIJACK_MODE` | The rep's calling is in an admin-controlled state |
| `INVALID_NUMBER` / `PROSPECT_NOT_FOUND` | `dial()` had nothing usable to dial |
| `CALL_IN_PROGRESS` / `NO_ACTIVE_CALL` | A call is up when it must not be / there is none to act on |
| `SESSION_ACTIVE` | A session is running, so a one-off dial or inbound answer is refused |
| `POSTCALL_DETAILS_REQUIRED` | The last one-off call still needs an outcome |
| `NO_INCOMING_CALL` | Nothing is ringing |
| `AUDIO_DEVICE_NOT_FOUND` | Unknown device id |
| `SIGN_IN_CODE_INVALID` / `SIGN_IN_CODE_EXPIRED` | The silent sign-in code was wrong / too old |
| `REALTIME_DISCONNECTED` | The frame's realtime connection is down; try again shortly |
| `SESSION_NOT_FOUND` / `SESSION_NOT_STARTABLE` / `SESSION_ALREADY_ACTIVE` | `session.start` problems |
| `NO_ACTIVE_SESSION` | A `session.*` command with no session running |
| `OUTCOME_PENDING` | `session.resume` before the last call's outcome was saved |
| `NO_CALL_TO_SAVE` / `OUTCOME_UNKNOWN` / `NOTE_REQUIRED` | `session.saveOutcome` problems |
| `QUEUED_CALL_NOT_FOUND` / `QUEUED_CALL_DIALING` | `session.removeQueued` problems |
| `UNKNOWN_COMMAND` | The Symbo release in front of you does not know this command yet |

Raised by the SDK itself, before anything reached Symbo (exported as
`CLIENT_ERRORS`): `INVALID_OPTIONS`, `NOT_MOUNTED`, `NOT_READY`, `DESTROYED`,
`MOUNT_TIMEOUT`, `COMMAND_TIMEOUT`, `NO_LOGIN_URL`, `POPUP_BLOCKED`.

## Hidden-mode checklist

With nothing on screen, the things a rep would otherwise click through have to
be right in advance.

- **HTTPS.** The microphone is only available to a secure page, and to a
  cross-origin frame inside one. `localhost` is exempt for development.
- **Delegate the permissions.** The SDK sets `allow="microphone; autoplay"` on
  the iframe. Your page's own `Permissions-Policy` response header must not
  withhold them from `app.symbo.ai`:
  ```
  Permissions-Policy: microphone=(self "https://app.symbo.ai"), autoplay=(self "https://app.symbo.ai")
  ```
  If the header is absent, the defaults allow it.
- **The mic prompt.** The browser shows it for `app.symbo.ai` the first time
  the frame needs the microphone, with nothing to click inside the frame. A
  denial only reaches you as `warning { MIC_PERMISSION_DENIED }` and
  `permission.denied` — show it.
- **Sign-in.** Wire `openSignIn()` to your button (from the click) or use
  `signIn({ code })`; nothing in the frame can be seen.
- **Sound.** Ringback and the connect tone play inside the frame; inbound
  ringing is yours. Keep the frame in the document (`display: none` on an
  ancestor stops it running).
- **Chrome.** The embedded dialer is supported in Chrome. Other browsers are
  not covered.
- **Allowed origins.** Your Symbo organisation lists the origins that may
  embed; ask Symbo to add yours (test and live), or `ready` never comes and
  you see `ORIGIN_NOT_ALLOWED`.

## SDK versions and Symbo releases

| SDK | Needs the Symbo release with | Surface |
| --- | --- | --- |
| 0.1.x | the embedded dialer | `mount / dial({ number }) / hangUp / setContact`; `ready, auth.required, call.*, contact.matched, resize, error` |
| **0.2.0** | the power-dial embed | everything above, plus `create()`, both modes, `signIn / openSignIn`, `getState`, `dial({ prospectId })`, sessions, inbound, audio devices, warnings |

`PROTOCOL_VERSION` is `2` for both: every 0.2.0 change is additive, so a
0.1.x integration keeps working against the newer release, and a 0.2.0
integration against the older release keeps everything 0.1.x had. The new
commands reject with `UNKNOWN_COMMAND` there, and `ready.capabilities` lists
what the frame in front of you supports — check it before offering a session
button.

`PROTOCOL_VERSION` changes when a message is removed or renamed, or when a
payload field changes meaning. This is a 0.x package and the surface can still
move; pin an exact version if that matters to you.

## Development

```bash
npm install
npm test        # protocol contract, client behaviour, and the stub driven end to end
npm run build   # dist/symbo-dialer.min.js, the script-tag bundle
npm run demo    # serve the example
```

The npm package ships plain ESM from `src/`. There is no build step for the
module entry — `dist/` exists only for script-tag users, and is rebuilt
automatically on publish.

The message names are declared twice, here and in the Symbo application, and
`test/protocol.test.js` pins them on this side against a literal shared with
the application's own contract test. Change one, change both.

## Licence

[MIT](LICENSE). Reaching the Symbo Service through this package needs a Symbo
account, and is governed by the [Symbo Terms and
Conditions](https://www.symbo.ai/resources/terms-conditions).

## Questions

**team@symbo.ai**
