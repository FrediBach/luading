import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

interface VercelHeader {
  key: string
  value: string
}

interface VercelHeaderRule {
  source: string
  headers: VercelHeader[]
}

interface VercelConfig {
  headers?: VercelHeaderRule[]
}

describe('Vercel deployment policy', () => {
  it('explicitly allows same-origin Web MIDI on every application route', () => {
    const config = JSON.parse(
      readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'),
    ) as VercelConfig

    expect(config.headers).toContainEqual({
      source: '/(.*)',
      headers: expect.arrayContaining([
        {
          key: 'Permissions-Policy',
          value: 'midi=(self)',
        },
      ]),
    })
  })
})
