import { luaDownloadFilename } from './script-file'

export type ScriptProjectOrigin =
  | { kind: 'new' }
  | { kind: 'import' }
  | { kind: 'bundled'; exampleId: string }
  | { kind: 'duplicate'; projectId: string }
  | { kind: 'recovery' }

export interface EditorViewSnapshot {
  line: number
  column: number
  scrollTop: number
  scrollLeft: number
}

export interface ScriptProject {
  id: string
  filename: string
  source: string
  modules: Record<string, string>
  origin: ScriptProjectOrigin
  createdAt: number
  updatedAt: number
  lastOpenedAt: number
  revision: number
  deletedAt?: number
  editorView?: EditorViewSnapshot
}

export type ActiveDocumentRef =
  | { kind: 'project'; projectId: string }
  | { kind: 'bundled'; exampleId: string }

export interface ProjectStoreMetadata {
  key: 'workspace'
  activeDocument?: ActiveDocumentRef
}

export type SourceSaveStatus =
  | { kind: 'template' }
  | { kind: 'saving' }
  | { kind: 'saved'; savedAt: number }
  | { kind: 'degraded'; recoverable: boolean; message: string }
  | { kind: 'unsaved'; message: string }
  | { kind: 'conflict'; conflictProjectId: string }

export interface ProjectTemplate {
  id: string
  filename: string
  source: string
  modules: Record<string, string>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function finiteNonNegative(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

export function cloneModules(value: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(value))
}

export function normalizeEditorView(value: EditorViewSnapshot): EditorViewSnapshot {
  return {
    line: Math.max(1, Math.floor(Number.isFinite(value.line) ? value.line : 1)),
    column: Math.max(1, Math.floor(Number.isFinite(value.column) ? value.column : 1)),
    scrollTop: Math.max(0, Number.isFinite(value.scrollTop) ? value.scrollTop : 0),
    scrollLeft: Math.max(0, Number.isFinite(value.scrollLeft) ? value.scrollLeft : 0),
  }
}

function validModules(value: unknown): value is Record<string, string> {
  return isRecord(value) && Object.entries(value).every(([key, source]) => (
    key.length > 0 && typeof source === 'string'
  ))
}

function parseOrigin(value: unknown): ScriptProjectOrigin | undefined {
  if (!isRecord(value) || typeof value.kind !== 'string') return undefined
  if (value.kind === 'new' || value.kind === 'import' || value.kind === 'recovery') {
    return { kind: value.kind }
  }
  if (value.kind === 'bundled' && typeof value.exampleId === 'string') {
    return { kind: 'bundled', exampleId: value.exampleId }
  }
  if (value.kind === 'duplicate' && typeof value.projectId === 'string') {
    return { kind: 'duplicate', projectId: value.projectId }
  }
  return undefined
}

function parseEditorView(value: unknown): EditorViewSnapshot | undefined {
  if (!isRecord(value)
    || !finiteNonNegative(value.line)
    || !finiteNonNegative(value.column)
    || !finiteNonNegative(value.scrollTop)
    || !finiteNonNegative(value.scrollLeft)) return undefined
  return normalizeEditorView(value as unknown as EditorViewSnapshot)
}

export function validateScriptProject(value: unknown): ScriptProject | undefined {
  if (!isRecord(value)
    || typeof value.id !== 'string' || value.id.length === 0
    || typeof value.filename !== 'string' || luaDownloadFilename(value.filename) !== value.filename
    || typeof value.source !== 'string'
    || !validModules(value.modules)
    || !finiteNonNegative(value.createdAt)
    || !finiteNonNegative(value.updatedAt)
    || !finiteNonNegative(value.lastOpenedAt)
    || !Number.isSafeInteger(value.revision) || (value.revision as number) < 1) return undefined
  const origin = parseOrigin(value.origin)
  if (!origin) return undefined
  if (value.deletedAt !== undefined && !finiteNonNegative(value.deletedAt)) return undefined
  const editorView = value.editorView === undefined ? undefined : parseEditorView(value.editorView)
  if (value.editorView !== undefined && !editorView) return undefined
  return {
    id: value.id,
    filename: value.filename,
    source: value.source,
    modules: cloneModules(value.modules),
    origin,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
    lastOpenedAt: value.lastOpenedAt,
    revision: value.revision as number,
    ...(value.deletedAt === undefined ? {} : { deletedAt: value.deletedAt as number }),
    ...(editorView ? { editorView } : {}),
  }
}

export function validateActiveDocument(value: unknown): ActiveDocumentRef | undefined {
  if (!isRecord(value)) return undefined
  if (value.kind === 'project' && typeof value.projectId === 'string') {
    return { kind: 'project', projectId: value.projectId }
  }
  if (value.kind === 'bundled' && typeof value.exampleId === 'string') {
    return { kind: 'bundled', exampleId: value.exampleId }
  }
  return undefined
}

export function cloneProject(project: ScriptProject): ScriptProject {
  return {
    ...project,
    modules: cloneModules(project.modules),
    origin: { ...project.origin },
    ...(project.editorView ? { editorView: { ...project.editorView } } : {}),
  }
}

export function allocateProjectFilename(suggestedName: string, projects: ScriptProject[]): string {
  const filename = luaDownloadFilename(suggestedName)
  const occupied = new Set(projects
    .filter((project) => project.deletedAt === undefined)
    .map((project) => project.filename.toLocaleLowerCase()))
  if (!occupied.has(filename.toLocaleLowerCase())) return filename
  const stem = filename.slice(0, -4)
  let suffix = 2
  while (occupied.has(`${stem} ${suffix}.lua`.toLocaleLowerCase())) suffix += 1
  return `${stem} ${suffix}.lua`
}

export function createScriptProject(input: {
  id: string
  filename: string
  source: string
  modules?: Record<string, string>
  origin: ScriptProjectOrigin
  now: number
}): ScriptProject {
  return {
    id: input.id,
    filename: luaDownloadFilename(input.filename),
    source: input.source,
    modules: cloneModules(input.modules ?? {}),
    origin: { ...input.origin },
    createdAt: input.now,
    updatedAt: input.now,
    lastOpenedAt: input.now,
    revision: 1,
  }
}

export function sortProjectsByRecent(projects: ScriptProject[]): ScriptProject[] {
  return projects
    .filter((project) => project.deletedAt === undefined)
    .map(cloneProject)
    .sort((left, right) => (
      right.lastOpenedAt - left.lastOpenedAt
      || left.filename.localeCompare(right.filename)
      || left.id.localeCompare(right.id)
    ))
}

export function resolveActiveDocument(
  projects: ScriptProject[],
  active: ActiveDocumentRef | undefined,
  hasTemplate: (id: string) => boolean,
  defaultTemplateId: string,
): ActiveDocumentRef {
  if (active?.kind === 'project'
    && projects.some((project) => project.id === active.projectId && project.deletedAt === undefined)) {
    return active
  }
  if (active?.kind === 'bundled' && hasTemplate(active.exampleId)) return active
  const recent = sortProjectsByRecent(projects)[0]
  return recent
    ? { kind: 'project', projectId: recent.id }
    : { kind: 'bundled', exampleId: defaultTemplateId }
}
