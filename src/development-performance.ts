export const DEVELOPMENT_MEASURE_LIMIT = 2000
export const DEVELOPMENT_MEASURE_CHECK_INTERVAL_MS = 1000

type PerformanceMeasures = Pick<
  Performance,
  'clearMeasures' | 'getEntriesByType'
>

interface PerformanceMeasureHost {
  performance: PerformanceMeasures
  setInterval(callback: () => void, delay: number): number
  clearInterval(handle: number): void
}

export function pruneDevelopmentPerformanceMeasures(
  performance: PerformanceMeasures,
  limit = DEVELOPMENT_MEASURE_LIMIT,
): boolean {
  if (performance.getEntriesByType('measure').length <= limit) return false
  performance.clearMeasures()
  return true
}

export function installDevelopmentPerformanceCleanup(
  host: PerformanceMeasureHost,
): () => void {
  const interval = host.setInterval(() => {
    pruneDevelopmentPerformanceMeasures(host.performance)
  }, DEVELOPMENT_MEASURE_CHECK_INTERVAL_MS)

  return () => host.clearInterval(interval)
}
