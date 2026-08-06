export function luaQuotedString(value: string): string {
  let result = '"'
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0
    if (character === '"') result += '\\"'
    else if (character === '\\') result += '\\\\'
    else if (character === '\n') result += '\\n'
    else if (character === '\r') result += '\\r'
    else if (character === '\t') result += '\\t'
    else if (code < 32 || code === 127) result += `\\${String(code).padStart(3, '0')}`
    else result += character
  }
  return `${result}"`
}
