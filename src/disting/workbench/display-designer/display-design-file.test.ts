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
  createDefaultDisplayPrimitive,
  createEmptyDisplayDesign,
  createSequentialDisplayDesignIdFactory,
} from './display-design-model'

describe('display design files', () => {
  it('serializes normalized documents byte-for-byte with stable ordering and a trailing newline', () => {
    const ids = createSequentialDisplayDesignIdFactory('file')
    const document = {
      ...createEmptyDisplayDesign('Envelope UI'),
      displayMode: 'full-screen' as const,
      elements: [createDefaultDisplayPrimitive('pixel-line', ids)],
    }
    const result = serializeDisplayDesign(document)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.fileName).toBe(`Envelope UI${DISPLAY_DESIGN_FILE_SUFFIX}`)
    expect(result.text).toBe(`{
  "kind": "luading-display-design",
  "version": 1,
  "name": "Envelope UI",
  "displayMode": "full-screen",
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
      }
    }
  ],
  "groups": [],
  "bindings": [],
  "symbols": []
}
`)
    expect(result.bytes).toBe(new TextEncoder().encode(result.text).byteLength)
  })

  it('round trips rich documents into defensive normalized values', () => {
    const ids = createSequentialDisplayDesignIdFactory('roundtrip')
    const document = {
      ...createEmptyDisplayDesign('Round trip'),
      bindings: [{ kind: 'text' as const, id: ids('binding'), name: 'Label', luaName: 'label', previewValue: 'Grüße' }],
      elements: [createDefaultDisplayPrimitive('smooth-circle', ids)],
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

  it('rejects malformed, oversized, unknown-version, and invalid documents without throwing', () => {
    expect(parseDisplayDesignText('{')).toMatchObject({ ok: false, code: 'invalid-json' })
    expect(parseDisplayDesignText('x'.repeat(DISPLAY_DESIGN_LIMITS.maximumJsonBytes + 1))).toMatchObject({ ok: false, code: 'file-too-large' })
    expect(parseDisplayDesignText(JSON.stringify({ ...createEmptyDisplayDesign(), version: 2 }))).toMatchObject({
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
