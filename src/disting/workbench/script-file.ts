export function luaDownloadFilename(suggestedName: string) {
  const stem = suggestedName
    .trim()
    .replace(/\.lua$/i, '')
    .replace(/[<>:"/\\|?*]+/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/[. ]+$/g, '')

  return `${stem || 'disting-script'}.lua`
}

export async function readLuaScriptFile(file: Pick<File, 'text'>) {
  const source = await file.text()
  return source.startsWith('\uFEFF') ? source.slice(1) : source
}

export function createLuaScriptDownload(source: string, suggestedName: string) {
  return {
    blob: new Blob([source], { type: 'text/x-lua;charset=utf-8' }),
    filename: luaDownloadFilename(suggestedName),
  }
}
