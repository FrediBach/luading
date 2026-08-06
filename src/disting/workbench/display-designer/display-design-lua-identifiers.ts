const LUA_KEYWORDS = new Set([
  'and', 'break', 'do', 'else', 'elseif', 'end', 'false', 'for', 'function', 'goto',
  'if', 'in', 'local', 'nil', 'not', 'or', 'repeat', 'return', 'then', 'true', 'until', 'while',
])

const GENERATED_LUA_RESERVED_IDENTIFIERS = new Set([
  'self', 'math',
  'drawLine', 'drawSmoothLine', 'drawBox', 'drawRectangle',
  'drawCircle', 'drawSmoothCircle', 'drawText', 'drawTinyText',
])

export function isSafeDisplayLuaIdentifier(value: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*$/u.test(value)
    && !LUA_KEYWORDS.has(value)
    && !GENERATED_LUA_RESERVED_IDENTIFIERS.has(value)
}

export function displayLuaIdentifierBase(value: string, fallback = 'value'): string {
  const ascii = value.normalize('NFKD').replace(/[\u0300-\u036f]/gu, '')
  let candidate = ascii.trim().toLowerCase().replace(/[^a-z0-9_]+/gu, '_').replace(/^_+|_+$/gu, '')
  if (!candidate) candidate = fallback
  if (/^[0-9]/u.test(candidate)) candidate = `${fallback}_${candidate}`
  if (!isSafeDisplayLuaIdentifier(candidate)) candidate = `${fallback}_${candidate}`
  return candidate
}

export function allocateDisplayLuaIdentifier(
  value: string,
  usedIdentifiers: Iterable<string>,
  fallback = 'value',
): string {
  const used = new Set(usedIdentifiers)
  const base = displayLuaIdentifierBase(value, fallback)
  let candidate = base
  let suffix = 2
  while (used.has(candidate) || !isSafeDisplayLuaIdentifier(candidate)) candidate = `${base}_${suffix++}`
  return candidate
}
