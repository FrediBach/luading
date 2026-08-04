import type { SourceSaveStatus } from './projects'

export function sourceSaveLabel(status: SourceSaveStatus): string {
  if (status.kind === 'template') return 'Bundled template'
  if (status.kind === 'saving') return 'Saving source…'
  if (status.kind === 'saved') return 'Saved locally'
  if (status.kind === 'conflict') return 'Conflict copy saved'
  if (status.kind === 'degraded') return status.recoverable ? 'Recovery draft' : 'Storage unavailable'
  return 'Source not saved'
}
