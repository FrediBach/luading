import type { ReactNode } from 'react'

export function InstrumentRack({ children }: { children: ReactNode }) {
  return <div className="workbench-instrument-rack">{children}</div>
}

