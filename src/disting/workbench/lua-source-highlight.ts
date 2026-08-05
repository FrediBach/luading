const LUA_KEYWORDS = new Set([
  'and', 'break', 'do', 'else', 'elseif', 'end', 'false', 'for', 'function',
  'goto', 'if', 'in', 'local', 'nil', 'not', 'or', 'repeat', 'return', 'then',
  'true', 'until', 'while',
])

const LUA_BUILTINS = new Set([
  'drawText', 'ipairs', 'math', 'pairs', 'print', 'self', 'string', 'table',
  'tonumber', 'tostring', 'type',
])

export type LuaPreviewTokenKind =
  | 'plain'
  | 'comment'
  | 'string'
  | 'number'
  | 'keyword'
  | 'constant'
  | 'builtin'

export interface LuaPreviewToken {
  kind: LuaPreviewTokenKind
  text: string
}

function tokenKind(identifier: string): LuaPreviewTokenKind {
  if (LUA_KEYWORDS.has(identifier)) return 'keyword'
  if (/^k[A-Z]\w*$/.test(identifier)) return 'constant'
  if (LUA_BUILTINS.has(identifier)) return 'builtin'
  return 'plain'
}

export function tokenizeLuaSource(source: string): LuaPreviewToken[] {
  const tokens: LuaPreviewToken[] = []
  const push = (kind: LuaPreviewTokenKind, text: string) => {
    if (!text) return
    const previous = tokens.at(-1)
    if (previous?.kind === kind) previous.text += text
    else tokens.push({ kind, text })
  }

  let index = 0
  while (index < source.length) {
    if (source.startsWith('--', index)) {
      const end = source.indexOf('\n', index)
      const next = end < 0 ? source.length : end
      push('comment', source.slice(index, next))
      index = next
      continue
    }

    const character = source[index]
    if (character === '"' || character === "'") {
      const quote = character
      let end = index + 1
      while (end < source.length) {
        if (source[end] === '\\') end += 2
        else if (source[end++] === quote) break
      }
      push('string', source.slice(index, end))
      index = end
      continue
    }

    const number = source.slice(index).match(/^(?:0[xX][\dA-Fa-f]+|\d+(?:\.\d*)?(?:[eE][+-]?\d+)?)/)?.[0]
    if (number) {
      push('number', number)
      index += number.length
      continue
    }

    const identifier = source.slice(index).match(/^[A-Za-z_]\w*/)?.[0]
    if (identifier) {
      push(tokenKind(identifier), identifier)
      index += identifier.length
      continue
    }

    push('plain', character)
    index += 1
  }
  return tokens
}
