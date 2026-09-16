# Power dialing through the SDK — exploration

> Not a commitment. This is a design sketch on a branch, written to make the
> options concrete enough to choose between. Nothing here is implemented, and
> the shape may not survive contact with the first partner who wants it.

Today the SDK dials one number at a time: the partner calls `dial()`, Symbo
places the call, events come back. Power dialing is a different shape — a
session that works through a list, paces itself, and reports progress as it
goes. This is about what, if anything, the SDK should expose of that.

## The tension worth naming first

The embedded dialer's premise is that **contacts stay in the partner's
system**. You keep your records, you pass a number and an `externalId`, and
Symbo hands the activity back tagged with your id. Nothing is copied.

Power dialing's premise is the opposite: **Symbo owns a session**, and that
session owns a queue of records it works through. It knows what it dialled,
what it reached, what to try next, and it has to survive a browser refresh.

Those two premises collide. Any design here is a choice about how much of the
partner's list Symbo has to hold, and the answer determines everything else.

## Two shapes

### Shape A — the partner hands over a list

```js
const session = await dialer.startPowerDial({
  records: [
    { number: '+12125550123', externalId: 'case-48211', fullName: 'Jane Doe' },
    { number: '+14155550142', externalId: 'case-48219', fullName: 'Marcus Bell' },
  ],
})

session.on('call.connected', ({ externalId }) => highlightRow(externalId))
session.on('session.finished', (summary) => showSummary(summary))
```

The partner supplies the queue, Symbo runs it, and every event comes back
tagged with the partner's own ids.

**What this costs.** The records have to exist somewhere Symbo can work
through, which means either creating them as prospects on the fly or holding
a session-scoped list. That is a real data model question, not an SDK one,
and it sits directly on the boundary the embed was built to respect. A partner
who chose the embed *because* their contacts stay theirs will read this
differently from one who just wants the dialing to work.

**What makes it plausible.** Symbo already feeds a power dial session from an
external list rather than a hand-picked one — the mechanism exists, it is just
pointed at connected CRMs today. A partner list is the same idea with a
different source.

### Shape B — the partner watches a session Symbo already runs

The user starts a power dial session inside the dialer the normal way. The SDK
reports what happens.

```js
dialer.on('pd.session.started', ({ sessionId, queued }) => {…})
dialer.on('pd.call.connected', ({ number, externalId }) => {…})
dialer.on('pd.session.ended', (summary) => {…})
```

No new data model, no list handover, no change to who owns what. The partner's
UI can mirror progress and file the outcomes, but cannot start, stop or steer
a session.

**What this costs.** It is only useful to a partner whose users are already in
Symbo enough to build a session there — which is not the dialer-only customer
this whole surface was built for. It may be the right first step anyway,
because it is nearly free and tells us whether anyone actually wants the
feature before the expensive version gets built.

## What the protocol would need either way

The current protocol is request/response plus a flat event stream, and a power
dial session is neither. It is long-running, has its own lifecycle, and emits
events that belong to *it* rather than to the dialer as a whole.

Open questions that fall out of that:

- **Does a session need its own object?** `dialer.on('pd.…')` keeps the surface
  flat but muddles two lifetimes. A returned `session` object is cleaner and is
  a bigger change.
- **What happens on refresh?** A session outlives the page. `mount()` would
  have to report that one is already running, and the partner would have to be
  able to rejoin it.
- **Who paces it?** If the partner can start a session they will want to pause,
  skip and resume it. Each of those is another command, and each can be refused
  for the same reasons `dial()` can.
- **Parallel lines.** A session can dial more than one number at a time. Events
  stop being a sequence and become per-line, which every payload shape above
  quietly assumes away.
- **What does `externalId` mean across a session?** Per record, presumably —
  but a session summary needs to report against the partner's ids too, not
  just Symbo's.

## Where to start

Shape B, if the goal is learning. It is additive, needs no data model
decision, and the events largely exist internally already — the work is
forwarding them across the frame, which is what the bridge already does for
single calls.

Shape A is the one a dialer-only partner actually wants, and it should not be
designed until someone has asked for it in enough detail to answer the
ownership question. Building it on a guess would commit the product to holding
partner contact lists, which is the one thing the embed was careful not to do.
