import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { browserProjectStore } from './indexeddb-project-store'
import {
  createProjectBackup,
  parseProjectBackup,
  serializeProjectBackup,
} from './project-backup'
import {
  clearRecoveryJournal,
  readRecoveryJournal,
  writeRecoveryJournal,
  type RecoveryStorage,
} from './project-recovery'
import {
  MemoryProjectStore,
  type ProjectBackupImportResult,
  type ProjectStore,
} from './project-store'
import {
  allocateProjectFilename,
  createScriptProject,
  normalizeEditorView,
  resolveActiveDocument,
  sortProjectsByRecent,
  type ActiveDocumentRef,
  type EditorViewSnapshot,
  type ProjectTemplate,
  type ScriptProject,
  type ScriptProjectOrigin,
  type SourceSaveStatus,
} from './projects'
import { NEW_DISTING_SCRIPT } from './script-file'
import {
  readStorageDurability,
  requestStorageDurability,
  type StorageDurability,
} from './storage-durability'

const SOURCE_DEBOUNCE_MS = 400
const VIEW_DEBOUNCE_MS = 1200

interface ActiveDocument {
  ref: ActiveDocumentRef
  key: string
  filename: string
  source: string
  modules: Record<string, string>
  editorView?: EditorViewSnapshot
  revision: number
}

export interface ProjectLibraryOptions {
  templates: Map<string, ProjectTemplate>
  defaultTemplate: ProjectTemplate
  createStore?: () => ProjectStore
  recoveryStorage?: RecoveryStorage
  now?: () => number
  id?: () => string
  sourceDebounceMs?: number
  viewDebounceMs?: number
  confirmDiscard?: (message: string) => boolean
  broadcastChannel?: (name: string) => BroadcastChannel
  storageManager?: StorageManager
}

export interface ProjectLibrary {
  hydrated: boolean
  projects: ScriptProject[]
  active: ActiveDocument
  saveStatus: SourceSaveStatus
  durability: StorageDurability
  notice?: string
  deletedProjectId?: string
  editSource(source: string): void
  updateModules(modules: Record<string, string>): void
  updateEditorView(view: EditorViewSnapshot): void
  flush(): Promise<void>
  selectTemplate(id: string): Promise<boolean>
  selectProject(id: string): Promise<boolean>
  createNew(input?: NewProjectInput): Promise<boolean>
  importScript(filename: string, source: string): Promise<boolean>
  rename(filename: string): Promise<boolean>
  duplicate(): Promise<boolean>
  deleteActive(): Promise<boolean>
  undoDelete(): Promise<boolean>
  backup(): Promise<string>
  restoreBackup(source: string): Promise<ProjectBackupImportResult>
  protectDrafts(): Promise<boolean | null>
}

export interface NewProjectInput {
  filename: string
  source: string
}

function defaultId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}

function templateDocument(template: ProjectTemplate): ActiveDocument {
  return {
    ref: { kind: 'bundled', exampleId: template.id },
    key: `bundled:${template.id}`,
    filename: template.filename,
    source: template.source,
    modules: { ...template.modules },
    revision: 0,
  }
}

function projectDocument(project: ScriptProject): ActiveDocument {
  return {
    ref: { kind: 'project', projectId: project.id },
    key: `project:${project.id}`,
    filename: project.filename,
    source: project.source,
    modules: { ...project.modules },
    ...(project.editorView ? { editorView: { ...project.editorView } } : {}),
    revision: project.revision,
  }
}

function failureMessage(cause: unknown): string {
  const detail = cause instanceof Error ? cause.message : String(cause)
  return `Durable local project storage is unavailable. ${detail}`
}

export function useProjectLibrary(options: ProjectLibraryOptions): ProjectLibrary {
  const initialOptionsRef = useRef(options)
  const nowRef = useRef(options.now ?? Date.now)
  const idRef = useRef(options.id ?? defaultId)
  const sourceDebounceRef = useRef(options.sourceDebounceMs ?? SOURCE_DEBOUNCE_MS)
  const viewDebounceRef = useRef(options.viewDebounceMs ?? VIEW_DEBOUNCE_MS)
  const [hydrated, setHydrated] = useState(false)
  const [projects, setProjects] = useState<ScriptProject[]>([])
  const [active, setActive] = useState<ActiveDocument>(() => templateDocument(options.defaultTemplate))
  const [saveStatus, setSaveStatus] = useState<SourceSaveStatus>({ kind: 'template' })
  const [notice, setNotice] = useState<string>()
  const [deletedProjectId, setDeletedProjectId] = useState<string>()
  const [durability, setDurability] = useState<StorageDurability>({ supported: false, persisted: null })
  const storeRef = useRef<ProjectStore | undefined>(undefined)
  const durableRef = useRef(true)
  const projectsRef = useRef<ScriptProject[]>([])
  const activeRef = useRef(active)
  const saveStatusRef = useRef(saveStatus)
  const dirtyRef = useRef(false)
  const sourceTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const viewTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const savingRef = useRef<Promise<void> | undefined>(undefined)
  const channelRef = useRef<BroadcastChannel | undefined>(undefined)

  const replaceProjects = useCallback((next: ScriptProject[]) => {
    projectsRef.current = next
    setProjects(next)
  }, [])

  const replaceActive = useCallback((next: ActiveDocument) => {
    activeRef.current = next
    setActive(next)
  }, [])

  const replaceSaveStatus = useCallback((next: SourceSaveStatus) => {
    saveStatusRef.current = next
    setSaveStatus(next)
  }, [])

  const recoveryStorage = options.recoveryStorage
    ?? (typeof localStorage === 'undefined' ? undefined : localStorage)

  const journalCurrent = useCallback((document = activeRef.current): boolean => (
    writeRecoveryJournal(recoveryStorage, {
      version: 1,
      document: document.ref,
      filename: document.filename,
      source: document.source,
      revision: document.revision + (dirtyRef.current ? 1 : 0),
      updatedAt: nowRef.current(),
      ...(document.ref.kind === 'bundled' ? { bundledExampleId: document.ref.exampleId } : {}),
    })
  ), [recoveryStorage])

  const preservePendingSource = useCallback(() => {
    const status = saveStatusRef.current.kind
    if (dirtyRef.current || status === 'saving' || status === 'degraded' || status === 'unsaved') {
      journalCurrent()
    }
  }, [journalCurrent])

  const performSave = useCallback(async (): Promise<void> => {
    if (savingRef.current) return savingRef.current
    const run = async () => {
      while (dirtyRef.current) {
        dirtyRef.current = false
        const snapshot = activeRef.current
        if (snapshot.ref.kind !== 'project') return
        const projectId = snapshot.ref.projectId
        const storedProject = projectsRef.current.find((project) => project.id === projectId)
        if (!storedProject) return
        try {
          const result = await storeRef.current?.saveProject({
            projectId: storedProject.id,
            expectedRevision: storedProject.revision,
            source: snapshot.source,
            modules: snapshot.modules,
            filename: snapshot.filename,
            now: nowRef.current(),
            conflictId: idRef.current(),
          })
          if (!result) throw new Error('No project store is active.')
          if (result.kind === 'conflict') {
            const nextProjects = [
              ...projectsRef.current.filter((project) => project.id !== result.project.id),
              result.project,
            ]
            replaceProjects(nextProjects)
            replaceActive(projectDocument(result.project))
            replaceSaveStatus({ kind: 'conflict', conflictProjectId: result.project.id })
            setNotice(`A newer revision was saved in another tab. Your work is in ${result.project.filename}.`)
            clearRecoveryJournal(recoveryStorage, Number.MAX_SAFE_INTEGER)
            return
          }
          const latest = activeRef.current
          const saved = result.project
          replaceProjects(projectsRef.current.map((project) => (
            project.id === saved.id
              ? {
                  ...saved,
                  source: latest.ref.kind === 'project' && latest.ref.projectId === saved.id
                    ? latest.source : saved.source,
                  modules: latest.ref.kind === 'project' && latest.ref.projectId === saved.id
                    ? { ...latest.modules } : saved.modules,
                }
              : project
          )))
          if (latest.ref.kind === 'project' && latest.ref.projectId === saved.id) {
            replaceActive({ ...latest, revision: saved.revision })
          }
          if (!durableRef.current) {
            replaceSaveStatus({
              kind: 'degraded',
              recoverable: journalCurrent(),
              message: 'IndexedDB is unavailable; this draft is only protected by browser recovery storage.',
            })
          } else if (!dirtyRef.current && activeRef.current.source === snapshot.source) {
            clearRecoveryJournal(recoveryStorage, saved.revision)
            replaceSaveStatus({ kind: 'saved', savedAt: nowRef.current() })
            channelRef.current?.postMessage({ projectId: saved.id, revision: saved.revision })
          }
        } catch (cause) {
          console.error('Luading project autosave failed.', cause)
          dirtyRef.current = true
          const recoverable = journalCurrent()
          replaceSaveStatus(recoverable
            ? { kind: 'degraded', recoverable: true, message: failureMessage(cause) }
            : { kind: 'unsaved', message: failureMessage(cause) })
          return
        }
      }
    }
    savingRef.current = run().finally(() => {
      savingRef.current = undefined
    })
    return savingRef.current
  }, [journalCurrent, recoveryStorage, replaceActive, replaceProjects, replaceSaveStatus])

  const scheduleSave = useCallback(() => {
    if (sourceTimerRef.current) clearTimeout(sourceTimerRef.current)
    sourceTimerRef.current = setTimeout(() => {
      sourceTimerRef.current = undefined
      void performSave()
    }, sourceDebounceRef.current)
  }, [performSave])

  const flush = useCallback(async () => {
    if (sourceTimerRef.current) clearTimeout(sourceTimerRef.current)
    sourceTimerRef.current = undefined
    await performSave()
    if (savingRef.current) await savingRef.current
  }, [performSave])

  const mayReplace = useCallback(async (): Promise<boolean> => {
    await flush()
    const status = saveStatusRef.current.kind
    const localDocumentAtRisk = activeRef.current.ref.kind === 'project'
      && (status === 'unsaved' || status === 'degraded')
    if (!localDocumentAtRisk) return true
    return options.confirmDiscard?.(
      'Durable project storage is unavailable. Export this source before continuing, or confirm to discard its browser-only protection.',
    ) ?? false
  }, [flush, options])

  useEffect(() => {
    let cancelled = false
    const hydrate = async () => {
      const initialOptions = initialOptionsRef.current
      let store: ProjectStore
      try {
        store = initialOptions.createStore?.() ?? browserProjectStore(() => {
          replaceSaveStatus({
            kind: 'degraded',
            recoverable: journalCurrent(),
            message: 'Local project storage changed in another tab. Reload Luading before continuing.',
          })
        })
        const snapshot = await store.hydrate()
        if (cancelled) {
          store.close()
          return
        }
        storeRef.current = store
        let nextProjects = snapshot.projects
        const journal = readRecoveryJournal(recoveryStorage)
        if (journal) {
          const journalDocument = journal.document
          const stored = journalDocument.kind === 'project'
            ? nextProjects.find((project) => project.id === journalDocument.projectId)
            : undefined
          const template = journalDocument.kind === 'bundled'
            ? initialOptions.templates.get(journalDocument.exampleId)
            : undefined
          const isNewer = stored
            ? journal.revision > stored.revision || journal.updatedAt > stored.updatedAt
            : template ? journal.source !== template.source : true
          if (isNewer) {
            const recovery = createScriptProject({
              id: idRef.current(),
              filename: allocateProjectFilename(
                `${journal.filename.slice(0, -4)} recovered.lua`,
                nextProjects,
              ),
              source: journal.source,
              modules: {},
              origin: { kind: 'recovery' },
              now: nowRef.current(),
            })
            await store.createProject(recovery)
            nextProjects = [...nextProjects, recovery]
            snapshot.metadata.activeDocument = { kind: 'project', projectId: recovery.id }
            clearRecoveryJournal(recoveryStorage, Number.MAX_SAFE_INTEGER)
            setNotice(`Recovered a newer browser draft as ${recovery.filename}.`)
          } else {
            clearRecoveryJournal(recoveryStorage, journal.revision)
          }
        }
        replaceProjects(nextProjects)
        const resolved = resolveActiveDocument(
          nextProjects,
          snapshot.metadata.activeDocument,
          (id) => initialOptions.templates.has(id) || id === initialOptions.defaultTemplate.id,
          initialOptions.defaultTemplate.id,
        )
        if (resolved.kind === 'project') {
          const project = nextProjects.find((item) => item.id === resolved.projectId)
          if (project) {
            replaceActive(projectDocument(project))
            replaceSaveStatus({ kind: 'saved', savedAt: project.updatedAt })
          }
        } else {
          replaceActive(templateDocument(initialOptions.templates.get(resolved.exampleId) ?? initialOptions.defaultTemplate))
          replaceSaveStatus({ kind: 'template' })
        }
        if (snapshot.quarantinedCount > 0) {
          setNotice(`${snapshot.quarantinedCount} malformed local project ${snapshot.quarantinedCount === 1 ? 'record was' : 'records were'} quarantined.`)
        }
      } catch (cause) {
        console.error('Luading local project hydration failed.', cause)
        durableRef.current = false
        store = new MemoryProjectStore()
        storeRef.current = store
        let nextProjects: ScriptProject[] = []
        const journal = readRecoveryJournal(recoveryStorage)
        if (journal) {
          const recovery = createScriptProject({
            id: idRef.current(),
            filename: `${journal.filename.slice(0, -4)} recovered.lua`,
            source: journal.source,
            modules: {},
            origin: { kind: 'recovery' },
            now: nowRef.current(),
          })
          await store.createProject(recovery)
          nextProjects = [recovery]
          replaceActive(projectDocument(recovery))
        }
        replaceProjects(nextProjects)
        replaceSaveStatus({
          kind: 'degraded',
          recoverable: Boolean(journal),
          message: failureMessage(cause),
        })
      } finally {
        if (!cancelled) setHydrated(true)
      }
    }
    void hydrate()
    return () => {
      cancelled = true
      if (sourceTimerRef.current) clearTimeout(sourceTimerRef.current)
      if (viewTimerRef.current) clearTimeout(viewTimerRef.current)
      preservePendingSource()
      void performSave().finally(() => storeRef.current?.close())
    }
  }, [
    journalCurrent,
    performSave,
    preservePendingSource,
    recoveryStorage,
    replaceActive,
    replaceProjects,
    replaceSaveStatus,
  ])

  useEffect(() => {
    const manager = options.storageManager
      ?? (typeof navigator === 'undefined' ? undefined : navigator.storage)
    void readStorageDurability(manager).then(setDurability)
  }, [options.storageManager])

  useEffect(() => {
    const createChannel = options.broadcastChannel
      ?? (typeof BroadcastChannel === 'undefined' ? undefined : (name: string) => new BroadcastChannel(name))
    if (!createChannel) return
    const channel = createChannel('luading-project-revisions')
    channelRef.current = channel
    channel.onmessage = (event: MessageEvent<unknown>) => {
      const value = event.data
      if (typeof value !== 'object' || value === null) return
      const { projectId, revision } = value as Record<string, unknown>
      const current = projectsRef.current.find((project) => project.id === projectId)
      if (current && typeof revision === 'number' && revision > current.revision && !dirtyRef.current) {
        setNotice(`${current.filename} changed in another tab. Reopen it to load the newer revision.`)
      }
    }
    return () => {
      channel.close()
      if (channelRef.current === channel) channelRef.current = undefined
    }
  }, [options.broadcastChannel])

  useEffect(() => {
    if (typeof document === 'undefined' || typeof window === 'undefined') return
    const handleVisibility = () => {
      if (document.hidden) {
        preservePendingSource()
        void flush()
      }
    }
    const handlePageHide = () => {
      preservePendingSource()
      void flush()
    }
    document.addEventListener('visibilitychange', handleVisibility)
    window.addEventListener('pagehide', handlePageHide)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility)
      window.removeEventListener('pagehide', handlePageHide)
    }
  }, [flush, preservePendingSource])

  const createOwnedProject = useCallback(async (
    filename: string,
    source: string,
    modules: Record<string, string>,
    origin: ScriptProjectOrigin,
  ): Promise<boolean> => {
    if (!await mayReplace()) return false
    const project = createScriptProject({
      id: idRef.current(),
      filename: allocateProjectFilename(filename, projectsRef.current),
      source,
      modules,
      origin,
      now: nowRef.current(),
    })
    replaceProjects([...projectsRef.current, project])
    replaceActive(projectDocument(project))
    journalCurrent(projectDocument(project))
    try {
      const stored = await storeRef.current?.createProject(project)
      if (!stored) throw new Error('No project store is active.')
      if (durableRef.current) {
        clearRecoveryJournal(recoveryStorage, stored.revision)
        replaceSaveStatus({ kind: 'saved', savedAt: nowRef.current() })
      } else {
        replaceSaveStatus({
          kind: 'degraded',
          recoverable: true,
          message: 'This project is available only for the current session; browser recovery storage is protecting the latest source.',
        })
      }
      return true
    } catch (cause) {
      console.error('Luading project creation failed.', cause)
      replaceSaveStatus(journalCurrent()
        ? { kind: 'degraded', recoverable: true, message: failureMessage(cause) }
        : { kind: 'unsaved', message: failureMessage(cause) })
      return true
    }
  }, [journalCurrent, mayReplace, recoveryStorage, replaceActive, replaceProjects, replaceSaveStatus])

  const editSource = useCallback((source: string) => {
    const current = activeRef.current
    if (current.ref.kind === 'bundled') {
      const project = createScriptProject({
        id: idRef.current(),
        filename: allocateProjectFilename(current.filename, projectsRef.current),
        source,
        modules: current.modules,
        origin: { kind: 'bundled', exampleId: current.ref.exampleId },
        now: nowRef.current(),
      })
      const document = projectDocument(project)
      replaceProjects([...projectsRef.current, project])
      replaceActive(document)
      replaceSaveStatus({ kind: 'saving' })
      journalCurrent(document)
      void storeRef.current?.createProject(project).then(() => {
        if (activeRef.current.ref.kind === 'project' && activeRef.current.ref.projectId === project.id) {
          if (durableRef.current) {
            clearRecoveryJournal(recoveryStorage, project.revision)
            replaceSaveStatus({ kind: 'saved', savedAt: nowRef.current() })
          } else {
            replaceSaveStatus({ kind: 'degraded', recoverable: true, message: 'IndexedDB is unavailable; the draft is session-only.' })
          }
        }
      }).catch((cause: unknown) => {
        console.error('Luading template fork failed.', cause)
        replaceSaveStatus(journalCurrent()
          ? { kind: 'degraded', recoverable: true, message: failureMessage(cause) }
          : { kind: 'unsaved', message: failureMessage(cause) })
      })
      return
    }
    const projectId = current.ref.projectId
    const next = { ...current, source }
    replaceActive(next)
    replaceProjects(projectsRef.current.map((project) => (
      project.id === projectId ? { ...project, source } : project
    )))
    dirtyRef.current = true
    replaceSaveStatus({ kind: 'saving' })
    journalCurrent(next)
    scheduleSave()
  }, [journalCurrent, recoveryStorage, replaceActive, replaceProjects, replaceSaveStatus, scheduleSave])

  const updateModules = useCallback((modules: Record<string, string>) => {
    const current = activeRef.current
    if (current.ref.kind !== 'project') return
    const projectId = current.ref.projectId
    const next = { ...current, modules: { ...modules } }
    replaceActive(next)
    replaceProjects(projectsRef.current.map((project) => (
      project.id === projectId ? { ...project, modules: { ...modules } } : project
    )))
    dirtyRef.current = true
    replaceSaveStatus({ kind: 'saving' })
    journalCurrent(next)
    scheduleSave()
  }, [journalCurrent, replaceActive, replaceProjects, replaceSaveStatus, scheduleSave])

  const updateEditorView = useCallback((view: EditorViewSnapshot) => {
    const current = activeRef.current
    if (current.ref.kind !== 'project') return
    const projectId = current.ref.projectId
    const normalized = normalizeEditorView(view)
    replaceActive({ ...current, editorView: normalized })
    if (viewTimerRef.current) clearTimeout(viewTimerRef.current)
    viewTimerRef.current = setTimeout(() => {
      viewTimerRef.current = undefined
      void storeRef.current?.updateProjectMetadata({
        projectId,
        editorView: normalized,
        now: nowRef.current(),
      }).then((saved) => {
        if (!saved) return
        replaceProjects(projectsRef.current.map((project) => project.id === saved.id ? saved : project))
      }).catch((cause: unknown) => console.error('Could not save editor view.', cause))
    }, viewDebounceRef.current)
  }, [replaceActive, replaceProjects])

  const openRef = useCallback(async (ref: ActiveDocumentRef): Promise<boolean> => {
    if (!await mayReplace()) return false
    if (ref.kind === 'bundled') {
      const template = options.templates.get(ref.exampleId) ?? (ref.exampleId === options.defaultTemplate.id ? options.defaultTemplate : undefined)
      if (!template) return false
      replaceActive(templateDocument(template))
      replaceSaveStatus({ kind: 'template' })
    } else {
      const project = projectsRef.current.find((item) => item.id === ref.projectId && item.deletedAt === undefined)
      if (!project) return false
      const opened = { ...project, lastOpenedAt: nowRef.current() }
      replaceProjects(projectsRef.current.map((item) => item.id === opened.id ? opened : item))
      replaceActive(projectDocument(opened))
      replaceSaveStatus(durableRef.current
        ? { kind: 'saved', savedAt: opened.updatedAt }
        : { kind: 'degraded', recoverable: true, message: 'IndexedDB is unavailable; changes are session-only.' })
      void storeRef.current?.updateProjectMetadata({ projectId: opened.id, now: opened.lastOpenedAt })
        .catch((cause: unknown) => console.error('Could not update last-opened time.', cause))
    }
    try {
      await storeRef.current?.setActiveDocument(ref)
    } catch (cause) {
      console.error('Could not remember the active document.', cause)
    }
    return true
  }, [mayReplace, options.defaultTemplate, options.templates, replaceActive, replaceProjects, replaceSaveStatus])

  const rename = useCallback(async (filename: string): Promise<boolean> => {
    await flush()
    const current = activeRef.current
    if (current.ref.kind !== 'project') return false
    const projectId = current.ref.projectId
    const normalized = allocateProjectFilename(
      filename,
      projectsRef.current.filter((project) => project.id !== projectId),
    )
    try {
      const saved = await storeRef.current?.updateProjectMetadata({
        projectId,
        filename: normalized,
        now: nowRef.current(),
      })
      if (!saved) return false
      replaceProjects(projectsRef.current.map((project) => project.id === saved.id ? saved : project))
      replaceActive({ ...current, filename: saved.filename })
      return true
    } catch (cause) {
      console.error('Could not rename project.', cause)
      setNotice(failureMessage(cause))
      return false
    }
  }, [flush, replaceActive, replaceProjects])

  const duplicate = useCallback(async (): Promise<boolean> => {
    if (!await mayReplace()) return false
    const current = activeRef.current
    if (current.ref.kind !== 'project') return false
    const projectId = current.ref.projectId
    const filename = allocateProjectFilename(
      `${current.filename.slice(0, -4)} copy.lua`,
      projectsRef.current,
    )
    try {
      const project = await storeRef.current?.duplicateProject(
        projectId,
        filename,
        idRef.current(),
        nowRef.current(),
      )
      if (!project) return false
      replaceProjects([...projectsRef.current, project])
      replaceActive(projectDocument(project))
      replaceSaveStatus(durableRef.current
        ? { kind: 'saved', savedAt: project.updatedAt }
        : { kind: 'degraded', recoverable: true, message: 'The copy is session-only.' })
      return true
    } catch (cause) {
      setNotice(failureMessage(cause))
      return false
    }
  }, [mayReplace, replaceActive, replaceProjects, replaceSaveStatus])

  const deleteActive = useCallback(async (): Promise<boolean> => {
    if (!await mayReplace()) return false
    const current = activeRef.current
    if (current.ref.kind !== 'project') return false
    const projectId = current.ref.projectId
    try {
      const fallback = await storeRef.current?.softDeleteProject(projectId, nowRef.current())
      const nextProjects = projectsRef.current.map((project) => (
        project.id === projectId ? { ...project, deletedAt: nowRef.current() } : project
      ))
      replaceProjects(nextProjects)
      setDeletedProjectId(projectId)
      if (fallback?.kind === 'project') {
        const project = nextProjects.find((item) => item.id === fallback.projectId)
        if (project) {
          replaceActive(projectDocument(project))
          replaceSaveStatus(durableRef.current
            ? { kind: 'saved', savedAt: project.updatedAt }
            : { kind: 'degraded', recoverable: true, message: 'This project is session-only.' })
          return true
        }
      }
      const defaultRef = { kind: 'bundled' as const, exampleId: options.defaultTemplate.id }
      replaceActive(templateDocument(options.defaultTemplate))
      replaceSaveStatus({ kind: 'template' })
      await storeRef.current?.setActiveDocument(defaultRef)
      return true
    } catch (cause) {
      setNotice(failureMessage(cause))
      return false
    }
  }, [mayReplace, options.defaultTemplate, replaceActive, replaceProjects, replaceSaveStatus])

  const undoDelete = useCallback(async (): Promise<boolean> => {
    if (!deletedProjectId) return false
    try {
      const restored = await storeRef.current?.restoreProject(deletedProjectId)
      if (!restored) return false
      replaceProjects(projectsRef.current.map((project) => project.id === restored.id ? restored : project))
      setDeletedProjectId(undefined)
      setNotice(`${restored.filename} was restored.`)
      return true
    } catch (cause) {
      setNotice(failureMessage(cause))
      return false
    }
  }, [deletedProjectId, replaceProjects])

  const backup = useCallback(async (): Promise<string> => {
    await flush()
    return serializeProjectBackup(createProjectBackup(projectsRef.current, nowRef.current()))
  }, [flush])

  const restoreBackup = useCallback(async (source: string): Promise<ProjectBackupImportResult> => {
    const backupValue = parseProjectBackup(source)
    const result = await storeRef.current?.importBackup(backupValue, idRef.current, nowRef.current())
    if (!result) throw new Error('No project store is active.')
    replaceProjects([...projectsRef.current, ...result.created])
    setNotice(`Restored ${result.created.length} scripts; skipped ${result.skipped}; renamed ${result.renamed}.`)
    return result
  }, [replaceProjects])

  const protectDrafts = useCallback(async (): Promise<boolean | null> => {
    const manager = options.storageManager
      ?? (typeof navigator === 'undefined' ? undefined : navigator.storage)
    const granted = await requestStorageDurability(manager)
    setDurability(await readStorageDurability(manager))
    return granted
  }, [options.storageManager])

  return useMemo(() => ({
    hydrated,
    projects: sortProjectsByRecent(projects),
    active,
    saveStatus,
    durability,
    ...(notice ? { notice } : {}),
    ...(deletedProjectId ? { deletedProjectId } : {}),
    editSource,
    updateModules,
    updateEditorView,
    flush,
    selectTemplate: (id: string) => openRef({ kind: 'bundled', exampleId: id }),
    selectProject: (id: string) => openRef({ kind: 'project', projectId: id }),
    createNew: (input?: NewProjectInput) => createOwnedProject(
      input?.filename ?? 'New Script.lua',
      input?.source ?? NEW_DISTING_SCRIPT,
      {},
      { kind: 'new' },
    ),
    importScript: (filename: string, source: string) => createOwnedProject(filename, source, {}, { kind: 'import' }),
    rename,
    duplicate,
    deleteActive,
    undoDelete,
    backup,
    restoreBackup,
    protectDrafts,
  }), [
    active,
    backup,
    createOwnedProject,
    deleteActive,
    deletedProjectId,
    duplicate,
    durability,
    editSource,
    flush,
    hydrated,
    notice,
    openRef,
    projects,
    protectDrafts,
    rename,
    restoreBackup,
    saveStatus,
    undoDelete,
    updateEditorView,
    updateModules,
  ])
}
