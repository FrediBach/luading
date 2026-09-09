import { SVG_IMPORT_LIMITS, type SvgScene } from './display-design-svg-model'
import { normalizeSvg } from './display-design-svg-normalize'

export function validateSvgFile(file: Pick<File, 'name' | 'size' | 'type'>): void {
  if (!file.name.toLowerCase().endsWith('.svg') && file.type.split(';')[0] !== 'image/svg+xml') throw new Error('Choose an SVG (.svg) file.')
  if (!Number.isFinite(file.size) || file.size < 0 || file.size > SVG_IMPORT_LIMITS.bytes) throw new Error('SVG files must be at most 2 MiB. Export only the desired artboard or group.')
}
export function svgDocument(text: string): Element {
  if (new TextEncoder().encode(text).length > SVG_IMPORT_LIMITS.bytes) throw new Error('SVG files must be at most 2 MiB. Export a smaller selection.')
  if (/<!\s*(DOCTYPE|ENTITY)/iu.test(text)) throw new Error('SVG document types and entity declarations are not supported. Export plain SVG.')
  const xml = new DOMParser().parseFromString(text, 'image/svg+xml')
  if (xml.querySelector('parsererror') || xml.documentElement.localName !== 'svg') throw new Error('This file is not valid SVG XML.')
  if ([...xml.childNodes].some(n => n.nodeType === 7 && n.nodeName !== 'xml')) throw new Error('External processing instructions are unsupported. Export plain SVG.')
  return xml.documentElement
}
export function parseDisplaySvg(text: string, name = 'Imported SVG', dimensions?: { width: number; height: number }): SvgScene {
  const iterator = normalizeSvg(svgDocument(text), name, dimensions)
  let step = iterator.next()
  while (!step.done) step = iterator.next()
  return step.value
}
export async function readDisplaySvg(text: string, name: string, signal: AbortSignal, dimensions?: { width: number; height: number }): Promise<SvgScene> {
  signal.throwIfAborted()
  const iterator = normalizeSvg(svgDocument(text), name, dimensions)
  let step = iterator.next()
  while (!step.done) {
    await new Promise<void>(resolve => setTimeout(resolve, 0)); signal.throwIfAborted(); step = iterator.next()
  }
  signal.throwIfAborted(); return step.value
}
