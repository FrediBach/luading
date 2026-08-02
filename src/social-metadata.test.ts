import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const indexHtml = readFileSync(new URL('../index.html', import.meta.url), 'utf8')

const expectTag = (attribute: string, value: string, content: string) => {
  expect(indexHtml).toContain(
    `<meta ${attribute}="${value}" content="${content}" />`,
  )
}

describe('social sharing metadata', () => {
  it('publishes canonical Open Graph metadata with the social image', () => {
    expect(indexHtml).toContain(
      '<link rel="canonical" href="https://luading.vercel.app/" />',
    )
    expectTag('property', 'og:type', 'website')
    expectTag('property', 'og:site_name', 'Luading')
    expectTag('property', 'og:locale', 'en_US')
    expectTag('property', 'og:url', 'https://luading.vercel.app/')
    expectTag('property', 'og:title', 'Luading - Disting NT Lua Simulator')
    expectTag('property', 'og:image:type', 'image/png')
    expectTag('property', 'og:image:width', '1200')
    expectTag('property', 'og:image:height', '630')
    expect(indexHtml).toContain(
      'property="og:image"\n      content="https://luading.vercel.app/luading-open-graph-image.png"',
    )
    expect(indexHtml).toContain('property="og:description"')
    expect(indexHtml).toContain('property="og:image:alt"')
  })

  it('publishes a large X card with accessible image metadata', () => {
    expectTag('name', 'twitter:card', 'summary_large_image')
    expectTag('name', 'twitter:title', 'Luading - Disting NT Lua Simulator')
    expect(indexHtml).toContain('name="twitter:description"')
    expect(indexHtml).toContain(
      'name="twitter:image"\n      content="https://luading.vercel.app/luading-open-graph-image.png"',
    )
    expect(indexHtml).toContain('name="twitter:image:alt"')
  })

  it('serves a 1200 by 630 PNG image', () => {
    const image = readFileSync(
      new URL('../public/luading-open-graph-image.png', import.meta.url),
    )

    expect(image.subarray(1, 4).toString('ascii')).toBe('PNG')
    expect(image.readUInt32BE(16)).toBe(1200)
    expect(image.readUInt32BE(20)).toBe(630)
  })
})
