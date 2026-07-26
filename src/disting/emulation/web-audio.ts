import {
  collectAudioVoiceEvents,
  createAudioRoutingState,
  type AudioRoutingState,
  type OutputAudioRoute,
} from './audio-routing'
import type { TracePoint } from '../types'

export type SynthWaveform = 'sawtooth' | 'square' | 'triangle' | 'sine'

export interface WebAudioVoiceSettings {
  synthWaveform: SynthWaveform
}

const SCHEDULE_AHEAD_SECONDS = 0.025

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

export class DistingWebAudioRouter {
  private context: AudioContext | null = null
  private master: GainNode | null = null
  private noiseBuffer: AudioBuffer | null = null
  private routingState: AudioRoutingState = createAudioRoutingState()

  get enabled() {
    return this.context?.state === 'running' && (this.master?.gain.value ?? 0) > 0
  }

  async enable(level: number) {
    if (!this.context) this.createGraph()
    if (!this.context || !this.master) return
    await this.context.resume()
    this.master.gain.cancelScheduledValues(this.context.currentTime)
    this.master.gain.setTargetAtTime(clamp(level, 0, 1), this.context.currentTime, 0.015)
  }

  disable() {
    if (!this.context || !this.master) return
    this.master.gain.cancelScheduledValues(this.context.currentTime)
    this.master.gain.setTargetAtTime(0, this.context.currentTime, 0.01)
  }

  setLevel(level: number) {
    if (!this.context || !this.master) return
    this.master.gain.setTargetAtTime(clamp(level, 0, 1), this.context.currentTime, 0.015)
  }

  reset(outputCount = 0) {
    this.routingState = createAudioRoutingState(outputCount)
  }

  process(
    trace: TracePoint[],
    routes: OutputAudioRoute[],
    settings: WebAudioVoiceSettings,
  ) {
    if (!this.context || !this.master || this.context.state !== 'running' || trace.length === 0) return
    const result = collectAudioVoiceEvents(trace, routes, this.routingState)
    this.routingState = result.state
    const startTime = this.context.currentTime + SCHEDULE_AHEAD_SECONDS

    for (const event of result.events) {
      const time = startTime + event.offsetSeconds
      if (event.kind === 'kick') this.kick(time)
      else if (event.kind === 'snare') this.snare(time)
      else if (event.kind === 'hat') this.hat(time)
      else if (event.kind === 'synth') {
        this.synth(time, event.voltage, settings.synthWaveform)
      }
    }
  }

  async close() {
    const context = this.context
    this.context = null
    this.master = null
    this.noiseBuffer = null
    if (context && context.state !== 'closed') await context.close()
  }

  private createGraph() {
    const context = new AudioContext({ latencyHint: 'interactive' })
    const master = context.createGain()
    const compressor = context.createDynamicsCompressor()
    master.gain.value = 0
    compressor.threshold.value = -10
    compressor.knee.value = 12
    compressor.ratio.value = 8
    compressor.attack.value = 0.003
    compressor.release.value = 0.15
    master.connect(compressor).connect(context.destination)

    const noiseBuffer = context.createBuffer(1, context.sampleRate, context.sampleRate)
    const samples = noiseBuffer.getChannelData(0)
    for (let index = 0; index < samples.length; index += 1) {
      samples[index] = Math.random() * 2 - 1
    }

    this.context = context
    this.master = master
    this.noiseBuffer = noiseBuffer
  }

  private kick(time: number) {
    if (!this.context || !this.master) return
    const oscillator = this.context.createOscillator()
    const gain = this.context.createGain()
    oscillator.type = 'sine'
    oscillator.frequency.setValueAtTime(150, time)
    oscillator.frequency.exponentialRampToValueAtTime(45, time + 0.16)
    gain.gain.setValueAtTime(0.9, time)
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.28)
    oscillator.connect(gain).connect(this.master)
    oscillator.start(time)
    oscillator.stop(time + 0.3)
  }

  private snare(time: number) {
    if (!this.context || !this.master || !this.noiseBuffer) return
    const noise = this.context.createBufferSource()
    const noiseFilter = this.context.createBiquadFilter()
    const noiseGain = this.context.createGain()
    noise.buffer = this.noiseBuffer
    noiseFilter.type = 'bandpass'
    noiseFilter.frequency.value = 1800
    noiseFilter.Q.value = 0.7
    noiseGain.gain.setValueAtTime(0.65, time)
    noiseGain.gain.exponentialRampToValueAtTime(0.001, time + 0.18)
    noise.connect(noiseFilter).connect(noiseGain).connect(this.master)

    const body = this.context.createOscillator()
    const bodyGain = this.context.createGain()
    body.type = 'triangle'
    body.frequency.setValueAtTime(190, time)
    body.frequency.exponentialRampToValueAtTime(115, time + 0.09)
    bodyGain.gain.setValueAtTime(0.3, time)
    bodyGain.gain.exponentialRampToValueAtTime(0.001, time + 0.12)
    body.connect(bodyGain).connect(this.master)

    noise.start(time)
    noise.stop(time + 0.2)
    body.start(time)
    body.stop(time + 0.14)
  }

  private hat(time: number) {
    if (!this.context || !this.master || !this.noiseBuffer) return
    const noise = this.context.createBufferSource()
    const filter = this.context.createBiquadFilter()
    const gain = this.context.createGain()
    noise.buffer = this.noiseBuffer
    filter.type = 'highpass'
    filter.frequency.value = 6500
    gain.gain.setValueAtTime(0.34, time)
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.065)
    noise.connect(filter).connect(gain).connect(this.master)
    noise.start(time)
    noise.stop(time + 0.08)
  }

  private synth(time: number, voltage: number, waveform: SynthWaveform) {
    if (!this.context || !this.master) return
    const oscillator = this.context.createOscillator()
    const filter = this.context.createBiquadFilter()
    const gain = this.context.createGain()
    const frequency = clamp(130.8128 * 2 ** clamp(voltage, -5, 5), 20, 12000)

    oscillator.type = waveform
    oscillator.frequency.setValueAtTime(frequency, time)
    filter.type = 'lowpass'
    filter.frequency.setValueAtTime(Math.min(9000, Math.max(700, frequency * 7)), time)
    filter.frequency.exponentialRampToValueAtTime(
      Math.min(5000, Math.max(300, frequency * 2)),
      time + 0.3,
    )
    filter.Q.value = 2.5
    gain.gain.setValueAtTime(0.001, time)
    gain.gain.exponentialRampToValueAtTime(0.34, time + 0.008)
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.42)
    oscillator.connect(filter).connect(gain).connect(this.master)
    oscillator.start(time)
    oscillator.stop(time + 0.45)
  }
}
