import type * as Monaco from 'monaco-editor/esm/vs/editor/editor.api'
import {
  DISTING_API,
  DISTING_API_SUPPORT,
  DISTING_CONSTANTS as DISTING_CONSTANT_CATALOG,
  DISTING_CONTRACT_PROVENANCE,
  DISTING_LIFECYCLE,
  formatApiSignature,
  type DistingApiEntry,
  type DistingApiParameter,
  type DistingConstantEntry,
  type DistingLifecycleEntry,
  type DistingValueType,
} from '../validation/api-manifest'
import {
  createLuaSourceIndex,
  type LuaSourceIndex,
  type SourceIndexSymbol,
} from '../validation/source-index'
import {
  activeLuaCallAt,
  completionContextAt,
  selfParameterReferenceAt,
} from './disting-intellisense-context'
import { DISTING_LUA_LANGUAGE_ID } from './disting-lua'
import { resolvedLocalSymbolAt } from './disting-navigation-context'

type MonacoApi = typeof Monaco
type CompletionKind = 'constant' | 'field' | 'function' | 'method' | 'snippet' | 'variable'

export type IntelliSenseEntry = {
  label: string
  signature?: string
  detail: string
  documentation: string
  insertText?: string
  parameters?: string[]
  completionKind?: CompletionKind
  sortText?: string
}

type SignatureParameter = {
  label: string
  acceptedTypes?: readonly DistingValueType[]
  variadic?: boolean
}

type SignatureEntry = {
  label: string
  documentation: string
  parameters: SignatureParameter[]
}

function apiInsertText(name: string, parameters: readonly DistingApiParameter[], explicit?: string) {
  if (explicit) return explicit
  const placeholders = parameters.map((parameter, index) => (
    `\${${index + 1}:${parameter.snippetDefault ?? parameter.name}}`
  ))
  return `${name}(${placeholders.join(', ')})`
}

function provenanceSortText(provenance: DistingApiEntry['provenance'] | DistingConstantEntry['provenance']) {
  return provenance === 'manual-1.12' || provenance === 'hardware-verified' ? '100' : '300'
}

export function apiEntryForIntelliSense(entry: DistingApiEntry): IntelliSenseEntry {
  const primaryParameters = entry.overloads[0].parameters
  const provenance = DISTING_CONTRACT_PROVENANCE[entry.provenance]
  const documentation = `${entry.documentation}\n\n**Contract source: ${provenance.label}.** ${provenance.detail}`
  return {
    label: entry.name,
    signature: entry.signature,
    detail: entry.support === 'full'
      ? entry.detail
      : `${entry.detail} · ${DISTING_API_SUPPORT[entry.support].label}`,
    documentation: entry.support === 'full'
      ? documentation
      : `${documentation}\n\n**Simulator support: ${DISTING_API_SUPPORT[entry.support].label}.** ${entry.supportDetail}`,
    insertText: apiInsertText(entry.name, primaryParameters, entry.insertText),
    parameters: primaryParameters.map((parameter) => (
      `${parameter.variadic ? '...' : ''}${parameter.name}${parameter.optional ? '?' : ''}`
    )),
    completionKind: 'function',
    sortText: provenanceSortText(entry.provenance),
  }
}

const DISTING_FUNCTIONS = DISTING_API.map(apiEntryForIntelliSense)

export function constantEntryForIntelliSense(entry: DistingConstantEntry): IntelliSenseEntry {
  const provenance = DISTING_CONTRACT_PROVENANCE[entry.provenance]
  return {
    label: entry.name,
    detail: `disting NT constant · ${entry.category} · ${provenance.label}`,
    documentation: `${entry.documentation}\n\n**Contract source: ${provenance.label}.** ${provenance.detail}`,
    completionKind: 'constant',
    sortText: provenanceSortText(entry.provenance),
  }
}

const DISTING_CONSTANTS = DISTING_CONSTANT_CATALOG.map(constantEntryForIntelliSense)

const LUA_GLOBALS: IntelliSenseEntry[] = [
  ['pairs', 'pairs(table)', 'Iterate over all key/value pairs in a table.'],
  ['ipairs', 'ipairs(table)', 'Iterate over consecutive integer keys starting at 1.'],
  ['type', 'type(value)', 'Return the Lua type name of a value.'],
  ['tostring', 'tostring(value)', 'Convert a value to a string.'],
  ['tonumber', 'tonumber(value, base?)', 'Convert a value to a number when possible.'],
  ['next', 'next(table, index?)', 'Return the next key/value pair in a table.'],
  ['select', 'select(index, ...)', 'Return selected values from a variadic argument list.'],
  ['pcall', 'pcall(function, ...)', 'Call a function in protected mode.'],
  ['assert', 'assert(value, message?)', 'Raise an error when value is false or nil.'],
].map(([label, signature, documentation]) => ({
  label,
  signature,
  detail: `Lua 5.4 · ${signature}`,
  documentation,
  insertText: `${label}(\${1:value})`,
  parameters: signature.slice(signature.indexOf('(') + 1, -1).split(',').map((value) => value.trim()),
  completionKind: 'function',
  sortText: '200',
}))

const LUA_KEYWORDS: IntelliSenseEntry[] = [
  ['and', 'Logical conjunction; returns the first false/nil operand or the second operand.'],
  ['break', 'Exit the nearest enclosing while, repeat, or for loop.'],
  ['do', 'Begin an explicitly scoped block, or the body of a loop.'],
  ['else', 'Run the fallback branch of an if statement.'],
  ['elseif', 'Test another condition in an if statement.'],
  ['end', 'Close a function, if statement, loop, or do block.'],
  ['false', 'The Boolean false value.'],
  ['for', 'Begin a numeric or generic for loop.'],
  ['function', 'Declare or create a Lua function.'],
  ['goto', 'Jump to a visible label in the current function.'],
  ['if', 'Begin a conditional statement.'],
  ['in', 'Separate iterator expressions from variables in a generic for loop.'],
  ['local', 'Declare a binding whose scope is limited to the current block.'],
  ['nil', 'The absence of a useful value; assigning nil removes a table key.'],
  ['not', 'Logical negation.'],
  ['or', 'Logical disjunction; returns the first truthy operand or the second operand.'],
  ['repeat', 'Begin a loop whose condition is checked by the closing until clause.'],
  ['return', 'Return zero or more values from the current function.'],
  ['then', 'Begin the body of an if or elseif branch.'],
  ['true', 'The Boolean true value.'],
  ['until', 'Close a repeat loop and provide its terminating condition.'],
  ['while', 'Begin a loop that continues while its condition is truthy.'],
].map(([label, documentation]) => ({
  label,
  signature: label,
  detail: 'Lua 5.4 keyword',
  documentation,
  sortText: '200',
}))

const MEMBER_COMPLETIONS: Record<string, IntelliSenseEntry[]> = {
  math: [
    ['abs', 'math.abs(x)'],
    ['ceil', 'math.ceil(x)'],
    ['floor', 'math.floor(x)'],
    ['max', 'math.max(x, ...)'],
    ['min', 'math.min(x, ...)'],
    ['sin', 'math.sin(x)'],
    ['cos', 'math.cos(x)'],
    ['sqrt', 'math.sqrt(x)'],
    ['random', 'math.random(m?, n?)'],
  ].map(([label, signature]) => ({
    label,
    signature,
    detail: `Lua 5.4 · ${signature}`,
    documentation: `Lua 5.4 \`${signature}\`.`,
    insertText: `${label}(\${1:value})`,
    parameters: signature.slice(signature.indexOf('(') + 1, -1).split(',').map((value) => value.trim()),
    completionKind: 'method',
    sortText: '200',
  })),
  string: [
    ['format', 'string.format(format, ...)'],
    ['len', 'string.len(value)'],
    ['lower', 'string.lower(value)'],
    ['sub', 'string.sub(value, i, j?)'],
    ['upper', 'string.upper(value)'],
  ].map(([label, signature]) => ({
    label,
    signature,
    detail: `Lua 5.4 · ${signature}`,
    documentation: `Lua 5.4 \`${signature}\`.`,
    insertText: `${label}(\${1:value})`,
    parameters: signature.slice(signature.indexOf('(') + 1, -1).split(',').map((value) => value.trim()),
    completionKind: 'method',
    sortText: '200',
  })),
  table: [
    ['concat', 'table.concat(list, separator?, i?, j?)'],
    ['insert', 'table.insert(list, position?, value)'],
    ['move', 'table.move(a1, f, e, t, a2?)'],
    ['remove', 'table.remove(list, position?)'],
    ['sort', 'table.sort(list, comparator?)'],
  ].map(([label, signature]) => ({
    label,
    signature,
    detail: `Lua 5.4 · ${signature}`,
    documentation: `Lua 5.4 \`${signature}\`.`,
    insertText: `${label}(\${1:value})`,
    parameters: signature.slice(signature.indexOf('(') + 1, -1).split(',').map((value) => value.trim()),
    completionKind: 'method',
    sortText: '200',
  })),
  self: [
    {
      label: 'parameters',
      detail: 'disting NT · current parameter values',
      documentation: 'A read-only 1-based array containing the current scaled value of each script-defined parameter.',
    },
    {
      label: 'algorithmIndex',
      detail: 'disting NT · algorithm index',
      documentation: 'The 1-based position of this Lua algorithm in the preset.',
    },
    {
      label: 'parameterOffset',
      detail: 'disting NT · parameter offset',
      documentation: 'The firmware parameter offset for this algorithm instance. Lua Script reserves 85 system parameters before script-defined values.',
    },
    {
      label: 'name',
      detail: 'disting NT · script name',
      documentation: 'The name declared by the returned script table.',
    },
    {
      label: 'author',
      detail: 'disting NT · script author',
      documentation: 'The author declared by the returned script table.',
    },
  ].map((entry) => ({ ...entry, completionKind: 'field' as const, sortText: '000' })),
}

export const COMPLETE_SCRIPT_SNIPPET: IntelliSenseEntry = {
  label: 'disting script',
  detail: 'disting NT · complete script scaffold',
  documentation: 'Create a complete Disting NT Lua lifecycle table with the two required descriptive header comments.',
  completionKind: 'snippet',
  sortText: '000',
  insertText: [
    '-- ${1:Algorithm name}',
    '-- ${2:Describe what the script does.}',
    'local out = {}',
    '',
    'return {',
    '  name = "${1:Algorithm name}",',
    '  author = "${3:Author}",',
    '',
    '  init = function(self)',
    '    return {',
    '      inputs = { kCV },',
    '      inputNames = { "Input" },',
    '      outputs = { kLinear },',
    '      outputNames = { "Output" },',
    '      parameters = {',
    '        { "${4:Amount}", 0, 100, 50, kPercent },',
    '      },',
    '    }',
    '  end,',
    '',
    '  step = function(self, dt, inputs)',
    '    out[1] = ${5:inputs[1]}',
    '    return out',
    '  end,',
    '',
    '  draw = function(self)',
    '    ${6:drawText(8, 20, self.name)}',
    '    return true',
    '  end,',
    '}',
  ].join('\n'),
}

export function lifecycleEntryForIntelliSense(entry: DistingLifecycleEntry): IntelliSenseEntry {
  const provenance = DISTING_CONTRACT_PROVENANCE[entry.provenance]
  return {
    label: `${entry.name} callback`,
    signature: entry.signature,
    detail: `disting NT lifecycle · ${entry.cadence}`,
    documentation: `${entry.documentation}\n\n${entry.returnSemantics}\n\n**Cadence:** ${entry.cadence}\n\n**Contract source: ${provenance.label}.** ${provenance.detail}`,
    insertText: entry.snippet,
    parameters: entry.parameters.map((parameter) => parameter.name),
    completionKind: 'snippet',
    sortText: provenanceSortText(entry.provenance),
  }
}

const TOP_LEVEL_FIELDS: IntelliSenseEntry[] = [
  {
    label: 'name',
    detail: 'disting NT program field · script name',
    documentation: 'The name shown for the Lua algorithm.',
    insertText: 'name = "${1:Script name}",',
    completionKind: 'field',
    sortText: '000',
  },
  {
    label: 'author',
    detail: 'disting NT program field · author',
    documentation: 'The script author shown with the algorithm metadata.',
    insertText: 'author = "${1:Author}",',
    completionKind: 'field',
    sortText: '000',
  },
  {
    label: 'luading',
    detail: 'Luading simulator extension · parameter presets',
    documentation: 'Declare ordered named parameter-value snapshots for the Luading parameter panel. Disting NT hardware ignores this extension.',
    insertText: [
      'luading = {',
      '  parameterPresets = {',
      '    { name = "${1:Preset name}", values = { ${2:0} } },',
      '  },',
      '},',
    ].join('\n'),
    completionKind: 'field',
    sortText: '300',
  },
  ...DISTING_LIFECYCLE.map((entry) => ({
    ...lifecycleEntryForIntelliSense(entry),
    label: entry.name,
  })),
]

const INIT_FIELDS: IntelliSenseEntry[] = [
  ['inputs', 'inputs = { ${1:kCV} },', 'Declare input bus types with kCV, kGate, or kTrigger.'],
  ['inputNames', 'inputNames = { "${1:Input}" },', 'Name input buses by their 1-based indices.'],
  ['outputs', 'outputs = { ${1:kLinear} },', 'Declare output interpolation with kStepped or kLinear.'],
  ['outputNames', 'outputNames = { "${1:Output}" },', 'Name output buses by their 1-based indices.'],
  ['parameters', 'parameters = {\n  { "${1:Amount}", ${2:0}, ${3:100}, ${4:50}, ${5:kPercent} },\n},', 'Declare script parameters.'],
  ['midi', 'midi = {\n  channelParameter = ${1:1},\n  messages = { "${2:note}" },\n},', 'Filter MIDI by a channel parameter and documented message types.'],
].map(([label, insertText, documentation]) => ({
  label,
  detail: `disting NT init metadata · ${label}`,
  documentation,
  insertText,
  completionKind: 'field',
  sortText: '000',
}))

const PARAMETER_SNIPPETS: IntelliSenseEntry[] = [
  {
    label: 'numeric parameter',
    detail: 'disting NT parameter · numeric',
    documentation: 'Insert `{ name, minimum, maximum, default, unit }`.',
    insertText: '{ "${1:Name}", ${2:0}, ${3:100}, ${4:50}, ${5:kPercent} },',
  },
  {
    label: 'scaled parameter',
    detail: 'disting NT parameter · scaled numeric',
    documentation: 'Insert `{ name, minimum, maximum, default, unit, scale }`.',
    insertText: '{ "${1:Name}", ${2:0}, ${3:1000}, ${4:500}, ${5:kHz}, ${6:kBy100} },',
  },
  {
    label: 'enum parameter',
    detail: 'disting NT parameter · enum',
    documentation: 'Insert `{ name, choices, defaultIndex }` using a 1-based default.',
    insertText: '{ "${1:Mode}", { "${2:Off}", "${3:On}" }, ${4:1} },',
  },
].map((entry) => ({ ...entry, completionKind: 'snippet' as const, sortText: '000' }))

function localEntry(symbol: SourceIndexSymbol): IntelliSenseEntry {
  return {
    label: symbol.name,
    detail: symbol.kind === 'function'
      ? 'Lua local function'
      : symbol.kind === 'parameter'
        ? 'Lua function parameter'
        : 'Lua local variable',
    documentation: `Declared ${symbol.kind} in the current script.`,
    completionKind: symbol.kind === 'function' ? 'function' : 'variable',
    sortText: '050',
  }
}

function choiceEntry(choice: string, detail: string): IntelliSenseEntry {
  return {
    label: `"${choice}"`,
    detail,
    documentation: `Documented value: \`${choice}\`.`,
    insertText: `"${choice}"`,
    completionKind: 'constant',
    sortText: '000',
  }
}

export function completionEntriesForSource(
  source: string,
  offset: number,
  index = createLuaSourceIndex(source, 1),
): IntelliSenseEntry[] {
  const context = completionContextAt(source, offset, index)
  if (context.kind === 'suppressed') return []
  if (context.kind === 'empty-document') return [COMPLETE_SCRIPT_SNIPPET]
  if (context.kind === 'choices') {
    return context.choices.map((choice) => choiceEntry(choice, context.detail))
  }
  if (context.kind === 'constant-category') {
    return DISTING_CONSTANT_CATALOG
      .filter((entry) => entry.category === context.category || (
        context.category === 'parameter-unit' && entry.category === 'compatibility-alias'
      ))
      .map(constantEntryForIntelliSense)
  }
  if (context.kind === 'parameter-list') return PARAMETER_SNIPPETS
  if (context.kind === 'member') return MEMBER_COMPLETIONS[context.owner] ?? []
  if (context.kind === 'top-level') {
    const existing = new Set(index.topLevelFields.map((field) => field.name))
    return TOP_LEVEL_FIELDS.filter((entry) => !existing.has(entry.label))
  }
  if (context.kind === 'init') {
    const existing = new Set(index.initFields.map((field) => field.name))
    return INIT_FIELDS.filter((entry) => !existing.has(entry.label))
  }

  const declaredBeforeCursor = index.symbols.filter((symbol) => {
    const lines = source.split('\n')
    const lineOffset = lines.slice(0, symbol.selectionRange.startLine - 1)
      .reduce((total, line) => total + line.length + 1, 0)
    const scopeStart = lines.slice(0, symbol.scopeRange.startLine - 1)
      .reduce((total, line) => total + line.length + 1, 0) + symbol.scopeRange.startColumn - 1
    const scopeEnd = lines.slice(0, symbol.scopeRange.endLine - 1)
      .reduce((total, line) => total + line.length + 1, 0) + symbol.scopeRange.endColumn - 1
    return lineOffset + symbol.selectionRange.startColumn - 1 <= offset
      && offset >= scopeStart
      && offset <= scopeEnd
  })
  const locals = [...new Map(declaredBeforeCursor.map((symbol) => [symbol.name, symbol])).values()]
    .map(localEntry)
  return [...locals, ...DISTING_FUNCTIONS, ...DISTING_CONSTANTS, ...LUA_GLOBALS]
}

function signatureDocumentation(entry: DistingApiEntry) {
  const provenance = DISTING_CONTRACT_PROVENANCE[entry.provenance]
  return `${entry.documentation}\n\nContract source: ${provenance.label}.`
}

const SIGNATURES = new Map<string, SignatureEntry[]>()
for (const entry of DISTING_API) {
  SIGNATURES.set(entry.name, entry.overloads.map((overload) => ({
    label: formatApiSignature(entry.name, overload),
    documentation: signatureDocumentation(entry),
    parameters: overload.parameters.map((parameter) => ({
      label: `${parameter.variadic ? '...' : ''}${parameter.name}${parameter.optional ? '?' : ''}`,
      acceptedTypes: parameter.acceptedTypes,
      variadic: Boolean(parameter.variadic),
    })),
  })))
}
for (const entry of LUA_GLOBALS) {
  if (!entry.signature) continue
  SIGNATURES.set(entry.label, [{
    label: entry.signature,
    documentation: entry.documentation,
    parameters: (entry.parameters ?? []).map((label) => ({ label })),
  }])
}
for (const [owner, entries] of Object.entries(MEMBER_COMPLETIONS)) {
  for (const entry of entries) {
    if (!entry.signature) continue
    SIGNATURES.set(`${owner}.${entry.label}`, [{
      label: entry.signature,
      documentation: entry.documentation,
      parameters: (entry.parameters ?? []).map((label) => ({ label })),
    }])
  }
}

const HOVER_ENTRIES = new Map(
  [...DISTING_FUNCTIONS, ...DISTING_CONSTANTS, ...LUA_GLOBALS, ...LUA_KEYWORDS]
    .map((entry) => [entry.label, entry]),
)

function containsPosition(range: SourceIndexSymbol['selectionRange'], line: number, column: number) {
  const startsBefore = range.startLine < line
    || (range.startLine === line && range.startColumn <= column)
  const endsAfter = range.endLine > line
    || (range.endLine === line && range.endColumn >= column)
  return startsBefore && endsAfter
}

function structuralHoverEntry(index: LuaSourceIndex, line: number, column: number) {
  const topLevel = index.topLevelFields.find((field) => (
    containsPosition(field.nameRange, line, column)
  ))
  if (topLevel) return TOP_LEVEL_FIELDS.find((entry) => entry.label === topLevel.name)
  const init = index.initFields.find((field) => containsPosition(field.nameRange, line, column))
  return init ? INIT_FIELDS.find((entry) => entry.label === init.name) : undefined
}

function localHoverEntry(symbol: SourceIndexSymbol): IntelliSenseEntry {
  const kind = symbol.kind === 'function'
    ? 'local function'
    : symbol.kind === 'parameter'
      ? 'function parameter'
      : 'local variable'
  return {
    label: symbol.name,
    signature: symbol.kind === 'function' ? `function ${symbol.name}(…)` : symbol.name,
    detail: `Lua ${kind}`,
    documentation: `A ${kind} declared on line ${symbol.selectionRange.startLine} of this script.`,
  }
}

function activeSignatureIndex(signatures: readonly SignatureEntry[], argumentIndex: number, argumentText: string) {
  if (signatures.length < 2) return 0
  const wantsTable = argumentText.startsWith('{')
  const typedMatch = signatures.findIndex((signature) => {
    const parameter = signature.parameters[Math.min(argumentIndex, signature.parameters.length - 1)]
    if (!parameter?.acceptedTypes || argumentText.length === 0) return false
    return parameter.acceptedTypes.includes('table') === wantsTable
  })
  return typedMatch >= 0 ? typedMatch : 0
}

function activeParameterIndex(signature: SignatureEntry, argumentIndex: number) {
  if (signature.parameters.length === 0) return 0
  const last = signature.parameters.length - 1
  return Math.min(argumentIndex, last)
}

function wordRange(monaco: MonacoApi, model: Monaco.editor.ITextModel, position: Monaco.Position) {
  const word = model.getWordUntilPosition(position)
  return new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn)
}

function monacoCompletionKind(monaco: MonacoApi, kind: CompletionKind | undefined) {
  const kinds = monaco.languages.CompletionItemKind
  if (kind === 'constant') return kinds.Constant
  if (kind === 'field') return kinds.Field
  if (kind === 'method') return kinds.Method
  if (kind === 'snippet') return kinds.Snippet
  if (kind === 'variable') return kinds.Variable
  return kinds.Function
}

function completion(monaco: MonacoApi, entry: IntelliSenseEntry, range: Monaco.Range) {
  return {
    label: entry.label,
    kind: monacoCompletionKind(monaco, entry.completionKind),
    detail: entry.detail,
    documentation: { value: entry.documentation },
    insertText: entry.insertText ?? entry.label,
    insertTextRules: entry.insertText
      ? monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet
      : undefined,
    sortText: `${entry.sortText ?? '200'}:${entry.label}`,
    range,
  }
}

function parameterName(source: string, index: LuaSourceIndex, parameterIndex: number) {
  const range = index.parameters[parameterIndex - 1]?.fields.name
  if (!range) return undefined
  const lines = source.split('\n')
  if (range.startLine !== range.endLine) return undefined
  const raw = lines[range.startLine - 1]?.slice(range.startColumn - 1, range.endColumn - 1).trim()
  return raw?.match(/^["'](.*)["']$/)?.[1]
}

let activeRegistration: { monaco: MonacoApi; disposable: Monaco.IDisposable } | undefined

export function registerDistingIntelliSense(monaco: MonacoApi) {
  if (activeRegistration?.monaco === monaco) return activeRegistration.disposable

  activeRegistration?.disposable.dispose()
  const disposables: Monaco.IDisposable[] = []
  const indexes = new WeakMap<Monaco.editor.ITextModel, { version: number; index: LuaSourceIndex }>()
  const sourceIndex = (model: Monaco.editor.ITextModel) => {
    const version = model.getVersionId()
    const cached = indexes.get(model)
    if (cached?.version === version) return cached.index
    const index = createLuaSourceIndex(model.getValue(), version)
    indexes.set(model, { version, index })
    return index
  }

  disposables.push(monaco.languages.registerCompletionItemProvider(DISTING_LUA_LANGUAGE_ID, {
    triggerCharacters: ['.', 'k'],
    provideCompletionItems(model, position) {
      const source = model.getValue()
      const offset = model.getOffsetAt(position)
      const entries = completionEntriesForSource(source, offset, sourceIndex(model))
      const range = wordRange(monaco, model, position)
      return { suggestions: entries.map((entry) => completion(monaco, entry, range)) }
    },
  }))

  disposables.push(monaco.languages.registerHoverProvider(DISTING_LUA_LANGUAGE_ID, {
    provideHover(model, position) {
      const source = model.getValue()
      const offset = model.getOffsetAt(position)
      const parameter = selfParameterReferenceAt(source, offset)
      if (parameter) {
        const index = sourceIndex(model)
        const name = parameterName(source, index, parameter.index)
        const start = model.getPositionAt(parameter.start)
        const end = model.getPositionAt(parameter.end)
        return {
          range: new monaco.Range(start.lineNumber, start.column, end.lineNumber, end.column),
          contents: [
            { value: `\`\`\`lua\nself.parameters[${parameter.index}]\n\`\`\`` },
            { value: name
              ? `**Script parameter ${parameter.index}: ${name}.** Read-only current scaled value declared by \`init().parameters\`.`
              : `Read-only current scaled value of script parameter ${parameter.index}.` },
          ],
        }
      }

      const word = model.getWordAtPosition(position)
      if (!word) return null
      const line = model.getLineContent(position.lineNumber)
      const prefix = line.slice(0, word.startColumn - 1)
      const owner = prefix.match(/([A-Za-z_]\w*)\.$/)?.[1]
      const index = sourceIndex(model)
      const local = resolvedLocalSymbolAt(source, offset, index)
      const entry = owner
        ? MEMBER_COMPLETIONS[owner]?.find((candidate) => candidate.label === word.word)
        : structuralHoverEntry(index, position.lineNumber, position.column)
          ?? (local ? localHoverEntry(local.definition) : HOVER_ENTRIES.get(word.word))
      if (!entry) return null

      return {
        range: new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn),
        contents: [
          { value: `\`\`\`lua\n${entry.signature ?? entry.label}\n\`\`\`` },
          { value: `**${entry.detail}.** ${entry.documentation}` },
        ],
      }
    },
  }))

  disposables.push(monaco.languages.registerSignatureHelpProvider(DISTING_LUA_LANGUAGE_ID, {
    signatureHelpTriggerCharacters: ['(', ','],
    signatureHelpRetriggerCharacters: [','],
    provideSignatureHelp(model, position) {
      const source = model.getValue()
      const call = activeLuaCallAt(source, model.getOffsetAt(position))
      if (!call) return null
      const signatures = SIGNATURES.get(call.name)
      if (!signatures?.length) return null
      const activeSignature = activeSignatureIndex(signatures, call.argumentIndex, call.argumentText)
      const selected = signatures[activeSignature]

      return {
        value: {
          signatures: signatures.map((signature) => ({
            label: signature.label,
            documentation: signature.documentation,
            parameters: signature.parameters.map((parameter) => ({ label: parameter.label })),
          })),
          activeSignature,
          activeParameter: activeParameterIndex(selected, call.argumentIndex),
        },
        dispose() {},
      }
    },
  }))

  let disposed = false
  const disposable = {
    dispose() {
      if (disposed) return
      disposed = true
      for (const item of disposables.toReversed()) item.dispose()
      if (activeRegistration?.disposable === disposable) activeRegistration = undefined
    },
  }

  activeRegistration = { monaco, disposable }
  return disposable
}
