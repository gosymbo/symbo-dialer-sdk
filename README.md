# @symbo/dialer-embed

Embed the Symbo dialer in your own application. The package covers two
different integrations, and this README keeps them apart:

- **The dialer widget.** Symbo's own dialer, in an iframe on your page. Your
  page adds Call buttons; the keypad, the contact card, notes, the outcome
  form and inbound ringing are all Symbo's. One-off calls, one at a time.
- **The power dialer.** Symbo's engine rings several contacts at once from a
  dial session your server created through the Symbo API, and your page
  draws the whole experience — the queue, the post-call form, the inbound
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
dialer.on('session.postCall', showYourPostCallScreen)
await dialer.mount()

await dialer.session.start({ dialSessionId }) // a session your server created
```

Not using a bundler? A script tag gives you the same thing on `window`:

```html
<script src="https://cdn.jsdelivr.net/npm/@symbo/dialer-embed@0.4/dist/symbo-dialer.min.js"></script>
<script>
  const dialer = SymboDialer.create({ container: document.getElementById('symbo-dialer') })
  dialer.mount()
</script>
```

> **Which Symbo release you need** is at the [end](#sdk-versions-and-symbo-releases).
> The session, inbound, audio and sign-in commands in 0.2.0 need the Symbo
> release that carries the power-dial embed, mute and the keypad in 0.3.0 the
> one that carries those, and session hold, one-off outcomes and calls during
> a paused session in 0.4.0 the one with those; against an earlier one they
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
- [Mute and keypad](#mute-and-keypad)
- [Warnings](#warnings)
- [New Symbo versions and reloads](#new-symbo-versions-and-reloads)
- [API](#api)
- [Events](#events)
- [Error codes](#error-codes)
- [Hidden-mode checklist](#hidden-mode-checklist)
- [SDK versions and Symbo releases](#sdk-versions-and-symbo-releases)

## Which integration are you building?

| | The dialer widget | The power dialer |
| --- | --- | --- |
| What the rep sees | Symbo's dialer, whole, in a 420×485 frame on your page | Your own screens; Symbo is a small status strip (`compact`) or invisible (`hidden`) |
| What you build | A Call button per contact | The queue, the contact card, the post-call form, the inbound banner |
| Where the session lives | — | In Symbo, on the rep's queue: the same dial session the Symbo app shows and can drive, created and edited through the Symbo API |
| How calls are placed | One at a time, with `dialer.dial()` | Several lines at once by Symbo's engine, from a queue your server created with the Symbo API |
| Outcomes and notes | Saved in Symbo's outcome form, inside the frame | Saved by your page with `session.saveOutcome()`, or by your server |
| Inbound calls | The frame rings and answers | Your page rings and answers (`call.incoming`) |
| Server side | None required | Sync contacts, create sessions, edit the queue, read calls back — the **Embedded Dialer** guide in the Symbo API docs |
| Mount with | `mode: 'widget'` (the default) | `mode: 'compact'` or `'hidden'` |
| SDK surface | `mount`, `dial`, `hangUp`, `setContact`, the `call.*` events | All of that, plus `session.*`, `signIn`, `answerIncoming`, `saveOutcome`, `audio.*`, `setMuted`, `sendDigits`, `getState`, the `session.*` events |
| Example | [`example/index.html`](example/index.html) | [`example/collections.html`](example/collections.html) and [`example/power-dial.html`](example/power-dial.html) |

Pick the **widget** when your application only needs a way to place a call and
is happy for the call itself to happen in Symbo's UI: a CRM record with a Call
button, a support console, an internal tool. It is the smallest integration
there is, and the 0.1.x surface.

Pick the **power dialer** when your reps work through lists inside your
application and you want them to stay there while Symbo does the dialing.
Symbo rings several contacts at once, connects the rep to whoever answers
first, and handles the no-answers, retries and default outcomes for you; your
application supplies the list, and Symbo keeps it told, as events, which
contacts are ringing, who answered and when a conversation needs its outcome,
and takes its commands to pause, skip, save an outcome or end. You draw all of
that in your own screens. Your server creates the session through the Symbo
API from contacts it has synced, can drop, re-queue or reschedule a contact
while it runs, and reads every call back when it ends. The session itself
lives in Symbo, on the rep's queue, so a manager can also see and manage it
from the Symbo app. This integration needs a server side for the API calls and
a page that draws the queue and the post-call screen.

Both can live on the same page — `dial()` works between sessions, and while
one is paused — and both go through the same sign-in.

## How it fits together

![Your page holds your UI, the SDK and the Symbo frame; your server talks to the public API; Symbo's engine rings the contacts and reads the queue.](docs/images/architecture.svg)

The SDK creates an iframe served from `app.symbo.ai` and talks to it over
`postMessage`. The frame holds the rep's audio leg, the calling device and the
realtime connection. Your page holds everything the rep sees and decides what
happens next: you send **commands** (`session.start`, `session.saveOutcome`,
`dial`, `answerIncoming`, `audio.set` …) and receive **events**
(`session.leg.ringing`, `session.postCall`, `call.incoming`, `warning` …).

The SDK sets the iframe up for you, with `allow="microphone; autoplay"` and
the mode on the frame URL.

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
?lockLines=2                                  with the stub: an organization that fixes every session's number of lines
?tokenServer=http://localhost:8790&email=…    silent sign-in through example/token-server (collections.html)
```

[`example/token-server`](example/token-server) stands in for your backend
while you try silent sign-in: it makes a keypair, serves the JWKS and mints
tokens, with nothing to install. Its README runs it against the stub and
against Symbo.

`appUrl` is an **origin**, not a path — the SDK appends `/dial?embed=1&mode=…`.

### Dialer widget · `example/index.html`

[**Open it live**](https://gosymbo.github.io/symbo-dialer-sdk/example/) — a
list of cases with Call buttons, a box for dialling any number, and Symbo's
dialer beside them. Everything after the click — ringing, notes, the outcome
form — happens inside the frame. This is the whole of the widget integration,
and the page that shipped with 0.1.x, unchanged.

### Power dialer · `example/collections.html`

The same pretend collections tool, rebuilt on the power dialer: a queue that
lights up as lines ring and connect, a post-call panel, an inbound banner, an
audio-device picker, a mode switch and a live log of everything the dialer
sends back. It also keeps a one-off Call button per contact, to show the two
coexisting. Against a Symbo environment, enter its API URL and an API token on
the page to load your organization's call outcomes into the post-call panel;
the stub brings its own.

![The example page's queue in the middle of a two-line round: one contact connected, the other line hung up because the first answered, the rest waiting.](docs/images/example-queue-round.png)

### Power dialer, minimal · `example/power-dial.html`

The smaller, plainer one: a single file of plain JavaScript that loads the SDK
from jsDelivr, signs in by redirect, starts a dial session you built in Symbo
by its id, and renders the queue as Queued / In progress / Attempted /
Completed boards that contacts move through as the engine works. No build step
and no server of your own — copy the file anywhere and serve the folder. It
picks up a session the rep already has running, so connecting mid-session
lands you on a live board. Inbound calls ring on the page between sessions and
while one is paused, with Answer and Ignore; over a call, Answer asks before
ending it (End & Accept). Their outcomes are saved with `dialer.saveOutcome()`.

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
| Outcome form, notes | Symbo's | Yours | Yours |
| Mute, keypad | Symbo's buttons, and `setMuted()` / `sendDigits()` | Yours, calling `setMuted()` / `sendDigits()` | Yours, calling `setMuted()` / `sendDigits()` |
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

**B · Silently, with a signed token.** Your server signs a short-lived
RS256 JWT for the rep who is logged into *your* app, and the page hands it
over. Symbo verifies the signature against a public key you publish as a JWKS
(JSON Web Key Set).

A JWT is a small signed JSON document in three parts: a header, which names
the algorithm and the key that signed it (`alg`, `kid`); a payload, whose
fields are called *claims*; and a signature. `iss` (issuer), `aud`
(audience), `sub` (subject), `jti` (token id), `iat` (issued at), `nbf` (not
before) and `exp` (expires) are standard claim names that every JWT library
knows; `email` and `organization_id` are two more that Symbo reads.

The token's `organization_id` claim names the Symbo organization it is for.
Symbo gives you a `profileId` during setup (see
[Your server's side](#your-servers-side)); one `profileId` can serve several
organizations, and the claim picks which:

```js
const PROFILE_ID = '<your profileId>' // Symbo gives you this

dialer.on('auth.required', async () => {
  try {
    // Your endpoint, on this page's origin, behind your login. It mints for
    // the CURRENT SESSION'S user — never for a user read from the request.
    const r = await fetch('/my-server/symbo-token', { method: 'POST' })
    if (!r.ok) throw new Error(`token endpoint answered ${r.status}`)
    const { token } = await r.json()
    await dialer.signIn({ token, profileId: PROFILE_ID }) // { user }; `ready` follows
  } catch (err) {
    // TOKEN_REJECTED           — Symbo would not accept the JWT: check its signature,
    //                            issuer (iss), audience (aud), expiry (exp) and key id (kid)
    // USER_NOT_PROVISIONED     — Symbo has no rep with that email
    // USER_NEEDS_FIRST_LOGIN   — an org admin who has not signed in to Symbo by hand yet
    //                            (reps never need to: their first sign-in activates them)
    // ORGANIZATION_ID_REQUIRED — the token has no organization_id claim
    // ORGANIZATION_MISMATCH    — that rep is not in the org the token names
    // PROFILE_NOT_CONFIGURED   — the profileId is wrong, or not set up for that org
    // CALLING_NOT_ENABLED      — the rep has no calling seat
    // RATE_LIMITED             — too many sign-ins from this address; wait a minute
    // ORIGIN_NOT_ALLOWED       — this page's origin is not on the list you gave Symbo
    // EMBEDDED_DIALER_DISABLED — the embedded dialer is off for this organization
    // TOKEN_REQUIRED           — your endpoint returned a blank token
    // …and the rest in the error table below.
    // Don't retry in a loop: show a button that calls openSignIn() instead.
    showSignInButton(err)
  }
})
```

Sessions last 8 hours. `auth.required` fires again at expiry; mint another
token and call `signIn()` again. The frame reloads to finish signing in, and
`ready` follows from the reloaded frame.

A frame that already holds the rep's session (after your page reloads, say)
checks it and, once it holds, says `ready` by itself with no `auth.required`.
A `signIn()` sent while it checks waits for the check; if the session holds,
it answers `{ user }` with that rep, without signing in again or reloading.
When `signIn()` does sign in, it answers `{ user, reloading: true }` and the
frame reloads to finish.

**Switching reps.** The rep signed in inside the frame is separate from your
app's login. The frame keeps that rep signed in for up to 8 hours, even if a
different user logs into your app in the same browser, and clearing your
site's cookies or storage does not sign them out. Calling `signIn()` while a
rep is signed in does not switch reps either: it succeeds, with the rep who
is already signed in. To keep the frame's rep matched to the user of your
app, do two things:

1. **When a user logs out of your app,** call `dialer.signOut()` before you
   clear your own session. It resolves once the rep is signed out; the frame
   then reloads with nobody signed in and sends `auth.required`. Your
   `dialer` object and its listeners carry on as before.
2. **Every time `ready` fires,** compare `dialer.user.email` with the email of
   the user logged into your app, ignoring case. If they differ, call
   `signOut()`, and when `auth.required` arrives, sign in the right rep: with
   `signIn({ token, profileId })`, or by showing your button for
   `openSignIn()`.

`signOut()` is refused while the rep is busy: with `SESSION_ACTIVE` while a
power-dial session is loaded (hold or end it first), with `CALL_IN_PROGRESS`
during a call or while one is ringing, and with `POSTCALL_DETAILS_REQUIRED`
while the last call still needs its outcome under "Require & block dialer".
Ask the rep to finish, then call it again.
A frame on an older Symbo release does not have `signOut()` and refuses it
with `UNKNOWN_COMMAND`, so check `dialer.hasCapability('signOut')` first.

### Your server's side

Each rep must already be a Symbo user with a calling seat, created with
`POST /v1/users` under the same email your token carries (see the **Getting
Started** guide in the Symbo API docs); a token never creates one. Org admins
must sign in to Symbo once by hand before silent sign-in works for them; reps
don't. Then set up once, and build one endpoint:

1. **A keypair and a JWKS.** An RSA 2048 keypair; the private key stays on
   your server. Publish the public half as a JWKS at a public HTTPS URL, with
   no login, WAF challenge or IP allowlist in front of it:

   ```bash
   openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out private.pem
   ```

   ```js
   // Node: the JWKS to publish, derived from the private key
   const fs = require('fs')
   const crypto = require('crypto')
   const jwk = crypto.createPublicKey(fs.readFileSync('private.pem')).export({ format: 'jwk' })
   const jwks = { keys: [{ ...jwk, use: 'sig', alg: 'RS256', kid: '2026-09' }] }
   // GET https://your-app.example/.well-known/jwks.json → jwks
   ```

   The `kid` (key id) is any string you choose; a date works. Every token
   carries it in the JWT's own header, next to `alg: RS256` (not an HTTP
   header), and it must match the `kid` of a key in your JWKS.

2. **Send Symbo the details** at **team@symbo.ai**:

   - **Your JWKS URL.**
   - **An issuer** (`iss` in the token, the standard JWT "issuer" claim): a
     fixed string that names your app as the one signing the tokens. Your
     app's URL is the usual choice, such as `https://your-app.example`.
   - **An audience** (`aud` in the token, the standard JWT "audience"
     claim): a fixed string that marks the tokens as meant for Symbo. Use
     `symbo-embedded-dialer`; it does not need to be a URL.
   - **Your page's origins**: the `https://` origin of every page that
     embeds the dialer, test and live, with no wildcards.
   - **Your Symbo organizations**: the name of each organization whose reps
     will sign in this way.

   Every token must carry the issuer and the audience exactly as you sent
   them; they are compared character for character, so a trailing slash
   makes a different issuer. Symbo records these details as your sign-in
   profile and sends back its `profileId`, plus the uuid of each Symbo
   organization the profile covers. Neither is a secret: the `profileId`
   goes in your page, in the `signIn()` call, and each uuid goes in the
   token's `organization_id` claim. To change the issuer, audience, JWKS URL
   or page origins later, email Symbo and wait for the reply before you
   switch.
3. **The token endpoint.** `POST`, on your page's origin, behind your login.
   It signs, with RS256 and your `kid` in the header:

   | Claim | Value |
   | --- | --- |
   | `iss` | Your issuer, exactly as you sent it to Symbo |
   | `aud` | Your audience, exactly as you sent it to Symbo |
   | `sub` | Your own user id for the rep, as a string |
   | `email` | The rep's email, from your session; it must match their email in Symbo. Only an address your app has verified belongs to that user |
   | `organization_id` | The uuid Symbo sent for the organization this rep belongs to. With several organizations, look it up from the logged-in user's account on your side, not from the request |
   | `jti` | A fresh random id per token |
   | `iat` (issued at) | The current time, in whole seconds since the Unix epoch (not milliseconds) |
   | `nbf` (not before) | A few seconds before `iat` |
   | `exp` (expires) | Two minutes after `iat` |

[`example/token-server`](example/token-server) does steps 1 and 3 (the
keypair, the JWKS and the tokens) with nothing to install; `token.js` is the
part to read. You still send the step 2 email yourself. The **Embedded Dialer** guide in
the Symbo API docs, under *Setting up silent sign-in*, has an Express
version, key rotation, what to do if a key leaks, and a troubleshooting table
for first-run `TOKEN_REJECTED`s.

`signIn()`, `signOut()` and `getState()` work before `ready`; every other command rejects
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
compact and hidden modes between power-dial sessions and while one is paused,
which is where the notes about "no outcome form" apply.

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
`call.ended { reason, durationSeconds }` → `call.postCall`. Compact and hidden
mode show no outcome form (widget mode shows Symbo's own), so render your own
post-call screen on `call.postCall` and save it with `dialer.saveOutcome()`:

```js
dialer.on('call.postCall', ({ callId, durationSeconds }) => {
  showPostCallScreen({ callId, durationSeconds })
})

// From your Save button:
await dialer.saveOutcome({
  outcomeValue: 'LEFT_VOICEMAIL', // or outcomeId, from GET /v1/callOutcomes
  note: 'Left a message about the renewal.',
}) // → { callId, outcomeId }; call.completed follows
```

It saves the call waiting in its post-call step or, with `callId`, any call
after the fact, including a session call the frame no longer holds; it needs
an outcome, a note or call fields to write. Only a save of the call that was
waiting sends `call.completed` and closes that step. A session call in front
of the rep is saved with `session.saveOutcome` instead; one the frame no
longer holds, after a `session.hold()` or a reload
([below](#reloads-you-did-not-ask-for)), is saved here with its `callId`.
Check `dialer.hasCapability('saveOutcome')` first: an older Symbo release
answers `UNKNOWN_COMMAND`. Your server can still save it with
`PUT /calls/{id}`; the frame learns of that write only when it next checks,
which `dial()`, `reload()`, `signOut()` and the session commands that dial on
do before refusing with `POSTCALL_DETAILS_REQUIRED`.

`call.postCall.blocksDialing` says whether your organization uses "Require &
block dialer". Only then does nothing dial until the outcome is saved: the
next `dial()` is refused with `POSTCALL_DETAILS_REQUIRED`, and so are the
session commands that dial on — `session.start()` (not with `dial: false`),
`session.resume()` and `session.saveOutcome({ then: 'resume' })`, which is
refused before it saves anything. Under plain "Require"
(`outcomeRequired: true`, `blocksDialing: false`) the next dial, or a session
dialing on, goes ahead and drops the unsaved post-call step; save that call by
`callId` afterwards if you still need to.

`contact.matched` fires when Symbo recognises a number you dialled without a
prospect.

`dial()` works between power-dial sessions, and while one is paused with the
rep's line down (`dialer.hasCapability('callsWhilePaused')`); the call is an
ordinary one, not part of the session. It is refused with `SESSION_ACTIVE`
only while the session is dialing or has a call in front of the rep —
connected, or in its post-call step: pause the session, or finish that step,
first. While another call is up it is refused with `CALL_IN_PROGRESS`. If the
calling device has not registered yet, `dial()` waits up to about 10 s for it
before refusing with `DEVICE_NOT_READY`.

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
`call.postCall` — and its outcome is saved the same way, with
`dialer.saveOutcome()`.

The page is offered an inbound call whenever the rep could take it: between
calls, during a one-off call, and during a power-dial session except while the
engine is dialing. One that arrives while it dials follows the rep's normal
no-answer routing (voicemail, forwarding). One inbound call rings at a time,
and `call.ended { reason: 'cancelled' }` arrives for every `call.incoming` that
stops ringing unanswered: the caller gave up, it was ignored (by you or in
Symbo), it rang out after 30 s, or the session started dialing over it.
`session.start()`, and `session.resume()` on a paused session with no call in
front, dismiss it as soon as they set the engine dialing, even if the queue
then turns out to be empty. Dialing on after a session call
(`session.resume()` or `session.saveOutcome({ then: 'resume' })` in the
post-call step, or `session.skipCurrent()`) dismisses it only when a contact is
left to dial.

`answerIncoming()` takes the call when the rep's line is free. Over a one-off
call it is refused with `CALL_IN_PROGRESS`, and over a session's call in front
of the rep, or while the engine dials, with `SESSION_ACTIVE`.
`answerIncoming({ endCurrent: true })` is Symbo's "End & Accept": it ends the
call the rep is on and answers. A one-off call ends with `call.ended` and
`call.postCall`, and is then treated like any call waiting for its outcome
(below). A session's connected call is hung up into its post-call step
(`session.leg.ended`, `session.postCall`) and the session pauses with
`session.paused { reason: 'incoming' }`; `session.resume()` is refused until
the inbound call is over and that step is saved. Check
`dialer.hasCapability('callWaiting')` before offering it.

Answering, with or without `endCurrent`, drops the post-call step of a one-off
or inbound call still waiting for its outcome, as in Symbo, whatever the
outcome setting. Keep the `callId` from its `call.postCall` and save it with
`dialer.saveOutcome({ callId })`, or from your server with
`PUT /calls/{id}`.

## The power dialer

Mount with `mode: 'compact'` or `'hidden'`, and draw the rest yourself. The
engine that dials lives on Symbo's servers. It rings the session's number of
lines at once (1–4, which you set, unless your organization locks it;
`dialer.concurrentCalls` tells you), bridges the rep to the first answer,
hangs up the rest, and pauses until you say otherwise. The session is a Symbo dial session like any other — it
sits on the rep's queue in Symbo, the rep can run it from the app, an admin can
watch it there and end or reassign it, and your page sees those actions as
events. Through the API and the SDK
you decide what goes on the queue and in what order, which of a contact's
numbers is dialled, which outcome each conversation gets, and what happens
after each call; your page draws the queue and the post-call screen.

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
  "concurrent_calls": 2,
  "skip_duplicates": true
}
```

The response carries the session id and its `queued_calls`. Hand the id to
your page. `concurrent_calls` is how many lines the session rings at once, 1
to 4; omitted, it rings one. When your organization locks the number, the lock
wins, and the response's `concurrent_calls` says what the session will ring.
The retry rules and the default outcomes for unanswered lines are not
per-session settings: they come from the organization's power-dial settings
in Symbo, or each rep's own where the organization has not locked them. The full request and
response, the filters, and what each rejection reason means are in the
**Embedded Dialer** guide.

### 2. The page starts it

```js
const { dialSessionId, concurrentCalls } = await dialer.session.start({
  dialSessionId,
  concurrentCalls: 2, // optional: saved on the session before its first round
})
```

The frame takes the session off hold, joins the rep's audio leg, and the
engine dials. From here on you render events. A `concurrentCalls` other than
your organization's locked number is refused with `CONCURRENT_CALLS_LOCKED`
before anything is dialed, and the start is refused with `CALL_IN_PROGRESS`
while a call is up or a `dial()` is still being placed, and, under "Require &
block dialer", with `POSTCALL_DETAILS_REQUIRED` while a one-off or inbound
call still needs its outcome ([One-off calls](#one-off-calls)). The result and
`session.started` carry `dialing: true`, or `dialing: false` when the queue
was already empty, which `session.noMoreCalls` has said, or when a call or a
`dial()` came up while the session was loading: it is then loaded and paused,
as with `dial: false` below, for `session.resume()` once the line is free.

Pass `dial: false` to load the session without dialing, as Symbo itself opens
one on page load: it comes off hold and reads `paused`
(`session.started { dialing: false }`), and the rep's line stays down until
`session.resume()`. Loading is not refused while a call is up or still needs
its outcome. An older Symbo release would ignore the option and dial at
once, so for a rep with power dialing (a frame that lists `session`) the SDK
refuses it with `NOT_SUPPORTED` unless `dialer.hasCapability('sessionLoad')`.

The frame never loads a session by itself. To carry on after a reload, use
the session id your server created, or have your server list the rep's open
sessions with
`GET /v1/dialSessions?owner=<rep user id>&status=paused,in_progress,new`,
newest first (`dialer.user.id` is that id).

A session parked with `session.hold()`, here or in Symbo, starts the same way,
and so does an ended session your server restored with
`POST /v1/dialSessions/{id}/actions/restore` (see the **Embedded Dialer**
guide): restoring puts it on `hold`, its cancelled calls back on the queue.

### 3. What a round of dialing looks like

![One round with two lines: Symbo rings both, line 2 answers, line 1 is hung up, the engine pauses, the conversation ends with session.postCall, your page saves the outcome, the next round rings.](docs/images/round-sequence.svg)

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
  session.postCall      { callId, queuedCallId: q-2, prospectId, answered: true,
                          durationSeconds, outcomeRequired }

  ↓ you render your post-call screen and save the outcome

  session.saveOutcome({ callId, outcomeId, note, then: 'resume' })
  call.completed        { callId, outcomeId, outcome, disposition, note, … }
  session.resumed
  session.leg.ringing   { queuedCallId: q-3 }  session.leg.ringing { queuedCallId: q-4 } …
```

The connected call's `session.leg.ended` and `session.postCall` can arrive in
either order (`session.postCall` comes first when the rep hangs up or skips),
so don't let one handler depend on the other having run.

A round where nobody answers needs nothing from you: each leg ends with its
reason (`no_answer`, `busy`, `failed`), Symbo records the attempt with the
default outcome, and the engine moves on to the next round by itself.
When the queue runs out you get `session.noMoreCalls { counts, sessionOpen:
true }` and nothing more: the session stays loaded and paused, its contacts
still reserved and the rep's line down, until you call `session.end()` or
`session.hold()`, or queue more contacts from your server and
`session.resume()`. `session.ended` only follows an end.

Every `session.leg.*` payload names the queued call (`queuedCallId`), the
prospect (`prospectId`, `prospectName`), the number, the `from` number and —
once a call exists — the `callId`. Key your rows on `queuedCallId`; join to
your records on `prospectId`; join to the call records you read back from the
API on `callId`.

### 4. The post-call step

`session.postCall` is your cue. The engine is paused, and with
`outcomeRequired: true` it will not resume until the conversation has an
outcome — so this panel is what keeps the session moving.

![The example page's post-call panel: the contact, how long the call lasted, an outcome picker, a note, and three buttons — save and dial next, save and pause, save and finish.](docs/images/example-post-call.png)

```js
dialer.on('session.postCall', ({ callId, prospectId, durationSeconds, outcomeRequired }) => {
  showPostCallScreen({ callId, prospectId, durationSeconds })
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

`call.completed` follows the save. Save a session's call with
`session.saveOutcome`: the frame holds the post-call step itself, and a write
your server makes with `PUT /calls/{id}` does not reach it, so
`session.resume()` keeps refusing with `OUTCOME_PENDING` after one.

### 5. Pause, resume, skip, end

| You call | What happens |
| --- | --- |
| `session.pause()` | Lines that are ringing are hung up (they get the cancelled default outcome) and the rep's line drops. A connected call is **never** cut: the engine stays paused after it until you resume. In the post-call step the line drops too and, once the outcome, note and required call fields are in, the call leaves the rep's view, as Symbo's Back does; until then it stays in front and `session.saveOutcome` still saves it. `session.paused { reason: 'requested' }` follows. If `end()` was asked for during the call, or an admin closed the session, a pause in the post-call step completes that and `session.ended` arrives instead. Pausing frees the line for `dial()` and inbound calls once none of the session's calls is in front of the rep: not while a contact is connected, and not while a post-call step still missing its outcome, note or required call fields stays in front (complete it with `session.saveOutcome` first; `answerIncoming({ endCurrent: true })` works meanwhile) |
| `session.resume()` | Dials the next round. Refused with `OUTCOME_PENDING` while a call is waiting for its outcome, and with `CALL_IN_PROGRESS` while a contact is still on the line (hang up or `skipCurrent()` first), another call — one-off or inbound — is up, or a `dial()` is still being placed. Under "Require & block dialer" it is also refused with `POSTCALL_DETAILS_REQUIRED` while a one-off or inbound call still needs its outcome: save it with `dialer.saveOutcome()` first |
| `session.saveOutcome({ …, then })` | Saves the outcome, note and call fields on the call, then `'resume'` (next round), `'pause'` or `'end'`. `'pause'` on a call that has ended closes it and drops the rep's line, as Symbo's Back does: `session.paused { reason: 'requested' }` follows and `getState()` reads `paused`. With a required call field still missing only the line drops, no event is sent and it keeps reading `post_call`; a save during the call keeps reading `connected`. If `end()` was asked for during the call, or an admin closed the session, a `'pause'` save completes that and `session.ended` arrives instead. `'resume'` is refused, before anything is saved, with `REALTIME_DISCONNECTED` while realtime is down, with `CALL_IN_PROGRESS` while another call is up or a `dial()` is still being placed, and, under "Require & block dialer", with `POSTCALL_DETAILS_REQUIRED` while a one-off or inbound call still needs its outcome |
| `session.skipCurrent()` | Hangs up the connected call and skips its outcome |
| `hangUp()` | Hangs up the connected call (→ `session.postCall`), or cancels ringing lines; during a one-off or inbound call, hangs that up |
| `session.hold()` | Parks the session without ending it, as Symbo's Back → Hold does: ringing lines are hung up, the rep's line drops, a call waiting for its outcome is closed without one, and the session goes on `hold` with its queue kept. `session.held { dialSessionId, counts }` follows, and it resolves the same. `session.start({ dialSessionId })` picks it up again, its cancelled calls back on the queue. Refused with `CALL_IN_PROGRESS` while a call is connected. If `end()` was asked for during the call, or an admin closed the session, a hold in the post-call step completes that instead: `session.ended` arrives, not `session.held`, and it still resolves `{ dialSessionId, counts }`. If Symbo turns the hold down, a session it no longer finds is unloaded, `session.ended` follows and the hold is refused with `SESSION_NOT_FOUND`; on any other failure the session stays loaded, paused with the rep's line down (what the hold already hung up or closed stays so), `session.paused { reason: 'requested' }` follows unless it was paused already, and the hold is refused with `COMMAND_FAILED`: hold again, or `session.resume()`. Check `dialer.hasCapability('sessionHold')` first |
| `session.removeQueued(queuedCallId \| [ids] \| { queuedCallIds })` | Drops queued contacts from this session, as Symbo's bulk remove does, and leaves one being dialed alone. One id resolves `{}`, or is refused with `QUEUED_CALL_DIALING` while its line rings or is connected and `QUEUED_CALL_NOT_FOUND` when it is not on the session or already removed. A list of 1 to 1000 ids resolves `{ removedCount, skipped: [{ queuedCallId, reason: 'dialing' }] }`: how many were removed, and the ones left alone because their line rings or is connected; an id not on the session, or already removed, is neither counted nor listed. Ids match whatever their case, and come back in Symbo's lower case. For a rep with power dialing (a frame that lists `session`), the SDK refuses a list with `NOT_SUPPORTED` unless `dialer.hasCapability('removeQueuedCalls')` |
| `session.end({ force })` | Ends the session loaded here and drops the rep's line. Refused with `CALL_IN_PROGRESS` over a connected call unless `force: true`; the call survives either way. Resolves with `{ dialSessionId, counts }`. It ends only the loaded session: end another one — one left on hold, say — from your server with `POST /v1/dialSessions/{id}/actions/end`. The SDK refuses a `dialSessionId` with `INVALID_OPTIONS` and sends nothing, as an older Symbo release would end the loaded session instead |
| `session.getQueue()` | `{ dialSessionId, counts, queue: [{ queuedCallId, prospectId, prospectName, number, status, order, attempts, lastCallId, lastOutcomeId }] }` |
| `session.setConcurrentCalls(n)` | Rings `n` lines, 1 to 4, from the next round; lines already ringing are neither hung up nor added to. Sends `session.concurrentCallsChanged` when the number changes; asking for the current number just resolves. Refused with `CONCURRENT_CALLS_LOCKED` when your organization locks a different number (`dialer.concurrentCallsLocked`). Check `dialer.hasCapability('concurrentCalls')` first |
| `getState()` | Everything at once: `{ signedIn, deviceReady, mode, powerDialing, concurrentCalls, concurrentCallsLocked, updateAvailable, session, call, muted, incoming, warnings, reloadRequired }`. A one-off call in its post-call step, or any call brought back (by a reload, or after an inbound call answered over it), reads `call: { callId, status: 'post_call', prospectId, number, durationSeconds, dialedAt, blocksDialing, restored }` |

Things the engine decides on its own, and that you should expect: it retries
an unanswered contact on the retry schedule, and rotates
through the contact's numbers unless you pinned one; it skips contacts outside
the session's timezone and phone-type filters without an event; unanswered and
cancelled legs get the default outcomes; the rep can also drive the
session from inside Symbo, in which case you see the same events. Only the
session's owner can dial, skip or pause it: an admin who opens it in Symbo
watches it, and can end, reassign or split it or change its settings, each of
which reaches you as `session.admin`.

### 6. The queue while it runs

Apart from `session.removeQueued()`, every change to the queue is made from
your server: on the queued call's id, `PUT /v1/dialSessionQueuedCalls/{id}`
with `status`, `retry_at`, `retry_position: 'top' | 'bottom'` or
`phone_number_id`; many at once, with
`POST /v1/dialSessions/{id}/actions/removeQueuedCalls`; and across sessions,
with `merge`, `rebalanceQueuedCalls` and `restore`. All of them are in the
**Embedded Dialer** guide. The engine reads the queue before every round, and the
frame sends `session.queue.updated { counts }` as its counts change. Edits
made to the queue in the Symbo app, such as moving every matching call at once
from its calls table, are not pushed to your page: the engine applies them on
its next round, and `session.getQueue()` or `GET /v1/dialSessionQueuedCalls`
shows them straight away.

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

## Mute and keypad

In compact and hidden mode the mute button and the keypad are yours to draw.
Widget mode has Symbo's own, and these commands work alongside them.

```js
muteButton.onclick = () => dialer.setMuted(!dialer.muted) // → { muted }
dialer.on('call.muteChanged', ({ muted }) => renderMuteButton(muted))

keypad.onclick = (e) => {
  const key = e.target.closest('button[data-digit]') // '0'-'9', '*' or '#'
  if (key) dialer.sendDigits(key.dataset.digit)
}
await dialer.sendDigits('4471#') // an extension or a menu choice, up to 32 at a time → { digits }
```

`setMuted()` mutes or unmutes the rep's microphone on their line to Symbo,
and mute lasts as long as that line, as in Symbo itself. On a one-off or
inbound call the line is the call. In a power-dial session it is the rep's own
leg, which stays up while lines ring and can outlast a conversation, so mute
can carry into the next one; it drops, taking mute with it, when the rep hangs
up, pauses (unless a contact is on the line) or holds, when the queue runs out,
and when the session ends. `call.muteChanged` reports
every change, whoever made it — this page, Symbo's own button in widget mode,
the line dropping, or a frame reload — and `dialer.muted` follows it, so draw
your button from the event rather than predicting it. Asking for the
state the line is already in just resolves, with no event. With the rep's line
down it is refused with `NO_ACTIVE_CALL`.

`sendDigits()` plays the digits to whoever answered: the call, or the
session's connected contact. They play one at a time, 200 ms apart, and it
resolves once the last has played; a second `sendDigits()` waits for the
first, so presses play in the order they were made. The rep hears the tones
too. It is refused with `NO_ACTIVE_CALL` while nobody has answered, and when
that conversation ends part-way; the message says how many digits had played,
and the rest are dropped rather than played to whoever answers next.

**`*` is also Symbo's hold key.** On a Symbo call, `*` from the rep puts the
contact on hold, and `*` again takes them off; while the contact is on hold,
`2` starts a transfer to the number keyed next, dialled on `#`. Symbo's own
keypad behaves the same way, and no event reports the hold. Send `*` only when
that is what you mean.

Check `dialer.hasCapability('mute')` and `dialer.hasCapability('dtmf')` first:
an older Symbo release answers `UNKNOWN_COMMAND`.

## Warnings

Anything Symbo's own UI would show as a problem arrives as a `warning`
with a code, and is withdrawn with `warning.cleared`. `dialer.warnings` is a
`Map` of the ones currently raised. In hidden mode these events are the only
way the rep learns about a problem, so show them.

`ready` is followed by a `warning` for each one raised at the time. While the
frame is not ready — before `ready`, or after `auth.required` — it sends only
`NOT_SIGNED_IN`, `EMBED_NOT_ENABLED` and `ORIGIN_NOT_ALLOWED`; any other
warning raised meanwhile waits for that `ready` and arrives once. `warning.cleared`
only withdraws a warning you were sent, so one raised and withdrawn before
`ready` never reaches you.

| Code | Meaning |
| --- | --- |
| `NOT_SIGNED_IN` | No user session in the frame (`auth.required` says how to fix it) |
| `REALTIME_DISCONNECTED` | The frame lost its realtime connection. `session.start` / `resume`, and `saveOutcome` with `then: 'resume'`, are refused until it is back |
| `DEVICE_NOT_READY` / `DEVICE_ERROR` | The calling device has not registered 15 s after `ready`, or its registration failed / it reported an error. A device that registers a moment after `ready` raises nothing, and `dial()` waits for it by itself. Each failure also arrives as `device.error { code, message, retrying }`: `DEVICE_LOGIN_FAILED` when the device could not register (`retrying` is true while Symbo repairs the device's endpoint and will try again, false when it will not), or `DEVICE_LOGGED_OUT` when the device was logged out (`retrying: false`) |
| `DEVICE_ENDPOINT_FAILED` | The calling device could not register and Symbo's repair of its endpoint gave up; `device.error { code: 'DEVICE_ENDPOINT_FAILED', retrying: false }` comes with it. Reload the frame with `reload({ hard: true })`, or contact Symbo support |
| `MIC_PERMISSION_DENIED` | The microphone permission was denied. `permission.denied` fires at the same time |
| `EMBED_NOT_ENABLED` | Embedding is not enabled for this organisation |
| `ORIGIN_NOT_ALLOWED` | This page's origin is not on the list you gave Symbo; `mount()` rejects with it |
| `POWER_DIALING_NOT_ENABLED` | This rep has no power-dialing seat |
| `HIJACK_MODE` | The rep's calling is in an admin-controlled state |

## New Symbo versions and reloads

When Symbo releases a new version, the frame does not reload itself for it:
that would cut off whatever the rep is doing. It tells you instead, and you
choose the moment.

```js
dialer.on('update.available', () => showUpdateButton()) // also dialer.updateAvailable, and on ready

updateButton.onclick = async () => {
  try {
    await dialer.reload() // { reloading: true }; frame.reloaded and a fresh ready follow
  } catch (err) {
    // SESSION_ACTIVE / CALL_IN_PROGRESS / POSTCALL_DETAILS_REQUIRED: try again between calls
  }
}
```

`reload()` is refused for the same reasons as `signOut()` — a loaded session
(`SESSION_ACTIVE`: hold or end it first), a call up or ringing
(`CALL_IN_PROGRESS`) — and the rep stays signed in. A one-off call still
waiting for its outcome under "Require & block dialer" only holds it up in
widget mode, where the rep may have a draft in Symbo's own form
(`POSTCALL_DETAILS_REQUIRED`); in compact and hidden mode the reloaded frame
brings that call back (below). Check `dialer.hasCapability('reload')` first.
`reload({ hard: true })` also fetches the Symbo build afresh, which is the
thing to try after `DEVICE_ENDPOINT_FAILED`; an older release does a plain
reload (`hasCapability('hardReload')`).

### Reloads you did not ask for

The frame also reloads, or signs the rep out and reloads, by itself:

| What happened | `reason` | Notice |
| --- | --- | --- |
| Symbo turned down the rep's session: it expired or was revoked | `logout` | `frame.leaving`, 600 ms ahead |
| The rep's account was suspended | `suspended` | `frame.leaving`, 600 ms ahead |
| Symbo found the rep's account already exists elsewhere (`ACCOUNT_ALREADY_EXISTS`) | `account_exists` | `frame.leaving`, 2.5 s ahead |
| The rep's plan or seats changed, in Symbo or through your own `PUT /v1/users/{id}` with `billing_plan` | `plan_changed` | `reload.required` at once; `frame.leaving`, 1 s ahead, once nothing would be cut off |
| The rep signed out in another Symbo frame on your site, which shares this one's storage | `signed_out_elsewhere` | `frame.leaving`, 600 ms ahead, even during a call or session |
| The browser discarded a background tab | — | none |
| Your page moved the iframe to another place in the DOM, which reloads any iframe: don't re-parent it | — | none |
| In widget mode, the rep reloaded from Symbo's own dialer | — | none |

`reload.required { reason }` (also `dialer.reloadRequired` and
`getState().reloadRequired`) means the frame has to reload, and will as soon as
no session is loaded, no call is up, ringing or being placed, and, under
"Require & block dialer" in widget mode, no call still needs its outcome. Call
`reload()` at a quiet moment yourself if you prefer.
`frame.leaving { reason, inMs }` is the last word from the old document; `inMs`
is how long until it goes.

Asked for or not, you get `frame.reloaded { requested, reason }` before the new
`ready` (or `auth.required`), and `dialer.ready` is `false` in between.
`reason` is the one `frame.leaving` gave, or `null` when nothing announced the
reload or you asked for it, and the new document repeats it as `reloadReason`
on its first `ready` or `auth.required`. Commands still waiting for an answer
reject with `FRAME_RELOADED` at once; the old frame may already have carried
them out, so check before sending them again after `ready`. (A `signIn()`
reloads the frame too, but that frame had not said `ready`, so no
`frame.reloaded` is sent for it.) The rep's line drops with the old document,
and what it held comes back like this:

- **A session loaded in it** is paused on Symbo's side. Call
  `session.start({ dialSessionId })` with its id to carry on, with
  `dial: false` to load it without dialing.
- **A call waiting for its outcome**, one-off, inbound or the session's,
  comes back under "Require & block dialer", as in Symbo: the new frame sends
  `call.postCall { restored: true, dialedAt }` after `ready`,
  `getState().call` shows it, and `dialer.saveOutcome()` saves it as before.
  A session's call is saved this way too, with
  `dialer.saveOutcome({ callId })` (the `callId` came with `session.postCall`),
  not `session.saveOutcome`. Otherwise its post-call step is gone; save it by
  `callId`, or from your server (`PUT /calls/{id}`).

So keep your own copy of what you need to carry on — the session you started,
the call waiting for its outcome — from the events as they arrive, or from a
`dialer.getState()` snapshot taken from time to time, rather than relying on
the frame to still hold it.

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
waits up to 15 s in all for the calling device to register and the carrier to
report the call ringing, and a shorter budget here would reject a call that
has really been placed. Nor does it
apply to `signIn()`, which allows at least 25 s: the frame may first wait for
the check of a session it already holds. `sendDigits()`
adds 200 ms to it for every digit waiting to play, its own and any sent
before it.

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
| `signIn({ token, profileId })` | `{ user }`, with `reloading: true` when it signed in and the frame reloads to finish |
| `reload({ hard? })` | `{ reloading }`, with `hard: true` when asked. The frame then reloads, the rep still signed in: `frame.reloaded { requested: true }` and `ready` follow. Refused like `signOut()`, except for an unsaved outcome in compact and hidden mode. See [New Symbo versions and reloads](#new-symbo-versions-and-reloads) |
| `signOut()` | `{ signedOut }`, false when nobody was signed in. The frame then reloads signed out and says `auth.required`. Refused with `SESSION_ACTIVE` / `CALL_IN_PROGRESS` / `POSTCALL_DETAILS_REQUIRED` while a session, a call (ringing or up) or its required outcome is pending |
| `openSignIn()` | the opened `Window` (synchronous; throws `NO_LOGIN_URL` / `POPUP_BLOCKED`). Wait for `ready`, not for that window to close: under `Cross-Origin-Opener-Policy: same-origin` the handle is severed when the login page loads and starts reading `closed === true` |
| `answerIncoming({ endCurrent? })` | `{ callId }`. `endCurrent: true` ends the call the rep is on first. A one-off or inbound call still waiting for its outcome loses its post-call step; save it by `callId`. See [Inbound calls](#inbound-calls) |
| `ignoreIncoming()` | `{}` |
| `saveOutcome({ callId?, outcomeId?, outcomeValue?, note?, callFields? })` | `{ callId, outcomeId }` — the outcome of a one-off or inbound call, or of a session call the frame no longer holds; `call.completed` follows for the call waiting in its post-call step. See [One-off calls](#one-off-calls) |
| `audio.list()` | `{ microphones, speakers, selected }` |
| `audio.set({ microphoneId?, speakerId? })` | same as `audio.list()` |
| `setMuted(muted \| { muted })` | `{ muted }`. See [Mute and keypad](#mute-and-keypad) |
| `sendDigits(digits \| { digits })` | `{ digits }`, once the last digit has played |
| `session.start({ dialSessionId, concurrentCalls?, dial? })` | `{ dialSessionId, concurrentCalls, concurrentCallsLocked, dialing }` |
| `session.pause()` / `session.resume()` / `session.skipCurrent()` | `{}` |
| `session.hold()` | `{ dialSessionId, counts }` |
| `session.end({ force? })` | `{ dialSessionId, counts }` |
| `session.removeQueued(queuedCallId \| { queuedCallId })` | `{}` |
| `session.removeQueued([ids] \| { queuedCallIds })` | `{ removedCount, skipped }` |
| `session.getQueue()` | `{ dialSessionId, counts, queue }` |
| `session.saveOutcome({ callId?, outcomeId?, outcomeValue?, note?, callFields?, then })` | `{ callId, outcomeId }` |
| `session.setConcurrentCalls(n \| { concurrentCalls })` | `{ dialSessionId, concurrentCalls }` |

### Listening

`on(event, handler)` returns an unsubscribe function; `once(event, handler)`
and `off(event, handler)` do what they say. `on('*', (name, payload) => …)`
receives everything.

### Properties, filled from `ready`

`dialer.ready`, `dialer.user { id, name, email }`, `dialer.organization { id, name }`,
`dialer.capabilities` (with `dialer.hasCapability(name)`), `dialer.concurrentCalls`,
`dialer.concurrentCallsLocked`, `dialer.updateAvailable`, `dialer.deviceReady`,
`dialer.powerDialing`, `dialer.mode`, `dialer.warnings`, `dialer.loginUrl`
(from the last `auth.required`). `dialer.updateAvailable` also turns true on
`update.available`.

`dialer.concurrentCalls` is the number of lines the running session rings,
or, with none running, your organization's locked number, or one. A session
you start rings the `concurrent_calls` it was created with unless
`session.start` passes `concurrentCalls`. It follows `session.start()`,
`session.started`, `session.concurrentCallsChanged`, `setConcurrentCalls()`
and `session.ended`.
`dialer.concurrentCallsLocked` is true when your organization fixes that number
for every session.

`dialer.muted` is whether the rep's microphone is muted on their line to
Symbo. It follows `call.muteChanged`, `setMuted()` and `getState()`, and is
false while the line is down.

`dialer.reloadRequired` is the `reason` of a `reload.required`, or `null`. A
frame reload clears it.

### Capabilities

`ready.capabilities` lists what the frame in front of you supports, and
`dialer.hasCapability(name)` checks one. The ones marked with a dagger are
only listed for a rep with power dialing.

| Capability | What it covers |
| --- | --- |
| `dial` | `dial()` |
| `session` † | `session.*` |
| `inbound` | `call.incoming`, `answerIncoming()`, `ignoreIncoming()` |
| `audioDevices` | `audio.list()`, `audio.set()` |
| `signIn` / `signOut` | `signIn()` / `signOut()` |
| `concurrentCalls` † | `session.setConcurrentCalls()`, `session.start({ concurrentCalls })` |
| `reload` | `reload()`, `update.available` |
| `mute` / `dtmf` | `setMuted()` / `sendDigits()` |
| `callsWhilePaused` † | `dial()` and `answerIncoming()` while a session is paused with the rep's line down |
| `sessionHold` † | `session.hold()` |
| `sessionLoad` † | `session.start({ dial: false })` |
| `removeQueuedCalls` † | `session.removeQueued()` with a list |
| `callWaiting` | inbound calls offered during a call, and `answerIncoming({ endCurrent: true })` |
| `saveOutcome` | `saveOutcome()` |
| `hardReload` | `reload({ hard: true })` |

### Exports

`SymboDialer`, `SymboDialerError`, `COMMANDS`, `EVENTS`, `ERRORS`, `WARNINGS`,
`CLIENT_ERRORS`, `MODES`, `RESULT`, `PROTOCOL_VERSION`.

## Events

| Event | Payload |
| --- | --- |
| `ready` | `{ protocolVersion, user, organization, mode, capabilities, deviceReady, powerDialing, concurrentCalls, concurrentCallsLocked, updateAvailable, reloadReason }` — `reloadReason` on the first `ready` after a reload the frame announced, otherwise `null` |
| `update.available` | `{}` — a newer Symbo version is ready; `dialer.reload()` picks it up |
| `reload.required` | `{ reason: 'plan_changed' }` — the frame has to reload, and will by itself once nothing would be cut off; `dialer.reload()` does it now |
| `frame.leaving` | `{ reason, inMs }` — the frame is about to reload or sign the rep out without being asked, in `inMs` ms. `reason`: `logout` \| `suspended` \| `account_exists` \| `plan_changed` \| `signed_out_elsewhere` |
| `frame.reloaded` | `{ requested, reason }` — sent by the SDK itself when a frame that had said `ready` loads again, before its new `ready`. `requested` is true after `reload()`; `reason` is the last `frame.leaving`'s, or `null`. Commands still waiting reject with `FRAME_RELOADED`. See [New Symbo versions and reloads](#new-symbo-versions-and-reloads) |
| `auth.required` | `{ loginUrl, reloadReason }` — once per unauthenticated state; again if the session expires. `reloadReason` as on `ready` |
| `device.ready` / `device.error` | `{}` / `{ code, message, retrying }` — `code` is `DEVICE_LOGIN_FAILED` (the device could not register; `retrying` is true while Symbo repairs the device's endpoint and will try again, false when it will not), `DEVICE_LOGGED_OUT` (the device was logged out; `retrying: false`) or `DEVICE_ENDPOINT_FAILED` (the endpoint repair gave up; `retrying: false`, and `reload({ hard: true })` is the fix). See [Warnings](#warnings) |
| `permission.denied` | `{ permission: 'microphone' }` |
| `warning` / `warning.cleared` | `{ code, message }` / `{ code }` |
| `call.started` | `{ callId, number, from, externalId, prospectId }` |
| `call.ringing` | `{ callId, number, from }` |
| `call.incoming` | `{ callId, from, prospectId, prospectName }` |
| `call.answered` | `{ callId }` — the far end picked up |
| `call.ended` | `{ callId, reason, durationSeconds }` — also for every `call.incoming` that stops ringing, with or without a session loaded |
| `call.postCall` | `{ callId, prospectId, answered, durationSeconds, outcomeRequired, blocksDialing, restored, dialedAt }` — `blocksDialing` under "Require & block dialer"; `restored` (with `dialedAt`, else `null`) when a reload brought the call back |
| `call.completed` | `{ callId, externalId, prospectId, outcomeId, outcome, disposition, dispositionGroup, note, durationSeconds }` — after a save through `session.saveOutcome`, or through `saveOutcome()` of the call waiting in its post-call step. A write from your server does not produce it |
| `call.muteChanged` | `{ muted }` — the rep's microphone was muted or unmuted: through `setMuted()`, Symbo's own button in widget mode, or the rep's line dropping while muted (the call ending; in a session, the rep hanging up, pausing or holding, the queue running out, the session ending; a frame reload). See [Mute and keypad](#mute-and-keypad) |
| `contact.matched` | `{ number, externalId, prospect: { id, fullName } }` |
| `audio.devicesChanged` | same shape as `audio.list()` |
| `session.started` | `{ dialSessionId, concurrentCalls, concurrentCallsLocked, dialing }` — `dialing` is false for `session.start({ dial: false })`, when the queue was already empty (`session.noMoreCalls` has said so), and when a call or a `dial()` came up while the session was loading (it stays loaded and paused) |
| `session.paused` | `{ dialSessionId, reason: 'connected' \| 'requested' \| 'incoming' }` — `incoming` when `answerIncoming({ endCurrent: true })` dropped the session's line |
| `session.resumed` | `{ dialSessionId }` — when the engine dials on. A resume that already knows the queue is empty sends `session.noMoreCalls` instead; one that finds it empty on the next fetch sends `session.noMoreCalls` right after |
| `session.ended` / `session.held` | `{ dialSessionId, counts }` — the session ended / was parked with `session.hold()` |
| `session.noMoreCalls` | `{ dialSessionId, counts, sessionOpen: true }` — the queue ran out; the session stays loaded and paused until it is ended or held |
| `session.leg.ringing` / `.answered` / `.connected` / `.ended` | `{ dialSessionId, callId, queuedCallId, prospectId, prospectName, number, from, status, reason }` — `reason` on ended: `answered_elsewhere \| no_answer \| busy \| cancelled \| failed \| completed` |
| `session.postCall` | `{ dialSessionId, callId, queuedCallId, prospectId, answered, durationSeconds, outcomeRequired }` |
| `session.queue.updated` | `{ dialSessionId, counts }` |
| `session.admin` | `{ dialSessionId, action }` |
| `session.concurrentCallsChanged` | `{ dialSessionId, concurrentCalls, concurrentCallsLocked }` — the number of lines or the lock changed: through `setConcurrentCalls()`, the rep or an admin in Symbo, or your organization's lock. It applies from the next round. A lock change with no session running arrives with `dialSessionId: null` and the number a session now gets |
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
| `DEVICE_NOT_READY` / `MIC_PERMISSION_DENIED` | The calling device did not register in time (`dial()` waits about 10 s for it) / the microphone was denied |
| `HIJACK_MODE` | The rep's calling is in an admin-controlled state |
| `INVALID_NUMBER` / `PROSPECT_NOT_FOUND` | `dial()` had nothing usable to dial |
| `CALL_IN_PROGRESS` / `NO_ACTIVE_CALL` | A call is up, or a `dial()` is still being placed, when it must not be / there is none to act on |
| `SESSION_ACTIVE` | A power-dial session has the rep's line — it is dialing, or one of its calls is in front of the rep — so `dial()` or `answerIncoming()` is refused; `signOut()` and `reload()` are refused while any session is loaded |
| `POSTCALL_DETAILS_REQUIRED` | Under "Require & block dialer" (`blocksDialing`), the last one-off or inbound call, or the call a reload brought back, still needs its outcome: save it with `saveOutcome()`. Refuses `dial()`, `signOut()`, `reload()`, and the session commands that dial on (`session.start()` without `dial: false`, `session.resume()`, `session.saveOutcome({ then: 'resume' })`) |
| `NO_INCOMING_CALL` | Nothing is ringing |
| `AUDIO_DEVICE_NOT_FOUND` | Unknown device id |
| `TOKEN_REQUIRED` / `TOKEN_REJECTED` | `signIn()` was given a blank token (none at all is `INVALID_OPTIONS`) / Symbo would not accept the one it got, or could not finish the sign-in; `err.message` gives the reason |
| `PROFILE_NOT_CONFIGURED` | The `profileId` is wrong, or not set up for the organization the token names |
| `ORGANIZATION_ID_REQUIRED` / `ORGANIZATION_MISMATCH` | The token carries no `organization_id` claim / names an organization the rep is not in |
| `USER_NOT_PROVISIONED` / `USER_NEEDS_FIRST_LOGIN` | Symbo has no such rep / an org admin has not signed in to Symbo by hand yet (reps never need to: their first sign-in activates them) |
| `EMBEDDED_DIALER_DISABLED` | `signIn()` for an organisation without the embedded dialer |
| `ACCOUNT_SETUP_INCOMPLETE` / `OTP_REQUIRED` / `ACCOUNT_SUSPENDED` / `ACCOUNT_INACTIVE` / `SUBSCRIPTION_REQUIRED` | `signIn()` refused by Symbo's own login rules: the rep's account is unfinished, needs a verified phone, is suspended or inactive, or the organisation has no active subscription. Fixed in Symbo, not in your code |
| `RATE_LIMITED` | Too many `signIn()` calls from one IP address in a short time; wait a minute |
| `REALTIME_DISCONNECTED` | The frame's realtime connection is down; try again shortly |
| `SESSION_NOT_FOUND` / `SESSION_NOT_STARTABLE` / `SESSION_ALREADY_ACTIVE` | `session.start` problems: not visible to this rep, ended or on another rep's queue, or a session is already loaded. `SESSION_NOT_FOUND` also answers `session.hold()` for a session Symbo no longer finds |
| `NO_ACTIVE_SESSION` | A `session.*` command with no session running |
| `CONCURRENT_CALLS_LOCKED` / `INVALID_CONCURRENT_CALLS` | `setConcurrentCalls` or `session.start` asked for a number of lines other than your organization's lock / that this Symbo release does not offer. A count that is not a whole number from 1 to 4 never reaches Symbo: the SDK refuses it with `INVALID_OPTIONS` |
| `OUTCOME_PENDING` | `session.resume` before the last call's outcome was saved; `saveOutcome()` without an outcome for a call that requires one |
| `NO_CALL_TO_SAVE` / `OUTCOME_UNKNOWN` / `NOTE_REQUIRED` | `session.saveOutcome` and `saveOutcome()` problems: nothing waiting for an outcome (or, for `saveOutcome()`, the session's own call), an unknown outcome or nothing to write, or an outcome that requires a note and got none |
| `QUEUED_CALL_NOT_FOUND` / `QUEUED_CALL_DIALING` | `session.removeQueued` with one id: it is not on the session or already removed / its line rings or is connected. A list is not refused for either: it counts what it removed and lists the calls being dialed in `skipped`. A page that posts the message itself gets `QUEUED_CALL_NOT_FOUND` for a list with no usable id or more than 1000; the SDK refuses those with `INVALID_OPTIONS` before sending |
| `INVALID_MUTED` / `INVALID_DIGITS` | `setMuted` was not given `true` or `false` / `sendDigits` was given something other than 1 to 32 of `0`-`9`, `*` and `#`. The SDK checks both before sending and refuses with `INVALID_OPTIONS`, so these only reach a page that posts the messages itself |
| `UNKNOWN_COMMAND` | The Symbo release in front of you does not know this command yet |
| `COMMAND_FAILED` | Something unexpected failed inside the frame while it ran the command; `err.message` carries what it caught. Retry, or check the frame's console. Not in `ERRORS`: it is the frame's answer for a failure outside the codes above, so compare `err.code` with the string |

Raised by the SDK itself, before anything reached Symbo (exported as
`CLIENT_ERRORS`): `INVALID_OPTIONS`, `NOT_MOUNTED`, `NOT_READY`, `DESTROYED`,
`MOUNT_TIMEOUT`, `COMMAND_TIMEOUT`, `NO_LOGIN_URL`, `POPUP_BLOCKED`,
`FRAME_RELOADED` (the frame reloaded before answering), `NOT_SUPPORTED` (an
option the Symbo release in front of you would misread rather than refuse:
`session.start({ dial: false })` or a list for `session.removeQueued`; the
message names the capability to check). For a rep without power dialing, whose
frame advertises no `session`, these go to the frame and get its own answer,
such as `POWER_DIALING_NOT_ENABLED`.

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
- **Sign-in.** A hidden frame shows the rep no sign-in button, so provide
  one: call `openSignIn()` inside your button's click handler (browsers block
  the tab otherwise), or sign the rep in with `signIn({ token, profileId })`.
  Call `signOut()` when a user logs out of your app, and when
  `dialer.user.email` on `ready` is not your logged-in user.
- **Content-Security-Policy.** If your page sends one, `frame-src` must
  allow `https://app.symbo.ai`, or the browser blocks the frame and all you
  see is `MOUNT_TIMEOUT`.
- **Sound.** Ringback and the connect tone play inside the frame; inbound
  ringing is yours. Keep the frame in the document (`display: none` on an
  ancestor stops it running).
- **Reloads.** Show `frame.leaving` and `reload.required` to the rep: in
  hidden mode they are the only sign the frame is about to go. Keep the
  iframe where `mount()` put it; moving it in the DOM reloads it.
- **Chrome.** The embedded dialer is supported in Chrome. Other browsers are
  not covered.
- **Allowed origins.** Give Symbo every origin that embeds the dialer, test
  and live. Once they are registered, any other origin gets
  `ORIGIN_NOT_ALLOWED`: from `signIn()` while nobody is signed in, and
  otherwise straight away, as an `error` and a `warning`, with `mount()`
  rejecting with that code rather than waiting out its timer.
  `EMBED_NOT_ENABLED` is the same answer for an organisation without the
  embedded dialer at all. Create a new client once it is sorted — the
  refused one keeps its rejected `mount()` promise.

## SDK versions and Symbo releases

| SDK | Needs the Symbo release with | Surface |
| --- | --- | --- |
| 0.1.x | the embedded dialer | `mount / dial({ number }) / hangUp / setContact`; `ready, auth.required, call.*, contact.matched, resize, error` |
| 0.2.0 | the power-dial embed | everything above, plus `create()`, all three modes, `signIn / signOut / openSignIn`, `getState`, `dial({ prospectId })`, sessions and their number of lines, inbound, audio devices, warnings |
| 0.3.0 | mute and keypad in the embed | everything above, plus `setMuted / sendDigits`, `call.muteChanged`, `dialer.muted` |
| 0.3.1 | the same (hearing the reloaded frame afresh needs the Symbo release that answers `signIn()` with `reloading`) | everything above; commands waiting when a ready frame reloads reject with `FRAME_RELOADED` instead of timing out, and the frame a `signIn()` reloads into is heard afresh, once until the next `ready` |
| **0.4.0** | session hold and one-off outcomes in the embed | everything above, plus `saveOutcome()`, `session.hold()`, `session.start({ dial: false })`, `session.removeQueued()` with a list, `answerIncoming({ endCurrent })`, `reload({ hard })`; `session.held`, `reload.required`, `frame.leaving`; `dialer.reloadRequired`, `frame.reloaded.reason`; the `NOT_SUPPORTED` client code |

`PROTOCOL_VERSION` is `2` for all of them: every change since 0.1.x is
additive, so an older integration keeps working against a newer release, and a
newer integration against an older release keeps everything that release had.
The commands it does not know reject with `UNKNOWN_COMMAND`, and
`ready.capabilities` lists what the frame in front of you supports — check it
before offering a session button, or a mute button. The few options an older
release would misread rather than refuse are refused by the SDK itself, with
`NOT_SUPPORTED`, for a rep with power dialing (a frame that lists `session`);
for a rep without, they go to the frame, which answers them itself.

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

The message names are declared twice, here and in the Symbo application's
embed `protocol.js`, and `test/protocol.test.js` pins them on this side with a
literal that must match the application's. Change one, change both.

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
