import type {
  AudioRouteDestination,
  ClockDivision,
  InputKind,
  SignalShape,
  SignalSourceConfig,
} from '../types'
import { createLuaSourceIndex } from '../validation/source-index'
import {
  CLOCK_DIVISIONS,
  defaultSignalSource,
  normalizeSignalSource,
} from './signal-sources'

interface SimulatorDefaults {
  inputSources: SignalSourceConfig[]
  outputAudioRoutes: AudioRouteDestination[]
}

const INPUT_SHAPES = new Map<string, SignalShape>([
  ['manual', 'manual'],
  ['manualdc', 'manual'],
  ['dc', 'manual'],
  ['sine', 'sine'],
  ['sinelfo', 'sine'],
  ['triangle', 'triangle'],
  ['trianglelfo', 'triangle'],
  ['sawup', 'sawUp'],
  ['risingsaw', 'sawUp'],
  ['sawdown', 'sawDown'],
  ['fallingsaw', 'sawDown'],
  ['square', 'square'],
  ['bipolarsquare', 'square'],
  ['gate', 'gate'],
  ['gateclock', 'gate'],
  ['trigger', 'trigger'],
  ['triggerpulse', 'trigger'],
  ['gatesequencer', 'gateSequencer'],
  ['notesequencer', 'noteSequencer'],
  ['notesequencervoct', 'noteSequencer'],
  ['arpeggio', 'arpeggio'],
  ['arpeggiovoct', 'arpeggio'],
  ['samplehold', 'sampleHold'],
  ['noise', 'noise'],
])

const OUTPUT_ROUTES = new Map<string, AudioRouteDestination>([
  ['off', 'off'],
  ['notconnected', 'off'],
  ['kick', 'kick'],
  ['kicktrigger', 'kick'],
  ['snare', 'snare'],
  ['snaretrigger', 'snare'],
  ['hat', 'hat'],
  ['hihat', 'hat'],
  ['hihattrigger', 'hat'],
  ['synthnote', 'synthNote'],
  ['synthnotevoct', 'synthNote'],
  ['voct', 'synthNote'],
  ['synthtrigger', 'synthTrigger'],
])

function normalizedLabel(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '')
}

function commentProperties(comment: string | undefined) {
  const properties = new Map<string, string>()
  for (const part of comment?.split(',') ?? []) {
    const separator = part.indexOf(':')
    if (separator < 0) continue
    const key = normalizedLabel(part.slice(0, separator))
    const value = part.slice(separator + 1).trim()
    if (key && value) properties.set(key, value)
  }
  return properties
}

function trailingComment(
  sourceLines: readonly string[],
  range: { endLine: number; endColumn: number } | undefined,
) {
  if (!range || range.endLine < 1) return undefined
  const remainder = sourceLines[range.endLine - 1]?.slice(range.endColumn - 1) ?? ''
  return remainder.match(/^\s*[,;]?\s*--(.*)$/)?.[1]?.trim()
}

function booleanValue(value: string | undefined) {
  if (!value) return undefined
  const normalized = normalizedLabel(value)
  if (normalized === 'true' || normalized === 'yes' || normalized === 'on') return true
  if (normalized === 'false' || normalized === 'no' || normalized === 'off') return false
  return undefined
}

function sourceForShape(shape: SignalShape, index: number) {
  const source = defaultSignalSource(
    shape === 'trigger' ? 'trigger' : shape === 'gate' ? 'gate' : 'cv',
    index,
  )
  source.shape = shape
  if (shape === 'noteSequencer' || shape === 'arpeggio') source.amplitude = 1
  return source
}

function inputDefault(
  kind: InputKind,
  index: number,
  properties: ReadonlyMap<string, string>,
) {
  const shape = INPUT_SHAPES.get(normalizedLabel(properties.get('type') ?? ''))
  const source = shape ? sourceForShape(shape, index) : defaultSignalSource(kind, index)
  const synced = booleanValue(properties.get('synced'))
  const divisionValue = properties.get('division') as ClockDivision | undefined
  const division = CLOCK_DIVISIONS.includes(divisionValue as ClockDivision)
    ? divisionValue
    : undefined

  if (synced === false) {
    source.timing = { mode: 'free', frequencyHz: 1 }
  } else if (synced === true || division) {
    source.timing = { mode: 'clock', division: division ?? '1/4' }
  }
  return normalizeSignalSource(source)
}

/**
 * Reads browser-simulator defaults from trailing comments on init input/output
 * entries. These annotations never alter the Lua table seen by the script or
 * the emulated Disting contract.
 */
export function simulatorDefaultsFromSource(
  source: string,
  inputKinds: readonly InputKind[],
  outputCount: number,
): SimulatorDefaults {
  const index = createLuaSourceIndex(source, 0)
  const lines = source.split('\n')
  const propertiesFor = (field: 'inputs' | 'outputs', entryIndex: number) => (
    commentProperties(trailingComment(
      lines,
      index.semanticLocations[`init.${field}[${entryIndex + 1}]`],
    ))
  )

  return {
    inputSources: inputKinds.map((kind, entryIndex) => (
      inputDefault(kind, entryIndex, propertiesFor('inputs', entryIndex))
    )),
    outputAudioRoutes: Array.from({ length: outputCount }, (_, entryIndex) => {
      const type = propertiesFor('outputs', entryIndex).get('type') ?? ''
      return OUTPUT_ROUTES.get(normalizedLabel(type)) ?? 'off'
    }),
  }
}
