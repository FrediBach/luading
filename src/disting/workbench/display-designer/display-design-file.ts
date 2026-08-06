import {
  DISPLAY_DESIGN_LIMITS,
  type DisplayDesignDocumentV1,
  type DisplayDesignerFinding,
} from './display-design-model'
import { validateDisplayDesign } from './display-design-validation'

export const DISPLAY_DESIGN_FILE_SUFFIX = '.luading-display.json' as const

export interface DisplayDesignFileMetadata {
  name: string
  type: string
  size: number
}

export type DisplayDesignFileFailureCode =
  | 'invalid-file-type'
  | 'file-too-large'
  | 'invalid-json'
  | 'invalid-document'
  | 'serialization-failed'

export interface DisplayDesignFileFailure {
  ok: false
  code: DisplayDesignFileFailureCode
  message: string
  findings?: DisplayDesignerFinding[]
}

export interface SerializedDisplayDesign {
  ok: true
  text: string
  bytes: number
  fileName: string
  document: DisplayDesignDocumentV1
}

export interface ParsedDisplayDesign {
  ok: true
  document: DisplayDesignDocumentV1
  findings: DisplayDesignerFinding[]
  bytes: number
}

export type SerializeDisplayDesignResult = SerializedDisplayDesign | DisplayDesignFileFailure
export type ParseDisplayDesignResult = ParsedDisplayDesign | DisplayDesignFileFailure

function utf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength
}

function isJsonMimeType(type: string): boolean {
  const mimeType = type.split(';', 1)[0]?.trim().toLowerCase() ?? ''
  return /^(?:application|text)\/(?:[a-z0-9!#$&^_.+-]+\+)?json$/u.test(mimeType)
}

export function validateDisplayDesignFileMetadata(
  metadata: DisplayDesignFileMetadata,
): DisplayDesignFileFailure | undefined {
  const supportedName = metadata.name.toLowerCase().endsWith(DISPLAY_DESIGN_FILE_SUFFIX)
  if (!supportedName && !isJsonMimeType(metadata.type)) {
    return {
      ok: false,
      code: 'invalid-file-type',
      message: `Choose a ${DISPLAY_DESIGN_FILE_SUFFIX} file or a file with a JSON media type.`,
    }
  }
  if (!Number.isFinite(metadata.size) || metadata.size < 0 || metadata.size > DISPLAY_DESIGN_LIMITS.maximumJsonBytes) {
    return {
      ok: false,
      code: 'file-too-large',
      message: `Display design files must be no larger than ${DISPLAY_DESIGN_LIMITS.maximumJsonBytes} bytes.`,
    }
  }
  return undefined
}

export function sanitizeDisplayDesignFileName(name: string): string {
  const withoutSuffix = name.normalize('NFC').replace(new RegExp(`${DISPLAY_DESIGN_FILE_SUFFIX.replaceAll('.', '\\.')}$`, 'iu'), '')
  const withoutControls = [...withoutSuffix].map((character) => {
    const codePoint = character.codePointAt(0) ?? 0
    return codePoint < 32 || codePoint === 127 ? '-' : character
  }).join('')
  let base = withoutControls
    .replace(/[/\\:*?"<>|]+/gu, '-')
    .replace(/\s+/gu, ' ')
    .replace(/-+/gu, '-')
    .replace(/^[.\s-]+|[.\s-]+$/gu, '')
  base = [...base].slice(0, DISPLAY_DESIGN_LIMITS.maximumNameCodePoints).join('').replace(/[.\s-]+$/gu, '')
  if (!base) base = 'Untitled display'
  if (/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu.test(base)) base = `_${base}`
  return `${base}${DISPLAY_DESIGN_FILE_SUFFIX}`
}

export function serializeDisplayDesign(value: unknown): SerializeDisplayDesignResult {
  try {
    const validation = validateDisplayDesign(value)
    if (!validation.ok || !validation.document) {
      return {
        ok: false,
        code: 'invalid-document',
        message: 'Repair the display design errors before downloading it.',
        findings: validation.findings,
      }
    }
    const text = `${JSON.stringify(validation.document, null, 2)}\n`
    const bytes = utf8ByteLength(text)
    if (bytes > DISPLAY_DESIGN_LIMITS.maximumJsonBytes) {
      return {
        ok: false,
        code: 'file-too-large',
        message: `The normalized display design exceeds ${DISPLAY_DESIGN_LIMITS.maximumJsonBytes} UTF-8 bytes.`,
      }
    }
    return {
      ok: true,
      text,
      bytes,
      fileName: sanitizeDisplayDesignFileName(validation.document.name),
      document: validation.document,
    }
  } catch {
    return {
      ok: false,
      code: 'serialization-failed',
      message: 'The display design could not be serialized safely.',
    }
  }
}

export function parseDisplayDesignText(text: string): ParseDisplayDesignResult {
  try {
    const bytes = utf8ByteLength(text)
    if (bytes > DISPLAY_DESIGN_LIMITS.maximumJsonBytes) {
      return {
        ok: false,
        code: 'file-too-large',
        message: `Display design files must be no larger than ${DISPLAY_DESIGN_LIMITS.maximumJsonBytes} UTF-8 bytes.`,
      }
    }
    let value: unknown
    try {
      value = JSON.parse(text) as unknown
    } catch {
      return { ok: false, code: 'invalid-json', message: 'The selected file does not contain valid JSON.' }
    }
    const validation = validateDisplayDesign(value)
    if (!validation.ok || !validation.document) {
      return {
        ok: false,
        code: 'invalid-document',
        message: validation.findings.find(({ severity }) => severity === 'error')?.message
          ?? 'The selected file is not a valid display design.',
        findings: validation.findings,
      }
    }
    return { ok: true, document: validation.document, findings: validation.findings, bytes }
  } catch {
    return { ok: false, code: 'invalid-document', message: 'The selected display design could not be inspected safely.' }
  }
}
