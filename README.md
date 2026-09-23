# @symbo/dialer-embed

Embed the Symbo dialer in your own application. The package covers two
different integrations, and this README keeps them apart:

- **The dialer widget.** Symbo's own dialer, in an iframe on your page. Your
  page adds Call buttons; the keypad, the contact card, notes, the outcome
  form and inbound ringing are all Symbo's. One-off calls, one at a time.
- **The power dialer.** Symbo's engine rings several contacts at once from a
  dial session your server created through the Symbo API, and your page
  draws the whole experience — the queue, the wrap-up form, the inbound
  banner — from events, with Symbo reduced to a status strip or hidden
  entirely.

Both use the same client; they differ in the `mode` you mount with and the
commands you call. [Which one to build](#which-integration-are-you-building)
is the first section below.

```bash
npm install @symbo/dialer-embed
```

The dialer widget, in full:

```js
import { SymboDialer } from '@symbo/dialer-embed'

const dialer = await SymboDialer.mount({
  container: document.getElementById('symbo-dialer'), // Symbo's dialer renders here
})
callButton.onclick = () => dialer.dial({ prospectId: 'p-1001' })
```

The power dialer, in outline (the rest of this README fills it in):

```js
const dialer = SymboDialer.create({
  container: document.getElementById('symbo-dialer'),
  mode: 'compact', // a status strip; or 'hidden' for nothing at all
})
dialer.on('session.leg.ringing', lightUpRow)
dialer.on('session.wrap', showYourWrapUp)
await dialer.mount()

await dialer.session.start({ dialSessionId }) // a session your server created
```

Not using a bundler? A script tag gives you the same thing on `window`:

```html
<script src="https://cdn.jsdelivr.net/npm/@symbo/dialer-embed@0.2/dist/symbo-dialer.min.js"></script>
<script>
  const dialer = SymboDialer.create({ container: document.getElementById('symbo-dialer') })
  dialer.mount()
</script>
```

> **Which Symbo release you need** is at the [end](#sdk-versions-and-symbo-releases).
> The session, inbound, audio and sign-in commands in 0.2.0 need the Symbo
> release that carries the power-dial embed; against an earlier one they
> reject with `UNKNOWN_COMMAND`, and `dialer.capabilities` tells you before you
> try.

## Contents

- [Which integration are you building?](#which-integration-are-you-building)
- [How it fits together](#how-it-fits-together)
- [The examples](#the-examples)
- [Three modes: widget, compact and hidden](#three-modes-widget-compact-and-hidden)
- [Signing in](#signing-in)
- [The dialer widget](#the-dialer-widget)
- [The power dialer](#the-power-dialer)
- [Audio devices](#audio-devices)
- [Warnings](#warnings)
- [API](#api)
- [Events](#events)
- [Error codes](#error-codes)
- [Hidden-mode checklist](#hidden-mode-checklist)
- [SDK versions and Symbo releases](#sdk-versions-and-symbo-releases)

## Which integration are you building?

| | The dialer widget | The power dialer |
| --- | --- | --- |
| What the rep sees | Symbo's dialer, whole, in a 420×485 frame on your page | Your own screens; Symbo is a small status strip (`compact`) or invisible (`hidden`) |
| What you build | A Call button per contact | The queue, the contact card, the wrap-up form, the inbound banner |
| Where the session lives | — | In Symbo, on the rep's queue: the same dial session the Symbo app shows and can drive, created and edited through the Symbo API |
| How calls are placed | One at a time, with `dialer.dial()` | Several lines at once by Symbo's engine, from a queue your server created with the Symbo API |
| Outcomes and notes | Saved in Symbo's outcome form, inside the frame | Saved by your page with `session.saveOutcome()`, or by your server |
| Inbound calls | The frame rings and answers | Your page rings and answers (`call.incoming`) |
| Server side | None required | Sync contacts, create sessions, edit the queue, read calls back — the **Embedded Dialer** guide in the Symbo API docs |
| Mount with | `mode: 'widget'` (the default) | `mode: 'compact'` or `'hidden'` |
| SDK surface | `mount`, `dial`, `hangUp`, `setContact`, the `call.*` events | All of that, plus `session.*`, `signIn`, `answerIncoming`, `audio.*`, `getState`, the `session.*` events |
| Example | [`example/index.html`](example/index.html) | [`example/collections.html`](example/collections.html) and [`example/power-dial.html`](example/power-dial.html) |

Pick the **widget** when your application only needs a way to place a call and
is happy for the call itself to happen in Symbo's UI: a CRM record with a Call
button, a support console, an internal tool. It is the smallest integration
there is, and the 0.1.x surface.

Pick the **power dialer** when your reps work through lists inside your
application and you want them to stay there while Symbo does the dialing.
Symbo rings several contacts at once, connects the rep to whoever answers
first, and handles the no-answers, retries and default outcomes for you; your
application supplies the list and gets a page that shows which contacts are
ringing, who answered, and a wrap-up for each conversation, all in your own
screens. Your server creates the session through the Symbo API from contacts
it has synced, can drop, re-queue or reschedule a contact while it runs, and
reads every call back when it ends. The session itself lives in Symbo, on
the rep's queue, so a manager can also see and manage it from the Symbo app.
This integration needs a server side for the API calls and a page that draws
the queue and the wrap-up.

Both can live on the same page — `dial()` still works between sessions — and
both go through the same sign-in.

## How it fits together

![Your page holds your UI, the SDK and the Symbo frame; your server talks to the public API; Symbo's engine rings the contacts and reads the queue.](docs/images/architecture.svg)

The SDK creates an iframe served from `app.symbo.ai` and talks to it over
`postMessage`. The frame holds the rep's audio leg, the calling device and the
realtime connection. Your page holds everything the rep sees and decides what
happens next: you send **commands** (`session.start`, `session.saveOutcome`,
`dial`, `answerIncoming`, `audio.set` …) and receive **events**
(`session.leg.ringing`, `session.wrap`, `call.incoming`, `warning` …). The
browser never talks to the carrier and never holds a Symbo credential.

The SDK sets the iframe up with `allow="microphone; autoplay"`, the target
origin pinned, and the mode on the frame URL. Those are the things that are
easy to get wrong by hand and fail in ways that are hard to diagnose, which is
most of why this package exists rather than a page of copy-paste
`postMessage`.

Everything on the **server** side — syncing contacts, creating sessions,
editing the queue while it runs, reading every call back — goes through the
Symbo public API with an org-admin token, and is walked through end to end in
the **Embedded Dialer** guide in the Symbo API documentation. This README is
the browser side.

## The examples

Three pages in [`example/`](example), each self-contained. `npm install &&
npm run demo` serves them, pointed at your Symbo account; add
`?appUrl=http://localhost:3000/example/stub` to run any of them against the
offline stub, which plays the Symbo side of the protocol with no account and
no network.

```
?appUrl=http://localhost:3000/example/stub    the offline stub
?appUrl=https://<your-environment>            any other Symbo environment
?mode=widget|compact|hidden                   start in that mode (collections.html)
```

`appUrl` is an **origin**, not a path — the SDK appends `/dial?embed=1&mode=…`.

### Dialer widget · `example/index.html`

[**Open it live**](https://gosymbo.github.io/symbo-dialer-sdk/example/) — a
list of cases with Call buttons, a box for dialling any number, and Symbo's
dialer beside them. Everything after the click — ringing, notes, the outcome
form — happens inside the frame. This is the whole of the widget integration,
and the page that shipped with 0.1.x, unchanged.

### Power dialer · `example/collections.html`

The same pretend collections tool, rebuilt on the power dialer: a queue that
lights up as lines ring and connect, a wrap-up panel, an inbound banner, an
audio-device picker, a mode switch and a live log of everything the dialer
sends back. It also keeps a one-off Call button per contact, to show the two
coexisting.

![The example page's queue in the middle of a two-line round: one contact connected, the other line hung up because the first answered, the rest waiting.](docs/images/example-queue-round.png)

### Power dialer, minimal · `example/power-dial.html`

The smaller, plainer one: a single file that signs in by redirect, starts a
dial session you built in Symbo by its id, and renders the queue as Queued /
In progress / Attempted / Completed boards that contacts move through as the
engine works. No build step and no server of your own — copy the file out,
put `dist/symbo-dialer.min.js` beside it, and serve the folder. It picks up a
session the rep already has running, so connecting mid-session lands you on a
live board.

![The power-dial reference page mid-session: counts along the top, the session controls, four columns of contacts and the live bar for the connected call.](docs/images/power-dial-board.png)

## Three modes: widget, compact and hidden

`widget` is the dialer-widget integration; `compact` and `hidden` are the
power-dialer integration. Reps still complete a handshake with Symbo before a
call can be placed: sign in, the microphone permission, the calling device
registering. How much of Symbo they see while doing it is what the mode
decides. All three run the same dialer and answer the same commands; they
differ only in what the frame renders.

![Widget shows Symbo's whole dialer in the frame; compact shows a status strip with your UI around it; hidden renders nothing and sends every state change as an event.](docs/images/modes.svg)

| | `mode: 'widget'` (default) | `mode: 'compact'` | `mode: 'hidden'` |
| --- | --- | --- | --- |
| The frame | Symbo's own dialer, the same one its CRM plugins embed: keypad, contact card, notes, outcome form. 420×485 unless you size the iframe | A small Symbo strip — signed-in user, device state, a settings panel for audio and caller id. The SDK sizes the iframe to it and follows the frame's `resize` events | 0×0, `visibility: hidden`, `aria-hidden`. Nothing to see or focus |
| Sign-in | Symbo's login form, inside the frame | A **Sign in** button in the strip opens Symbo's login tab | Your button calls `dialer.openSignIn()`, or your server signs a token for `dialer.signIn({ token, profileId })` |
| Device / mic / realtime state | Shown in the dialer, and sent as events | Shown in the strip, and sent as events | Sent as events only: `ready`, `auth.required`, `warning`, `warning.cleared`, `device.*`, `permission.denied` |
| Audio settings | The dialer's settings tab, and `dialer.audio.*` | The strip's panel, and `dialer.audio.*` | `dialer.audio.*` only |
| Outcome form, notes, keypad | Symbo's | Yours | Yours |
| Inbound ringtone | The frame rings | Silent — play your own on `call.incoming` | Silent — play your own on `call.incoming` |
| Toasts | Symbo's, inside the frame | None — the same states arrive as `warning` | None |

Ringback while lines ring and the connect tone play inside the frame in every
mode. Hidden mode has a [checklist](#hidden-mode-checklist) of things that only
matter when there is nothing on screen.

`?embed=1` with no mode at all is `widget`, which is what it has always meant.
The 0.1.x `hidden: true` option still works and maps onto `mode: 'hidden'`
with a deprecation warning; `hidden: false` keeps its old meaning of
`'compact'`.

## Signing in

`mount()` resolves once a user is signed in inside the frame. Until then Symbo
says `auth.required`, and the mount timer stops — a rep taking their time is
not a timeout. There are two ways through, and you can offer both.

![Two ways in: a Symbo login tab opened from a click, or a silent sign-in where your server signs a JWT that Symbo verifies against the JWKS you publish.](docs/images/sign-in-paths.svg)

**A · A Symbo login tab.** `auth.required` carries a `loginUrl`. Widget mode
shows Symbo's login form in the frame and compact mode a **Sign in** button
that opens the tab; in hidden mode, or if you want your own button, call
`openSignIn()` **from a click handler** (browsers block tabs opened any other
way). When the rep finishes, the frame picks the session up by itself and
`ready` follows.

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

**B · Silently, with a trusted auth token.** Your server signs a short-lived
RS256 JWT for the rep who is logged into *your* app, and the page hands it
over. Symbo verifies the signature against a public key you publish as a JWKS,
so Symbo issues you no credential at all — the only key involved is yours. The
token carries an `organization_id` claim naming the Symbo organization it is
for; one `profileId` can serve several, and the claim picks which:

```js
const PROFILE_ID = 'trusted-token-profile-live-…' // Symbo gives you this

dialer.on('auth.required', async () => {
  // Your endpoint. It must mint for the CURRENT SESSION'S user — never for a
  // user id read from the request body.
  const { token } = await fetch('/my-server/symbo-token').then((r) => r.json())
  try {
    await dialer.signIn({ token, profileId: PROFILE_ID }) // { user }; `ready` follows
  } catch (err) {
    // TOKEN_REJECTED           — Symbo would not accept the JWT (signature, iss, aud, exp, kid)
    // USER_NOT_PROVISIONED     — Symbo has no rep with that email
    // USER_NEEDS_FIRST_LOGIN   — the rep has not accepted their Symbo invite
    // ORGANIZATION_ID_REQUIRED — the token has no organization_id claim
    // ORGANIZATION_MISMATCH    — that rep is not in the org the token names
    // PROFILE_NOT_CONFIGURED   — the profileId is wrong, or not bound to that org
    // CALLING_NOT_ENABLED      — the rep has no calling seat
  }
})
```

Sessions last 8 hours. `auth.required` fires again at expiry; mint another
token and call `signIn()` again — the rep sees nothing. The one-time setup on
your side (a keypair, a JWKS URL, the `iss` and `aud` you will use) and a
troubleshooting table for first-run `TOKEN_REJECTED`s are in the
**Embedded Dialer** guide, under *Setting up silent sign-in*.

`signIn()` and `getState()` work before `ready`; every other command rejects
with `NOT_READY` until then. If the session expires mid-day, `auth.required`
is sent again and `dialer.ready` goes back to `false`.

`mountTimeoutMs` (default 30 000) only covers the frame never saying anything
at all — a wrong `appUrl`, an unreachable environment, a Symbo build without
the embed surface — and rejects `mount()` with `MOUNT_TIMEOUT`.

## The dialer widget

Mount with no `mode` (or `mode: 'widget'`) and Symbo's dialer renders in your
container, 420×485 unless you size the iframe. The rep signs in inside it,
and every call — placed from your button or arriving inbound — is handled
there: ringing, the contact card, notes, the outcome form. Your page needs
`dial()` and, at most, the `call.*` events to know what state the line is in.

The two things below are the widget integration. Both also work with the
compact and hidden modes between power-dial sessions, which is where the
notes about "no outcome form" apply.

### One-off calls

For a "Call" button on a single contact, outside a session:

```js
const { callId } = await dialer.dial({ prospectId: 'p-1001', phoneNumberId: 'pn-2' })
// or, for a number you hold no Symbo record for:
const { callId } = await dialer.dial({ number: '+12125550123', externalId: 'case-48211' })
```

`dial()` resolves when the carrier reports the call ringing, which is where
the `callId` comes from. A `callId` of `null` is not a failed call: it comes
back **fast** for a call that failed outright or was answered on another
device, and after about 15 s for one that rings for a long time. Either way
`call.started`, `call.ringing` and `call.ended` carry the id once it is known,
so key your record off the events rather than off this resolution alone.

Events: `call.started` → `call.ringing` → `call.answered` (far-end pickup) →
`call.ended { reason, durationSeconds }` → `call.wrap`. That is the end of it:
compact and hidden mode show no outcome form (widget mode shows Symbo's own),
and there is no command for saving a one-off outcome (`session.saveOutcome`
is for the call in front of the rep in a session, and refuses with
`NO_ACTIVE_SESSION` outside one). Render your own wrap-up on `call.wrap` and
save it from your server with `PUT /calls/{id}`; the completion signal is that
response — not an event in the page. `contact.matched` fires when Symbo
recognises a number you dialled without a prospect. `dial()` is refused with
`SESSION_ACTIVE` while a session runs: the rep's line is busy for the whole
session.

`externalId` comes back on the call events and on the call record, which is
how a call lands against your record without a prospect. Prefer `prospectId`
when you have one.

### Inbound calls

In compact and hidden mode the frame plays **no** ringtone — widget mode rings
by itself. Play your own on `call.incoming`, and stop it when the call is
answered, ignored, or ends:

![The example page's inbound banner: who is calling, the number and matched contact, an Answer button and an Ignore button.](docs/images/example-inbound.png)

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

An answered inbound call ends the way a one-off call does — `call.ended` →
`call.wrap`, and the outcome is yours to save with `PUT /calls/{id}`.

An inbound call that arrives while a session is active, or while a call is
up, is not offered to the page: it follows the rep's normal no-answer routing
(voicemail, forwarding). One inbound call rings at a time.

## The power dialer

Mount with `mode: 'compact'` or `'hidden'`, and draw the rest yourself. The
engine that dials lives on Symbo's servers. It rings your organisation's
number of lines at once (1–4, fixed per org; `dialer.concurrentCalls` tells
you), bridges the rep to the first answer, hangs up the rest, and pauses until
you say otherwise. The session is a Symbo dial session like any other — it
sits on the rep's queue in Symbo, the rep or an admin can act on it from the
app, and your page sees those actions as events. Through the API and the SDK
you decide what goes on the queue and in what order, which of a contact's
numbers is dialled, which outcome each conversation gets, and what happens
after each call; your page draws the queue and the wrap-up.

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
  "use_auto_timezone": false,
  "skip_duplicates": true
}
```

The response carries the session id and its `queued_calls`. Hand the id to
your page. The number of lines, the retry rules and the default outcomes for
unanswered lines are not per-session settings: they come from the
organisation and the owner's power-dial settings. The full request and
response, the filters, and what each rejection reason means are in the
**Embedded Dialer** guide.

### 2. The page starts it

```js
const { dialSessionId, concurrentCalls } = await dialer.session.start({
  dialSessionId,
})
```

The frame takes the session off hold, joins the rep's audio leg, and the
engine dials. From here on you render events.

### 3. What a round of dialing looks like

![One round with two lines: Symbo rings both, line 2 answers, line 1 is hung up, the engine pauses, the conversation ends with session.wrap, your page saves the outcome, the next round rings.](docs/images/round-sequence.svg)

The same round, as the events arrive:

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
your records on `prospectId`; join to the call records you read back from the
API on `callId`.

### 4. The wrap-up

`session.wrap` is your cue. The engine is paused, and with
`outcomeRequired: true` it will not resume until the conversation has an
outcome — so this panel is what keeps the session moving.

![The example page's wrap-up panel: the contact, how long the call lasted, an outcome picker, a note, and three buttons — save and dial next, save and pause, save and finish.](docs/images/example-wrap-up.png)

```js
dialer.on('session.wrap', ({ callId, prospectId, durationSeconds, outcomeRequired }) => {
  showWrapUp({ callId, prospectId, durationSeconds })
})

// From your Save button:
const { outcomeId } = await dialer.session.saveOutcome({
  callId,                      // defaults to the call waiting for its outcome
  outcomeValue: 'MEETING_BOOKED', // or outcomeId, from GET /v1/callOutcomes
  note: 'Demo booked for Friday 10:00.',
  callFields: { c_meeting_at_4821: '2026-09-25T10:00:00-07:00' },
  then: 'resume',              // 'resume' (next round), 'pause', or 'end'
})
```

`call.completed` follows the save. You can save from your server instead
(`PUT /calls/{id}`) and then call `dialer.session.resume()`; `saveOutcome` is
the same write done from the page in one step.

### 5. Pause, resume, skip, end

| You call | What happens |
| --- | --- |
| `session.pause()` | Lines that are ringing are hung up (they get the cancelled default outcome). A connected call is **never** cut. The engine stays paused after the call until you resume |
| `session.resume()` | Dials the next round. Refused with `OUTCOME_PENDING` while a call is waiting for its outcome, and with `CALL_IN_PROGRESS` while a contact is still on the line (hang up or `skipCurrent()` first) |
| `session.saveOutcome({ …, then })` | Saves the outcome, note and call fields on the call, then `'resume'` (next round), `'pause'` (stay paused) or `'end'` |
| `session.skipCurrent()` | Hangs up the connected call and skips its outcome |
| `hangUp()` | Hangs up the connected call (→ `session.wrap`), or cancels ringing lines |
| `session.removeQueued(queuedCallId)` | Drops a queued contact from this session. Refused with `QUEUED_CALL_DIALING` once its line is ringing |
| `session.end({ force })` | Ends the session. Refused with `CALL_IN_PROGRESS` over a connected call unless `force: true`; the call survives either way. Resolves with `{ counts }` |
| `session.getQueue()` | `{ dialSessionId, counts, queue: [{ queuedCallId, prospectId, prospectName, number, status, order, attempts, lastCallId, lastOutcomeId }] }` |
| `getState()` | Everything at once: `{ signedIn, deviceReady, mode, powerDialing, concurrentCalls, session, call, incoming, warnings }` |

Things the engine decides on its own, and that you should expect: it retries
an unanswered contact on the owner's own power-dial schedule, and rotates
through the contact's numbers unless you pinned one; it skips contacts outside
the session's timezone and phone-type filters without an event; unanswered and
cancelled legs get the rep's default outcomes; a session can also be driven
from inside Symbo by the rep or an admin, in which case you see the same
events (and `session.admin`).

### 6. The queue while it runs

Apart from `session.removeQueued()`, every change to the queue is made from
your server, on the queued call's id: `PUT /v1/dialSessionQueuedCalls/{id}`
with `status`, `retry_at`, `retry_position: 'top' | 'bottom'` or
`phone_number_id`. The engine reads the queue before every round, and the
frame sends `session.queue.updated { counts }` as its counts change.

![The states of a queued contact: queued, dialing, then attempted, completed or cancelled; removed and re-queued through the API; attempted contacts come back to the queue on retry.](docs/images/queued-call-states.svg)

`counts` on `session.queue.updated`, `session.ended` and `getState()` is
`{ queued, dialing, attempted, completed, cancelled, removed, remaining }`.
These count queue rows. For how many of the session's *calls* carry an
outcome, read `counts.outcomes_saved` on `GET /v1/dialSessions/{id}` — it is
not on these events, because a session can hold several calls per row.

## Audio devices

```js
const { microphones, speakers, selected } = await dialer.audio.list()
await dialer.audio.set({ microphoneId: microphones[1].id }) // resolves with the same shape
dialer.on('audio.devicesChanged', renderPicker) // a headset was plugged in
```

Device labels are only available once the microphone permission has been
granted; before that the lists are empty or unnamed, and `audio.list()` can
be refused with `DEVICE_NOT_READY`. The rep's choice persists inside Symbo, so
it matches what Symbo's own UI shows in widget and compact mode, and survives
reloads.

## Warnings

Anything Symbo's own UI would show as a problem arrives as a `warning`
with a code, and is withdrawn with `warning.cleared`. `dialer.warnings` is a
`Map` of the ones currently raised. In hidden mode these events are the only
way the rep learns about a problem, so show them.

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
| `dialer.mount()` | Creates the iframe. Resolves with the client on `ready`; rejects with `MOUNT_TIMEOUT` if the frame never answers, or with `EMBED_NOT_ENABLED` / `ORIGIN_NOT_ALLOWED` if it answers by refusing the page; calling it again returns the same promise, settled the same way — a client whose mount was refused cannot be retried, so make a new one |
| `dialer.destroy()` | Removes the iframe and its listeners; anything still pending rejects with `DESTROYED` |

Options: `container` (required), `appUrl` (an origin; default
`https://app.symbo.ai`), `mode` (`'widget'` \| `'compact'` \| `'hidden'`,
default `'widget'`), `mountTimeoutMs`
(default 30 000), `commandTimeoutMs` (default 15 000). `commandTimeoutMs` does
not apply to `dial()`, which always allows at least 25 s: the frame itself
waits up to 15 s for the carrier to report the call ringing, and a shorter
budget here would reject a call that has really been placed.

### Commands

Every command returns a promise that settles on Symbo's answer: it resolves
with the answer's data, or rejects with a `SymboDialerError` whose `.code` is
one of the [error codes](#error-codes) and whose `.message` says why.

| Command | Resolves with |
| --- | --- |
| `dial({ number \| prospectId, phoneNumberId?, externalId?, externalObjectType?, fullName? })` | `{ callId }` — `callId` is `null` when the carrier never reported the call ringing |
| `hangUp()` | `{}` |
| `setContact({ … })` | `{}` |
| `getState()` | the state object above |
| `signIn({ token, profileId })` | `{ user }` |
| `openSignIn()` | the opened `Window` (synchronous; throws `NO_LOGIN_URL` / `POPUP_BLOCKED`). Wait for `ready`, not for that window to close: under `Cross-Origin-Opener-Policy: same-origin` the handle is severed when the login page loads and starts reading `closed === true` |
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
| `call.completed` | `{ callId, externalId, prospectId, outcomeId, outcome, disposition, dispositionGroup, note, durationSeconds }` — after a save made through `session.saveOutcome` succeeded. A one-off outcome, saved from your server, does not produce it |
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
| `resize` | `{ width, height }` — applied in widget and compact mode, ignored in hidden. Only the compact strip sends it; widget mode sizes itself once, from `ready` |
| `error` | `{ code, message }` — a refusal that was not an answer to a command |

Events are good for driving your UI in the moment. For anything you need to
keep, read the call records back from the API — `GET /calls?dialSessionId=…`
returns every leg of a session with its outcome — because events in a page
are not durable.

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
| `TOKEN_REQUIRED` / `TOKEN_REJECTED` | `signIn()` was given no token / Symbo would not accept the one it got |
| `PROFILE_NOT_CONFIGURED` | The `profileId` is wrong, or not bound to the organization the token names |
| `ORGANIZATION_ID_REQUIRED` / `ORGANIZATION_MISMATCH` | The token carries no `organization_id` claim / names an organization the rep is not in |
| `USER_NOT_PROVISIONED` / `USER_NEEDS_FIRST_LOGIN` | Symbo has no such rep / the rep has not accepted their invite |
| `REALTIME_DISCONNECTED` | The frame's realtime connection is down; try again shortly |
| `SESSION_NOT_FOUND` / `SESSION_NOT_STARTABLE` / `SESSION_ALREADY_ACTIVE` | `session.start` problems: not visible to this rep, ended or on another rep's queue, or a session is already loaded |
| `NO_ACTIVE_SESSION` | A `session.*` command with no session running |
| `OUTCOME_PENDING` | `session.resume` before the last call's outcome was saved |
| `NO_CALL_TO_SAVE` / `OUTCOME_UNKNOWN` / `NOTE_REQUIRED` | `session.saveOutcome` problems: nothing waiting for an outcome, an unknown outcome, or an outcome that requires a note and got none |
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
  `signIn({ token, profileId })`; nothing in the frame can be seen.
- **Sound.** Ringback and the connect tone play inside the frame; inbound
  ringing is yours. Keep the frame in the document (`display: none` on an
  ancestor stops it running).
- **Chrome.** The embedded dialer is supported in Chrome. Other browsers are
  not covered.
- **Allowed origins.** Your Symbo organisation lists the origins that may
  embed; ask Symbo to add yours (test and live). Until it is listed the frame
  answers straight away: `ORIGIN_NOT_ALLOWED` as an `error` and a `warning`,
  and `mount()` rejects with that code rather than waiting out its timer.
  `EMBED_NOT_ENABLED` is the same answer for an organisation without the
  embedded dialer at all. Create a new client once it is sorted — the
  refused one keeps its rejected `mount()` promise.

## SDK versions and Symbo releases

| SDK | Needs the Symbo release with | Surface |
| --- | --- | --- |
| 0.1.x | the embedded dialer | `mount / dial({ number }) / hangUp / setContact`; `ready, auth.required, call.*, contact.matched, resize, error` |
| **0.2.0** | the power-dial embed | everything above, plus `create()`, all three modes, `signIn / openSignIn`, `getState`, `dial({ prospectId })`, sessions, inbound, audio devices, warnings |

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
npm test          # protocol contract, client behaviour, and the stub driven end to end
npm run build     # dist/symbo-dialer.min.js, the script-tag bundle
npm run demo      # serve the example
npm run diagrams  # redraw docs/images/*.svg from docs/diagrams/build.mjs
```

The npm package ships plain ESM from `src/`. There is no build step for the
module entry — `dist/` exists only for script-tag users, and is rebuilt
automatically on publish.

The message names are declared twice, here and in the Symbo application, and
`test/protocol.test.js` pins them on this side against a literal shared with
the application's own contract test. Change one, change both.

The figures in `docs/images/` are shared with the Symbo API's **Embedded
Dialer** guide, which links to them by URL. The SVGs are generated by
`docs/diagrams/build.mjs`; the PNGs are screenshots of the example pages
running against the offline stub.

## Licence

[MIT](LICENSE). Reaching the Symbo Service through this package needs a Symbo
account, and is governed by the [Symbo Terms and
Conditions](https://www.symbo.ai/resources/terms-conditions).

## Questions

**team@symbo.ai**
