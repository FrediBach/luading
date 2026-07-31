import {
  compileLuaSource,
  type LuaEngineLike,
} from '../emulation/lua-runtime'
import { validateLuaSource } from './static-validator'
import type {
  ScriptDiagnostic,
  SourceRange,
} from './types'

const LUA_ERROR_LOCATION = /(?:^|\n).*?script\.lua:(\d+):\s*([^\n]*)$/
const NEAR_TOKEN = /\bnear\s+(?:'([^']*)'|"([^"]*)"|(<[^>]+>))\s*$/

function lineRangeAtEnd(lines: readonly string[], reportedLine: number): SourceRange {
  const startLine = Math.max(1, Math.min(reportedLine, lines.length))
  const startColumn = (lines[startLine - 1]?.length ?? 0) + 1
  return {
    startLine,
    startColumn,
    endLine: startLine,
    endColumn: startColumn,
  }
}

export function syntaxErrorRange(source: string, errorMessage: string): SourceRange {
  const lines = source.split('\n')
  const location = errorMessage.match(LUA_ERROR_LOCATION)
  const reportedLine = Number(location?.[1] ?? 1)
  const fallback = lineRangeAtEnd(lines, reportedLine)
  const line = lines[fallback.startLine - 1] ?? ''
  const near = (location?.[2] ?? errorMessage).match(NEAR_TOKEN)
  const token = near?.[1] ?? near?.[2] ?? near?.[3]

  if (!token || token === '<eof>') return fallback

  const tokenIndex = line.lastIndexOf(token)
  if (tokenIndex < 0) return fallback

  return {
    startLine: fallback.startLine,
    startColumn: tokenIndex + 1,
    endLine: fallback.startLine,
    endColumn: tokenIndex + Math.max(1, token.length) + 1,
  }
}

function syntaxErrorSummary(errorMessage: string) {
  return errorMessage.match(LUA_ERROR_LOCATION)?.[2]?.trim() || errorMessage.trim()
}

export function syntaxErrorDiagnostic(
  source: string,
  errorMessage: string,
): ScriptDiagnostic {
  const range = syntaxErrorRange(source, errorMessage)
  const summary = syntaxErrorSummary(errorMessage)
  return {
    id: `syntax:lua-compile:${range.startLine}:${range.startColumn}`,
    ruleId: 'lua-syntax',
    severity: 'error',
    category: 'contract',
    target: 'simulator',
    origin: 'syntax',
    message: `Lua syntax error: ${summary}`,
    detail: 'The script does not compile with the simulator\'s Lua 5.4 runtime. The returned chunk was not executed.',
    penalty: 0,
    range,
  }
}

export async function validateLuaSourceWithEngine(
  lua: LuaEngineLike,
  source: string,
  staticDiagnostics = validateLuaSource(source),
): Promise<ScriptDiagnostic[]> {
  const compileError = await compileLuaSource(lua, source)
  return compileError
    ? [...staticDiagnostics, syntaxErrorDiagnostic(source, compileError)]
    : staticDiagnostics
}

export type LuaValidationService = ReturnType<typeof createLuaValidationService>

export function createLuaValidationService(
  createEngine: () => Promise<LuaEngineLike>,
) {
  let enginePromise: Promise<LuaEngineLike> | undefined
  let queue: Promise<void> = Promise.resolve()

  return {
    validate(source: string): Promise<ScriptDiagnostic[]> {
      const staticDiagnostics = validateLuaSource(source)
      const result = queue.then(async () => {
        enginePromise ??= createEngine()
        const engine = await enginePromise
        return validateLuaSourceWithEngine(engine, source, staticDiagnostics)
      })
      queue = result.then(() => undefined, () => undefined)
      return result
    },
  }
}
