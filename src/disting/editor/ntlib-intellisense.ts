import { NTLIB_MODULES } from '../ntlib-modules'

export type NtlibIntelliSenseEntry = {
  label: string
  signature?: string
  detail: string
  documentation: string
  insertText?: string
  parameters?: string[]
  completionKind?: 'constant' | 'field' | 'function' | 'method' | 'snippet' | 'variable'
  sortText?: string
  resultType?: string
}

const CONSTRUCTOR_TYPES: Record<string, Record<string, string>> = {
  'ntlib.clock': { new: 'Clock' },
  'ntlib.env': { ad: 'Env', ar: 'Env', asr: 'Env', adsr: 'Env', dahdsr: 'Env' },
  'ntlib.gate': { new: 'Gate', bank: 'Bank' },
  'ntlib.lfo': {
    phasor: 'Phasor', new: 'Lfo', sampleHold: 'RandomShape', smoothRandom: 'RandomShape', drift: 'Drift',
  },
  'ntlib.midi': { clock: 'MidiClock', noteStack: 'NoteStack', voices: 'Voices', mpe: 'Mpe' },
  'ntlib.param': { builder: 'Builder', smooth: 'Smooth', mod: 'Mod' },
  'ntlib.quant': { new: 'Quant', fromCents: 'Quant' },
  'ntlib.rand': { new: 'Rng', weights: 'Weighted', walk: 'Walk', bag: 'Bag', markov: 'Markov', turing: 'Turing' },
  'ntlib.rhythm': { pattern: 'Pattern', poly: 'Poly' },
  'ntlib.seq': { new: 'Playhead', track: 'Track', recorder: 'Recorder' },
  'ntlib.signal': {
    schmitt: 'Schmitt', edge: 'Edge', slew: 'Slew', onepole: 'OnePole', dcblock: 'Dc',
    follower: 'Follower', debounce: 'Debounce', changed: 'Changed', sampleHold: 'SampleHold', window: 'Window',
  },
  'ntlib.state': { schema: 'Schema' },
  'ntlib.test': { harness: 'Harness', suite: 'Suite' },
  'ntlib.volts': { tuning: 'Tuning' },
}

const METHOD_RESULT_TYPES: Record<string, string> = {
  'ntlib.clock#Clock.divider': 'ntlib.clock#Divider',
  'ntlib.test#Harness.record': 'ntlib.test#Recording',
}

const members = new Map<string, NtlibIntelliSenseEntry[]>()

function addMember(owner: string, entry: NtlibIntelliSenseEntry) {
  const entries = members.get(owner) ?? []
  const existing = entries.findIndex((candidate) => candidate.label === entry.label)
  if (existing >= 0) entries[existing] = { ...entries[existing], ...entry }
  else entries.push(entry)
  members.set(owner, entries)
}

function classType(moduleName: string, className: string) {
  return `${moduleName}#${className}`
}

function parameters(raw: string) {
  return raw.split(',').map((value) => value.trim()).filter(Boolean)
}

function insertCall(label: string, values: readonly string[]) {
  return `${label}(${values.map((value, index) => (
    `\${${index + 1}:${value.replace(/^_/, '') || 'value'}}`
  )).join(', ')})`
}

function functionEntry(
  owner: string,
  label: string,
  rawParameters: string,
  method: boolean,
): NtlibIntelliSenseEntry {
  const values = parameters(rawParameters)
  const separator = method ? ':' : '.'
  const displayOwner = owner.replace('#', '.')
  return {
    label,
    signature: `${displayOwner}${separator}${label}(${values.join(', ')})`,
    detail: `ntlib · ${method ? 'method' : 'function'}`,
    documentation: `Bundled pure-Lua ${method ? 'method' : 'function'} from \`${displayOwner}\`.`,
    insertText: insertCall(label, values),
    parameters: values,
    completionKind: method ? 'method' : 'function',
    sortText: '010',
  }
}

function skipQuoted(source: string, offset: number) {
  const quote = source[offset]
  let cursor = offset + 1
  while (cursor < source.length) {
    if (source[cursor] === '\\') cursor += 2
    else if (source[cursor] === quote) return cursor + 1
    else cursor += 1
  }
  return source.length
}

function tableEnd(source: string, opening: number) {
  let depth = 0
  for (let cursor = opening; cursor < source.length; cursor += 1) {
    if (source[cursor] === '"' || source[cursor] === "'") {
      cursor = skipQuoted(source, cursor) - 1
    } else if (source.startsWith('--', cursor)) {
      const newline = source.indexOf('\n', cursor + 2)
      cursor = newline < 0 ? source.length : newline
    } else if (source[cursor] === '{') depth += 1
    else if (source[cursor] === '}' && --depth === 0) return cursor
  }
  return source.length
}

function topLevelTableFields(source: string, opening: number, closing: number) {
  const fields: Array<{ name: string; tableOpening?: number }> = []
  let depth = 0
  let cursor = opening + 1
  while (cursor < closing) {
    if (source[cursor] === '"' || source[cursor] === "'") {
      cursor = skipQuoted(source, cursor)
      continue
    }
    if (source.startsWith('--', cursor)) {
      const newline = source.indexOf('\n', cursor + 2)
      cursor = newline < 0 ? closing : newline + 1
      continue
    }
    if (source[cursor] === '{') {
      depth += 1
      cursor += 1
      continue
    }
    if (source[cursor] === '}') {
      depth -= 1
      cursor += 1
      continue
    }
    if (depth === 0 && /[A-Za-z_]/.test(source[cursor])) {
      const start = cursor
      cursor += 1
      while (/[A-Za-z0-9_]/.test(source[cursor] ?? '')) cursor += 1
      const name = source.slice(start, cursor)
      let equals = cursor
      while (/\s/.test(source[equals] ?? '')) equals += 1
      if (source[equals] === '=') {
        let value = equals + 1
        while (/\s/.test(source[value] ?? '')) value += 1
        fields.push({ name, tableOpening: source[value] === '{' ? value : undefined })
      }
      continue
    }
    cursor += 1
  }
  return fields
}

function ensurePath(moduleName: string, path: readonly string[]) {
  let owner = moduleName
  for (const segment of path) {
    const next = `${owner}.${segment}`
    addMember(owner, {
      label: segment,
      detail: 'ntlib · table',
      documentation: `Public table \`${next}\` from the bundled ntlib library.`,
      completionKind: 'field',
      sortText: '020',
      resultType: next,
    })
    owner = next
  }
  return owner
}

function addTableMembers(moduleName: string, path: readonly string[], source: string, opening: number) {
  const owner = ensurePath(moduleName, path)
  const closing = tableEnd(source, opening)
  for (const field of topLevelTableFields(source, opening, closing)) {
    const resultType = field.tableOpening === undefined ? undefined : `${owner}.${field.name}`
    addMember(owner, {
      label: field.name,
      detail: 'ntlib · value',
      documentation: `Public value \`${owner}.${field.name}\` from the bundled ntlib library.`,
      completionKind: 'constant',
      sortText: '020',
      resultType,
    })
    if (field.tableOpening !== undefined) {
      addTableMembers(moduleName, [...path, field.name], source, field.tableOpening)
    }
  }
}

function buildCatalog() {
  for (const [moduleName, source] of Object.entries(NTLIB_MODULES)) {
    const initial = source.match(/local\s+M\s*=\s*\{/)
    if (initial?.index !== undefined) {
      const opening = source.indexOf('{', initial.index)
      addTableMembers(moduleName, [], source, opening)
    }

    for (const match of source.matchAll(/M((?:\.[A-Za-z_]\w*)+)\s*=\s*\{/g)) {
      const path = match[1].slice(1).split('.')
      const opening = source.indexOf('{', match.index + match[0].length - 1)
      addTableMembers(moduleName, path, source, opening)
    }

    for (const match of source.matchAll(/function\s+M((?:\.[A-Za-z_]\w*)+)\s*\(([^)]*)\)/g)) {
      const path = match[1].slice(1).split('.')
      const label = path.pop()!
      const owner = ensurePath(moduleName, path)
      const entry = functionEntry(owner, label, match[2], false)
      const resultClass = path.length === 0 ? CONSTRUCTOR_TYPES[moduleName]?.[label] : undefined
      if (resultClass) entry.resultType = classType(moduleName, resultClass)
      addMember(owner, entry)
    }

    for (const match of source.matchAll(/function\s+([A-Z][A-Za-z0-9_]*):([A-Za-z_]\w*)\s*\(([^)]*)\)/g)) {
      if (match[2].startsWith('_')) continue
      const owner = classType(moduleName, match[1])
      const entry = functionEntry(owner, match[2], match[3], true)
      entry.resultType = METHOD_RESULT_TYPES[`${owner}.${match[2]}`]
      addMember(owner, entry)
    }
  }

  const voltsMethods = members.get('ntlib.volts#Tuning') ?? []
  for (const method of voltsMethods) {
    addMember('ntlib.volts', {
      ...method,
      signature: method.signature?.replace('ntlib.volts.Tuning:', 'ntlib.volts.'),
      detail: 'ntlib · function',
      completionKind: 'function',
    })
  }

  for (const moduleName of Object.keys(NTLIB_MODULES).filter((name) => name !== 'ntlib')) {
    const label = moduleName.slice('ntlib.'.length)
    addMember('ntlib', {
      label,
      detail: 'ntlib · lazy module',
      documentation: `Bundled module loaded by \`require '${moduleName}'\`.`,
      completionKind: 'field',
      sortText: '000',
      resultType: moduleName,
    })
  }

  for (const entries of members.values()) {
    entries.sort((left, right) => (
      (left.sortText ?? '').localeCompare(right.sortText ?? '') || left.label.localeCompare(right.label)
    ))
  }
}

buildCatalog()

function resolveExpressionType(expression: string, bindings: ReadonlyMap<string, string>) {
  const parts = expression.split(/[.:]/)
  let owner: string | undefined = bindings.get(parts.shift() ?? '')
  if (!owner) return undefined
  for (const part of parts) {
    const currentOwner: string = owner
    const entry: NtlibIntelliSenseEntry | undefined = members.get(currentOwner)
      ?.find((candidate) => candidate.label === part)
    if (!entry?.resultType) return undefined
    owner = entry.resultType
  }
  return owner
}

function bindingsAt(source: string, offset: number) {
  const bindings = new Map<string, string>()
  const lines = source.slice(0, offset).split('\n')
  for (const line of lines) {
    if (/^\s*--/.test(line)) continue
    const required = line.match(/^\s*local\s+([A-Za-z_]\w*)\s*=\s*require\s*(?:\(\s*)?["'](ntlib(?:\.[A-Za-z_]\w*)*)["']/)
    if (required && NTLIB_MODULES[required[2]]) {
      bindings.set(required[1]!, required[2]!)
      continue
    }

    const assigned = line.match(/^\s*local\s+([A-Za-z_]\w*)\s*=\s*([A-Za-z_]\w*(?:[.:][A-Za-z_]\w*)*)/)
    if (!assigned) continue
    const expression = assigned[2]!
    const separator = Math.max(expression.lastIndexOf('.'), expression.lastIndexOf(':'))
    if (separator >= 0) {
      const owner = resolveExpressionType(expression.slice(0, separator), bindings)
      const entry = owner
        ? members.get(owner)?.find((candidate) => (
          candidate.label === expression.slice(separator + 1)
        ))
        : undefined
      if (entry?.resultType) bindings.set(assigned[1]!, entry.resultType)
    } else {
      const type = resolveExpressionType(expression, bindings)
      if (type) bindings.set(assigned[1]!, type)
    }
  }
  return bindings
}

export function ntlibMembersForSource(source: string, offset: number, ownerExpression: string) {
  const owner = resolveExpressionType(ownerExpression.replace(/:/g, '.'), bindingsAt(source, offset))
  return owner ? members.get(owner) : undefined
}

export function ntlibEntryForCall(source: string, offset: number, callName: string) {
  const separator = Math.max(callName.lastIndexOf('.'), callName.lastIndexOf(':'))
  if (separator < 0) return undefined
  const owner = resolveExpressionType(callName.slice(0, separator).replace(/:/g, '.'), bindingsAt(source, offset))
  return owner
    ? members.get(owner)?.find((entry) => entry.label === callName.slice(separator + 1))
    : undefined
}

export function ntlibRequireEntriesAt(source: string, offset: number) {
  const before = source.slice(0, offset)
  const match = before.match(/\brequire\s*(?:\(\s*)?["']([^"']*)$/)
  if (!match || (!'ntlib'.startsWith(match[1]) && !match[1].startsWith('ntlib'))) return undefined
  const prefix = match[1]
  return Object.keys(NTLIB_MODULES)
    .filter((name) => name.startsWith(prefix))
    .sort()
    .map((name): NtlibIntelliSenseEntry => ({
      label: name,
      detail: 'ntlib · bundled Lua module',
      documentation: `Load the bundled \`${name}\` module.`,
      insertText: prefix.includes('.') ? name.slice(name.lastIndexOf('.') + 1) : name,
      completionKind: 'field',
      sortText: '000',
    }))
}

export function ntlibCatalogMembers(owner: string) {
  return members.get(owner) ?? []
}
