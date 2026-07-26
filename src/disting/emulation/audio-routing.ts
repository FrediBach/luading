import type { TracePoint } from '../types'

export type AudioRouteDestination =
  | 'off'
  | 'kick'
  | 'snare'
  | 'hat'
  | 'synthNote'
  | 'synthTrigger'

export interface OutputAudioRoute {
  destination: AudioRouteDestination
}

export type AudioVoiceEvent =
  | { kind: 'kick' | 'snare' | 'hat'; offsetSeconds: number }
  | { kind: 'synth'; offsetSeconds: number; voltage: number }

export interface AudioRoutingState {
  previousVoltages: Array<number | undefined>
  synthVoltage: number
  synthSemitone?: number
  lastSynthEventTime: number
}

const HIGH_THRESHOLD_VOLTS = 1
const MIN_SYNTH_NOTE_INTERVAL_SECONDS = 0.025

export function createAudioRoutingState(outputCount = 0): AudioRoutingState {
  return {
    previousVoltages: Array.from({ length: outputCount }),
    synthVoltage: 0,
    lastSynthEventTime: Number.NEGATIVE_INFINITY,
  }
}

function finiteVoltage(value: number | undefined) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

/**
 * Converts dense simulator trace points into sparse musical events. Keeping this
 * step independent of WebAudio makes short trigger handling deterministic and
 * testable.
 */
export function collectAudioVoiceEvents(
  trace: TracePoint[],
  routes: OutputAudioRoute[],
  previousState: AudioRoutingState,
) {
  const state: AudioRoutingState = {
    ...previousState,
    previousVoltages: [...previousState.previousVoltages],
  }
  const events: AudioVoiceEvent[] = []
  const firstTime = trace[0]?.time ?? 0

  for (const point of trace) {
    const offsetSeconds = Math.max(0, point.time - firstTime)

    // Resolve pitch before triggers so two routes changing on the same control
    // step play the newly selected note.
    for (let index = 0; index < routes.length; index += 1) {
      if (routes[index]?.destination !== 'synthNote') continue
      const voltage = finiteVoltage(point.outputs[index])
      const semitone = Math.round(voltage * 12)
      const noteChanged = state.synthSemitone === undefined || semitone !== state.synthSemitone
      state.synthVoltage = voltage
      state.synthSemitone = semitone
      if (
        noteChanged
        && point.time - state.lastSynthEventTime >= MIN_SYNTH_NOTE_INTERVAL_SECONDS
      ) {
        events.push({ kind: 'synth', offsetSeconds, voltage })
        state.lastSynthEventTime = point.time
      }
    }

    for (let index = 0; index < routes.length; index += 1) {
      const destination = routes[index]?.destination ?? 'off'
      const voltage = finiteVoltage(point.outputs[index])
      const previous = state.previousVoltages[index]
      const rising = voltage >= HIGH_THRESHOLD_VOLTS
        && (previous === undefined || previous < HIGH_THRESHOLD_VOLTS)

      if (rising) {
        if (destination === 'kick' || destination === 'snare' || destination === 'hat') {
          events.push({ kind: destination, offsetSeconds })
        } else if (destination === 'synthTrigger') {
          events.push({ kind: 'synth', offsetSeconds, voltage: state.synthVoltage })
          state.lastSynthEventTime = point.time
        }
      }

      state.previousVoltages[index] = voltage
    }
  }

  return { events, state }
}
