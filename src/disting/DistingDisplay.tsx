import { useEffect, useRef } from 'react'
import { renderDistingDisplay } from './emulation/display-renderer'
import { DISTING_DISPLAY, type DrawCommand } from './types'

interface Props {
  commands: DrawCommand[]
}

export function DistingDisplay({ commands }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context) return

    renderDistingDisplay(context, commands)
  }, [commands])

  return (
    <canvas
      ref={canvasRef}
      className="disting-display"
      width={DISTING_DISPLAY.width}
      height={DISTING_DISPLAY.height}
      aria-label="Simulated Disting NT display"
    />
  )
}
