import { describe, expect, it, vi } from 'vitest'
import {
  DEVELOPMENT_MEASURE_LIMIT,
  installDevelopmentPerformanceCleanup,
  pruneDevelopmentPerformanceMeasures,
} from './development-performance'

function measures(count: number): PerformanceEntryList {
  return Array.from({ length: count }, () => ({} as PerformanceEntry))
}

describe('development performance cleanup', () => {
  it('preserves a bounded set of measures', () => {
    const clearMeasures = vi.fn()
    const performance = {
      clearMeasures,
      getEntriesByType: () => measures(DEVELOPMENT_MEASURE_LIMIT),
    }

    expect(pruneDevelopmentPerformanceMeasures(performance)).toBe(false)
    expect(clearMeasures).not.toHaveBeenCalled()
  })

  it('clears the timeline after it exceeds the bound', () => {
    const clearMeasures = vi.fn()
    const performance = {
      clearMeasures,
      getEntriesByType: () => measures(DEVELOPMENT_MEASURE_LIMIT + 1),
    }

    expect(pruneDevelopmentPerformanceMeasures(performance)).toBe(true)
    expect(clearMeasures).toHaveBeenCalledOnce()
  })

  it('installs and removes the periodic cleanup', () => {
    const clearMeasures = vi.fn()
    const performance = {
      clearMeasures,
      getEntriesByType: () => measures(DEVELOPMENT_MEASURE_LIMIT + 1),
    }
    let callback: () => void = () => undefined
    const clearInterval = vi.fn()
    const stop = installDevelopmentPerformanceCleanup({
      performance,
      setInterval: (nextCallback) => {
        callback = nextCallback
        return 42
      },
      clearInterval,
    })

    callback()
    expect(clearMeasures).toHaveBeenCalledOnce()
    stop()
    expect(clearInterval).toHaveBeenCalledWith(42)
  })
})
