import type { RuntimeStats } from '../types'

interface Props {
  stats: RuntimeStats
}

export function StatusBar({ stats }: Props) {
  return (
    <footer className="workbench-statusbar">
      <span>Lua 5.4 / WASM</span>
      <span>1 kHz step</span>
      <span>30 fps draw</span>
      <span>{stats.simulatedSeconds.toFixed(3)} s simulated</span>
      <span className="workbench-statusbar-spacer" />
      <span>Timing is browser-local, not calibrated Disting NT CPU usage</span>
    </footer>
  )
}

