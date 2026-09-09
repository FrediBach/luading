// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { parseDisplaySvg, readDisplaySvg, validateSvgFile } from './display-design-svg-file'
import { svgColour } from './display-design-svg-style'
const wrap = (s: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 64">${s}</svg>`
describe('bounded detached SVG normalization', () => {
  it('normalizes inherited CSS, transforms and local references in paint order', () => {
    const scene = parseDisplaySvg(wrap('<style>.a{fill:white} #r{fill:red !important}</style><defs><rect id="r" class="a" width="5" height="2"/></defs><g transform="translate(3 4)"><use href="#r" x="2"/><rect class="a" width="1" height="1"/></g>'))
    expect(scene.nodes).toHaveLength(2)
    expect(scene.nodes[0]?.bounds).toEqual({ x: 5, y: 4, width: 5, height: 2 })
    expect(scene.nodes.map(n => n.style.fill)).toEqual(['red', 'white'])
    expect(scene.nodes[0]?.groups).toHaveLength(2)
  })
  it('preserves fill holes, ellipses, rounded corners and text runs', () => {
    const scene = parseDisplaySvg(wrap('<path d="M0 0H10V10H0Z M2 2H8V8H2Z" fill-rule="evenodd"/><ellipse cx="20" cy="20" rx="5" ry="3"/><rect width="20" height="8" rx="2"/><text x="4" y="10">A<tspan x="4" y="20" font-size="6">B &amp; C</tspan></text>'))
    expect(scene.nodes[0]?.contours).toHaveLength(2)
    expect(scene.nodes[1]?.shape).toBeUndefined()
    expect(scene.nodes[2]?.contours[0]?.segments.some(s => s.points.length === 4)).toBe(true)
    expect(scene.nodes[4]?.text).toEqual({ value: 'B & C', x: 4, y: 20, size: 6 })
  })
  it('blocks unsupported effects without silently losing source objects', () => {
    const scene = parseDisplaySvg(wrap('<g opacity=".5"><rect width="4" height="4"/></g><image href="https://example.com/x.png"/><rect width="4" height="4" fill="url(#gradient)"/><script>alert(1)</script>'))
    expect(scene.nodes).toHaveLength(4)
    expect(scene.nodes.every(n => n.findings.some(f => f.severity === 'blocked'))).toBe(true)
    expect(JSON.stringify(scene)).not.toContain('alert(1)')
  })
  it('handles hidden content, unresolved references and namespace injection', () => {
    const scene = parseDisplaySvg(wrap('<rect display="none"/><use href="#missing"/><foreignObject><div xmlns="http://www.w3.org/1999/xhtml">Bad</div></foreignObject>'))
    expect(scene.hiddenCount).toBe(1)
    expect(scene.nodes).toHaveLength(2)
    expect(scene.nodes.every(n => n.findings.length > 0)).toBe(true)
  })
  it('rejects malformed XML, duplicate IDs, DTD, file limits and invalid viewports', () => {
    for (const s of ['<svg>', '<!DOCTYPE svg><svg/>', wrap('<g id="x"/><g id="x"/>'), '<svg width="0" height="2"/>']) expect(() => parseDisplaySvg(s)).toThrow()
    expect(() => validateSvgFile({ name: 'x.svg', type: '', size: 3 * 1024 * 1024 })).toThrow(/2 MiB/)
    expect(() => validateSvgFile({ name: 'x.html', type: 'text/html', size: 10 })).toThrow(/Choose/)
    expect(parseDisplaySvg('<svg/>', 's', { width: 100, height: 30 }).viewport.width).toBe(100)
  })
  it('cancels chunked traversal without returning partial output', async () => {
    const abort = new AbortController()
    const pending = readDisplaySvg(wrap('<rect width="1" height="1"/>'.repeat(80)), 'many', abort.signal)
    abort.abort()
    await expect(pending).rejects.toThrow()
  })
  it('uses a stable luminance mapping while preserving alpha and black paint', () => {
    expect(svgColour('white')).toEqual({ shade: 15, alpha: 1 })
    expect(svgColour('black')).toEqual({ shade: 0, alpha: 1 })
    expect(svgColour('none')).toBeNull()
    expect(svgColour('#fff8')?.alpha).toBeCloseTo(8 / 15)
    expect(svgColour('rgb(100%,0%,0%)')?.shade).toBe(3)
    expect(() => svgColour('url(x)')).toThrow()
  })
})

describe('SVG normalization regression cases', () => {
  it('does not treat a line as a filled shape, and accounts for text anchors', () => {
    const scene = parseDisplaySvg(wrap('<line x1="2" y1="2" x2="5" y2="2" stroke="white"/><text x="50" y="20" text-anchor="end" font-size="10">Test</text>'))
    expect(scene.nodes[0]?.style.fill).toBe('none')
    expect(scene.nodes[1]?.bounds.x).toBe(26)
  })
  it('blocks oversized labels before glyph rasterization and invalid supplied dimensions', () => {
    const scene = parseDisplaySvg(wrap(`<text>${'x'.repeat(513)}</text>`))
    expect(scene.nodes[0]?.text).toBeUndefined()
    expect(scene.nodes[0]?.findings[0]?.message).toContain('512')
    expect(() => parseDisplaySvg('<svg/>', 'test', { width: NaN, height: 64 })).toThrow(/positive/)
  })
  it('resolves absolute units and viewBox meet/slice/none without ignoring unsupported CSS', () => {
    const scene = parseDisplaySvg('<svg xmlns="http://www.w3.org/2000/svg" width="1in" height="1in" viewBox="0 0 48 24"><rect width="48" height="24"/></svg>')
    expect(scene.nodes[0]?.bounds).toEqual({ x: 0, y: 24, width: 96, height: 48 })
    const none = parseDisplaySvg('<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 48 24" preserveAspectRatio="none"><rect width="48" height="24"/></svg>')
    expect(none.nodes[0]?.bounds).toEqual({ x: 0, y: 0, width: 96, height: 96 })
    const css = parseDisplaySvg(wrap('<style>g rect {fill:white}</style><rect width="4" height="4"/>'))
    expect(css.findings[0]?.severity).toBe('blocked')
  })
  it('stops reference cycles and deep source nesting with actionable findings', () => {
    const scene = parseDisplaySvg(wrap('<defs><g id="a"><use href="#a"/></g></defs><use href="#a"/>'))
    expect(scene.nodes[0]?.findings.some(f => f.message.includes('cyclic'))).toBe(true)
    expect(() => parseDisplaySvg(wrap('<g>'.repeat(65) + '<rect/>' + '</g>'.repeat(65)))).toThrow(/nesting/)
  })
})

it('measures actual curve extrema and resolves inherited percentage font sizes', () => {
  const scene = parseDisplaySvg(wrap('<path fill="none" stroke="white" d="M0 0Q50 100 100 0"/><g font-size="50%"><text x="10" y="20">Label</text></g>'))
  expect(scene.nodes[0]?.bounds).toEqual({ x: 0, y: 0, width: 100, height: 50 })
  expect(scene.nodes[1]?.text?.size).toBe(8)
})
