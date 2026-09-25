/**
 * The two things a partner backend does for silent sign-in, as plain
 * functions: publish a public key as a JWKS, and sign a short-lived RS256 JWT
 * for the rep who is logged in. node:crypto only — nothing to install.
 *
 * server.js puts these behind HTTP; test/token-server.test.js checks that what
 * mintToken signs verifies against what publicJwks publishes.
 */
import { createSign, generateKeyPairSync, randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

/**
 * Where the keypair lives. Outside this repository on purpose: `npm run serve`
 * shares the whole repo over HTTP, and a private key never belongs in a folder
 * a web server can see. Override with KEYS_DIR.
 */
export const keysDir = () =>
  process.env.KEYS_DIR || join(homedir(), '.symbo-token-server')

/** An RSA 2048 keypair, the private half as PKCS#8 PEM. */
export function generateKeys({ kid = randomUUID() } = {}) {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
  })
  return {
    kid,
    privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }),
    jwks: publicJwks(publicKey, kid),
  }
}

/**
 * The JWKS Symbo verifies against: the public key as a JWK, plus the `kid`
 * every token carries in its header. To rotate, publish the new key beside the
 * old one and leave both listed for a day, then switch the signer to the new
 * `kid` and drop the old entry once nothing signs with it.
 */
export function publicJwks(publicKey, kid) {
  const jwk = publicKey.export({ format: 'jwk' }) // { kty, n, e }
  return { keys: [{ ...jwk, use: 'sig', alg: 'RS256', kid }] }
}

export function saveKeys({ kid, privateKeyPem, jwks }, dir = keysDir()) {
  mkdirSync(dir, { recursive: true, mode: 0o700 })
  writeFileSync(join(dir, 'private.pem'), privateKeyPem, { mode: 0o600 })
  writeFileSync(join(dir, 'jwks.json'), JSON.stringify(jwks, null, 2))
  writeFileSync(join(dir, 'kid.txt'), kid)
  return dir
}

export function loadKeys(dir = keysDir()) {
  const files = ['private.pem', 'jwks.json', 'kid.txt']
  const missing = files.filter((file) => !existsSync(join(dir, file)))
  if (missing.length) return null
  return {
    privateKeyPem: readFileSync(join(dir, 'private.pem'), 'utf8'),
    jwks: JSON.parse(readFileSync(join(dir, 'jwks.json'), 'utf8')),
    kid: readFileSync(join(dir, 'kid.txt'), 'utf8').trim(),
  }
}

const b64url = (input) => Buffer.from(input).toString('base64url')

/**
 * Sign the token. Every claim here is one Symbo checks or reads:
 *
 *   iss, aud         must equal what you gave Symbo, exactly
 *   sub              your own user id for the rep
 *   email            how Symbo finds the rep — only ever an address your app
 *                    has verified belongs to this user
 *   organization_id  which Symbo organization the rep is in
 *   jti              fresh per token
 *   iat, nbf, exp    a two-minute life; nbf a few seconds back for clock skew
 *
 * Roles are deliberately absent: a rep's permissions come from their Symbo
 * account.
 */
export function mintToken({
  privateKeyPem,
  kid,
  issuer,
  audience,
  email,
  sub,
  organizationId,
  ttlSeconds = 120,
  now = Math.floor(Date.now() / 1000),
}) {
  const header = { alg: 'RS256', typ: 'JWT', kid }
  const claims = {
    iss: issuer,
    aud: audience,
    sub: sub || email,
    email,
    organization_id: organizationId,
    jti: randomUUID(),
    iat: now,
    nbf: now - 5,
    exp: now + ttlSeconds,
  }
  const signingInput = `${b64url(JSON.stringify(header))}.${b64url(
    JSON.stringify(claims)
  )}`
  const signature = createSign('RSA-SHA256')
    .update(signingInput)
    .sign(privateKeyPem)
    .toString('base64url')
  return { token: `${signingInput}.${signature}`, claims }
}
