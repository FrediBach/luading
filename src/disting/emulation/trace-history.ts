import type { TracePoint } from '../types'

export const DEFAULT_TRACE_POINT_LIMIT = 5000

/**
 * Keeps the high-frequency scope history outside React props.
 *
 * Native private fields are deliberately used here. React's development
 * instrumentation recursively records enumerable prop data in User Timing
 * measures, so exposing the trace array on this object would retain and clone
 * thousands of samples on every frame.
 */
export class TraceHistory {
  #limit: number
  #points: readonly TracePoint[] = []

  constructor(limit = DEFAULT_TRACE_POINT_LIMIT) {
    this.#limit = limit
  }

  get points(): readonly TracePoint[] {
    return this.#points
  }

  snapshot(revision: number): readonly TracePoint[] {
    // The revision is the React-visible synchronization token for this opaque
    // store. Reading it here prevents compilers from treating the snapshot as
    // invariant merely because the TraceHistory identity is stable.
    void revision
    return this.#points
  }

  append(points: readonly TracePoint[]): void {
    if (points.length === 0) return
    if (points.length >= this.#limit) {
      this.#points = points.slice(-this.#limit)
      return
    }

    const combined = [...this.#points, ...points]
    this.#points = combined.length > this.#limit
      ? combined.slice(-this.#limit)
      : combined
  }

  clear(): void {
    this.#points = []
  }
}
