import type { SignalShape } from '../types'

interface Props {
  shape: SignalShape
  size?: number
}

function shapePath(shape: SignalShape) {
  switch (shape) {
    case 'manual':
      return 'M2 12H22'
    case 'freeform':
      return 'M2 17 7 9l5 4 5-8 5 6'
    case 'sine':
      return 'M2 12C5 3 9 3 12 12s7 9 10 0'
    case 'triangle':
      return 'M2 18 7 6l5 12 5-12 5 12'
    case 'sawUp':
      return 'M2 18 11 6v12l9-12v12'
    case 'sawDown':
      return 'M2 6v12l9-12v12l9-12v12'
    case 'square':
      return 'M2 18V6h10v12h10V6'
    case 'gate':
      return 'M2 18V7h14v11h6'
    case 'trigger':
      return 'M2 18h7V5h4v13h9'
    case 'gateSequencer':
      return 'M2 18V8h4v10h4V8h4v10h8'
    case 'noteSequencer':
      return 'M2 17h4v-4h4V8h4v3h4V5h4'
    case 'arpeggio':
      return 'M2 18 7 14l5-5 5 5 5-10'
    case 'sampleHold':
      return 'M2 17h5V8h5v5h5V5h5'
    case 'noise':
      return 'M2 14 5 7l3 12 3-14 3 11 3-8 2 10 3-6'
  }
}

export function SignalShapeGlyph({ shape, size = 28 }: Props) {
  return (
    <svg
      className="signal-shape-glyph"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      role="img"
      aria-label={`${shape} signal shape`}
    >
      <path d={shapePath(shape)} />
    </svg>
  )
}
