import type {
  DistingUiControl,
  DistingUiEventKind,
  WorkerRequest,
} from '../types'

const POT_CONTROLS = ['pot1', 'pot2', 'pot3'] as const
const ENCODER_CONTROLS = ['encoder1', 'encoder2'] as const
const BUTTON_CONTROLS = ['button1', 'button2', 'button3', 'button4'] as const

function controlAt(
  controls: readonly DistingUiControl[],
  index: number,
) {
  return Number.isInteger(index) && index >= 0 && index < controls.length
    ? controls[index] ?? null
    : null
}

export function potControlAt(index: number) {
  return controlAt(POT_CONTROLS, index)
}

export function encoderControlAt(index: number) {
  return controlAt(ENCODER_CONTROLS, index)
}

export function buttonControlAt(index: number) {
  return controlAt(BUTTON_CONTROLS, index)
}

export function normalizePotPosition(value: number) {
  if (!Number.isFinite(value)) return 0.5
  return Math.min(1, Math.max(0, value))
}

export function createUiEventRequest(
  control: DistingUiControl,
  event: DistingUiEventKind,
  value?: number,
): Extract<WorkerRequest, { type: 'uiEvent' }> {
  return value === undefined
    ? { type: 'uiEvent', control, event }
    : { type: 'uiEvent', control, event, value }
}
