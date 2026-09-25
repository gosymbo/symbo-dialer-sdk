/**
 * A stand-in for your backend, for trying silent sign-in before you build
 * yours. It does the two jobs your backend will do:
 *
 *   GET  /.well-known/jwks.json   your public key, for Symbo to verify with
 *   POST /symbo-token             a short-lived RS256 JWT for a rep
 *
 *   node example/token-server/generate-keys.js   once
 *   node example/token-server/server.js          then
 *
 * ──────────────────────────────────────────────────────────────────────────
 * READ THIS BEFORE COPYING ANY OF IT INTO A REAL BACKEND
 *
 * POST /symbo-token here takes the rep's email in the request body, because
 * this stand-in has no login of its own. Yours must NOT. It mints for whoever
 * is logged into your app, from your session, and only for an email your app
 * has verified belongs to them:
 *
 *     const email = req.session.user.email   // yes
 *     const email = req.body.email           // NO
 * ──────────────────────────────────────────────────────────────────────────
 */
import { createServer } from 'node:http'

import { keysDir, loadKeys, mintToken } from './token.js'

const PORT = Number(process.env.PORT || 8790)

// Both must equal what you gave Symbo, character for character. A mismatch
// is the most common first failure, and it surfaces as TOKEN_REJECTED.
const ISSUER = process.env.ISSUER || `http://localhost:${PORT}`
const AUDIENCE = process.env.AUDIENCE || 'symbo-embedded-dialer'

// The Symbo organization uuid Symbo sent you with your profileId. One
// profile can serve several organizations; each token names its own.
const ORGANIZATION_ID = process.env.ORGANIZATION_ID || ''

const TTL_SECONDS = Number(process.env.TTL_SECONDS || 120)

const keys = loadKeys()
if (!keys) {
  console.error(`No key in ${keysDir()}.`)
  console.error('Run: node example/token-server/generate-keys.js')
  process.exit(1)
}

const send = (res, status, body, headers = {}) => {
  const payload = body === undefined ? '' : JSON.stringify(body)
  res.writeHead(status, {
    'content-type': 'application/json',
    // The example page is served from another port, so it is cross-origin.
    // Your own token endpoint should sit on your page's origin and need none.
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'content-type',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    ...headers,
  })
  res.end(payload)
}

const readJson = (req) =>
  new Promise((resolve, reject) => {
    let body = ''
    req.on('data', (chunk) => {
      body += chunk
      if (body.length > 10_000) req.destroy()
    })
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {})
      } catch (err) {
        reject(err)
      }
    })
  })

const server = createServer(async (req, res) => {
  const { pathname } = new URL(req.url, `http://localhost:${PORT}`)

  if (req.method === 'OPTIONS') return send(res, 204)

  // What Symbo fetches. It must be reachable from the public internet over
  // HTTPS, with no login, WAF challenge or IP allowlist in front of it — it
  // holds only a public key. A tunnel is fine for testing.
  if (req.method === 'GET' && pathname === '/.well-known/jwks.json') {
    return send(res, 200, keys.jwks, { 'cache-control': 'public, max-age=300' })
  }

  if (req.method === 'GET' && pathname === '/') {
    return send(res, 200, {
      issuer: ISSUER,
      audience: AUDIENCE,
      kid: keys.kid,
      jwks: `${ISSUER}/.well-known/jwks.json`,
      organization_id: ORGANIZATION_ID || '(not set; send it per request)',
      mint: 'POST /symbo-token { "email": "rep@example.com" }',
      warning:
        'Stand-in only. A real backend mints for its session user, never for an email in the body.',
    })
  }

  if (req.method === 'POST' && pathname === '/symbo-token') {
    let body
    try {
      body = await readJson(req)
    } catch {
      return send(res, 400, { error: 'The body must be JSON.' })
    }

    // ⚠ Stand-in only. See the banner at the top of this file.
    const email = String(body.email || '').trim()
    if (!email) return send(res, 400, { error: 'email is required.' })

    const organizationId = String(
      body.organization_id || ORGANIZATION_ID
    ).trim()
    if (!organizationId) {
      return send(res, 400, {
        error:
          'organization_id is required: set ORGANIZATION_ID, or send it in the body.',
      })
    }

    const { token, claims } = mintToken({
      privateKeyPem: keys.privateKeyPem,
      kid: keys.kid,
      issuer: ISSUER,
      audience: AUDIENCE,
      email,
      organizationId,
      ttlSeconds: TTL_SECONDS,
    })
    console.log(
      `minted for ${email} in ${organizationId}, expires in ${TTL_SECONDS}s (jti ${claims.jti})`
    )
    return send(res, 200, { token, expires_in: TTL_SECONDS })
  }

  send(res, 404, { error: 'Not found.' })
})

server.listen(PORT, () => {
  console.log(`Token server on http://localhost:${PORT}`)
  console.log(`  JWKS  http://localhost:${PORT}/.well-known/jwks.json`)
  console.log(`  mint  POST http://localhost:${PORT}/symbo-token`)
  console.log(`  iss   ${ISSUER}`)
  console.log(`  aud   ${AUDIENCE}`)
  console.log(`  org   ${ORGANIZATION_ID || '(send organization_id per request)'}`)
  console.log(`  kid   ${keys.kid}`)
  console.log(`  keys  ${keysDir()}`)
})
