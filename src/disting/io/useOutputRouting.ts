import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { WebMidiOutputTraceRouter, type WebMidiOutputEvent } from '../emulation/midi-routing'
import {
  DistingWebAudioRouter,
  type SynthWaveform,
} from '../emulation/web-audio'
import type { DistingWebMidiManager } from '../emulation/web-midi'
import type {
  LoadedProgram,
  OutputChannelRoute,
  TracePoint,
  WebMidiDeviceState,
} from '../types'
import {
  emptyOutputRoutes,
  normalizeOutputRoutes,
  updateOutputRoute,
  webAudioRoutes,
} from './output-audio-controls'

const MIDI_SCHEDULE_LEAD_MS = 25

function isNoteOff(bytes: readonly number[]) {
  return ((bytes[0] ?? 0) & 0xf0) === 0x80
}

export function useOutputRouting(
  program: LoadedProgram,
  trace: readonly TracePoint[],
  midiManager: DistingWebMidiManager,
  midiDevices: WebMidiDeviceState,
) {
  const processedTimeRef = useRef(Number.NEGATIVE_INFINITY)
  const pendingNoteOffsRef = useRef(new Map<string, number[][]>())
  const [audio] = useState(() => new DistingWebAudioRouter())
  const [midi] = useState(() => new WebMidiOutputTraceRouter())
  const [routeState, setRouteState] = useState(() => ({
    program,
    routes: emptyOutputRoutes(program.outputCount, program.outputAudioDefaults),
  }))
  const [audioEnabled, setAudioEnabled] = useState(false)
  const [audioLevel, setAudioLevel] = useState(0.55)
  const [waveform, setWaveform] = useState<SynthWaveform>('sawtooth')
  const [audioError, setAudioError] = useState<string | null>(null)
  const [midiErrors, setMidiErrors] = useState<Record<string, string>>({})
  const routes = useMemo(
    () => normalizeOutputRoutes(
      routeState.program === program
        ? routeState.routes
        : emptyOutputRoutes(program.outputCount, program.outputAudioDefaults),
      program.outputCount,
    ),
    [program, routeState],
  )
  const connectedOutputIds = useMemo(() => new Set(
    midiDevices.outputs
      .filter((port) => port.state === 'connected')
      .map((port) => port.id),
  ), [midiDevices.outputs])

  const reportMidiError = useCallback((portId: string, message: string) => {
    queueMicrotask(() => setMidiErrors((previous) => ({ ...previous, [portId]: message })))
  }, [])

  const clearMidiError = useCallback((portId: string) => {
    queueMicrotask(() => setMidiErrors((previous) => {
      if (!(portId in previous)) return previous
      const next = { ...previous }
      delete next[portId]
      return next
    }))
  }, [])

  const queueNoteOff = useCallback((event: WebMidiOutputEvent) => {
    const portEvents = pendingNoteOffsRef.current.get(event.portId) ?? []
    portEvents.push([...event.bytes])
    pendingNoteOffsRef.current.set(event.portId, portEvents)
  }, [])

  const sendMidiEvents = useCallback((
    events: readonly WebMidiOutputEvent[],
    scheduled: boolean,
  ) => {
    const baseTime = scheduled ? performance.now() + MIDI_SCHEDULE_LEAD_MS : undefined
    for (const event of events) {
      const failures = midiManager.send(
        [event.portId],
        event.bytes,
        baseTime === undefined ? undefined : baseTime + event.offsetSeconds * 1000,
      )
      if (failures.length > 0) {
        const message = failures[0]?.message ?? 'MIDI output failed.'
        reportMidiError(event.portId, message)
        if (isNoteOff(event.bytes)) queueNoteOff(event)
      } else {
        clearMidiError(event.portId)
      }
    }
  }, [clearMidiError, midiManager, queueNoteOff, reportMidiError])

  useEffect(() => {
    processedTimeRef.current = Number.NEGATIVE_INFINITY
    audio.reset(program.outputCount)
  }, [audio, program])

  useEffect(() => {
    audio.reset(program.outputCount)
    sendMidiEvents(midi.setRoutes(routes), false)
  }, [audio, midi, program.outputCount, routes, sendMidiEvents])

  useEffect(() => {
    sendMidiEvents(midi.releaseUnavailable(connectedOutputIds), false)
    for (const portId of connectedOutputIds) {
      const pending = pendingNoteOffsRef.current.get(portId)
      if (!pending) continue
      const remaining: number[][] = []
      for (const bytes of pending) {
        const failures = midiManager.send([portId], bytes)
        if (failures.length === 0) {
          clearMidiError(portId)
        } else {
          remaining.push(bytes)
          reportMidiError(
            portId,
            failures[0]?.message ?? 'MIDI output failed.',
          )
        }
      }
      if (remaining.length === 0) pendingNoteOffsRef.current.delete(portId)
      else pendingNoteOffsRef.current.set(portId, remaining)
    }
  }, [
    clearMidiError,
    connectedOutputIds,
    midi,
    midiManager,
    reportMidiError,
    sendMidiEvents,
  ])

  useEffect(() => {
    let firstFreshIndex = trace.length
    for (let index = trace.length - 1; index >= 0; index -= 1) {
      if ((trace[index]?.time ?? Number.NEGATIVE_INFINITY) <= processedTimeRef.current) {
        firstFreshIndex = index + 1
        break
      }
      firstFreshIndex = index
    }
    const freshTrace = trace.slice(firstFreshIndex)
    if (freshTrace.length === 0) {
      if (trace.length === 0) processedTimeRef.current = Number.NEGATIVE_INFINITY
      return
    }
    processedTimeRef.current = freshTrace[freshTrace.length - 1]?.time
      ?? Number.NEGATIVE_INFINITY
    if (audioEnabled) {
      audio.process(freshTrace, webAudioRoutes(routes), { synthWaveform: waveform })
    }
    sendMidiEvents(midi.process(freshTrace, connectedOutputIds), true)
  }, [
    audio,
    audioEnabled,
    connectedOutputIds,
    midi,
    routes,
    sendMidiEvents,
    trace,
    waveform,
  ])

  useEffect(() => () => {
    for (const event of midi.releaseAll()) {
      midiManager.send([event.portId], event.bytes)
    }
    void audio.close()
  }, [audio, midi, midiManager])

  const toggleAudio = useCallback(async () => {
    setAudioError(null)
    if (audioEnabled) {
      audio.disable()
      setAudioEnabled(false)
      return
    }
    try {
      await audio.enable(audioLevel)
      setAudioEnabled(true)
    } catch (caught) {
      setAudioEnabled(false)
      setAudioError(
        caught instanceof Error
          ? caught.message
          : 'WebAudio could not be started.',
      )
    }
  }, [audio, audioEnabled, audioLevel])

  const changeAudioLevel = useCallback((nextLevel: number) => {
    const normalized = Math.min(1, Math.max(0, nextLevel))
    setAudioLevel(normalized)
    if (audioEnabled) audio.setLevel(normalized)
  }, [audio, audioEnabled])

  const changeRoute = useCallback((index: number, route: OutputChannelRoute) => {
    setRouteState((previous) => ({
      program,
      routes: updateOutputRoute(
        previous.program === program
          ? previous.routes
          : emptyOutputRoutes(program.outputCount, program.outputAudioDefaults),
        program.outputCount,
        index,
        route,
      ),
    }))
  }, [program])

  return {
    routes,
    audioEnabled,
    audioLevel,
    waveform,
    audioError,
    midiErrors,
    toggleAudio,
    changeAudioLevel,
    changeWaveform: setWaveform,
    changeRoute,
  }
}
