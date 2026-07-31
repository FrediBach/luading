export const DISPLAY_FLOAT_PRECISION = 2

export function formatDisplayFloat(value: number) {
  const zeroThreshold = 0.5 * 10 ** -DISPLAY_FLOAT_PRECISION
  const normalized = Math.abs(value) < zeroThreshold ? 0 : value
  return normalized.toFixed(DISPLAY_FLOAT_PRECISION)
}
