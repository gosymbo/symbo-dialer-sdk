# @symbo/dialer-embed

Embed the Symbo dialer in your own application.

> **Pre-release.** Not published to npm yet, and the embed surface is not
> deployed on any Symbo environment. See [Status](#status).

```bash
npm install @symbo/dialer-embed
```

```js
import { SymboDialer } from '@symbo/dialer-embed'

const dialer = await SymboDialer.mount({
  container: document.getElementById('symbo-dialer'),
})

await dialer.dial({
  number: '+12125550123',
  externalId: 'case-48211',
  externalObjectType: 'prospect',
})

dialer.on('call.completed', ({ callId, externalId, disposition }) => {
  // Good for driving your UI in the moment. For anything you need to keep,
  // take it from the call.completed webhook — events in a page aren't durable.
})
```

Not using a bundler? A script tag gives you the same thing on `window`:

```html
<script src="https://cdn.jsdelivr.net/npm/@symbo/dialer-embed@0/dist/symbo-dialer.min.js"></script>
<script>
  SymboDialer.mount({ container: document.getElementById('symbo-dialer') })
</script>
```

`mount()` resolves once someone is signed in and the dialer can place calls. On
a first visit that means waiting for the user to sign in inside the frame, so
listen for `auth.required` if you need to react sooner — for example to expand
a dialer your layout keeps collapsed.

The SDK creates the iframe itself, with `allow="microphone"` set and the target
origin pinned. Those are the two things that are easy to get wrong by hand and
fail in ways that are hard to diagnose, which is most of why this package exists
rather than a page of copy-paste `postMessage`.

## Try it

A complete example application lives in [`example/`](example) — a pretend
collections tool with a case list, a dial button per row, and a live log of
everything the dialer sends back.

```bash
npm install
npm run demo
```

That serves the repo and opens the example, pointed at your Symbo account. It
also ships a stub that plays the Symbo side of the protocol, so you can watch
the events flow with no account and no network.

Point it elsewhere with `?appUrl=` — it takes an **origin**, not a path, and the
example shows which one it is currently using:

```
?appUrl=http://localhost:3000/example/stub    the offline stub
?appUrl=https://<your-environment>            any other Symbo environment
```

## API

| Method | Notes |
| --- | --- |
| `SymboDialer.mount({ container, appUrl?, mountTimeoutMs? })` | Resolves with the client. `appUrl` is an **origin** — the SDK appends `/dial?embed=1` |
| `dial({ number, externalId?, externalObjectType?, fullName?, dialImmediately? })` | `number` in whatever format your records hold |
| `hangUp()` | Ends the call in progress |
| `setContact({ ... })` | Loads a contact without dialing |
| `on(event, handler)` | Returns an unsubscribe function |
| `once(event, handler)` | |
| `destroy()` | Removes the iframe and its listeners |

Events: `ready`, `auth.required`, `call.started`, `call.incoming`,
`call.answered`, `call.ended`, `call.completed`, `contact.matched`, `resize`,
`error`.

## When a dial is refused

Every command is answered, and the promise it returned settles on that answer.
A refused command rejects with a `SymboDialerError` carrying a `code`:

```js
try {
  await dialer.dial({ number, externalId })
} catch (err) {
  if (err.code === 'POSTCALL_DETAILS_REQUIRED') showOutcomeReminder()
}
```

Worth wiring up, because these states are the ones that would otherwise look
like nothing happening. Inside Symbo they announce themselves with a toast, or
by the dialer opening on the outcome form — neither of which reaches you if
your page keeps the frame small or collapsed.

| Code | Meaning |
| --- | --- |
| `POSTCALL_DETAILS_REQUIRED` | The last call still needs an outcome |
| `NEEDS_SETUP` | No activated outbound number, or no calling device |
| `CALLING_NOT_ENABLED` | Calling isn't enabled on this Symbo account |
| `CALL_IN_PROGRESS` | A call is already active |
| `INVALID_NUMBER` | `number` was missing or empty |
| `NOT_READY` / `DESTROYED` | Sent before `mount()` resolved, or after `destroy()` |
| `COMMAND_TIMEOUT` | Symbo never answered |

The `error` event is still there, for failures that aren't an answer to
something you asked for.

## Linking calls to your own records

Pass `externalId` on `dial()` and it comes back on every event — and on the
webhooks Symbo sends your server after the call. That is how call activity lands
against the right record in your system without duplicating your contacts into
Symbo.

Going the other way, `contact.matched` fires when you dial a number you hold no
record for and Symbo recognises it — you started with a phone number and now
know whose it is.

The outbound call events also carry `from`, the number you called *from*. With
local presence that is chosen at dial time, so you can't know it in advance, and
it is the number your customer sees and calls back on.

For inbound calls, Symbo can ask *your* server who an unknown number belongs to;
see the `call.contactlookup` webhook in the Symbo API guide.

## Development

```bash
npm install
npm test        # protocol contract + mount guards
npm run build   # dist/symbo-dialer.min.js, the script-tag bundle
npm run demo    # serve the example
```

The npm package ships plain ESM from `src/`. There is no build step for the
module entry — `dist/` exists only for script-tag users, and is rebuilt
automatically on publish.

## The contract is declared twice

This package does not depend on the Symbo application, which is what lets it
live in its own repository. The cost is that the message names exist in both
places and must agree exactly. Drift is silent — both sides keep working while a
partner stops receiving an event nobody noticed was renamed.

`test/protocol.test.js` pins the contract here against a written-out literal,
and symbo-ui has a matching test with the same literal. Changing the protocol on
either side fails that side's build until the literal is updated, which is the
moment you are meant to remember the other repository exists.

Bump `PROTOCOL_VERSION` when a message is removed or renamed, or when a payload
field changes meaning. Adding an event or an optional field is additive and does
not need one.

## Status

Pre-release. Two things are not done:

- **Not published.** The `@symbo` npm scope needs claiming.
- **Symbo needs the matching fix.** The embed surface is live, but the
  handshake only completes on an environment carrying the fix for it. Against
  one that doesn't, the dialer renders in the frame, never answers, and
  `mount()` ends in `MOUNT_TIMEOUT`. The bundled stub works either way.

## Licence

[MIT](LICENSE). Reaching the Symbo Service through this package needs a Symbo
account, and is governed by the [Symbo Terms and
Conditions](https://www.symbo.ai/resources/terms-conditions).

## Questions

**team@symbo.ai**
