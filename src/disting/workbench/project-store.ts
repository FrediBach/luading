import {
  createScriptProject,
  allocateProjectFilename,
  cloneProject,
  normalizeEditorView,
  sortProjectsByRecent,
  type ActiveDocumentRef,
  type EditorViewSnapshot,
  type ProjectStoreMetadata,
  type ScriptProject,
} from './projects'
import {
  equivalentBackupProject,
  importedFilename,
  type ProjectBackupV1,
} from './project-backup'

export type PersistenceErrorKind =
  | 'unavailable'
  | 'quota'
  | 'permission'
  | 'blocked'
  | 'serialization'
  | 'conflict'
  | 'unknown'

export class ProjectPersistenceError extends Error {
  readonly kind: PersistenceErrorKind

  constructor(kind: PersistenceErrorKind, message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'ProjectPersistenceError'
    this.kind = kind
  }
}

export interface ProjectWorkspaceSnapshot {
  projects: ScriptProject[]
  metadata: ProjectStoreMetadata
  quarantinedCount: number
}

export interface ProjectSaveRequest {
  projectId: string
  expectedRevision: number
  source: string
  modules: Record<string, string>
  filename: string
  now: number
  conflictId: string
}

export type ProjectSaveResult =
  | { kind: 'saved'; project: ScriptProject }
  | { kind: 'conflict'; project: ScriptProject; storedProject: ScriptProject }

export interface ProjectMetadataRequest {
  projectId: string
  now: number
  filename?: string
  editorView?: EditorViewSnapshot
}

export interface ProjectBackupImportResult {
  created: ScriptProject[]
  skipped: number
  renamed: number
}

export interface ProjectStore {
  hydrate(): Promise<ProjectWorkspaceSnapshot>
  createProject(project: ScriptProject): Promise<ScriptProject>
  saveProject(change: ProjectSaveRequest): Promise<ProjectSaveResult>
  updateProjectMetadata(change: ProjectMetadataRequest): Promise<ScriptProject>
  duplicateProject(projectId: string, filename: string, id: string, now: number): Promise<ScriptProject>
  softDeleteProject(projectId: string, now: number): Promise<ActiveDocumentRef | undefined>
  restoreProject(projectId: string): Promise<ScriptProject>
  setActiveDocument(active: ActiveDocumentRef): Promise<void>
  importBackup(backup: ProjectBackupV1, id: () => string, now: number): Promise<ProjectBackupImportResult>
  close(): void
}

export class MemoryProjectStore implements ProjectStore {
  protected projects = new Map<string, ScriptProject>()
  protected metadata: ProjectStoreMetadata = { key: 'workspace' }

  constructor(snapshot?: Partial<ProjectWorkspaceSnapshot>) {
    for (const project of snapshot?.projects ?? []) this.projects.set(project.id, cloneProject(project))
    if (snapshot?.metadata) this.metadata = { ...snapshot.metadata }
  }

  async hydrate(): Promise<ProjectWorkspaceSnapshot> {
    return {
      projects: [...this.projects.values()].map(cloneProject),
      metadata: { ...this.metadata },
      quarantinedCount: 0,
    }
  }

  async createProject(project: ScriptProject): Promise<ScriptProject> {
    if (this.projects.has(project.id)) {
      throw new ProjectPersistenceError('conflict', `Project ${project.id} already exists.`)
    }
    const stored = cloneProject(project)
    this.projects.set(stored.id, stored)
    this.metadata = { key: 'workspace', activeDocument: { kind: 'project', projectId: stored.id } }
    return cloneProject(stored)
  }

  async saveProject(change: ProjectSaveRequest): Promise<ProjectSaveResult> {
    const current = this.projects.get(change.projectId)
    if (!current || current.deletedAt !== undefined) {
      throw new ProjectPersistenceError('unknown', `Project ${change.projectId} is unavailable.`)
    }
    if (current.revision !== change.expectedRevision) {
      const conflict = createScriptProject({
        id: change.conflictId,
        filename: allocateProjectFilename(`${change.filename.slice(0, -4)} conflict.lua`, [...this.projects.values()]),
        source: change.source,
        modules: change.modules,
        origin: { kind: 'duplicate', projectId: current.id },
        now: change.now,
      })
      this.projects.set(conflict.id, conflict)
      this.metadata = { key: 'workspace', activeDocument: { kind: 'project', projectId: conflict.id } }
      return { kind: 'conflict', project: cloneProject(conflict), storedProject: cloneProject(current) }
    }
    const saved: ScriptProject = {
      ...current,
      filename: change.filename,
      source: change.source,
      modules: { ...change.modules },
      updatedAt: change.now,
      lastOpenedAt: change.now,
      revision: current.revision + 1,
    }
    this.projects.set(saved.id, saved)
    return { kind: 'saved', project: cloneProject(saved) }
  }

  async updateProjectMetadata(change: ProjectMetadataRequest): Promise<ScriptProject> {
    const current = this.projects.get(change.projectId)
    if (!current || current.deletedAt !== undefined) {
      throw new ProjectPersistenceError('unknown', `Project ${change.projectId} is unavailable.`)
    }
    const updated: ScriptProject = {
      ...current,
      ...(change.filename ? { filename: change.filename } : {}),
      ...(change.editorView ? { editorView: normalizeEditorView(change.editorView) } : {}),
      lastOpenedAt: change.now,
    }
    this.projects.set(updated.id, updated)
    return cloneProject(updated)
  }

  async duplicateProject(projectId: string, filename: string, id: string, now: number): Promise<ScriptProject> {
    const source = this.projects.get(projectId)
    if (!source || source.deletedAt !== undefined) {
      throw new ProjectPersistenceError('unknown', `Project ${projectId} is unavailable.`)
    }
    return this.createProject(createScriptProject({
      id,
      filename,
      source: source.source,
      modules: source.modules,
      origin: { kind: 'duplicate', projectId },
      now,
    }))
  }

  async softDeleteProject(projectId: string, now: number): Promise<ActiveDocumentRef | undefined> {
    const current = this.projects.get(projectId)
    if (!current) throw new ProjectPersistenceError('unknown', `Project ${projectId} is unavailable.`)
    this.projects.set(projectId, { ...current, deletedAt: now })
    const fallback = sortProjectsByRecent([...this.projects.values()])[0]
    this.metadata = {
      key: 'workspace',
      ...(fallback ? { activeDocument: { kind: 'project', projectId: fallback.id } as const } : {}),
    }
    return this.metadata.activeDocument
  }

  async restoreProject(projectId: string): Promise<ScriptProject> {
    const current = this.projects.get(projectId)
    if (!current) throw new ProjectPersistenceError('unknown', `Project ${projectId} is unavailable.`)
    const restored = { ...current }
    delete restored.deletedAt
    this.projects.set(projectId, restored)
    return cloneProject(restored)
  }

  async setActiveDocument(active: ActiveDocumentRef): Promise<void> {
    this.metadata = { key: 'workspace', activeDocument: { ...active } }
  }

  async importBackup(backup: ProjectBackupV1, id: () => string, now: number): Promise<ProjectBackupImportResult> {
    const working = [...this.projects.values()].map(cloneProject)
    const created: ScriptProject[] = []
    let skipped = 0
    let renamed = 0
    for (const item of backup.projects) {
      const collision = working.find((project) => project.id === item.id)
      if (collision && equivalentBackupProject(item, collision)) {
        skipped += 1
        continue
      }
      let projectId = collision ? id() : item.id
      while (working.some((project) => project.id === projectId)) projectId = id()
      const filename = importedFilename(item, working)
      if (filename !== item.filename) renamed += 1
      const project: ScriptProject = {
        id: projectId,
        filename,
        source: item.source,
        modules: { ...item.modules },
        origin: { ...item.origin },
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
        lastOpenedAt: now,
        revision: 1,
      }
      working.push(project)
      created.push(project)
    }
    for (const project of created) this.projects.set(project.id, cloneProject(project))
    return { created: created.map(cloneProject), skipped, renamed }
  }

  close(): void {}
}

export function persistenceError(cause: unknown, fallback: string): ProjectPersistenceError {
  if (cause instanceof ProjectPersistenceError) return cause
  const name = cause instanceof DOMException ? cause.name : ''
  const kind: PersistenceErrorKind = name === 'QuotaExceededError'
    ? 'quota'
    : name === 'SecurityError' || name === 'NotAllowedError'
      ? 'permission'
      : name === 'DataCloneError'
        ? 'serialization'
        : 'unknown'
  const detail = cause instanceof Error ? cause.message : String(cause)
  return new ProjectPersistenceError(kind, `${fallback}: ${detail}`, { cause })
}
