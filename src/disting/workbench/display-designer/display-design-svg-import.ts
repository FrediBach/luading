import { activeDisplayDesignScreen, addDisplayDesignScreen, cloneDisplayDesign, createEmptyDisplayDesignSelection, createSequentialDisplayDesignIdFactory, type DisplayDesignDocument, type DisplayDesignSelection } from './display-design-model'
import { serializeDisplayDesign } from './display-design-file'
import { compileDisplayDesign } from './display-design-compiler'
import { generateDisplayDesignLua } from './display-design-generator'
import type { SvgConversion, SvgImportOptions, SvgScene } from './display-design-svg-model'

export function unresolvedSvgFindings(conversion: SvgConversion, options: SvgImportOptions) {
  return conversion.findings.filter(f => f.severity === 'blocked' || (f.severity === 'review' && !options.accepted.includes(f.id) && !(options.keepClipped && f.id.endsWith(':text-fit'))))
}
export type SvgImportResult = { ok: true; document: DisplayDesignDocument; selection: DisplayDesignSelection; drawCalls: number; sourceBytes: number } | { ok: false; message: string }
/** Revalidates the entire current draft; the conversion and original document stay untouched. */
export function materializeSvgImport(document: DisplayDesignDocument, scene: SvgScene, conversion: SvgConversion, options: SvgImportOptions): SvgImportResult {
  const unresolved = unresolvedSvgFindings(conversion, options)
  if (unresolved.length) return { ok: false, message: `Resolve ${unresolved.length} import finding${unresolved.length === 1 ? '' : 's'} before inserting.` }
  if (!conversion.elements.length) return { ok: false, message: 'No drawable elements remain.' }
  const used = new Set<string>()
  const collect = (value: unknown) => { if (!value || typeof value !== 'object') return; for (const [key, item] of Object.entries(value)) { if (key === 'id' && typeof item === 'string') used.add(item); else if (typeof item === 'object') collect(item) } }
  collect(document)
  const sequence = createSequentialDisplayDesignIdFactory('svg-import')
  const ids: typeof sequence = (scope) => { let id = sequence(scope); while (used.has(id)) id = sequence(scope); used.add(id); return id }
  let next = cloneDisplayDesign(document)
  if (options.newScreen) next = addDisplayDesignScreen(next, ids, scene.name.slice(0, 80)).document
  const screenId = activeDisplayDesignScreen(next).id, groupIds = new Map<string, string>(), sourceForElement = new Map<string, string>()
  for (const [sourceId, elements] of Object.entries(conversion.sourceMap)) for (const id of elements) sourceForElement.set(id, sourceId)
  const elements = conversion.elements.map(element => {
    const sourceId = sourceForElement.get(element.id), source = scene.nodes.find(n => n.id === sourceId)
    const key = source?.groups.at(-1) ?? (sourceId && (conversion.sourceMap[sourceId]?.length ?? 0) > 1 ? sourceId : undefined)
    let groupId: string | undefined
    if (key) { groupId = groupIds.get(key); if (!groupId) { groupId = ids('group'); groupIds.set(key, groupId); next.groups.push({ id: groupId, name: (scene.groups.find(g => g.id === key)?.name ?? source?.name ?? scene.name).slice(0, 80), screenId }) } }
    return { ...cloneDisplayDesign(element), id: ids('element'), screenId, ...(groupId ? { groupId } : {}) }
  })
  next.elements.push(...elements)
  const serialized = serializeDisplayDesign(next)
  if (!serialized.ok) return { ok: false, message: serialized.findings?.map(f => f.message).join(' ') || serialized.message }
  const generated = generateDisplayDesignLua(serialized.document)
  if (!generated.ok) return { ok: false, message: 'The imported design cannot generate Lua. Resolve its validation findings.' }
  return { ok: true, document: serialized.document, selection: { ...createEmptyDisplayDesignSelection(), elementIds: elements.map(e => e.id) }, drawCalls: compileDisplayDesign(serialized.document).commands.length, sourceBytes: generated.generatedUtf8Bytes }
}
