import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { AudioRouteDestination } from '../emulation/audio-routing'
import {
  DistingWebAudioRouter,
  type SynthWaveform,
} from '../emulation/web-audio'
import type { LoadedProgram, TracePoint } from '../types'
import {
  emptyOutputAudioRoutes,
  normalizeOutputAudioRoutes,
  updateOutputAudioRoute,
} from './output-audio-controls'

export function useOutputAudio(
  program: LoadedProgram,
  trace: readonly TracePoint[],
) {
  const processedTimeRef = useRef(Number.NEGATIVE_INFINITY)
  const [audio] = useState(() => new DistingWebAudioRouter())
  const [routeState, setRouteState] = useState(() => ({
    program,
    routes: emptyOutputAudioRoutes(program.outputCount),
  }))
  const [enabled, setEnabled] = useState(false)
  const [level, setLevel] = useState(0.55)
  const [waveform, setWaveform] = useState<SynthWaveform>('sawtooth')
  const [error, setError] = useState<string | null>(null)
  const activeRoutes = useMemo(
    () => normalizeOutputAudioRoutes(
      routeState.program === program ? routeState.routes : [],
      program.outputCount,
    ),
    [program, routeState],
  )

  useEffect(() => {
    processedTimeRef.current = Number.NEGATIVE_INFINITY
    audio.reset(program.outputCount)
  }, [audio, program])

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
    if (enabled) {
      audio.process(freshTrace, activeRoutes, {
        synthWaveform: waveform,
      })
    }
  }, [activeRoutes, audio, enabled, trace, waveform])

  useEffect(() => () => {
    void audio.close()
  }, [audio])

  const toggleEnabled = useCallback(async () => {
    setError(null)
    if (enabled) {
      audio.disable()
      setEnabled(false)
      return
    }
    try {
      await audio.enable(level)
      setEnabled(true)
    } catch (caught) {
      setEnabled(false)
      setError(
        caught instanceof Error
          ? caught.message
          : 'WebAudio could not be started.',
      )
    }
  }, [audio, enabled, level])

  const changeLevel = useCallback((nextLevel: number) => {
    const normalized = Math.min(1, Math.max(0, nextLevel))
    setLevel(normalized)
    if (enabled) audio.setLevel(normalized)
  }, [audio, enabled])

  const changeRoute = useCallback((
    index: number,
    destination: AudioRouteDestination,
  ) => {
    setRouteState((previous) => ({
      program,
      routes: updateOutputAudioRoute(
        previous.program === program ? previous.routes : [],
        program.outputCount,
        index,
        destination,
      ),
    }))
    audio.reset(program.outputCount)
  }, [audio, program])

  return {
    routes: activeRoutes,
    enabled,
    level,
    waveform,
    error,
    toggleEnabled,
    changeLevel,
    changeWaveform: setWaveform,
    changeRoute,
  }
}
