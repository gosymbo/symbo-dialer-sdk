import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { spawn } from 'node:child_process'
import { createPublicKey, createVerify } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  generateKeys,
  mintToken,
  saveKeys,
} from '../example/token-server/token.js'

// The example token server stands in for a partner's backend. What matters is
// that a token it signs verifies against the JWKS it publishes, the way
// Symbo's verifier will check it — so this verifies with nothing but the JWKS.

const decode = (part) => JSON.parse(Buffer.from(part, 'base64url').toString())

function verifyAgainstJwks(token, jwks) {
  const [h, p, s] = token.split('.')
  const header = decode(h)
  const jwk = jwks.keys.find((key) => key.kid === header.kid)
  if (!jwk) return { ok: false, header }
  const ok = createVerify('RSA-SHA256')
    .update(`${h}.${p}`)
    .verify(createPublicKey({ key: jwk, format: 'jwk' }), s, 'base64url')
  return { ok, header, claims: decode(p) }
}

const mintWith = (keys, extra = {}) =>
  mintToken({
    privateKeyPem: keys.privateKeyPem,
    kid: keys.kid,
    issuer: 'https://partner.example',
    audience: 'symbo-embedded-dialer',
    email: 'rep@partner.example',
    organizationId: 'org-uuid',
    ...extra,
  })

describe('the example token server', () => {
  const keys = generateKeys()

  it('publishes an RS256 signing key under the kid its tokens carry', () => {
    expect(keys.jwks.keys).toHaveLength(1)
    const [jwk] = keys.jwks.keys
    expect(jwk).toMatchObject({ kty: 'RSA', e: 'AQAB', use: 'sig', alg: 'RS256' })
    expect(jwk.kid).toBe(keys.kid)
    // The public half only.
    expect(jwk.d).toBeUndefined()
    expect(keys.privateKeyPem).toContain('BEGIN PRIVATE KEY')
  })

  it('signs a token that verifies against the published JWKS', () => {
    const { token } = mintWith(keys)
    const { ok, header, claims } = verifyAgainstJwks(token, keys.jwks)
    expect(ok).toBe(true)
    expect(header).toEqual({ alg: 'RS256', typ: 'JWT', kid: keys.kid })
    expect(claims).toMatchObject({
      iss: 'https://partner.example',
      aud: 'symbo-embedded-dialer',
      sub: 'rep@partner.example',
      email: 'rep@partner.example',
      organization_id: 'org-uuid',
    })
  })

  it('lives two minutes, with a little slack for clock skew, and never repeats a jti', () => {
    const now = 1_800_000_000
    const a = mintWith(keys, { now }).claims
    const b = mintWith(keys, { now }).claims
    expect(a.iat).toBe(now)
    expect(a.exp - a.iat).toBe(120)
    expect(a.nbf).toBeLessThan(a.iat)
    expect(a.jti).not.toBe(b.jti)
  })

  it('does not verify against a different key', () => {
    const { token } = mintWith(keys)
    const other = generateKeys({ kid: keys.kid })
    expect(verifyAgainstJwks(token, other.jwks).ok).toBe(false)
  })

  it('puts no roles in the token', () => {
    const { claims } = mintWith(keys)
    expect(Object.keys(claims).sort()).toEqual(
      ['aud', 'email', 'exp', 'iat', 'iss', 'jti', 'nbf', 'organization_id', 'sub'].sort()
    )
  })
})

describe('the example token server over HTTP', () => {
  const PORT = 18790 + Math.floor(Math.random() * 1000)
  const base = `http://127.0.0.1:${PORT}`
  let dir
  let child

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'symbo-token-server-'))
    saveKeys(generateKeys(), dir)
    child = spawn(process.execPath, ['example/token-server/server.js'], {
      env: {
        ...process.env,
        KEYS_DIR: dir,
        PORT: String(PORT),
        ISSUER: 'https://partner.example',
        ORGANIZATION_ID: 'org-from-env',
      },
      stdio: 'pipe',
    })
    await new Promise((resolve, reject) => {
      child.stdout.on('data', (d) => String(d).includes('Token server') && resolve())
      child.on('exit', (code) => reject(new Error(`server exited ${code}`)))
    })
  })

  afterAll(() => {
    child?.kill()
    rmSync(dir, { recursive: true, force: true })
  })

  it('mints a token the JWKS it serves verifies', async () => {
    const jwks = await (await fetch(`${base}/.well-known/jwks.json`)).json()
    const res = await fetch(`${base}/symbo-token`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'rep@partner.example' }),
    })
    expect(res.status).toBe(200)
    const { token, expires_in } = await res.json()
    expect(expires_in).toBe(120)
    const { ok, claims } = verifyAgainstJwks(token, jwks)
    expect(ok).toBe(true)
    expect(claims.iss).toBe('https://partner.example')
    expect(claims.organization_id).toBe('org-from-env')
  })

  it('lets a request name the organization, for a profile bound to several', async () => {
    const res = await fetch(`${base}/symbo-token`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'rep@partner.example', organization_id: 'org-b' }),
    })
    const { token } = await res.json()
    expect(decode(token.split('.')[1]).organization_id).toBe('org-b')
  })

  it('refuses a request with no email', async () => {
    const res = await fetch(`${base}/symbo-token`, { method: 'POST', body: '{}' })
    expect(res.status).toBe(400)
  })
})
