# Example token server

A stand-in for your backend, so you can try silent sign-in before you build
yours. It does the two jobs your backend will do, with Node's own `crypto` and
nothing to install:

```
GET  /.well-known/jwks.json   your public key, which Symbo verifies tokens against
POST /symbo-token             a short-lived RS256 JWT for a rep
```

`token.js` holds the parts worth reading: making the keypair, turning the
public key into a JWKS, and signing the token. `server.js` puts them behind
HTTP.

## Try it against the offline stub

No Symbo account needed. The stub accepts any token, so this proves your page
wiring and the token server, not Symbo's verification.

```bash
npm run token-server:keys     # once: writes the keypair to ~/.symbo-token-server
ORGANIZATION_ID=demo-org npm run token-server   # listens on :8790
npm run serve                 # in a second terminal: the examples on :3000
```

Open
`http://localhost:3000/example/collections.html?appUrl=http://localhost:3000/example/stub&tokenServer=http://localhost:8790&email=sam@partner.test`.
The page asks the token server for a token when the frame reports
`auth.required`, hands it to `signIn()`, and reaches **Ready** without a click.
The token server logs each token it mints. If the page reaches **Ready** and the
token server logged nothing, the stub was still signed in from an earlier try:
press **Sign out** and it signs in again through the token server.

## Try it against Symbo

Symbo has to fetch your JWKS from the internet, and it sets you up by email,
so the JWKS URL you send has to keep working until Symbo replies and for as
long as you test. Put the token server on a public `https://` URL that stays
the same: a tunnel with a fixed hostname, or a host you already have. A
tunnel that gets a new URL each time it starts means another email each
time.

The issuer is only a name, compared character for character; it does not
have to match the tunnel. Pick one you won't need to change:

```bash
# expose localhost:8790 at a public https:// URL with the tunnel you use,
# for example `cloudflared tunnel …` or `ngrok http 8790`, and leave it running
ISSUER=https://test.your-app.example npm run token-server
```

1. Send **team@symbo.ai** the JWKS URL
   (`https://<your tunnel>/.well-known/jwks.json`), the issuer (your
   `ISSUER`, exactly), the audience (`symbo-embedded-dialer` unless you set
   `AUDIENCE`) and the Symbo organization you will test in. For the page:
   while your organization has no origins registered, Symbo accepts a page on
   any origin, so `http://localhost:3000` works. Once origins are registered,
   only those work, and only `https://` origins can be registered: serve the
   page through an `https://` tunnel too and send that origin.
2. Symbo sends back a `profileId` and the organization's uuid. Put the uuid
   in `ORGANIZATION_ID` and restart the token server only; leave the tunnel
   running, or its URL changes.
3. Open `collections.html` with `appUrl=https://app.symbo.ai`,
   `tokenServer=http://localhost:8790`, `profileId=<yours>`, and `email` set
   to a rep who already exists in that organization with a calling seat.

## Settings

| Env var | Default | |
| --- | --- | --- |
| `PORT` | `8790` | |
| `ISSUER` | `http://localhost:$PORT` | Your issuer, sent as the `iss` claim. Any fixed string; it must equal what you sent Symbo, exactly |
| `AUDIENCE` | `symbo-embedded-dialer` | Your audience, sent as the `aud` claim. Same rule |
| `ORGANIZATION_ID` | none | The Symbo organization uuid for the `organization_id` claim. The server starts without it, and mints only once it is set. A request can send `organization_id` to override it, for a profile that covers several organizations |
| `TTL_SECONDS` | `120` | Token life. The session it opens lasts 8 hours |
| `KEYS_DIR` | `~/.symbo-token-server` | Where the keypair lives. Outside this repo on purpose: `npm run serve` shares the whole repo over HTTP |
| `KID` | a random uuid | The key id, read by `generate-keys.js` only |

`generate-keys.js` refuses to replace an existing key, because the JWKS Symbo
already fetched would stop matching it. Pass `--force` if you mean it.

## What not to copy

`POST /symbo-token` takes the rep's email in the request body, because this
stand-in has no login of its own. **Your backend must never do that.** It mints
for whoever is logged into your app, from your own session:

```js
const email = req.session.user.email   // yes
const email = req.body.email           // no
```

Likewise `organization_id`: this stand-in takes it from the request for
convenience. Your backend picks it on the server, from the logged-in user's
account.

Two more rules this stand-in cannot show:

- **Only mint for an email your app has verified belongs to that user.**
- **Keep the endpoint on your page's own origin, behind your login, and use
  `POST`.** This server allows every origin (`access-control-allow-origin: *`)
  only because the example page runs on a different port. If your endpoint has
  to live on another origin, allow just your page's origin, with credentials,
  and call it with `fetch(url, { method: 'POST', credentials: 'include' })`.

## Moving to your backend

- Keep the private key in your secret manager, not in a file next to your code.
  PKCS#8 (`BEGIN PRIVATE KEY`, which `generate-keys.js` writes) and PKCS#1
  (`BEGIN RSA PRIVATE KEY`) both work.
- Serve the JWKS at a stable HTTPS URL with no login, WAF challenge or IP
  allowlist in front of it. It holds only a public key.
- Port `mintToken` from `token.js`, or use a JWT library that signs RS256 and
  sets `kid` in the header. `jsonwebtoken`:
  `jwt.sign(claims, privateKey, { algorithm: 'RS256', header: { kid } })`.
