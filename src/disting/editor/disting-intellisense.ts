import type * as Monaco from 'monaco-editor/esm/vs/editor/editor.api'
import { DISTING_API } from '../validation/api-manifest'

type MonacoApi = typeof Monaco

type ApiEntry = {
  label: string
  signature?: string
  detail: string
  documentation: string
  insertText?: string
  parameters?: string[]
}

function apiInsertText(name: string, parameters: string[], explicit?: string) {
  if (explicit) return explicit
  const placeholders = parameters.map((parameter, index) => (
    `\${${index + 1}:${parameter.replace(/\?$/, '')}}`
  ))
  return `${name}(${placeholders.join(', ')})`
}

const DISTING_FUNCTIONS: ApiEntry[] = DISTING_API.map((entry) => ({
  label: entry.name,
  signature: entry.signature,
  detail: entry.simulator ? entry.detail : `${entry.detail} · hardware only`,
  documentation: entry.simulator
    ? entry.documentation
    : `${entry.documentation} Valid on Disting NT hardware; not currently emulated by this simulator.`,
  insertText: apiInsertText(entry.name, entry.parameters, entry.insertText),
  parameters: entry.parameters,
}))

const DISTING_CONSTANTS: ApiEntry[] = [
  ['kCV', 'CV input'],
  ['kGate', 'Gate input'],
  ['kTrigger', 'Trigger input'],
  ['kStepped', 'Stepped output'],
  ['kLinear', 'Linear output'],
  ['kNone', 'No parameter unit'],
  ['kDb', 'Decibel parameter unit'],
  ['kDb_minInf', 'Decibel unit with −∞ minimum'],
  ['kPercent', 'Percent parameter unit'],
  ['kHz', 'Hertz parameter unit'],
  ['kSemitones', 'Semitone parameter unit'],
  ['kCents', 'Cents parameter unit'],
  ['kMs', 'Milliseconds parameter unit'],
  ['kSeconds', 'Seconds parameter unit'],
  ['kFrames', 'Frames parameter unit'],
  ['kMIDINote', 'MIDI note parameter unit'],
  ['kMillivolts', 'Millivolts parameter unit'],
  ['kVolts', 'Volts parameter unit'],
  ['kBPM', 'Beats-per-minute parameter unit'],
  ['kBy10', 'Parameter scaling ÷ 10'],
  ['kBy100', 'Parameter scaling ÷ 100'],
  ['kBy1000', 'Parameter scaling ÷ 1000'],
].map(([label, detail]) => ({
  label,
  detail: `disting NT constant · ${detail}`,
  documentation: detail,
}))

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
      documentation: 'The firmware parameter offset for this algorithm instance.',
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

const LIFECYCLE_SNIPPETS: ApiEntry[] = [
  {
    label: 'disting script',
    detail: 'disting NT · complete script scaffold',
    documentation: 'Create a complete Disting NT Lua lifecycle table.',
    insertText: [
      'local out = {}',
      '',
      'return {',
      '  name = "${1:Algorithm name}",',
      '  author = "${2:Author}",',
      '',
      '  init = function(self)',
      '    return {',
      '      inputs = { kCV },',
      '      inputNames = { "Input" },',
      '      outputs = { kLinear },',
      '      outputNames = { "Output" },',
      '      parameters = {',
      '        { "${3:Amount}", 0, 100, 50, kPercent },',
      '      },',
      '    }',
      '  end,',
      '',
      '  step = function(self, dt, inputs)',
      '    out[1] = ${4:inputs[1]}',
      '    return out',
      '  end,',
      '',
      '  draw = function(self)',
      '    ${5:drawText(8, 20, self.name)}',
      '    return true',
      '  end,',
      '}',
    ].join('\n'),
  },
  {
    label: 'init callback',
    detail: 'disting NT lifecycle · declare I/O and parameters',
    documentation: 'Runs once when the script loads. Return the input, output, and parameter metadata.',
    insertText: [
      'init = function(self)',
      '  return {',
      '    inputs = { ${1:kCV} },',
      '    inputNames = { "${2:Input}" },',
      '    outputs = { ${3:kLinear} },',
      '    outputNames = { "${4:Output}" },',
      '    parameters = {',
      '      ${5:{ "Amount", 0, 100, 50, kPercent }},',
      '    },',
      '  }',
      'end,',
    ].join('\n'),
  },
  {
    label: 'step callback',
    detail: 'disting NT lifecycle · 1 kHz control step',
    documentation: 'Runs every 1 ms in this playground. Return a 1-based table of output voltages.',
    insertText: [
      'step = function(self, dt, inputs)',
      '  ${1:out[1] = inputs[1]}',
      '  return out',
      'end,',
    ].join('\n'),
  },
  {
    label: 'trigger callback',
    detail: 'disting NT lifecycle · rising trigger edge',
    documentation: 'Runs when a declared trigger input crosses the high threshold. Input numbers are 1-based.',
    insertText: [
      'trigger = function(self, input)',
      '  ${1:-- Handle the rising edge}',
      'end,',
    ].join('\n'),
  },
  {
    label: 'gate callback',
    detail: 'disting NT lifecycle · gate edge',
    documentation: 'Runs on both edges of a declared gate input. `rising` is true for the rising edge.',
    insertText: [
      'gate = function(self, input, rising)',
      '  ${1:-- Handle the gate edge}',
      'end,',
    ].join('\n'),
  },
  {
    label: 'draw callback',
    detail: 'disting NT lifecycle · 30 fps display',
    documentation: 'Draws the custom 256×64 UI. Return true to suppress the standard firmware parameter line.',
    insertText: [
      'draw = function(self)',
      '  ${1:drawText(8, 20, self.name)}',
      '  return true',
      'end,',
    ].join('\n'),
  },
  {
    label: 'custom UI callbacks',
    detail: 'disting NT lifecycle · custom front-panel behavior',
    documentation: 'Opt into custom UI dispatch and handle a front-panel control.',
    insertText: [
      'ui = function(self)',
      '  return true',
      'end,',
      'setupUi = function(self)',
      '  return { ${1:0.5}, ${2:0.5}, ${3:0.5} }',
      'end,',
      'pot3Turn = function(self, value)',
      '  ${4:-- Handle normalized pot position}',
      'end,',
    ].join('\n'),
  },
  {
    label: 'MIDI receive callback',
    detail: 'disting NT lifecycle · filtered MIDI input',
    documentation: 'Handle messages selected by the `midi` metadata returned from init().',
    insertText: [
      'midiMessage = function(self, message)',
      '  local status = message[1]',
      '  ${1:-- Handle the MIDI bytes}',
      'end,',
    ].join('\n'),
  },
  {
    label: 'serialise callback',
    detail: 'disting NT lifecycle · preset state',
    documentation: 'Return JSON-compatible state that will be restored as `self.state`.',
    insertText: [
      'serialise = function(self)',
      '  return {',
      '    ${1:value = self.value},',
      '  }',
      'end,',
    ].join('\n'),
  },
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

export function registerDistingIntelliSense(monaco: MonacoApi) {
  const disposables: Monaco.IDisposable[] = []

  disposables.push(monaco.languages.registerCompletionItemProvider('lua', {
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

  disposables.push(monaco.languages.registerHoverProvider('lua', {
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

  disposables.push(monaco.languages.registerSignatureHelpProvider('lua', {
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

  return {
    dispose() {
      for (const disposable of disposables) disposable.dispose()
    },
  }
}
