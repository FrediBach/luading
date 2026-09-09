// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { parseDisplaySvg } from './display-design-svg-file'
import { convertDisplaySvg } from './display-design-svg-convert'
import { DEFAULT_SVG_IMPORT_OPTIONS, type SvgImportOptions } from './display-design-svg-model'
import { createEmptyDisplayDesign } from './display-design-model'
import { materializeSvgImport } from './display-design-svg-import'
import { renderDisplayTestPixels } from '../../testing/display-pixel-test-environment'
import { compileDisplayDesign } from './display-design-compiler'
import { generateDisplayDesignLua } from './display-design-generator'
import { parseDisplayDesignText, serializeDisplayDesign } from './display-design-file'
import { createDistingLuaTestEngine } from '../../testing/lua-test-environment'
import { DistingDisplayApi } from '../../emulation/display-api'
import { loadLuaProgramRuntime } from '../../emulation/lua-runtime'
const wrap = (s: string, box = '0 0 256 64') => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${box}">${s}</svg>`
const options = (partial: Partial<SvgImportOptions> = {}): SvgImportOptions => ({ ...DEFAULT_SVG_IMPORT_OPTIONS, ...partial })
const engines: Awaited<ReturnType<typeof createDistingLuaTestEngine>>[] = []
afterEach(() => { vi.unstubAllGlobals(); for (const lua of engines.splice(0)) lua.global.close() })

describe('SVG conversion and code handoff', () => {
  it('selects native primitives and keeps inclusive one-pixel fill bounds', () => {
    const scene = parseDisplaySvg(wrap('<rect x="2" y="3" width="1" height="1" fill="white"/><circle cx="20" cy="20" r="5" fill="none" stroke="white"/><line x1="2" y1="10" x2="8" y2="10" stroke="white"/>'))
    const result = convertDisplaySvg(scene, options(), 'full-screen')
    expect(result.elements.map(e => e.kind)).toEqual(['box', 'circle', 'line'])
    expect(result.elements[0]).toMatchObject({ x1: { value: 2 }, y1: { value: 3 }, x2: { value: 2 }, y2: { value: 3 } })
  })
  it('fits a 1024px design uniformly and preserves parameter-line space', () => {
    const scene = parseDisplaySvg(wrap('<rect width="1024" height="256" fill="white"/>', '0 0 1024 256'))
    expect(convertDisplaySvg(scene, options({ fit: 'artwork' }), 'full-screen').scale).toBe(.25)
    const result = convertDisplaySvg(scene, options({ fit: 'artwork' }), 'parameter-line')
    expect(result.scale).toBe(54 / 256)
    expect(result.bounds.y).toBe(10)
    expect(result.findings.some(f => f.id === 'document:clipping')).toBe(false)
  })
  it('retains even-odd holes as unpainted space instead of black pixel-box backgrounds', () => {
    const scene = parseDisplaySvg(wrap('<path fill="white" fill-rule="evenodd" d="M2 2H10V10H2Z M4 4H8V8H4Z"/>'))
    const result = convertDisplaySvg(scene, options(), 'full-screen')
    expect(result.elements.every(e => e.kind === 'box')).toBe(true)
    const covers = (x: number, y: number) => result.elements.some(e => e.kind === 'box' && e.x1.kind === 'literal' && e.x2.kind === 'literal' && e.y1.kind === 'literal' && e.y2.kind === 'literal' && x >= e.x1.value && x <= e.x2.value && y >= e.y1.value && y <= e.y2.value)
    expect(covers(3, 3)).toBe(true); expect(covers(5, 5)).toBe(false)
  })
  it('matches native text after scaling, and exposes missing glyphs and awkward transforms', () => {
    const scene = parseDisplaySvg(wrap('<text x="10" y="20" font-size="6" fill="white">Tiny</text><text x="40" y="20" font-size="8" fill="white">Standard</text><text x="10" y="40" transform="rotate(5)" fill="white">😀</text>'))
    const result = convertDisplaySvg(scene, options(), 'full-screen')
    expect(result.elements[0]).toMatchObject({ kind: 'text', tiny: true, y: { value: 20 } })
    expect(result.elements[1]).toMatchObject({ kind: 'text', tiny: false })
    expect(result.findings.some(f => f.id.endsWith(':glyphs'))).toBe(true)
    expect(result.findings.some(f => f.id.endsWith(':text-transform'))).toBe(true)
  })
  it('requires decisions for wide strokes and clipping, and rejects opacity', () => {
    const scene = parseDisplaySvg(wrap('<rect width="400" height="4" fill="white"/><line y1="10" x2="20" y2="10" stroke="white" stroke-width="5"/><rect width="4" height="4" fill-opacity=".5"/>'))
    const result = convertDisplaySvg(scene, options(), 'full-screen')
    expect(result.findings.some(f => f.id === 'document:clipping' && f.severity === 'blocked')).toBe(true)
    expect(result.findings.some(f => f.id.endsWith(':stroke-width') && f.severity === 'review')).toBe(true)
    expect(result.findings.some(f => f.id.endsWith(':fill-opacity') && f.severity === 'blocked')).toBe(true)
  })
  it('materializes collision-safe editable layers, preserves the draft, and survives JSON without SVG', () => {
    const scene = parseDisplaySvg(wrap('<g id="Meter"><rect x="2" y="12" width="20" height="4" fill="white"/><text x="2" y="24" font-size="8" fill="white">Level</text></g>'))
    const opts = options(), converted = convertDisplaySvg(scene, opts, 'parameter-line')
    opts.accepted = converted.findings.filter(f => f.severity === 'review').map(f => f.id)
    const original = createEmptyDisplayDesign(), before = JSON.stringify(original)
    const first = materializeSvgImport(original, scene, converted, opts)
    expect(first.ok).toBe(true); if (!first.ok) return
    const second = materializeSvgImport(first.document, scene, converted, opts)
    expect(second.ok).toBe(true); if (!second.ok) return
    expect(new Set(second.document.elements.map(e => e.id)).size).toBe(4)
    expect(JSON.stringify(original)).toBe(before)
    const file = serializeDisplayDesign(second.document)
    expect(file.ok).toBe(true); if (!file.ok) return
    expect(file.text).not.toContain('viewBox')
    expect(parseDisplayDesignText(file.text)).toMatchObject({ ok: true })
  })
  it('executes imported curves, fills and escaped native text through production Lua', async () => {
    const scene = parseDisplaySvg(wrap('<path fill="none" stroke="white" d="M2 15Q10 25 20 15"/><rect x="2" y="30" width="8" height="5" fill="white"/><text x="20" y="40" font-size="8" fill="white">A &quot; B \\ C</text>'))
    const opts = options(), converted = convertDisplaySvg(scene, opts, 'full-screen')
    opts.accepted = converted.findings.filter(f => f.severity === 'review').map(f => f.id)
    const imported = materializeSvgImport({ ...createEmptyDisplayDesign(), displayMode: 'full-screen' }, scene, converted, opts)
    expect(imported.ok).toBe(true); if (!imported.ok) return
    const generated = generateDisplayDesignLua(imported.document)
    expect(generated.ok).toBe(true); if (!generated.ok) return
    vi.stubGlobal('document', undefined); vi.stubGlobal('location', undefined)
    const lua = await createDistingLuaTestEngine(50); engines.push(lua)
    const display = new DistingDisplayApi(); display.register(lua.global)
    const runtime = await loadLuaProgramRuntime(lua, `return {${generated.source}}`)
    display.reset(); expect(runtime.draw?.()).toBe(true)
    expect(display.commands).toEqual(compileDisplayDesign(imported.document).commands)
    expect(renderDisplayTestPixels(display.commands)).toEqual(renderDisplayTestPixels(compileDisplayDesign(imported.document).commands))
    runtime.close?.()
  })
})

describe('SVG conversion regression cases', () => {
  it('clips only after explicit acceptance, and keeps native boundary lines in bounds', () => {
    const scene = parseDisplaySvg(wrap('<line x1="0" y1="0" x2="255" y2="0" stroke="white"/>'))
    const result = convertDisplaySvg(scene, options(), 'full-screen')
    expect(result.findings.some(f => f.severity === 'blocked' || f.severity === 'review')).toBe(false)
    const clipped = parseDisplaySvg(wrap('<rect x="250" y="12" width="12" height="5" fill="white"/>'))
    expect(materializeSvgImport(createEmptyDisplayDesign(), clipped, convertDisplaySvg(clipped, options(), 'parameter-line'), options()).ok).toBe(false)
    expect(materializeSvgImport(createEmptyDisplayDesign(), clipped, convertDisplaySvg(clipped, options({ keepClipped: true }), 'parameter-line'), options({ keepClipped: true })).ok).toBe(true)
  })
  it('splits explicitly edited line breaks into native labels without embedding a newline glyph', () => {
    const scene = parseDisplaySvg(wrap('<text x="10" y="20" font-size="8" fill="white">Label</text>'))
    const id = scene.nodes[0]!.id, opts = options({ overrides: { [id]: { text: 'One\nTwo', splitLines: true, font: 'standard' } } })
    const result = convertDisplaySvg(scene, opts, 'full-screen')
    expect(result.elements).toHaveLength(2)
    expect(result.elements[1]).toMatchObject({ kind: 'text', text: { value: 'Two' }, y: { value: 28 } })
    expect(result.findings.some(f => f.id.endsWith(':glyphs'))).toBe(false)
  })
  it('enforces aggregate limits with existing content and never partially inserts', () => {
    const scene = parseDisplaySvg(wrap('<rect x="2" y="12" width="1" height="1" fill="white"/>'))
    const converted = convertDisplaySvg(scene, options(), 'parameter-line')
    const document = createEmptyDisplayDesign()
    document.elements = Array.from({ length: 512 }, (_, i) => ({ ...converted.elements[0]!, id: `existing-${i}` }))
    const before = JSON.stringify(document), result = materializeSvgImport(document, scene, converted, options({ newScreen: true }))
    expect(result.ok).toBe(false); expect(JSON.stringify(document)).toBe(before)
    if (!result.ok) expect(result.message).toContain('512')
  })
  it('selects groups without losing ancestor transforms and distinguishes viewport fit from artwork fit', () => {
    const scene = parseDisplaySvg(wrap('<g id="Icon" transform="translate(100 100)"><rect width="8" height="8" fill="white"/></g><rect width="1024" height="1"/>', '0 0 4096 4096'))
    const groupId = scene.groups[0]!.id
    const art = convertDisplaySvg(scene, options({ groupId, fit: 'artwork' }), 'full-screen'), page = convertDisplaySvg(scene, options({ groupId, fit: 'viewport' }), 'full-screen')
    expect(art.sourceCount).toBe(1); expect(art.scale).toBe(8); expect(page.scale).toBe(64 / 4096)
  })
  it('does not replace a self-crossing polygon with a regular outline', () => {
    const scene = parseDisplaySvg(wrap('<polygon points="20,10 20,30 10,20 30,20" fill="none" stroke="white"/>'))
    expect(convertDisplaySvg(scene, options(), 'full-screen').elements.some(e => e.kind === 'polygon')).toBe(false)
  })
  it('preserves nonzero fill holes with reverse winding and opaque black knockouts', () => {
    const scene = parseDisplaySvg(wrap('<path fill="black" d="M2 12H12V22H2Z M4 14V20H10V14Z"/>'))
    const result = convertDisplaySvg(scene, options(), 'full-screen')
    expect(result.elements.every(e => e.kind === 'box' && e.shade.kind === 'literal' && e.shade.value === 0)).toBe(true)
    expect(result.elements.some(e => e.kind === 'box' && e.x1.kind === 'literal' && e.x2.kind === 'literal' && e.y1.kind === 'literal' && e.y2.kind === 'literal' && e.x1.value <= 6 && e.x2.value >= 6 && e.y1.value <= 16 && e.y2.value >= 16)).toBe(false)
  })
})


it('keeps imported native text bindable and preserves parameter-line callback behavior', async () => {
  const scene = parseDisplaySvg(wrap('<text x="10" y="24" font-size="8" fill="white">Label</text>'))
  const opts = options(), converted = convertDisplaySvg(scene, opts, 'parameter-line')
  opts.accepted = converted.findings.filter(f => f.severity === 'review').map(f => f.id)
  const imported = materializeSvgImport(createEmptyDisplayDesign(), scene, converted, opts)
  expect(imported.ok).toBe(true); if (!imported.ok) return
  imported.document.bindings.push({ id: 'label-state', kind: 'text', name: 'Label value', luaName: 'label_value', previewValue: 'Connected' })
  const text = imported.document.elements[0]!
  if (text.kind !== 'text') throw new Error('Expected native text')
  text.text = { kind: 'text-binding', bindingId: 'label-state' }
  const generated = generateDisplayDesignLua(imported.document)
  expect(generated.ok).toBe(true); if (!generated.ok) return
  expect(generated.source).toContain('label_value')
  vi.stubGlobal('document', undefined); vi.stubGlobal('location', undefined)
  const lua = await createDistingLuaTestEngine(50); engines.push(lua)
  const display = new DistingDisplayApi(); display.register(lua.global)
  const runtime = await loadLuaProgramRuntime(lua, `return {${generated.source}}`)
  display.reset(); expect(runtime.draw?.()).toBeNull()
  expect(display.commands).toEqual(compileDisplayDesign(imported.document).commands)
  expect(display.commands[0]).toMatchObject({ kind: 'text', text: 'Connected' })
  runtime.close?.()
})

it('fits outline endpoints inside the inclusive display pixel boundary', () => {
  const scene = parseDisplaySvg(wrap('<rect width="1024" height="256" fill="none" stroke="white"/>', '0 0 1024 256'))
  const result = convertDisplaySvg(scene, options({ fit: 'artwork' }), 'full-screen')
  expect(result.findings.some(f => f.id === 'document:clipping')).toBe(false)
  expect(result.bounds.x + result.bounds.width).toBeLessThanOrEqual(256)
  expect(result.bounds.y + result.bounds.height).toBeLessThanOrEqual(64)
})

it('retains stroke-only text as a reviewable native replacement and flags overlapping labels', () => {
  const scene = parseDisplaySvg(wrap('<text x="10" y="20" font-size="2" fill="none" stroke="white">AAAA</text><text x="16" y="20" font-size="2" fill="white">BBBB</text>'))
  const result = convertDisplaySvg(scene, options(), 'full-screen')
  expect(result.elements.filter(e => e.kind === 'text')).toHaveLength(2)
  expect(result.findings.some(f => f.id.endsWith(':text-stroke') && f.severity === 'review')).toBe(true)
  expect(result.findings.some(f => f.id.includes('text-overlap'))).toBe(true)
})
