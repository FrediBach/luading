export interface PendingFrameCommit<Source> {
  revision: number
  source: Source
}

export class FrameCommitGate<Source> {
  private nextRevision = 0
  private pending: PendingFrameCommit<Source> | null = null

  schedule(source: Source) {
    this.nextRevision += 1
    this.pending = {
      revision: this.nextRevision,
      source,
    }
    return this.nextRevision
  }

  commit(revision: number, activeSource: Source | null) {
    if (!this.pending || this.pending.revision !== revision) return null

    const { source } = this.pending
    this.pending = null
    return source === activeSource ? source : null
  }

  clear() {
    this.pending = null
  }
}
