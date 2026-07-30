import { downsampleMinMax, signalPlotPath } from './control-math'

interface Props {
  label: string
  values: readonly number[]
  min: number
  max: number
  stepped?: boolean
  width?: number
  height?: number
  maxPoints?: number
}

export function MiniSignalPlot({
  label,
  values,
  min,
  max,
  stepped = false,
  width = 112,
  height = 42,
  maxPoints = 64,
}: Props) {
  const sampled = downsampleMinMax(values, maxPoints)
  const path = signalPlotPath(sampled, width, height, min, max, stepped)
  const zeroY = max > min && min <= 0 && max >= 0
    ? height - ((0 - min) / (max - min)) * height
    : null

  return (
    <svg
      className="mini-signal-plot"
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={label}
      preserveAspectRatio="none"
    >
      <title>{label}</title>
      {zeroY !== null && <line className="mini-signal-zero" x1="0" x2={width} y1={zeroY} y2={zeroY} />}
      {path
        ? <path className="mini-signal-path" d={path} />
        : <text x="50%" y="50%">No signal</text>}
    </svg>
  )
}

