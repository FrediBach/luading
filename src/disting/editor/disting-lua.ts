import type * as Monaco from 'monaco-editor/esm/vs/editor/editor.api'
import { DISTING_API, DISTING_CONSTANTS } from '../validation/api-manifest'

type MonacoApi = typeof Monaco

type DistingLanguageApi = {
  languages: Pick<
    MonacoApi['languages'],
    'getLanguages' | 'register' | 'setLanguageConfiguration' | 'setMonarchTokensProvider'
  >
}

export const DISTING_LUA_LANGUAGE_ID = 'disting-lua'
export const DISTING_LUA_MODEL_URI = 'inmemory://disting/main.lua'

const LUA_KEYWORDS = [
  'and',
  'break',
  'do',
  'else',
  'elseif',
  'end',
  'false',
  'for',
  'function',
  'goto',
  'if',
  'in',
  'local',
  'nil',
  'not',
  'or',
  'repeat',
  'return',
  'then',
  'true',
  'until',
  'while',
] as const

const LUA_OPERATORS = [
  '+', '-', '*', '/', '//', '%', '^', '#',
  '&', '~', '|', '<<', '>>',
  '..', '<', '<=', '>', '>=', '==', '~=', '=',
] as const

const DISTING_FUNCTION_NAMES = DISTING_API.map((entry) => entry.name)
const DISTING_CONSTANT_NAMES = DISTING_CONSTANTS.map((entry) => entry.name)

export const DISTING_LUA_LANGUAGE_CONFIGURATION: Monaco.languages.LanguageConfiguration = {
  comments: {
    lineComment: '--',
    blockComment: ['--[[', ']]'],
  },
  brackets: [
    ['{', '}'],
    ['[', ']'],
    ['(', ')'],
  ],
  wordPattern: /(?:[A-Za-z_]\w*)|(?:0[xX][\dA-Fa-f]+)|(?:\d+(?:\.\d*)?(?:[eE][+-]?\d+)?)/g,
  indentationRules: {
    increaseIndentPattern: /^((?!--).)*(?:\bfunction\b.*|\b(?:then|do)\b\s*|\brepeat\s*|\belse\s*)(?:--.*)?$/,
    decreaseIndentPattern: /^\s*(?:elseif\b|else\b|end\b|until\b)/,
  },
  onEnterRules: [
    {
      beforeText: /^\s*(?:elseif\b.*\bthen|else)\s*(?:--.*)?$/,
      afterText: /^\s*end\b/,
      action: { indentAction: 2 },
    },
    {
      beforeText: /^((?!--).)*(?:\bfunction\b.*|\b(?:then|do)\b\s*|\brepeat\s*)(?:--.*)?$/,
      afterText: /^\s*(?:end|until)\b/,
      action: { indentAction: 2 },
    },
    {
      beforeText: /^\s*(?:elseif\b.*\bthen|else)\s*(?:--.*)?$/,
      action: { indentAction: 1 },
    },
    {
      beforeText: /^((?!--).)*(?:\bfunction\b.*|\b(?:then|do)\b\s*|\brepeat\s*)(?:--.*)?$/,
      action: { indentAction: 1 },
    },
    {
      beforeText: /^.*\{[^}"']*$/,
      afterText: /^\s*\}/,
      action: { indentAction: 2 },
    },
  ],
  autoClosingPairs: [
    { open: '{', close: '}' },
    { open: '[', close: ']' },
    { open: '(', close: ')' },
    { open: '"', close: '"', notIn: ['string', 'comment'] },
    { open: "'", close: "'", notIn: ['string', 'comment'] },
  ],
  surroundingPairs: [
    { open: '{', close: '}' },
    { open: '[', close: ']' },
    { open: '(', close: ')' },
    { open: '"', close: '"' },
    { open: "'", close: "'" },
  ],
  folding: {
    markers: {
      start: /^\s*--\s*#?region\b/,
      end: /^\s*--\s*#?endregion\b/,
    },
  },
}

export const DISTING_LUA_TOKENIZER: Monaco.languages.IMonarchLanguage = {
  defaultToken: '',
  tokenPostfix: '.disting-lua',
  keywords: LUA_KEYWORDS,
  operators: LUA_OPERATORS,
  distingFunctions: DISTING_FUNCTION_NAMES,
  distingConstants: DISTING_CONSTANT_NAMES,
  brackets: [
    { token: 'delimiter.bracket', open: '{', close: '}' },
    { token: 'delimiter.array', open: '[', close: ']' },
    { token: 'delimiter.parenthesis', open: '(', close: ')' },
  ],
  symbols: /[=><~&|+\-*/%^#]+/,
  escapes: /\\(?:[abfnrtv\\"']|z\s*|x[\dA-Fa-f]{2}|u\{[\dA-Fa-f]+\}|\d{1,3})/,
  tokenizer: {
    root: [
      { include: '@whitespace' },

      // Lua table fields use `name = value`; the generic Monaco Lua mode
      // incorrectly highlights JavaScript-style `name: value` fields.
      [
        /([,{])(\s*)([A-Za-z_]\w*)(\s*)(=)(?!=)/,
        ['@brackets', '', 'key', '', 'delimiter'],
      ],

      [
        /[A-Za-z_]\w*/,
        {
          cases: {
            '@keywords': { token: 'keyword.$0' },
            '@distingFunctions': 'support.function.disting',
            '@distingConstants': 'constant.disting',
            '@default': 'identifier',
          },
        },
      ],

      // Long brackets must be recognized before the ordinary `[` bracket.
      [/\[([=]*)\[/, { token: 'string', next: '@longString.$1' }],
      [/[{}()[\]]/, '@brackets'],
      [
        /@symbols/,
        {
          cases: {
            '@operators': 'operator',
            '@default': 'delimiter',
          },
        },
      ],

      // Lua 5.4 decimal and hexadecimal integers and floats.
      [/0[xX](?:[\dA-Fa-f]+(?:\.[\dA-Fa-f]*)?|\.[\dA-Fa-f]+)[pP][+-]?\d+/, 'number.float.hex'],
      [/0[xX][\dA-Fa-f]+/, 'number.hex'],
      [/(?:\d+\.\d*|\.\d+)(?:[eE][+-]?\d+)?/, 'number.float'],
      [/\d+[eE][+-]?\d+/, 'number.float'],
      [/\d+/, 'number'],

      [/\.\.\.?/, 'operator'],
      [/[;,:.]/, 'delimiter'],

      [/"/, { token: 'string.quote', next: '@doubleQuotedString' }],
      [/'/, { token: 'string.quote', next: '@singleQuotedString' }],
    ],

    whitespace: [
      [/[ \t\r\n]+/, ''],
      [/--\[([=]*)\[/, { token: 'comment', next: '@longComment.$1' }],
      [/--.*$/, 'comment'],
    ],

    longComment: [
      [/[^\]]+/, 'comment'],
      [
        /\]([=]*)\]/,
        {
          cases: {
            '$1==$S2': { token: 'comment', next: '@pop' },
            '@default': 'comment',
          },
        },
      ],
      [/./, 'comment'],
    ],

    longString: [
      [/[^\]]+/, 'string'],
      [
        /\]([=]*)\]/,
        {
          cases: {
            '$1==$S2': { token: 'string', next: '@pop' },
            '@default': 'string',
          },
        },
      ],
      [/./, 'string'],
    ],

    doubleQuotedString: [
      [/[^\\"]+/, 'string'],
      [/@escapes/, 'string.escape'],
      [/\\./, 'string.escape.invalid'],
      [/"/, { token: 'string.quote', next: '@pop' }],
    ],

    singleQuotedString: [
      [/[^\\']+/, 'string'],
      [/@escapes/, 'string.escape'],
      [/\\./, 'string.escape.invalid'],
      [/'/, { token: 'string.quote', next: '@pop' }],
    ],
  },
}

let activeRegistration: { api: DistingLanguageApi; disposable: Monaco.IDisposable } | undefined

export function registerDistingLuaLanguage(api: DistingLanguageApi): Monaco.IDisposable {
  if (activeRegistration?.api === api) return activeRegistration.disposable

  activeRegistration?.disposable.dispose()

  if (!api.languages.getLanguages().some((language) => language.id === DISTING_LUA_LANGUAGE_ID)) {
    api.languages.register({
      id: DISTING_LUA_LANGUAGE_ID,
      aliases: ['Disting Lua', 'disting-lua'],
      mimetypes: ['text/x-disting-lua'],
    })
  }

  const disposables = [
    api.languages.setLanguageConfiguration(
      DISTING_LUA_LANGUAGE_ID,
      DISTING_LUA_LANGUAGE_CONFIGURATION,
    ),
    api.languages.setMonarchTokensProvider(
      DISTING_LUA_LANGUAGE_ID,
      DISTING_LUA_TOKENIZER,
    ),
  ]

  let disposed = false
  const disposable = {
    dispose() {
      if (disposed) return
      disposed = true
      for (const item of disposables.toReversed()) item.dispose()
      if (activeRegistration?.disposable === disposable) activeRegistration = undefined
    },
  }

  activeRegistration = { api, disposable }
  return disposable
}
