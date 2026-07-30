const DEFAULT_DRAG_PIXELS = 160

function decimalPlaces(value: number) {
  const text = value.toString().toLowerCase()
  if (text.includes('e-')) return Number(text.split('e-')[1] ?? 0)
  return text.includes('.') ? (text.split('.')[1]?.length ?? 0) : 0
}

export function clampControlValue(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, value))
}

export function snapControlValue(
  value: number,
  min: number,
  max: number,
  step = 0,
) {
  const clamped = clampControlValue(value, min, max)
  if (!Number.isFinite(step) || step <= 0) return clamped
  const snapped = min + Math.round((clamped - min) / step) * step
  const precision = Math.min(12, Math.max(decimalPlaces(step), decimalPlaces(min)))
  return clampControlValue(Number(snapped.toFixed(precision)), min, max)
}

export function controlValueToUnit(value: number, min: number, max: number) {
  if (max <= min) return 0
  return (clampControlValue(value, min, max) - min) / (max - min)
}

export function controlValueToAngle(
  value: number,
  min: number,
  max: number,
  startAngle = -135,
  endAngle = 135,
) {
  return startAngle + controlValueToUnit(value, min, max) * (endAngle - startAngle)
}

export function valueFromVerticalDrag(
  startValue: number,
  verticalPixels: number,
  min: number,
  max: number,
  step = 0,
  fine = false,
  dragPixels = DEFAULT_DRAG_PIXELS,
) {
  const sensitivity = fine ? dragPixels * 10 : dragPixels
  const next = startValue + (verticalPixels / sensitivity) * (max - min)
  return snapControlValue(next, min, max, step)
}

export function keyboardAdjustedValue(
  value: number,
  key: string,
  min: number,
  max: number,
  step: number,
  pageStep = step * 10,
) {
  switch (key) {
    case 'ArrowUp':
    case 'ArrowRight':
      return snapControlValue(value + step, min, max, step)
    case 'ArrowDown':
    case 'ArrowLeft':
      return snapControlValue(value - step, min, max, step)
    case 'PageUp':
      return snapControlValue(value + pageStep, min, max, step)
    case 'PageDown':
      return snapControlValue(value - pageStep, min, max, step)
    case 'Home':
      return min
    case 'End':
      return max
    default:
      return null
  }
}

export function parseControlValue(
  text: string,
  min: number,
  max: number,
  step = 0,
) {
  const parsed = Number(text.trim())
  return Number.isFinite(parsed)
    ? snapControlValue(parsed, min, max, step)
    : null
}

export function relativeEncoderSteps(deltaPixels: number, pixelsPerStep = 8) {
  if (!Number.isFinite(deltaPixels) || pixelsPerStep <= 0) return 0
  return Math.trunc(deltaPixels / pixelsPerStep)
}

export function downsampleMinMax(values: readonly number[], maxPoints: number) {
  if (maxPoints <= 0 || values.length === 0) return []
  if (values.length <= maxPoints) return [...values]
  if (maxPoints === 1) return [values[values.length - 1] ?? 0]
  if (maxPoints === 2) return [values[0] ?? 0, values[values.length - 1] ?? 0]

  const result = [values[0] ?? 0]
  const interiorLength = values.length - 2
  const bucketCount = Math.max(1, Math.floor((maxPoints - 2) / 2))

  for (let bucket = 0; bucket < bucketCount; bucket += 1) {
    const start = 1 + Math.floor(bucket * interiorLength / bucketCount)
    const end = 1 + Math.floor((bucket + 1) * interiorLength / bucketCount)
    let minValue = Number.POSITIVE_INFINITY
    let maxValue = Number.NEGATIVE_INFINITY
    let minIndex = start
    let maxIndex = start

    for (let index = start; index < end; index += 1) {
      const value = values[index] ?? 0
      if (value < minValue) {
        minValue = value
        minIndex = index
      }
      if (value > maxValue) {
        maxValue = value
        maxIndex = index
      }
    }

    if (minIndex <= maxIndex) result.push(minValue, maxValue)
    else result.push(maxValue, minValue)
  }

  result.push(values[values.length - 1] ?? 0)
  return result.slice(0, maxPoints)
}

export function signalPlotPath(
  values: readonly number[],
  width: number,
  height: number,
  min: number,
  max: number,
  stepped = false,
) {
  if (values.length === 0 || width <= 0 || height <= 0) return ''
  const span = Math.max(Number.EPSILON, max - min)
  const point = (value: number, index: number) => {
    const x = values.length === 1 ? width / 2 : index * width / (values.length - 1)
    const normalized = (clampControlValue(value, min, max) - min) / span
    const y = height - normalized * height
    return { x, y }
  }

  const first = point(values[0] ?? 0, 0)
  let path = `M${first.x.toFixed(2)},${first.y.toFixed(2)}`

  for (let index = 1; index < values.length; index += 1) {
    const previous = point(values[index - 1] ?? 0, index - 1)
    const current = point(values[index] ?? 0, index)
    if (stepped) path += `L${current.x.toFixed(2)},${previous.y.toFixed(2)}`
    path += `L${current.x.toFixed(2)},${current.y.toFixed(2)}`
  }

  return path
}

