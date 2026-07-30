import { describe, expect, it } from 'vitest'
import { FrameCommitGate } from './frame-commit'

describe('frame commit gate', () => {
  it('acknowledges only after the scheduled revision commits', () => {
    const gate = new FrameCommitGate<object>()
    const worker = {}
    const revision = gate.schedule(worker)

    expect(gate.commit(revision - 1, worker)).toBeNull()
    expect(gate.commit(revision, worker)).toBe(worker)
    expect(gate.commit(revision, worker)).toBeNull()
  })

  it('does not acknowledge a frame from a replaced worker', () => {
    const gate = new FrameCommitGate<object>()
    const oldWorker = {}
    const currentWorker = {}
    const revision = gate.schedule(oldWorker)

    expect(gate.commit(revision, currentWorker)).toBeNull()
  })

  it('keeps a newer pending frame when an older transition commits', () => {
    const gate = new FrameCommitGate<object>()
    const worker = {}
    const olderRevision = gate.schedule(worker)
    const newerRevision = gate.schedule(worker)

    expect(gate.commit(olderRevision, worker)).toBeNull()
    expect(gate.commit(newerRevision, worker)).toBe(worker)
  })

  it('drops pending acknowledgement state when cleared', () => {
    const gate = new FrameCommitGate<object>()
    const worker = {}
    const revision = gate.schedule(worker)

    gate.clear()

    expect(gate.commit(revision, worker)).toBeNull()
  })
})
