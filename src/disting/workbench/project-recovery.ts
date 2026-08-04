import { luaDownloadFilename } from './script-file'

export const PROJECT_RECOVERY_KEY = 'luading-active-source-recovery-v1'

export interface ProjectRecoveryJournal {
  version: 1
  document: { kind: 'project'; projectId: string } | { kind: 'bundled'; exampleId: string }
  filename: string
  source: string
  revision: number
  updatedAt: number
  bundledExampleId?: string
}

export interface RecoveryStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

function parseJournal(value: unknown): ProjectRecoveryJournal | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
  const journal = value as Record<string, unknown>
  const document = journal.document
  if (journal.version !== 1
    || typeof journal.filename !== 'string'
    || luaDownloadFilename(journal.filename) !== journal.filename
    || typeof journal.source !== 'string'
    || !Number.isSafeInteger(journal.revision) || (journal.revision as number) < 0
    || typeof journal.updatedAt !== 'number' || !Number.isFinite(journal.updatedAt)
    || typeof document !== 'object' || document === null || Array.isArray(document)) return undefined
  const ref = document as Record<string, unknown>
  const normalizedDocument = ref.kind === 'project' && typeof ref.projectId === 'string'
    ? { kind: 'project' as const, projectId: ref.projectId }
    : ref.kind === 'bundled' && typeof ref.exampleId === 'string'
      ? { kind: 'bundled' as const, exampleId: ref.exampleId }
      : undefined
  if (!normalizedDocument) return undefined
  return {
    version: 1,
    document: normalizedDocument,
    filename: journal.filename,
    source: journal.source,
    revision: journal.revision as number,
    updatedAt: journal.updatedAt,
    ...(typeof journal.bundledExampleId === 'string'
      ? { bundledExampleId: journal.bundledExampleId }
      : {}),
  }
}

export function readRecoveryJournal(storage: RecoveryStorage | undefined): ProjectRecoveryJournal | undefined {
  if (!storage) return undefined
  try {
    const value = storage.getItem(PROJECT_RECOVERY_KEY)
    return value ? parseJournal(JSON.parse(value)) : undefined
  } catch {
    return undefined
  }
}

export function writeRecoveryJournal(
  storage: RecoveryStorage | undefined,
  journal: ProjectRecoveryJournal,
): boolean {
  if (!storage) return false
  try {
    storage.setItem(PROJECT_RECOVERY_KEY, JSON.stringify(journal))
    return true
  } catch {
    return false
  }
}

export function clearRecoveryJournal(
  storage: RecoveryStorage | undefined,
  savedRevision: number,
): void {
  const current = readRecoveryJournal(storage)
  if (!current || current.revision > savedRevision) return
  try {
    storage?.removeItem(PROJECT_RECOVERY_KEY)
  } catch {
    // Best-effort cleanup; a validated older journal is harmless on the next boot.
  }
}
