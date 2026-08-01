import { describe, expect, it, vi } from 'vitest'
import type { WebMidiDeviceState } from '../types'
import {
  DistingWebMidiManager,
  type WebMidiAccessProvider,
  type WebMidiMessage,
} from './web-midi'

class FakeMidiPort extends EventTarget {
  readonly id: string
  readonly type: 'input' | 'output'
  name: string | null
  manufacturer: string | null
  version: string | null = '1'
  state: 'connected' | 'disconnected' = 'connected'
  connection: 'open' | 'closed' | 'pending' = 'closed'
  onstatechange = null
  onmidimessage = null
  readonly sent: Array<{ bytes: number[]; timestamp?: number }> = []
  openError: unknown
  sendError: unknown
  closeError: unknown
  clearError: unknown
  clearCalls = 0
  closeCalls = 0

  constructor(
    id: string,
    type: 'input' | 'output',
    name: string | null = id,
    manufacturer: string | null = 'Test maker',
  ) {
    super()
    this.id = id
    this.type = type
    this.name = name
    this.manufacturer = manufacturer
  }

  async open() {
    if (this.openError) throw this.openError
    this.connection = 'open'
    return this
  }

  async close() {
    this.closeCalls += 1
    if (this.closeError) throw this.closeError
    this.connection = 'closed'
    return this
  }

  send(bytes: number[], timestamp?: number) {
    if (this.sendError) throw this.sendError
    this.sent.push({ bytes: [...bytes], timestamp })
  }

  clear() {
    this.clearCalls += 1
    if (this.clearError) throw this.clearError
  }

  emitMessage(bytes: number[] | null, timestamp = 12.5) {
    const event = new Event('midimessage') as MIDIMessageEvent
    Object.defineProperties(event, {
      data: { value: bytes === null ? null : Uint8Array.from(bytes) },
      timeStamp: { value: timestamp },
    })
    this.dispatchEvent(event)
  }
}

class FakeMidiAccess extends EventTarget {
  readonly inputs = new Map<string, MIDIInput>()
  readonly outputs = new Map<string, MIDIOutput>()
  readonly sysexEnabled = false
  onstatechange = null

  addPort(port: FakeMidiPort) {
    if (port.type === 'input') this.inputs.set(port.id, port as unknown as MIDIInput)
    else this.outputs.set(port.id, port as unknown as MIDIOutput)
  }

  emitStateChange() {
    this.dispatchEvent(new Event('statechange'))
  }
}

function providerFor(access: FakeMidiAccess) {
  const requestMIDIAccess = vi.fn(async () => access as unknown as MIDIAccess)
  return {
    provider: { requestMIDIAccess } satisfies WebMidiAccessProvider,
    requestMIDIAccess,
  }
}

function flushTasks() {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

describe('DistingWebMidiManager', () => {
  it('reports unsupported environments without requesting permission', async () => {
    const manager = new DistingWebMidiManager()
    const states: WebMidiDeviceState[] = []
    const unsubscribe = manager.subscribe((state) => states.push(state))

    expect(manager.state.status).toBe('unsupported')
    expect(await manager.connect()).toMatchObject({ status: 'unsupported' })
    expect(states).toHaveLength(1)

    unsubscribe()
    await manager.close()
  })

  it('uses the browser provider when requestMIDIAccess is available', async () => {
    const access = new FakeMidiAccess()
    const requestMIDIAccess = vi.fn(async () => access as unknown as MIDIAccess)
    vi.stubGlobal('navigator', { requestMIDIAccess })
    try {
      const manager = new DistingWebMidiManager()
      expect(await manager.connect()).toMatchObject({ status: 'ready' })
      expect(requestMIDIAccess).toHaveBeenCalledWith({ sysex: false })
      await manager.close()
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('requests non-SysEx access once and publishes sorted port snapshots', async () => {
    const access = new FakeMidiAccess()
    access.addPort(new FakeMidiPort('input-z', 'input', null, null))
    access.addPort(new FakeMidiPort('input-a', 'input', 'Alpha'))
    access.addPort(new FakeMidiPort('output-b', 'output', 'Beta'))
    const { provider, requestMIDIAccess } = providerFor(access)
    const manager = new DistingWebMidiManager(provider)
    const states: WebMidiDeviceState[] = []
    manager.subscribe((state) => states.push(state))

    const [left, right] = await Promise.all([manager.connect(), manager.connect()])

    expect(requestMIDIAccess).toHaveBeenCalledOnce()
    expect(requestMIDIAccess).toHaveBeenCalledWith({ sysex: false })
    expect(left.status).toBe('ready')
    expect(right.status).toBe('ready')
    expect(manager.state.inputs.map((port) => port.name)).toEqual(['Alpha', 'MIDI input'])
    expect(manager.state.inputs[1]?.manufacturer).toBe('')
    expect(manager.state.outputs.map((port) => port.id)).toEqual(['output-b'])
    expect(states.map((state) => state.status)).toEqual(['idle', 'requesting', 'ready'])

    await manager.connect()
    expect(requestMIDIAccess).toHaveBeenCalledOnce()
    await manager.close()
  })

  it('distinguishes permission denial from other access failures and allows retry', async () => {
    const access = new FakeMidiAccess()
    const requestMIDIAccess = vi.fn()
      .mockRejectedValueOnce(new DOMException('Permission blocked', 'NotAllowedError'))
      .mockRejectedValueOnce('MIDI service failed')
      .mockResolvedValueOnce(access as unknown as MIDIAccess)
    const manager = new DistingWebMidiManager({ requestMIDIAccess })

    expect(await manager.connect()).toMatchObject({
      status: 'denied',
      error: 'Permission blocked',
    })
    expect(await manager.connect()).toMatchObject({
      status: 'error',
      error: 'MIDI service failed',
    })
    expect(await manager.connect()).toMatchObject({ status: 'ready' })

    await manager.close()
  })

  it('opens selected inputs, emits copied messages, and detaches cleanly', async () => {
    const access = new FakeMidiAccess()
    const input = new FakeMidiPort('keys', 'input')
    access.addPort(input)
    const manager = new DistingWebMidiManager(providerFor(access).provider)
    const messages: WebMidiMessage[] = []
    const unsubscribe = manager.subscribeToMessages((message) => messages.push(message))
    await manager.connect()

    await manager.setInputEnabled('keys', true)
    expect(manager.enabledInputIds).toEqual(['keys'])
    expect(input.connection).toBe('open')
    input.emitMessage([0x90, 60, 100], 44)
    input.emitMessage([], 45)
    input.emitMessage(null, 46)
    expect(messages).toEqual([{
      portId: 'keys',
      bytes: [0x90, 60, 100],
      timestamp: 44,
    }])

    unsubscribe()
    await manager.setInputEnabled('keys', false)
    input.emitMessage([0x80, 60, 0])
    expect(messages).toHaveLength(1)
    expect(input.closeCalls).toBe(1)

    await manager.close()
  })

  it('reconciles hot-plugged and reconnected selected inputs', async () => {
    const access = new FakeMidiAccess()
    const manager = new DistingWebMidiManager(providerFor(access).provider)
    await manager.connect()
    await manager.setInputEnabled('later', true)

    const input = new FakeMidiPort('later', 'input')
    const output = new FakeMidiPort('out', 'output')
    access.addPort(input)
    access.addPort(output)
    access.emitStateChange()
    await flushTasks()
    expect(input.connection).toBe('open')
    expect(manager.state.outputs.map((port) => port.id)).toEqual(['out'])

    input.state = 'disconnected'
    access.emitStateChange()
    await flushTasks()
    expect(input.closeCalls).toBe(1)

    input.state = 'connected'
    access.emitStateChange()
    await flushTasks()
    expect(input.connection).toBe('open')

    await manager.close()
  })

  it('keeps input-open failures non-fatal and reports the first error', async () => {
    const access = new FakeMidiAccess()
    const first = new FakeMidiPort('first', 'input')
    const second = new FakeMidiPort('second', 'input')
    first.openError = new Error('First input is busy')
    second.openError = new Error('Second input is busy')
    access.addPort(first)
    access.addPort(second)
    const manager = new DistingWebMidiManager(providerFor(access).provider)
    await manager.connect()

    await manager.setInputEnabled('first', true)
    await manager.setInputEnabled('second', true)
    expect(manager.state).toMatchObject({
      status: 'ready',
      error: 'First input is busy',
    })

    await manager.close()
  })

  it('sends once per output and reports unavailable, disconnected, and device errors', async () => {
    const access = new FakeMidiAccess()
    const working = new FakeMidiPort('working', 'output')
    const disconnected = new FakeMidiPort('disconnected', 'output')
    const failing = new FakeMidiPort('failing', 'output')
    disconnected.state = 'disconnected'
    failing.sendError = new TypeError('Invalid MIDI message')
    access.addPort(working)
    access.addPort(disconnected)
    access.addPort(failing)
    const manager = new DistingWebMidiManager(providerFor(access).provider)
    await manager.connect()

    const failures = manager.send(
      ['working', 'working', 'missing', 'disconnected', 'failing'],
      [0x90, 64, 127],
      100,
    )

    expect(working.sent).toEqual([{ bytes: [0x90, 64, 127], timestamp: 100 }])
    expect(failures).toEqual([
      { portId: 'missing', message: 'MIDI output is unavailable.' },
      { portId: 'disconnected', message: 'MIDI output is disconnected.' },
      { portId: 'failing', message: 'Invalid MIDI message' },
    ])

    await manager.close()
  })

  it('invalidates pending access and tolerates disappearing ports during cleanup', async () => {
    const access = new FakeMidiAccess()
    const input = new FakeMidiPort('input', 'input')
    const output = new FakeMidiPort('output', 'output')
    input.closeError = new Error('Input disappeared')
    output.closeError = new Error('Output disappeared')
    output.clearError = new Error('Queue disappeared')
    access.addPort(input)
    access.addPort(output)
    let resolveAccess!: (access: MIDIAccess) => void
    const pending = new Promise<MIDIAccess>((resolve) => {
      resolveAccess = resolve
    })
    const manager = new DistingWebMidiManager({ requestMIDIAccess: () => pending })
    const connecting = manager.connect()

    await manager.close()
    resolveAccess(access as unknown as MIDIAccess)
    expect(await connecting).toMatchObject({ status: 'idle' })
    expect(output.clearCalls).toBe(1)
    expect(input.closeCalls).toBe(1)
    expect(output.closeCalls).toBe(1)
  })
})
