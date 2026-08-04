import {
  allocateProjectFilename,
  cloneModules,
  type ScriptProject,
  type ScriptProjectOrigin,
} from './projects'
import { luaDownloadFilename } from './script-file'

export const PROJECT_BACKUP_FORMAT = 'luading-project-backup'
export const PROJECT_BACKUP_VERSION = 1
export const PROJECT_BACKUP_MAX_BYTES = 10 * 1024 * 1024

export interface ProjectBackupItem {
  id: string
  filename: string
  source: string
  modules: Record<string, string>
  origin: ScriptProjectOrigin
  createdAt: number
  updatedAt: number
}

export interface ProjectBackupV1 {
  format: typeof PROJECT_BACKUP_FORMAT
  version: typeof PROJECT_BACKUP_VERSION
  exportedAt: string
  projects: ProjectBackupItem[]
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function validOrigin(value: unknown): value is ScriptProjectOrigin {
  if (!record(value)) return false
  return value.kind === 'new' || value.kind === 'import' || value.kind === 'recovery'
    || (value.kind === 'bundled' && typeof value.exampleId === 'string')
    || (value.kind === 'duplicate' && typeof value.projectId === 'string')
}

function validItem(value: unknown): value is ProjectBackupItem {
  return record(value)
    && typeof value.id === 'string' && value.id.length > 0
    && typeof value.filename === 'string' && luaDownloadFilename(value.filename) === value.filename
    && typeof value.source === 'string'
    && record(value.modules)
    && Object.entries(value.modules).every(([key, source]) => key.length > 0 && typeof source === 'string')
    && validOrigin(value.origin)
    && typeof value.createdAt === 'number' && Number.isFinite(value.createdAt) && value.createdAt >= 0
    && typeof value.updatedAt === 'number' && Number.isFinite(value.updatedAt) && value.updatedAt >= 0
}

export function createProjectBackup(projects: ScriptProject[], now: number): ProjectBackupV1 {
  return {
    format: PROJECT_BACKUP_FORMAT,
    version: PROJECT_BACKUP_VERSION,
    exportedAt: new Date(now).toISOString(),
    projects: projects
      .filter((project) => project.deletedAt === undefined)
      .sort((left, right) => left.filename.localeCompare(right.filename) || left.id.localeCompare(right.id))
      .map((project) => ({
        id: project.id,
        filename: project.filename,
        source: project.source,
        modules: cloneModules(project.modules),
        origin: { ...project.origin },
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
      })),
  }
}

export function serializeProjectBackup(backup: ProjectBackupV1): string {
  return `${JSON.stringify(backup, null, 2)}\n`
}

export function parseProjectBackup(source: string): ProjectBackupV1 {
  const withoutBom = source.startsWith('\uFEFF') ? source.slice(1) : source
  if (new TextEncoder().encode(withoutBom).byteLength > PROJECT_BACKUP_MAX_BYTES) {
    throw new Error('The backup is larger than the supported 10 MB limit.')
  }
  let value: unknown
  try {
    value = JSON.parse(withoutBom)
  } catch {
    throw new Error('The selected file is not valid JSON.')
  }
  if (!record(value) || value.format !== PROJECT_BACKUP_FORMAT) {
    throw new Error('This is not a Luading project backup.')
  }
  if (value.version !== PROJECT_BACKUP_VERSION) {
    throw new Error(`Backup version ${String(value.version)} is not supported.`)
  }
  if (typeof value.exportedAt !== 'string' || !Number.isFinite(Date.parse(value.exportedAt))) {
    throw new Error('The backup export timestamp is invalid.')
  }
  if (!Array.isArray(value.projects) || value.projects.length > 10_000) {
    throw new Error('The backup project list is invalid or too large.')
  }
  if (!value.projects.every(validItem)) {
    throw new Error('The backup contains an invalid project record.')
  }
  if (new Set(value.projects.map((project) => project.id)).size !== value.projects.length) {
    throw new Error('The backup contains duplicate project IDs.')
  }
  return {
    format: PROJECT_BACKUP_FORMAT,
    version: PROJECT_BACKUP_VERSION,
    exportedAt: value.exportedAt,
    projects: value.projects.map((project) => ({
      ...project,
      modules: cloneModules(project.modules),
      origin: { ...project.origin },
    })),
  }
}

export function equivalentBackupProject(item: ProjectBackupItem, project: ScriptProject): boolean {
  return item.source === project.source
    && JSON.stringify(Object.entries(item.modules).sort()) === JSON.stringify(Object.entries(project.modules).sort())
}

export function importedFilename(item: ProjectBackupItem, projects: ScriptProject[]): string {
  return allocateProjectFilename(item.filename, projects)
}
