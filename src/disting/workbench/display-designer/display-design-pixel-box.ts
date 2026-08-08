export interface DisplayPixelBoxRegion {
  x1: number
  y1: number
  x2: number
  y2: number
  shade: number
}

function horizontalRegions(
  width: number,
  height: number,
  shades: readonly number[],
  targetShade: number,
): DisplayPixelBoxRegion[] {
  const completed: DisplayPixelBoxRegion[] = []
  let active = new Map<string, DisplayPixelBoxRegion>()
  for (let y = 0; y < height; y += 1) {
    const next = new Map<string, DisplayPixelBoxRegion>()
    let x = 0
    while (x < width) {
      if (shades[y * width + x] !== targetShade) {
        x += 1
        continue
      }
      const x1 = x
      while (x + 1 < width && shades[y * width + x + 1] === targetShade) x += 1
      const key = `${x1}:${x}`
      const previous = active.get(key)
      next.set(key, previous ? { ...previous, y2: y } : { x1, y1: y, x2: x, y2: y, shade: targetShade })
      x += 1
    }
    for (const [key, region] of active) if (!next.has(key)) completed.push(region)
    active = next
  }
  return [...completed, ...active.values()]
}

function verticalRegions(
  width: number,
  height: number,
  shades: readonly number[],
  targetShade: number,
): DisplayPixelBoxRegion[] {
  const transposed = Array.from({ length: width * height }, (_, index) => {
    const transposedWidth = height
    const tx = index % transposedWidth
    const ty = Math.floor(index / transposedWidth)
    return shades[tx * width + ty] ?? 0
  })
  return horizontalRegions(height, width, transposed, targetShade).map((region) => ({
    x1: region.y1,
    y1: region.x1,
    x2: region.y2,
    y2: region.x2,
    shade: region.shade,
  }))
}

function greedyRegions(
  width: number,
  height: number,
  shades: readonly number[],
  targetShade: number,
): DisplayPixelBoxRegion[] {
  const available = shades.map((shade) => shade === targetShade)
  const regions: DisplayPixelBoxRegion[] = []
  while (true) {
    const start = available.indexOf(true)
    if (start < 0) return regions
    const startX = start % width
    const startY = Math.floor(start / width)
    let maximumWidth = 0
    while (startX + maximumWidth < width && available[startY * width + startX + maximumWidth]) maximumWidth += 1
    let bestWidth = 1
    let bestHeight = 1
    let rowWidth = maximumWidth
    for (let y = startY; y < height && rowWidth > 0; y += 1) {
      let widthAtRow = 0
      while (widthAtRow < rowWidth && available[y * width + startX + widthAtRow]) widthAtRow += 1
      rowWidth = Math.min(rowWidth, widthAtRow)
      if (rowWidth === 0) break
      const candidateHeight = y - startY + 1
      if (rowWidth * candidateHeight > bestWidth * bestHeight) {
        bestWidth = rowWidth
        bestHeight = candidateHeight
      }
    }
    for (let y = startY; y < startY + bestHeight; y += 1) {
      for (let x = startX; x < startX + bestWidth; x += 1) available[y * width + x] = false
    }
    regions.push({
      x1: startX,
      y1: startY,
      x2: startX + bestWidth - 1,
      y2: startY + bestHeight - 1,
      shade: targetShade,
    })
  }
}

function regionsForShade(
  width: number,
  height: number,
  shades: readonly number[],
  targetShade: number,
): DisplayPixelBoxRegion[] {
  const candidates = [
    horizontalRegions(width, height, shades, targetShade),
    verticalRegions(width, height, shades, targetShade),
    greedyRegions(width, height, shades, targetShade),
  ]
  return candidates.reduce((best, candidate) => candidate.length < best.length ? candidate : best)
}

/**
 * Produces an exact pixel image with a small number of non-antialiased line and
 * rectangle calls. It compares horizontal, vertical, and area-first rectangle
 * partitions, then also tries each present shade as a full-box background so
 * later regions can use the firmware's normal overdraw semantics.
 */
export function optimizeDisplayPixelBox(
  width: number,
  height: number,
  shades: readonly number[],
): DisplayPixelBoxRegion[] {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || shades.length !== width * height) return []
  const presentShades = [...new Set(shades)]
  const partition = (backgroundShade?: number) => {
    const regions = backgroundShade === undefined
      ? []
      : [{ x1: 0, y1: 0, x2: width - 1, y2: height - 1, shade: backgroundShade }]
    for (const targetShade of presentShades) {
      if (targetShade === backgroundShade) continue
      regions.push(...regionsForShade(width, height, shades, targetShade))
    }
    return regions
  }
  let best = partition()
  for (const shade of presentShades) {
    const candidate = partition(shade)
    if (candidate.length < best.length) best = candidate
  }
  return best
}
