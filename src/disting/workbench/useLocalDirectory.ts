import { useEffect, useRef, useState } from 'react'
import { directoryPicker, listDirectoryScripts, writeDirectoryScript, type LocalDirectoryHandle, type LocalFileHandle } from './local-directory'
import { readLuaScriptFile } from './script-file'
import type { ScriptProject } from './projects'
import type { ProjectLibrary } from './useProjectLibrary'

interface Link { file: LocalFileHandle; disk: string; autosave: boolean }
export interface LocalDirectoryControls {
  supported: boolean
  name?: string
  files: string[]
  activeFile?: string
  autosave: boolean
  busy: boolean
  message: string
  error?: boolean
  connect(): void
  disconnect(): void
  refresh(): void
  open(name: string): void
  save(): void
  toggleAutosave(): void
}

export function useLocalDirectory(library: ProjectLibrary): LocalDirectoryControls {
  const [directory, setDirectory] = useState<LocalDirectoryHandle>()
  const [files, setFiles] = useState<LocalFileHandle[]>([])
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState(false)
  const [saving, setSaving] = useState(false)
  const [revision, setRevision] = useState(0)
  const links = useRef(new Map<string, Link>())
  const generation = useRef(0)
  const writing = useRef(false)
  const activeId = library.active.ref.kind === 'project' ? library.active.ref.projectId : undefined
  const active = activeId ? links.current.get(activeId) : undefined
  // Project-library callbacks can change on every runtime frame. Debounce source
  // content, not array identity, so a running simulator cannot starve disk saves.
  const sourceSnapshot = JSON.stringify(library.projects.map(({ id, source, deletedAt }) => ({ id, source, deletedAt })))
  const notify = () => setRevision((value) => value + 1)
  const report = (text: string) => { setMessage(text); setError(false) }
  const fail = (cause: unknown) => {
    setMessage(cause instanceof Error ? cause.message : String(cause))
    setError(true)
  }

  useEffect(() => () => { generation.current += 1 }, [])

  useEffect(() => {
    if (!directory) return
    let cancelled = false
    let scanning = false
    const scan = async () => {
      if (scanning) return
      scanning = true
      try {
        const next = await listDirectoryScripts(directory)
        if (!cancelled) setFiles(next)
      } catch (error) { if (!cancelled) fail(error) }
      finally { scanning = false }
    }
    void scan()
    const timer = setInterval(() => void scan(), 3000)
    window.addEventListener('focus', scan)
    return () => { cancelled = true; clearInterval(timer); window.removeEventListener('focus', scan) }
  }, [directory])

  useEffect(() => {
    if (busy) return
    const token = generation.current
    const timer = setTimeout(async () => {
      if (writing.current) return
      writing.current = true
      let attempted = false
      try {
        const projects = JSON.parse(sourceSnapshot) as Pick<ScriptProject, 'id' | 'source' | 'deletedAt'>[]
        for (const project of projects) {
          const link = links.current.get(project.id)
          if (token !== generation.current) break
          if (!link?.autosave || project.deletedAt || project.source === link.disk) continue
          attempted = true
          setSaving(true)
          try {
            await writeDirectoryScript(link.file, link.disk, project.source)
            link.disk = project.source
            if (token === generation.current) report(`Saved ${link.file.name} to directory.`)
          } catch (error) {
            link.autosave = false
            if (token === generation.current) fail(error)
          }
        }
      } finally { writing.current = false; if (attempted && token === generation.current) { setSaving(false); notify() } }
    }, 800)
    return () => clearTimeout(timer)
  }, [sourceSnapshot, revision, busy])

  const connect = async () => {
    const picker = directoryPicker()
    if (!picker || busy || writing.current) return
    const token = generation.current
    setBusy(true)
    try {
      const next = await picker({ mode: 'read' })
      const entries = await listDirectoryScripts(next)
      if (token !== generation.current) return
      generation.current += 1
      links.current.clear()
      setDirectory(next)
      setFiles(entries)
      report(`Connected ${next.name}. Choose a Lua file from the scripts dropdown.`)
    } catch (error) { if (!(error instanceof DOMException && error.name === 'AbortError')) fail(error) }
    finally { setBusy(false) }
  }
  const open = async (name: string) => {
    const file = files.find((candidate) => candidate.name === name)
    if (!file || busy || writing.current) return
    const token = generation.current
    setBusy(true)
    try {
      const disk = await (await file.getFile()).text()
      if (token !== generation.current) return
      const existing = [...links.current].find(([, link]) => link.file.name === name && link.disk === disk)
      let opened: boolean
      if (existing && library.projects.some((project) => project.id === existing[0] && !project.deletedAt)) {
        opened = await library.selectProject(existing[0])
      } else {
        opened = await library.importScript(name, await readLuaScriptFile({ text: async () => disk }), (id) => {
          if (token !== generation.current) return
          for (const link of links.current.values()) if (link.file.name === name) link.autosave = false
          links.current.set(id, { file, disk, autosave: false })
        })
      }
      if (opened && token === generation.current) report(`Opened ${name}. Directory autosave is optional.`)
    } catch (error) { if (token === generation.current) fail(error) }
    finally { setBusy(false) }
  }
  const save = async (enable: boolean) => {
    if (!directory || !active || busy || writing.current) return
    const token = generation.current
    const source = library.active.source
    setBusy(true)
    writing.current = true
    try {
      if (await directory.requestPermission({ mode: 'readwrite' }) !== 'granted') throw new Error('Write permission was not granted. Your browser draft is preserved.')
      if (token !== generation.current) return
      await writeDirectoryScript(active.file, active.disk, source)
      active.disk = source
      active.autosave = enable
      if (token === generation.current) report(`Saved ${active.file.name} to directory.${enable ? ' Autosave enabled for this file.' : ''}`)
    } catch (error) { active.autosave = false; if (token === generation.current) fail(error) }
    finally { writing.current = false; setBusy(false); notify() }
  }
  return {
    supported: Boolean(directoryPicker()), name: directory?.name,
    files: files.map((file) => file.name), activeFile: active?.file.name,
    autosave: active?.autosave ?? false, busy: busy || saving, message, error,
    connect: () => void connect(),
    disconnect: () => {
      if (busy || writing.current) return
      generation.current += 1
      links.current.clear()
      setDirectory(undefined); setFiles([]); report('Directory disconnected. Browser drafts are preserved.')
    },
    refresh: () => {
      const token = generation.current
      if (directory) void listDirectoryScripts(directory).then((next) => {
        if (token === generation.current) { setFiles(next); report('Directory refreshed. Reopen a file to read external edits.') }
      }).catch((cause: unknown) => { if (token === generation.current) fail(cause) })
    },
    open: (name) => void open(name), save: () => void save(active?.autosave ?? false),
    toggleAutosave: () => {
      if (active?.autosave) { active.autosave = false; notify(); report('Directory autosave disabled for this file.') }
      else void save(true)
    },
  }
}
