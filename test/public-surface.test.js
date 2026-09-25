// Everything a partner reads — the README, the source, the examples, the
// figures — points at production and nothing else. The only Symbo hosts that
// may appear are app.symbo.ai and api.symbo.ai; any other *.symbo.ai host is
// an internal environment and fails the build.
//
// Deliberately an allowlist: this repository is public, so the test must not
// itself spell out what it keeps out.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const ALLOWED_HOSTS = new Set(['app.symbo.ai', 'api.symbo.ai', 'www.symbo.ai'])
const SYMBO_HOST = /\b((?:[a-z0-9-]+\.)+symbo\.ai)\b/gi

const ROOT = new URL('..', import.meta.url).pathname
const SKIP = new Set(['node_modules', 'dist', 'coverage', '.git', 'package-lock.json'])
const TEXT = /\.(md|js|mjs|html|svg|json)$/

function* files(dir) {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue
    const path = join(dir, name)
    if (statSync(path).isDirectory()) yield* files(path)
    else if (TEXT.test(name)) yield path
  }
}

describe('the public surface', () => {
  it('names no Symbo host but production', () => {
    const hits = []
    for (const path of files(ROOT)) {
      readFileSync(path, 'utf8').split('\n').forEach((line, i) => {
        for (const [, host] of line.matchAll(SYMBO_HOST)) {
          if (!ALLOWED_HOSTS.has(host.toLowerCase())) {
            hits.push(`${path.slice(ROOT.length)}:${i + 1}: ${host}`)
          }
        }
      })
    }
    expect(hits).toEqual([])
  })

  it('catches a host it does not allow', () => {
    // Assembled at runtime so the scan above does not trip over this line.
    const url = ['https://other', 'symbo', 'ai/dial'].join('.')
    const [[, host]] = url.matchAll(SYMBO_HOST)
    expect(ALLOWED_HOSTS.has(host)).toBe(false)
  })
})
