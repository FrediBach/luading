import type { TracePoint } from '../types'

export function downsampleTraceChannel(
  trace: readonly TracePoint[],
  kind: 'input' | 'output',
  channelIndex: number,
  maxPoints: number,
  windowPoints: number,
) {
  if (trace.length === 0 || maxPoints <= 0 || windowPoints <= 0) return []
  const start = Math.max(0, trace.length - windowPoints)
  const count = trace.length - start
  const read = (index: number) => (
    trace[index]?.[kind === 'input' ? 'inputs' : 'outputs'][channelIndex] ?? 0
  )

  if (count <= maxPoints) {
    return Array.from({ length: count }, (_, index) => read(start + index))
  }
  if (maxPoints === 1) return [read(trace.length - 1)]

  const result: number[] = []
  const bucketCount = Math.max(1, Math.floor(maxPoints / 2))

  for (let bucket = 0; bucket < bucketCount; bucket += 1) {
    const bucketStart = start + Math.floor(bucket * count / bucketCount)
    const bucketEnd = start + Math.floor((bucket + 1) * count / bucketCount)
    let minimum = Number.POSITIVE_INFINITY
    let maximum = Number.NEGATIVE_INFINITY
    let minimumIndex = bucketStart
    let maximumIndex = bucketStart

    for (let index = bucketStart; index < bucketEnd; index += 1) {
      const value = read(index)
      if (value < minimum) {
        minimum = value
        minimumIndex = index
      }
      if (value > maximum) {
        maximum = value
        maximumIndex = index
      }
    }

    if (minimumIndex <= maximumIndex) result.push(minimum, maximum)
    else result.push(maximum, minimum)
  }

  return result.slice(-maxPoints)
}
