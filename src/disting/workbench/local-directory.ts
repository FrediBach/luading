/** Main-thread File System Access adapter. Handles never enter project storage or Lua. */
export interface LocalFileHandle {
  kind: 'file'
  name: string
  getFile(): Promise<Pick<File, 'text'>>
  createWritable(): Promise<{ write(source: string): Promise<void>; close(): Promise<void>; abort(): Promise<void> }>
}
export interface LocalDirectoryHandle {
  name: string
  values(): AsyncIterable<LocalFileHandle | { kind: 'directory'; name: string }>
  requestPermission(options: { mode: 'readwrite' }): Promise<PermissionState>
}
export type DirectoryPicker = (options: { mode: 'read' }) => Promise<LocalDirectoryHandle>
export function directoryPicker(): DirectoryPicker | undefined {
  return (window as Window & { showDirectoryPicker?: DirectoryPicker }).showDirectoryPicker?.bind(window)
}
export async function listDirectoryScripts(directory: LocalDirectoryHandle) {
  const files: LocalFileHandle[] = []
  for await (const entry of directory.values()) {
    if (entry.kind === 'file' && /\.lua$/i.test(entry.name)) files.push(entry)
  }
  return files.sort((a, b) => a.name.localeCompare(b.name))
}
export async function writeDirectoryScript(handle: LocalFileHandle, expected: string, source: string) {
  const disk = await (await handle.getFile()).text()
  if (disk !== expected) throw new Error(`${handle.name} changed on disk. Reopen it from the directory to load a fresh copy; your browser draft is preserved.`)
  const writable = await handle.createWritable()
  try {
    await writable.write(source)
    await writable.close()
  } catch (error) {
    await writable.abort().catch(() => undefined)
    throw error
  }
}
