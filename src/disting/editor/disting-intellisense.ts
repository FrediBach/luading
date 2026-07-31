import type * as Monaco from 'monaco-editor/esm/vs/editor/editor.api'
import {
  DISTING_API,
  DISTING_API_SUPPORT,
  DISTING_CONSTANTS as DISTING_CONSTANT_CATALOG,
  DISTING_CONTRACT_PROVENANCE,
  DISTING_LIFECYCLE,
  type DistingApiEntry,
  type DistingApiParameter,
  type DistingConstantEntry,
  type DistingLifecycleEntry,
} from '../validation/api-manifest'
import { DISTING_LUA_LANGUAGE_ID } from './disting-lua'

type MonacoApi = typeof Monaco

type ApiEntry = {
  label: string
  signature?: string
  detail: string
  documentation: string
  insertText?: string
  parameters?: string[]
}

function apiInsertText(name: string, parameters: readonly DistingApiParameter[], explicit?: string) {
  if (explicit) return explicit
  const placeholders = parameters.map((parameter, index) => (
    `\${${index + 1}:${parameter.snippetDefault ?? parameter.name}}`
  ))
  return `${name}(${placeholders.join(', ')})`
}

export function apiEntryForIntelliSense(entry: DistingApiEntry): ApiEntry {
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
  }
}

const DISTING_FUNCTIONS: ApiEntry[] = DISTING_API.map(apiEntryForIntelliSense)

export function constantEntryForIntelliSense(entry: DistingConstantEntry): ApiEntry {
  const provenance = DISTING_CONTRACT_PROVENANCE[entry.provenance]
  return {
    label: entry.name,
    detail: `disting NT constant · ${entry.category} · ${provenance.label}`,
    documentation: `${entry.documentation}\n\n**Contract source: ${provenance.label}.** ${provenance.detail}`,
  }
}

const DISTING_CONSTANTS: ApiEntry[] = DISTING_CONSTANT_CATALOG.map(
  constantEntryForIntelliSense,
)

const LUA_GLOBALS: ApiEntry[] = [
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
}))

const MEMBER_COMPLETIONS: Record<string, ApiEntry[]> = {
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
  })),
  self: [
    {
      label: 'parameters',
      detail: 'disting NT · current parameter values',
      documentation: 'A 1-based array containing the current scaled value of each parameter.',
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
  ],
}

export const COMPLETE_SCRIPT_SNIPPET: ApiEntry = {
  label: 'disting script',
  detail: 'disting NT · complete script scaffold',
  documentation: 'Create a complete Disting NT Lua lifecycle table with the two required descriptive header comments.',
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

export function lifecycleEntryForIntelliSense(entry: DistingLifecycleEntry): ApiEntry {
  const provenance = DISTING_CONTRACT_PROVENANCE[entry.provenance]
  return {
    label: `${entry.name} callback`,
    signature: entry.signature,
    detail: `disting NT lifecycle · ${entry.cadence}`,
    documentation: `${entry.documentation}\n\n${entry.returnSemantics}\n\n**Cadence:** ${entry.cadence}\n\n**Contract source: ${provenance.label}.** ${provenance.detail}`,
    insertText: entry.snippet,
    parameters: entry.parameters.map((parameter) => parameter.name),
  }
}

const LIFECYCLE_SNIPPETS: ApiEntry[] = [
  COMPLETE_SCRIPT_SNIPPET,
  ...DISTING_LIFECYCLE.map(lifecycleEntryForIntelliSense),
  {
    label: 'parameter definition',
    detail: 'disting NT · numeric parameter',
    documentation: 'Insert `{ name, min, max, default, unit, scale? }` in an `init()` parameter list.',
    insertText: '{ "${1:Name}", ${2:0}, ${3:100}, ${4:50}, ${5:kPercent} }',
  },
]

const SIGNATURES = new Map<string, ApiEntry>()

for (const entry of [...DISTING_FUNCTIONS, ...LUA_GLOBALS]) {
  if (entry.signature) SIGNATURES.set(entry.label, entry)
}

for (const [owner, entries] of Object.entries(MEMBER_COMPLETIONS)) {
  for (const entry of entries) {
    if (entry.signature) SIGNATURES.set(`${owner}.${entry.label}`, entry)
  }
}

const HOVER_ENTRIES = new Map(
  [...DISTING_FUNCTIONS, ...DISTING_CONSTANTS, ...LUA_GLOBALS].map((entry) => [entry.label, entry]),
)

function wordRange(monaco: MonacoApi, model: Monaco.editor.ITextModel, position: Monaco.Position) {
  const word = model.getWordUntilPosition(position)
  return new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn)
}

function completion(monaco: MonacoApi, entry: ApiEntry, range: Monaco.Range, kind: Monaco.languages.CompletionItemKind) {
  return {
    label: entry.label,
    kind,
    detail: entry.detail,
    documentation: { value: entry.documentation },
    insertText: entry.insertText ?? entry.label,
    insertTextRules: entry.insertText
      ? monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet
      : undefined,
    range,
  }
}

function ownerBeforePosition(model: Monaco.editor.ITextModel, position: Monaco.Position) {
  const line = model.getLineContent(position.lineNumber).slice(0, position.column - 1)
  return line.match(/([A-Za-z_]\w*)\.\w*$/)?.[1]
}

let activeRegistration: { monaco: MonacoApi; disposable: Monaco.IDisposable } | undefined

export function registerDistingIntelliSense(monaco: MonacoApi) {
  if (activeRegistration?.monaco === monaco) return activeRegistration.disposable

  activeRegistration?.disposable.dispose()
  const disposables: Monaco.IDisposable[] = []

  disposables.push(monaco.languages.registerCompletionItemProvider(DISTING_LUA_LANGUAGE_ID, {
    triggerCharacters: ['.', 'k'],
    provideCompletionItems(model, position) {
      const range = wordRange(monaco, model, position)
      const owner = ownerBeforePosition(model, position)
      const members = owner ? MEMBER_COMPLETIONS[owner] : undefined

      if (members) {
        return {
          suggestions: members.map((entry) => completion(
            monaco,
            entry,
            range,
            entry.signature
              ? monaco.languages.CompletionItemKind.Method
              : monaco.languages.CompletionItemKind.Field,
          )),
        }
      }

      return {
        suggestions: [
          ...DISTING_FUNCTIONS.map((entry) => completion(
            monaco,
            entry,
            range,
            monaco.languages.CompletionItemKind.Function,
          )),
          ...DISTING_CONSTANTS.map((entry) => completion(
            monaco,
            entry,
            range,
            monaco.languages.CompletionItemKind.Constant,
          )),
          ...LUA_GLOBALS.map((entry) => completion(
            monaco,
            entry,
            range,
            monaco.languages.CompletionItemKind.Function,
          )),
          ...LIFECYCLE_SNIPPETS.map((entry) => completion(
            monaco,
            entry,
            range,
            monaco.languages.CompletionItemKind.Snippet,
          )),
        ],
      }
    },
  }))

  disposables.push(monaco.languages.registerHoverProvider(DISTING_LUA_LANGUAGE_ID, {
    provideHover(model, position) {
      const word = model.getWordAtPosition(position)
      if (!word) return null

      const line = model.getLineContent(position.lineNumber)
      const prefix = line.slice(0, word.startColumn - 1)
      const owner = prefix.match(/([A-Za-z_]\w*)\.$/)?.[1]
      const entry = owner
        ? MEMBER_COMPLETIONS[owner]?.find((candidate) => candidate.label === word.word)
        : HOVER_ENTRIES.get(word.word)
      if (!entry) return null

      return {
        range: new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn),
        contents: [
          { value: `\`\`\`lua\n${entry.signature ?? entry.label}\n\`\`\`` },
          { value: entry.documentation },
        ],
      }
    },
  }))

  disposables.push(monaco.languages.registerSignatureHelpProvider(DISTING_LUA_LANGUAGE_ID, {
    signatureHelpTriggerCharacters: ['(', ','],
    signatureHelpRetriggerCharacters: [','],
    provideSignatureHelp(model, position) {
      const prefix = model.getValueInRange({
        startLineNumber: Math.max(1, position.lineNumber - 8),
        startColumn: 1,
        endLineNumber: position.lineNumber,
        endColumn: position.column,
      })
      const call = prefix.match(/([A-Za-z_]\w*(?:\.[A-Za-z_]\w*)?)\s*\(([^()]*)$/)
      if (!call) return null

      const entry = SIGNATURES.get(call[1])
      if (!entry?.signature) return null
      const activeParameter = Math.min(
        entry.parameters?.length ? entry.parameters.length - 1 : 0,
        call[2].split(',').length - 1,
      )

      return {
        value: {
          signatures: [{
            label: entry.signature,
            documentation: entry.documentation,
            parameters: (entry.parameters ?? []).map((label) => ({ label })),
          }],
          activeSignature: 0,
          activeParameter,
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
