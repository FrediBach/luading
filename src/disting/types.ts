export const DISTING_DISPLAY = {
  width: 256,
  height: 64,
  shades: 16,
  drawFps: 30,
  stepSeconds: 0.001,
} as const

export type TextAlignment = 'left' | 'centre' | 'right'

export type DrawCommand =
  | { kind: 'line'; x1: number; y1: number; x2: number; y2: number; shade: number; smooth: boolean }
  | {
      kind: 'box'
      x1: number
      y1: number
      x2: number
      y2: number
      shade: number
      fill: boolean
      smooth: boolean
    }
  | { kind: 'circle'; x: number; y: number; radius: number; shade: number; smooth: boolean }
  | { kind: 'text'; x: number; y: number; text: string; shade: number; tiny: boolean; align: TextAlignment }

export type InputKind = 'cv' | 'gate' | 'trigger'
export type OutputKind = 'stepped' | 'linear'
export type AudioRouteDestination =
  | 'off'
  | 'kick'
  | 'snare'
  | 'hat'
  | 'synthNote'
  | 'synthTrigger'

export const DISTING_MIDI_DESTINATION_BITS = {
  breakout: 0x1,
  selectBus: 0x2,
  usb: 0x4,
  internal: 0x8,
} as const

export type DistingMidiDestination = keyof typeof DISTING_MIDI_DESTINATION_BITS
export type DistingMidiPortAssignments = Partial<Record<DistingMidiDestination, string>>

export type MidiChannel =
  | 1 | 2 | 3 | 4
  | 5 | 6 | 7 | 8
  | 9 | 10 | 11 | 12
  | 13 | 14 | 15 | 16

export type MidiChannelFilter = 'omni' | MidiChannel
export type MidiNoteFilter = 'any' | number

export type WebMidiAccessStatus =
  | 'unsupported'
  | 'idle'
  | 'requesting'
  | 'ready'
  | 'denied'
  | 'error'

export interface WebMidiPortDescriptor {
  id: string
  type: 'input' | 'output'
  name: string
  manufacturer: string
  state: 'connected' | 'disconnected'
  connection: 'open' | 'closed' | 'pending'
}

export interface WebMidiDeviceState {
  status: WebMidiAccessStatus
  inputs: WebMidiPortDescriptor[]
  outputs: WebMidiPortDescriptor[]
  error?: string
}

interface WebMidiInputMappingBase {
  portId: string
  channel: MidiChannelFilter
}

interface WebMidiVoltageRange {
  minimumVolts: number
  maximumVolts: number
}

export type WebMidiInputMapping =
  | (WebMidiInputMappingBase & WebMidiVoltageRange & {
      kind: 'cc'
      controller: number
    })
  | (WebMidiInputMappingBase & WebMidiVoltageRange & {
      kind: 'pitchBend'
    })
  | (WebMidiInputMappingBase & {
      kind: 'notePitch'
      baseNote: number
      baseVoltage: number
    })
  | (WebMidiInputMappingBase & WebMidiVoltageRange & {
      kind: 'noteVelocity'
      note: MidiNoteFilter
    })
  | (WebMidiInputMappingBase & {
      kind: 'noteGate' | 'noteTrigger'
      note: MidiNoteFilter
      lowVolts: number
      highVolts: number
    })
  | (WebMidiInputMappingBase & {
      kind: 'ccGate' | 'ccTrigger'
      controller: number
      threshold: number
      lowVolts: number
      highVolts: number
    })

export type WebAudioOutputRoute = {
  kind: 'webAudio'
  destination: Exclude<AudioRouteDestination, 'off'>
}

export type WebMidiNoteSource =
  | { kind: 'fixed'; note: number }
  | {
      kind: 'output'
      outputIndex: number
      baseNote: number
      baseVoltage: number
    }

export type OutputChannelRoute =
  | { kind: 'off' }
  | WebAudioOutputRoute
  | (WebMidiVoltageRange & {
      kind: 'webMidiCc'
      portId: string
      channel: MidiChannel
      controller: number
    })
  | (WebMidiVoltageRange & {
      kind: 'webMidiPitchBend'
      portId: string
      channel: MidiChannel
    })
  | {
      kind: 'webMidiNote'
      portId: string
      channel: MidiChannel
      source: WebMidiNoteSource
      gateThresholdVolts: number
      velocity: number
    }

export type InputChannelRoute =
  | { kind: 'generator'; source: SignalSourceConfig }
  | { kind: 'webMidi'; mapping: WebMidiInputMapping }

export interface ExternalInputUpdate {
  index: number
  value?: number
  pulse?: number
}

export interface ParameterDefinition {
  name: string
  min: number
  max: number
  value: number
  unit: string
  scale: number
  enumValues?: string[]
  enumOffset?: number
}

export interface ScriptParameterPreset {
  name: string
  values: number[]
}

export interface LoadedProgram {
  name: string
  author: string
  inputCount: number
  outputCount: number
  inputNames: string[]
  outputNames: string[]
  inputKinds: InputKind[]
  outputKinds: OutputKind[]
  outputAudioDefaults?: AudioRouteDestination[]
  parameters: ParameterDefinition[]
  parameterPresets: ScriptParameterPreset[]
  customUi: boolean
  uiPotPositions: Array<number | null>
  midi?: {
    channelParameter?: number
    messages: string[]
  }
}

export type DistingUiControl =
  | 'pot1'
  | 'pot2'
  | 'pot3'
  | 'encoder1'
  | 'encoder2'
  | 'button1'
  | 'button2'
  | 'button3'
  | 'button4'

export type DistingUiEventKind = 'turn' | 'push' | 'release'
export type DistingDisplayMode = 'overview' | 'meters' | 'parameters' | 'ui' | 'algorithm' | 'menu'

export type DistingHardwareEvent =
  | { kind: 'i2cCommand'; address: number; bytes: number[] }
  | { kind: 'i2cGetter'; address: number; bytes: number[]; response: number[] }
  | { kind: 'midiOut'; destinations: number; bytes: number[] }
  | { kind: 'displayMode'; mode: DistingDisplayMode }
  | { kind: 'exit' }

export type SignalShape =
  | 'manual'
  | 'freeform'
  | 'sine'
  | 'triangle'
  | 'sawUp'
  | 'sawDown'
  | 'square'
  | 'gate'
  | 'trigger'
  | 'gateSequencer'
  | 'noteSequencer'
  | 'arpeggio'
  | 'sampleHold'
  | 'noise'

export type ClockDivision =
  | '2 bars'
  | '1 bar'
  | '1/2'
  | '1/4'
  | '1/8'
  | '1/16'
  | '1/32'

export type SignalTiming =
  | { mode: 'free'; frequencyHz: number }
  | { mode: 'clock'; division: ClockDivision }

export type ArpeggioType = 'up' | 'down' | 'upDown' | 'random'
export type ArpeggioChord = 'major' | 'minor' | 'fifth' | 'major7' | 'minor7'

export interface FreeformCvPoint {
  phase: number
  volts: number
}

export interface SignalSourceConfig {
  shape: SignalShape
  timing: SignalTiming
  amplitude: number
  offset: number
  phase: number
  pulseWidth: number
  manualValue: number
  seed: number
  stepCount: number
  gateSteps: boolean[]
  noteSteps: number[]
  arpeggioType: ArpeggioType
  arpeggioChord: ArpeggioChord
  arpeggioOctaves: number
  freeformPoints: FreeformCvPoint[]
}

export interface GlobalClockConfig {
  bpm: number
  running: boolean
}

export interface TracePoint {
  time: number
  clockBeats: number
  inputs: number[]
  outputs: number[]
}

export type ScopeSource =
  | { kind: 'input'; index: number }
  | { kind: 'output'; index: number }

export interface ScopeProbe {
  id: string
  source: ScopeSource | null
}

export interface RuntimeStats {
  simulatedSeconds: number
  steps: number
  averageUs: number
  p95Us: number
  maxUs: number
  budgetPercent: number
  droppedSteps: number
  callbacks: Partial<Record<import('./validation/types').LuaCallbackName, CallbackRuntimeStats>>
}

export interface CallbackRuntimeStats {
  calls: number
  averageUs: number
  p95Us: number
  maxUs: number
}

export type WorkerRequest =
  | { type: 'load'; source: string; modules?: Record<string, string>; state?: unknown }
  | { type: 'start' }
  | { type: 'pause' }
  | { type: 'frameAck' }
  | { type: 'resetTelemetry' }
  | { type: 'setInputSource'; index: number; config: SignalSourceConfig }
  | { type: 'setExternalInputSource'; index: number; value: number }
  | { type: 'externalInput'; updates: ExternalInputUpdate[] }
  | { type: 'setClock'; config: GlobalClockConfig }
  | { type: 'setParameter'; index: number; value: number }
  | { type: 'applyParameterPreset'; index: number }
  | { type: 'trigger'; index: number }
  | { type: 'uiEvent'; control: DistingUiControl; event: DistingUiEventKind; value?: number }
  | { type: 'midi'; bytes: number[] }
  | { type: 'serialise' }

export type WorkerResponse =
  | { type: 'ready' }
  | {
      type: 'loaded'
      program: LoadedProgram
      inputSources: SignalSourceConfig[]
      diagnostics: import('./validation/types').ScriptDiagnostic[]
    }
  | { type: 'running'; running: boolean }
  | {
      type: 'frame'
      trace: TracePoint[]
      inputs: number[]
      outputs: number[]
      parameterValues: number[]
      stats: RuntimeStats
      display: DrawCommand[]
    }
  | { type: 'log'; line: string }
  | { type: 'hardware'; event: DistingHardwareEvent }
  | { type: 'serialised'; state: unknown }
  | {
      type: 'parameterPresetApplied'
      index: number
      parameterValues: number[]
      display: DrawCommand[]
    }
  | { type: 'diagnostics'; diagnostics: import('./validation/types').ScriptDiagnostic[] }
  | {
      type: 'error'
      message: string
      diagnostic?: import('./validation/types').ScriptDiagnostic
      diagnostics?: import('./validation/types').ScriptDiagnostic[]
    }
