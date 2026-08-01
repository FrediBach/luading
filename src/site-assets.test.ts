import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('site assets', () => {
  it('uses the Luading logo as the SVG favicon', () => {
    const index = readFileSync(new URL('../index.html', import.meta.url), 'utf8')
    const logo = readFileSync(
      new URL('../public/luading-logo.svg', import.meta.url),
      'utf8',
    )

    expect(index).toContain(
      '<link rel="icon" type="image/svg+xml" href="/luading-logo.svg" />',
    )
    expect(logo).toContain('<svg')
  })
})
