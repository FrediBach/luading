import { describe, expect, it } from 'vitest'
import {
  DISPLAY_DESIGN_FILE_SUFFIX,
  parseDisplayDesignText,
  sanitizeDisplayDesignFileName,
  serializeDisplayDesign,
  validateDisplayDesignFileMetadata,
} from './display-design-file'
import {
  DISPLAY_DESIGN_LIMITS,
  addDisplayDesignElement,
  createDefaultDisplayPrimitive,
  createEmptyDisplayDesign,
  createSequentialDisplayDesignIdFactory,
} from './display-design-model'

function legacyDocument(document: object, version: 1 | 2 | 3 | 4 | 5 | 6): Record<string, unknown> {
  const legacy = structuredClone(document) as unknown as Record<string, unknown>
  delete legacy.screens
  delete legacy.activeScreenId
  legacy.version = version
  legacy.elements = (legacy.elements as Array<Record<string, unknown>>).map((element) => {
    const copy = { ...element }
    delete copy.screenId
    return copy
  })
  legacy.groups = (legacy.groups as Array<Record<string, unknown>>).map((group) => {
    const copy = { ...group }
    delete copy.screenId
    return copy
  })
  return legacy
}

describe('display design files', () => {
  it('serializes normalized documents byte-for-byte with stable ordering and a trailing newline', () => {
    const ids = createSequentialDisplayDesignIdFactory('file')
    const document = addDisplayDesignElement({
      ...createEmptyDisplayDesign('Envelope UI'),
      displayMode: 'full-screen' as const,
    }, createDefaultDisplayPrimitive('pixel-line', ids))
    const result = serializeDisplayDesign(document)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.fileName).toBe(`Envelope UI${DISPLAY_DESIGN_FILE_SUFFIX}`)
    expect(result.text).toBe(`{
  "kind": "luading-display-design",
  "version": 7,
  "name": "Envelope UI",
  "displayMode": "full-screen",
  "screens": [
    {
      "id": "display-screen-1",
      "name": "Screen 1"
    }
  ],
  "activeScreenId": "display-screen-1",
  "elements": [
    {
      "id": "file-element-1",
      "name": "Pixel line",
      "shade": {
        "kind": "literal",
        "value": 15
      },
      "visible": {
        "kind": "visible"
      },
      "kind": "line",
      "smooth": false,
      "x1": {
        "kind": "literal",
        "value": 8
      },
      "y1": {
        "kind": "literal",
        "value": 16
      },
      "x2": {
        "kind": "literal",
        "value": 32
      },
      "y2": {
        "kind": "literal",
        "value": 16
      },
      "screenId": "display-screen-1"
    }
  ],
  "groups": [],
  "tokens": [],
  "bindings": [],
  "symbols": [],
  "layoutGrid": null
}
`)
    expect(result.bytes).toBe(new TextEncoder().encode(result.text).byteLength)
  })

  it('migrates version-1 files without making them invalid and always serializes version 7', () => {
    const current = createEmptyDisplayDesign('Legacy')
    const legacy = legacyDocument(current, 1)
    delete legacy.layoutGrid
    delete legacy.tokens
    const parsed = parseDisplayDesignText(JSON.stringify(legacy))

    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.migratedFromVersion).toBe(1)
    expect(parsed.document).toEqual(current)

    const serialized = serializeDisplayDesign(parsed.document)
    expect(serialized.ok).toBe(true)
    if (!serialized.ok) return
    expect(JSON.parse(serialized.text)).toMatchObject({ version: 7, tokens: [], layoutGrid: null, screens: [{ name: 'Screen 1' }] })
  })

  it('migrates version-2 numeric binding endpoints into current static scalars', () => {
    const ids = createSequentialDisplayDesignIdFactory('v2')
    const line = createDefaultDisplayPrimitive('pixel-line', ids)
    const bindingId = ids('binding')
    const legacy = legacyDocument({
      ...createEmptyDisplayDesign('Version 2'),
      elements: [{ ...line, x1: { kind: 'number-binding', bindingId, from: 4, to: 20, quantize: 'integer' } }],
      bindings: [{ kind: 'number', id: bindingId, name: 'Position', luaName: 'position', previewValue: 0.5 }],
    }, 2)
    delete legacy.tokens
    const parsed = parseDisplayDesignText(JSON.stringify(legacy))
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.migratedFromVersion).toBe(2)
    expect(parsed.document.version).toBe(7)
    expect(parsed.document.elements[0]).toMatchObject({
      x1: { kind: 'number-binding', from: { kind: 'literal', value: 4 }, to: { kind: 'literal', value: 20 } },
    })
  })

  it('migrates version-4 pixel boxes and writes canonical version-7 polygons', () => {
    const ids = createSequentialDisplayDesignIdFactory('v4')
    const pixelBox = createDefaultDisplayPrimitive('pixel-box', ids)
    const legacy = legacyDocument({ ...createEmptyDisplayDesign('Version 4'), elements: [pixelBox] }, 4)
    const parsed = parseDisplayDesignText(JSON.stringify(legacy))
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.migratedFromVersion).toBe(4)
    expect(parsed.document.version).toBe(7)
    expect(parsed.document.elements[0]).toEqual({ ...pixelBox, screenId: 'display-screen-1' })

    const polygon = createDefaultDisplayPrimitive('polygon', ids)
    const serialized = serializeDisplayDesign({ ...parsed.document, elements: [polygon] })
    expect(serialized.ok).toBe(true)
    if (!serialized.ok) return
    const stored = JSON.parse(serialized.text) as { elements: Array<Record<string, unknown>> }
    expect(Object.keys(stored.elements[0]!)).toEqual([
      'id', 'name', 'shade', 'visible', 'kind', 'x', 'y', 'radius', 'sides', 'screenId',
    ])
  })

  it('migrates version-5 polygons and writes canonical version-7 Bézier curves', () => {
    const ids = createSequentialDisplayDesignIdFactory('v5')
    const polygon = createDefaultDisplayPrimitive('polygon', ids)
    const legacy = legacyDocument({ ...createEmptyDisplayDesign('Version 5'), elements: [polygon] }, 5)
    const parsed = parseDisplayDesignText(JSON.stringify(legacy))
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.migratedFromVersion).toBe(5)
    expect(parsed.document.version).toBe(7)
    expect(parsed.document.elements[0]).toEqual({ ...polygon, screenId: 'display-screen-1' })

    const bezier = createDefaultDisplayPrimitive('bezier', ids)
    const serialized = serializeDisplayDesign({ ...parsed.document, elements: [bezier] })
    expect(serialized.ok).toBe(true)
    if (!serialized.ok) return
    const stored = JSON.parse(serialized.text) as { elements: Array<Record<string, unknown>> }
    expect(Object.keys(stored.elements[0]!)).toEqual([
      'id', 'name', 'shade', 'visible', 'kind', 'points', 'segments', 'screenId',
    ])
  })

  it('migrates version-6 Bézier designs into one named screen', () => {
    const ids = createSequentialDisplayDesignIdFactory('v6')
    const bezier = createDefaultDisplayPrimitive('bezier', ids)
    const legacy = legacyDocument({ ...createEmptyDisplayDesign('Version 6'), elements: [bezier] }, 6)
    const parsed = parseDisplayDesignText(JSON.stringify(legacy))

    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.migratedFromVersion).toBe(6)
    expect(parsed.document).toMatchObject({
      version: 7,
      screens: [{ id: 'display-screen-1', name: 'Screen 1' }],
      activeScreenId: 'display-screen-1',
      elements: [{ kind: 'bezier', screenId: 'display-screen-1' }],
    })
  })

  it('round trips rich documents into defensive normalized values', () => {
    const ids = createSequentialDisplayDesignIdFactory('roundtrip')
    const document = {
      ...createEmptyDisplayDesign('Round trip'),
      bindings: [{ kind: 'text' as const, id: ids('binding'), name: 'Label', luaName: 'label', previewValue: 'Grüße' }],
      elements: [{ ...createDefaultDisplayPrimitive('smooth-circle', ids), screenId: 'display-screen-1' }],
    }
    const serialized = serializeDisplayDesign(document)
    expect(serialized.ok).toBe(true)
    if (!serialized.ok) return
    const parsed = parseDisplayDesignText(serialized.text)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.document).toEqual(document)
    expect(parsed.document).not.toBe(document)
    expect(parsed.findings.map(({ ruleId }) => ruleId)).toContain('approximate-smoothing')
  })

  it('pins canonical version-7 root, token, and AST key order', () => {
    const ids = createSequentialDisplayDesignIdFactory('canonical-token')
    const token = { id: ids('token'), name: 'Bar width', luaName: 'bar_width', value: 12 }
    const box = createDefaultDisplayPrimitive('filled-box', ids)
    box.x2 = { kind: 'token-expression', expression: {
      kind: 'binary', operator: 'subtract', left: { kind: 'token', tokenId: token.id }, right: { kind: 'number', value: 1 },
    } }
    const result = serializeDisplayDesign({ ...createEmptyDisplayDesign(), tokens: [token], elements: [box] })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const parsed = JSON.parse(result.text) as Record<string, unknown>
    expect(Object.keys(parsed)).toEqual(['kind', 'version', 'name', 'displayMode', 'screens', 'activeScreenId', 'elements', 'groups', 'tokens', 'bindings', 'symbols', 'layoutGrid'])
    expect(Object.keys((parsed.tokens as Array<Record<string, unknown>>)[0]!)).toEqual(['id', 'name', 'luaName', 'value'])
    const expression = (((parsed.elements as Array<Record<string, unknown>>)[0]!.x2 as Record<string, unknown>).expression as Record<string, unknown>)
    expect(Object.keys(expression)).toEqual(['kind', 'operator', 'left', 'right'])
    expect(Object.keys(expression.left as Record<string, unknown>)).toEqual(['kind', 'tokenId'])
  })

  it('rejects malformed, oversized, unknown-version, and invalid documents without throwing', () => {
    expect(parseDisplayDesignText('{')).toMatchObject({ ok: false, code: 'invalid-json' })
    expect(parseDisplayDesignText('x'.repeat(DISPLAY_DESIGN_LIMITS.maximumJsonBytes + 1))).toMatchObject({ ok: false, code: 'file-too-large' })
    expect(parseDisplayDesignText(JSON.stringify({ ...createEmptyDisplayDesign(), version: 8 }))).toMatchObject({
      ok: false,
      code: 'invalid-document',
      findings: [{ ruleId: 'unsupported-version' }],
    })
    expect(parseDisplayDesignText(JSON.stringify({ ...createEmptyDisplayDesign(), extra: true }))).toMatchObject({
      ok: false,
      code: 'invalid-document',
      findings: [{ ruleId: 'unknown-key' }],
    })
    expect(() => serializeDisplayDesign(new Proxy({}, { ownKeys: () => { throw new Error('hostile') } }))).not.toThrow()
  })

  it('validates the file suffix, JSON media types, and byte size before reading', () => {
    expect(validateDisplayDesignFileMetadata({ name: 'design.luading-display.json', type: '', size: 10 })).toBeUndefined()
    expect(validateDisplayDesignFileMetadata({ name: 'design.data', type: 'application/vnd.example+json; charset=utf-8', size: 10 })).toBeUndefined()
    expect(validateDisplayDesignFileMetadata({ name: 'design.json', type: 'text/plain', size: 10 })).toMatchObject({ code: 'invalid-file-type' })
    expect(validateDisplayDesignFileMetadata({ name: 'design.luading-display.json', type: '', size: DISPLAY_DESIGN_LIMITS.maximumJsonBytes + 1 })).toMatchObject({ code: 'file-too-large' })
  })

  it('sanitizes unsafe, repeated, reserved, empty, and long download names', () => {
    expect(sanitizeDisplayDesignFileName(' Envelope/UI:*? ')).toBe(`Envelope-UI${DISPLAY_DESIGN_FILE_SUFFIX}`)
    expect(sanitizeDisplayDesignFileName('../..')).toBe(`Untitled display${DISPLAY_DESIGN_FILE_SUFFIX}`)
    expect(sanitizeDisplayDesignFileName('CON')).toBe(`_CON${DISPLAY_DESIGN_FILE_SUFFIX}`)
    expect(sanitizeDisplayDesignFileName(`Panel${DISPLAY_DESIGN_FILE_SUFFIX}`)).toBe(`Panel${DISPLAY_DESIGN_FILE_SUFFIX}`)
    expect([...sanitizeDisplayDesignFileName('a'.repeat(100)).replace(DISPLAY_DESIGN_FILE_SUFFIX, '')]).toHaveLength(DISPLAY_DESIGN_LIMITS.maximumNameCodePoints)
  })
})
