import { NTLIB_EXPORT_MODULES } from '../ntlib-modules'

export const NEW_DISTING_SCRIPT = `-- New Script
-- Passes input 1 to output 1. Replace the example logic below.

local outputs = {}

-- Add shared state and helper functions above the returned table.
return {
  name = "New Script",
  author = "Your Name",

  init = function(self)
    -- Declare inputs, outputs, and parameters here.
    return {
      inputs = { kCV },
      inputNames = { "Input" },
      outputs = { kLinear },
      outputNames = { "Output" },
    }
  end,

  step = function(self, dt, inputs)
    -- This runs every 1 ms. Put signal processing here.
    outputs[1] = inputs[1]
    return outputs
  end,

  -- Add draw(), trigger(), gate(), MIDI, or UI callbacks here.
}`

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

function longBracketLevel(source: string, offset: number) {
  if (source[offset] !== '[') return null
  let cursor = offset + 1
  while (source[cursor] === '=') cursor += 1
  return source[cursor] === '[' ? cursor - offset - 1 : null
}

function afterLongBracket(source: string, offset: number, level: number) {
  const closing = `]${'='.repeat(level)}]`
  const end = source.indexOf(closing, offset + level + 2)
  return end < 0 ? source.length : end + closing.length
}

function afterQuotedString(source: string, offset: number) {
  const quote = source[offset]
  let cursor = offset + 1
  while (cursor < source.length) {
    if (source[cursor] === '\\') {
      cursor += 2
    } else if (source[cursor] === quote) {
      return cursor + 1
    } else {
      cursor += 1
    }
  }
  return source.length
}

function afterTrivia(source: string, offset: number) {
  let cursor = offset
  while (cursor < source.length) {
    if (/\s/.test(source[cursor])) {
      cursor += 1
      continue
    }
    if (source.startsWith('--', cursor)) {
      const level = longBracketLevel(source, cursor + 2)
      if (level !== null) {
        cursor = afterLongBracket(source, cursor + 2, level)
      } else {
        const newline = source.indexOf('\n', cursor + 2)
        cursor = newline < 0 ? source.length : newline + 1
      }
      continue
    }
    break
  }
  return cursor
}

function requiredModuleAt(source: string, offset: number) {
  let cursor = afterTrivia(source, offset)
  if (source[cursor] === '(') cursor = afterTrivia(source, cursor + 1)
  const quote = source[cursor]
  if (quote !== "'" && quote !== '"') return null

  const end = afterQuotedString(source, cursor)
  if (end > source.length || source[end - 1] !== quote) return null
  const literal = source.slice(cursor + 1, end - 1)
  if (literal.includes('\\')) return null
  return literal
}

export function sourceImportsNtlib(source: string) {
  let cursor = 0
  while (cursor < source.length) {
    if (source.startsWith('--', cursor)) {
      cursor = afterTrivia(source, cursor)
      continue
    }
    if (source[cursor] === "'" || source[cursor] === '"') {
      cursor = afterQuotedString(source, cursor)
      continue
    }
    const level = longBracketLevel(source, cursor)
    if (level !== null) {
      cursor = afterLongBracket(source, cursor, level)
      continue
    }
    if (/[A-Za-z_]/.test(source[cursor])) {
      const start = cursor
      cursor += 1
      while (/[A-Za-z0-9_]/.test(source[cursor] ?? '')) cursor += 1
      if (source.slice(start, cursor) === 'require') {
        const moduleName = requiredModuleAt(source, cursor)
        if (moduleName === 'ntlib' || moduleName?.startsWith('ntlib.')) return true
      }
      continue
    }
    cursor += 1
  }
  return false
}

function embeddedNtlibSource(modules: Readonly<Record<string, string>>) {
  const names = Object.keys(modules).sort((left, right) => {
    if (left === 'ntlib') return -1
    if (right === 'ntlib') return 1
    return left.localeCompare(right)
  })
  const preload = names.map((name) => (
    `package.preload[${JSON.stringify(name)}] = function(...)\n${modules[name]}\nend\n`
  )).join('\n')
  return `-- ntlib embedded automatically by Luading for hardware export.\n${preload}\n-- Original script follows.\n`
}

export function createLuaScriptDownload(
  source: string,
  suggestedName: string,
  ntlibModules: Readonly<Record<string, string>> = NTLIB_EXPORT_MODULES,
) {
  const exportedSource = sourceImportsNtlib(source)
    ? `${embeddedNtlibSource(ntlibModules)}${source}`
    : source
  return {
    blob: new Blob([exportedSource], { type: 'text/x-lua;charset=utf-8' }),
    filename: luaDownloadFilename(suggestedName),
  }
}
