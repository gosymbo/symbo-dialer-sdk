/**
 * Make the keypair the token server signs with, once:
 *
 *   node example/token-server/generate-keys.js
 *
 * Writes private.pem, jwks.json and kid.txt to ~/.symbo-token-server (or
 * KEYS_DIR). Refuses to overwrite an existing key: the JWKS you gave Symbo
 * would stop matching it. Pass --force to replace it anyway.
 */
import { existsSync } from 'node:fs'
import { join } from 'node:path'

import { generateKeys, keysDir, saveKeys } from './token.js'

const dir = keysDir()
// Any of the three files means a key was made here; a partial set is still
// one not to overwrite by accident.
const existing = ['private.pem', 'jwks.json', 'kid.txt'].some((file) => existsSync(join(dir, file)))
if (existing && !process.argv.includes('--force')) {
  console.error(`A key already exists in ${dir}.`)
  console.error('Replacing it breaks sign-in until the new JWKS is fetched.')
  console.error('Run again with --force if that is what you want.')
  process.exit(1)
}

const keys = generateKeys({ kid: process.env.KID })
saveKeys(keys, dir)
console.log(`Wrote private.pem, jwks.json and kid.txt to ${dir}`)
console.log(`kid ${keys.kid}`)
