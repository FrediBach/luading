import {
  allocateProjectFilename,
  cloneProject,
  createScriptProject,
  normalizeEditorView,
  sortProjectsByRecent,
  validateActiveDocument,
  validateScriptProject,
  type ActiveDocumentRef,
  type ProjectStoreMetadata,
  type ScriptProject,
} from './projects'
import {
  equivalentBackupProject,
  importedFilename,
  type ProjectBackupV1,
} from './project-backup'
import {
  persistenceError,
  ProjectPersistenceError,
  type ProjectBackupImportResult,
  type ProjectMetadataRequest,
  type ProjectSaveRequest,
  type ProjectSaveResult,
  type ProjectStore,
  type ProjectWorkspaceSnapshot,
} from './project-store'

export const PROJECT_DATABASE_NAME = 'luading-workbench'
export const PROJECT_DATABASE_VERSION = 1

const PROJECTS = 'projects'
const METADATA = 'metadata'

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed.'))
  })
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction aborted.'))
    transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB transaction failed.'))
  })
}

function workspaceMetadata(value: unknown): ProjectStoreMetadata {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return { key: 'workspace' }
  const activeDocument = validateActiveDocument((value as Record<string, unknown>).activeDocument)
  return { key: 'workspace', ...(activeDocument ? { activeDocument } : {}) }
}

export class IndexedDbProjectStore implements ProjectStore {
  private database?: IDBDatabase
  private opening?: Promise<IDBDatabase>
  private readonly factory: IDBFactory
  private readonly onConnectionInvalidated?: () => void

  constructor(
    factory: IDBFactory,
    onConnectionInvalidated?: () => void,
  ) {
    this.factory = factory
    this.onConnectionInvalidated = onConnectionInvalidated
  }

  private open(): Promise<IDBDatabase> {
    if (this.database) return Promise.resolve(this.database)
    if (this.opening) return this.opening
    const opening = new Promise<IDBDatabase>((resolve, reject) => {
      let settled = false
      let request: IDBOpenDBRequest
      try {
        request = this.factory.open(PROJECT_DATABASE_NAME, PROJECT_DATABASE_VERSION)
      } catch (cause) {
        reject(persistenceError(cause, 'Could not open local project storage'))
        return
      }
      request.onupgradeneeded = () => {
        const database = request.result
        if (!database.objectStoreNames.contains(PROJECTS)) {
          const projects = database.createObjectStore(PROJECTS, { keyPath: 'id' })
          projects.createIndex('updatedAt', 'updatedAt')
          projects.createIndex('lastOpenedAt', 'lastOpenedAt')
          projects.createIndex('deletedAt', 'deletedAt')
        }
        if (!database.objectStoreNames.contains(METADATA)) {
          database.createObjectStore(METADATA, { keyPath: 'key' })
        }
      }
      request.onblocked = () => {
        if (settled) return
        settled = true
        reject(new ProjectPersistenceError(
          'blocked',
          'Another Luading tab is blocking the local project database upgrade. Close older tabs and reload.',
        ))
      }
      request.onerror = () => {
        if (settled) return
        settled = true
        reject(persistenceError(request.error, 'Could not open local project storage'))
      }
      request.onsuccess = () => {
        const database = request.result
        if (settled) {
          database.close()
          return
        }
        settled = true
        database.onversionchange = () => {
          database.close()
          if (this.database === database) this.database = undefined
          this.onConnectionInvalidated?.()
        }
        this.database = database
        resolve(database)
      }
    }).finally(() => {
      this.opening = undefined
    })
    this.opening = opening
    return opening
  }

  private async transaction<T>(
    stores: string[],
    mode: IDBTransactionMode,
    operation: (transaction: IDBTransaction) => Promise<T>,
  ): Promise<T> {
    try {
      const database = await this.open()
      const transaction = database.transaction(stores, mode)
      const done = transactionDone(transaction)
      try {
        const result = await operation(transaction)
        await done
        return result
      } catch (cause) {
        try {
          transaction.abort()
        } catch {
          // The transaction may already have rolled back or committed.
        }
        await done.catch(() => undefined)
        throw cause
      }
    } catch (cause) {
      throw persistenceError(cause, 'Local project storage failed')
    }
  }

  async hydrate(): Promise<ProjectWorkspaceSnapshot> {
    return this.transaction([PROJECTS, METADATA], 'readonly', async (transaction) => {
      const rawProjects = await requestResult(transaction.objectStore(PROJECTS).getAll())
      const projects: ScriptProject[] = []
      let quarantinedCount = 0
      for (const value of rawProjects) {
        const project = validateScriptProject(value)
        if (project) projects.push(project)
        else quarantinedCount += 1
      }
      const rawMetadata = await requestResult(transaction.objectStore(METADATA).get('workspace'))
      return { projects, metadata: workspaceMetadata(rawMetadata), quarantinedCount }
    })
  }

  async createProject(project: ScriptProject): Promise<ScriptProject> {
    return this.transaction([PROJECTS, METADATA], 'readwrite', async (transaction) => {
      const projects = transaction.objectStore(PROJECTS)
      if (await requestResult(projects.get(project.id))) {
        transaction.abort()
        throw new ProjectPersistenceError('conflict', `Project ${project.id} already exists.`)
      }
      const stored = cloneProject(project)
      projects.add(stored)
      transaction.objectStore(METADATA).put({
        key: 'workspace',
        activeDocument: { kind: 'project', projectId: stored.id },
      })
      return stored
    })
  }

  async saveProject(change: ProjectSaveRequest): Promise<ProjectSaveResult> {
    return this.transaction([PROJECTS, METADATA], 'readwrite', async (transaction) => {
      const projects = transaction.objectStore(PROJECTS)
      const current = validateScriptProject(await requestResult(projects.get(change.projectId)))
      if (!current || current.deletedAt !== undefined) {
        throw new ProjectPersistenceError('unknown', `Project ${change.projectId} is unavailable.`)
      }
      if (current.revision !== change.expectedRevision) {
        const all = (await requestResult(projects.getAll()))
          .map(validateScriptProject)
          .filter((project): project is ScriptProject => Boolean(project))
        const conflict = createScriptProject({
          id: change.conflictId,
          filename: allocateProjectFilename(`${change.filename.slice(0, -4)} conflict.lua`, all),
          source: change.source,
          modules: change.modules,
          origin: { kind: 'duplicate', projectId: current.id },
          now: change.now,
        })
        projects.add(conflict)
        transaction.objectStore(METADATA).put({
          key: 'workspace',
          activeDocument: { kind: 'project', projectId: conflict.id },
        })
        return { kind: 'conflict', project: conflict, storedProject: current }
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
      projects.put(saved)
      return { kind: 'saved', project: saved }
    })
  }

  async updateProjectMetadata(change: ProjectMetadataRequest): Promise<ScriptProject> {
    return this.transaction([PROJECTS], 'readwrite', async (transaction) => {
      const projects = transaction.objectStore(PROJECTS)
      const current = validateScriptProject(await requestResult(projects.get(change.projectId)))
      if (!current || current.deletedAt !== undefined) {
        throw new ProjectPersistenceError('unknown', `Project ${change.projectId} is unavailable.`)
      }
      const updated: ScriptProject = {
        ...current,
        ...(change.filename ? { filename: change.filename } : {}),
        ...(change.editorView ? { editorView: normalizeEditorView(change.editorView) } : {}),
        lastOpenedAt: change.now,
      }
      projects.put(updated)
      return updated
    })
  }

  async duplicateProject(projectId: string, filename: string, id: string, now: number): Promise<ScriptProject> {
    return this.transaction([PROJECTS, METADATA], 'readwrite', async (transaction) => {
      const projects = transaction.objectStore(PROJECTS)
      const source = validateScriptProject(await requestResult(projects.get(projectId)))
      if (!source || source.deletedAt !== undefined) {
        throw new ProjectPersistenceError('unknown', `Project ${projectId} is unavailable.`)
      }
      const duplicate = createScriptProject({
        id,
        filename,
        source: source.source,
        modules: source.modules,
        origin: { kind: 'duplicate', projectId },
        now,
      })
      projects.add(duplicate)
      transaction.objectStore(METADATA).put({
        key: 'workspace',
        activeDocument: { kind: 'project', projectId: duplicate.id },
      })
      return duplicate
    })
  }

  async softDeleteProject(projectId: string, now: number): Promise<ActiveDocumentRef | undefined> {
    return this.transaction([PROJECTS, METADATA], 'readwrite', async (transaction) => {
      const projects = transaction.objectStore(PROJECTS)
      const current = validateScriptProject(await requestResult(projects.get(projectId)))
      if (!current) throw new ProjectPersistenceError('unknown', `Project ${projectId} is unavailable.`)
      projects.put({ ...current, deletedAt: now })
      const all = (await requestResult(projects.getAll()))
        .map(validateScriptProject)
        .filter((project): project is ScriptProject => Boolean(project) && project?.id !== projectId)
      const fallback = sortProjectsByRecent(all)[0]
      const metadata = {
        key: 'workspace',
        ...(fallback ? { activeDocument: { kind: 'project', projectId: fallback.id } as const } : {}),
      }
      transaction.objectStore(METADATA).put(metadata)
      return metadata.activeDocument
    })
  }

  async restoreProject(projectId: string): Promise<ScriptProject> {
    return this.transaction([PROJECTS], 'readwrite', async (transaction) => {
      const projects = transaction.objectStore(PROJECTS)
      const current = validateScriptProject(await requestResult(projects.get(projectId)))
      if (!current) throw new ProjectPersistenceError('unknown', `Project ${projectId} is unavailable.`)
      const restored = { ...current }
      delete restored.deletedAt
      projects.put(restored)
      return restored
    })
  }

  async setActiveDocument(active: ActiveDocumentRef): Promise<void> {
    await this.transaction([METADATA], 'readwrite', async (transaction) => {
      transaction.objectStore(METADATA).put({ key: 'workspace', activeDocument: { ...active } })
    })
  }

  async importBackup(backup: ProjectBackupV1, id: () => string, now: number): Promise<ProjectBackupImportResult> {
    return this.transaction([PROJECTS], 'readwrite', async (transaction) => {
      const store = transaction.objectStore(PROJECTS)
      const working = (await requestResult(store.getAll()))
        .map(validateScriptProject)
        .filter((project): project is ScriptProject => Boolean(project))
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
        store.add(project)
        working.push(project)
        created.push(project)
      }
      return { created, skipped, renamed }
    })
  }

  close(): void {
    this.database?.close()
    this.database = undefined
  }
}

export function browserProjectStore(onConnectionInvalidated?: () => void): ProjectStore {
  if (typeof indexedDB === 'undefined') {
    throw new ProjectPersistenceError('unavailable', 'IndexedDB is not available in this browser context.')
  }
  return new IndexedDbProjectStore(indexedDB, onConnectionInvalidated)
}
