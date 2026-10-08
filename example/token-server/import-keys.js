/**
 * Put a keypair someone else made where the token server reads it, instead of
 * making a new one. For a teammate testing against a trusted auth profile whose
 * JWKS is already published: everyone signs with the one key Symbo knows.
 *
 *   node example/token-server/import-keys.js <private-key.pem> <jwks.json | https://…>
 *   pbpaste | node example/token-server/import-keys.js - <jwks.json | https://…>
 *
 * The public key is the JWKS, as a file or the URL it is published at. Checks
 * the private key matches a key in it (that key's kid goes in every token),
 * then writes private.pem, jwks.json and kid.txt to ~/.symbo-token-server (or
 * KEYS_DIR), as generate-keys.js does. Refuses to replace a different key
 * already there; pass --force to.
 */
import { createPublicKey } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

import { importKeys, keysDir, loadKeys, saveKeys } from './token.js'

const fail = (message) => {
  console.error(message)
  process.exit(1)
}

const args = process.argv.slice(2)
const force = args.includes('--force')
const [privateArg, publicArg] = args.filter((arg) => arg !== '--force')
if (!privateArg || !publicArg)
  fail(
    'Usage: node example/token-server/import-keys.js <private-key.pem | -> <jwks.json | https://…> [--force]'
  )

const readStdin = async () => {
  const chunks = []
  for await (const chunk of process.stdin) chunks.push(chunk)
  return Buffer.concat(chunks).toString('utf8')
}

const readJwks = async (source) => {
  if (!/^https?:\/\//.test(source)) return JSON.parse(readFileSync(source, 'utf8'))
  const res = await fetch(source)
  if (!res.ok) throw new Error(`${source} answered ${res.status}`)
  return res.json()
}

let keys
try {
  const privateKeyPem =
    privateArg === '-' ? await readStdin() : readFileSync(privateArg, 'utf8')
  keys = importKeys({ privateKeyPem, jwks: await readJwks(publicArg) })
} catch (error) {
  fail(error.message)
}

// The same key, in whatever PEM form it was saved, has the same public half.
const sameKey = (current) => {
  try {
    const modulus = (pem) => createPublicKey(pem).export({ format: 'jwk' }).n
    return modulus(current.privateKeyPem) === modulus(keys.privateKeyPem)
  } catch {
    return false
  }
}

const dir = keysDir()
// Any of the three files means a key is here; a partial set is still one not
// to overwrite by accident. Importing the same key again just rewrites it.
const existing = ['private.pem', 'jwks.json', 'kid.txt'].some((file) =>
  existsSync(join(dir, file))
)
if (existing && !force && !sameKey(loadKeys(dir) || {}))
  fail(
    `A different key is already in ${dir}.\n` +
      'Replacing it breaks sign-in for any profile that has its JWKS.\n' +
      'Run again with --force if that is what you want.'
  )

saveKeys(keys, dir)
console.log(`Wrote private.pem, jwks.json and kid.txt to ${dir}`)
console.log(`kid ${keys.kid}`)
if (privateArg !== '-' && resolve(privateArg) !== resolve(dir, 'private.pem'))
  console.log(`Delete the copy you were sent (${privateArg}) once sign-in works.`)
