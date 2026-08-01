import type {
  WebMidiDeviceState,
  WebMidiPortDescriptor,
} from '../types'

export interface WebMidiAccessProvider {
  requestMIDIAccess(options?: MIDIOptions): Promise<MIDIAccess>
}

export interface WebMidiMessage {
  portId: string
  bytes: number[]
  timestamp: number
}

export interface WebMidiSendFailure {
  portId: string
  message: string
}

type StateListener = (state: WebMidiDeviceState) => void
type MessageListener = (message: WebMidiMessage) => void

function browserMidiProvider(): WebMidiAccessProvider | null {
  if (
    typeof navigator === 'undefined'
    || typeof navigator.requestMIDIAccess !== 'function'
  ) return null

  return {
    requestMIDIAccess: (options) => navigator.requestMIDIAccess(options),
  }
}

function errorMessage(caught: unknown) {
  if (caught instanceof Error && caught.message) return caught.message
  return String(caught)
}

function portDescriptor(port: MIDIPort): WebMidiPortDescriptor {
  return {
    id: port.id,
    type: port.type,
    name: port.name?.trim() || `MIDI ${port.type}`,
    manufacturer: port.manufacturer?.trim() ?? '',
    state: port.state,
    connection: port.connection,
  }
}

function sortedPortDescriptors(ports: Iterable<MIDIPort>) {
  return [...ports]
    .map(portDescriptor)
    .sort((left, right) => (
      left.name.localeCompare(right.name) || left.id.localeCompare(right.id)
    ))
}

function inputPorts(access: MIDIAccess) {
  const ports = new Map<string, MIDIInput>()
  access.inputs.forEach((port, id) => ports.set(id, port))
  return ports
}

function outputPorts(access: MIDIAccess) {
  const ports = new Map<string, MIDIOutput>()
  access.outputs.forEach((port, id) => ports.set(id, port))
  return ports
}

async function safelyClose(port: MIDIPort) {
  try {
    await port.close()
  } catch {
    // A disconnected Web MIDI port is allowed to reject close().
  }
}

export class DistingWebMidiManager {
  private readonly provider: WebMidiAccessProvider | null
  private access: MIDIAccess | null = null
  private inputs = new Map<string, MIDIInput>()
  private outputs = new Map<string, MIDIOutput>()
  private selectedInputIds = new Set<string>()
  private inputHandlers = new Map<string, {
    port: MIDIInput
    handler: (event: MIDIMessageEvent) => void
  }>()
  private stateListeners = new Set<StateListener>()
  private messageListeners = new Set<MessageListener>()
  private connectPromise: Promise<WebMidiDeviceState> | null = null
  private requestVersion = 0
  private currentState: WebMidiDeviceState

  constructor(provider: WebMidiAccessProvider | null = browserMidiProvider()) {
    this.provider = provider
    this.currentState = {
      status: provider ? 'idle' : 'unsupported',
      inputs: [],
      outputs: [],
    }
  }

  get state(): WebMidiDeviceState {
    return {
      ...this.currentState,
      inputs: [...this.currentState.inputs],
      outputs: [...this.currentState.outputs],
    }
  }

  get enabledInputIds() {
    return [...this.selectedInputIds]
  }

  subscribe(listener: StateListener) {
    this.stateListeners.add(listener)
    listener(this.state)
    return () => this.stateListeners.delete(listener)
  }

  subscribeToMessages(listener: MessageListener) {
    this.messageListeners.add(listener)
    return () => this.messageListeners.delete(listener)
  }

  connect(): Promise<WebMidiDeviceState> {
    if (!this.provider) return Promise.resolve(this.state)
    if (this.connectPromise) return this.connectPromise
    if (this.access) {
      return this.refreshPorts().then(() => this.state)
    }

    const requestVersion = ++this.requestVersion
    this.updateState({ status: 'requesting', inputs: [], outputs: [] })
    const request = this.provider.requestMIDIAccess({ sysex: false })
      .then(async (access) => {
        if (requestVersion !== this.requestVersion) {
          await this.closeAccessPorts(access)
          return this.state
        }
        this.access = access
        access.addEventListener('statechange', this.handleStateChange)
        await this.refreshPorts()
        return this.state
      })
      .catch((caught: unknown) => {
        if (requestVersion !== this.requestVersion) return this.state
        this.updateState({
          status: caught instanceof DOMException && caught.name === 'NotAllowedError'
            ? 'denied'
            : 'error',
          inputs: [],
          outputs: [],
          error: errorMessage(caught),
        })
        return this.state
      })
      .finally(() => {
        if (this.connectPromise === request) this.connectPromise = null
      })
    this.connectPromise = request
    return request
  }

  async setInputEnabled(portId: string, enabled: boolean) {
    if (enabled) this.selectedInputIds.add(portId)
    else this.selectedInputIds.delete(portId)
    const inputError = await this.reconcileInputHandlers()
    this.publishReadyState(inputError)
  }

  send(
    portIds: readonly string[],
    bytes: readonly number[],
    timestamp?: number,
  ): WebMidiSendFailure[] {
    const failures: WebMidiSendFailure[] = []
    for (const portId of new Set(portIds)) {
      const output = this.outputs.get(portId)
      if (!output) {
        failures.push({ portId, message: 'MIDI output is unavailable.' })
        continue
      }
      if (output.state !== 'connected') {
        failures.push({ portId, message: 'MIDI output is disconnected.' })
        continue
      }
      try {
        output.send([...bytes], timestamp)
      } catch (caught) {
        failures.push({ portId, message: errorMessage(caught) })
      }
    }
    return failures
  }

  async close() {
    this.requestVersion += 1
    this.connectPromise = null
    const access = this.access
    this.access = null
    if (access) access.removeEventListener('statechange', this.handleStateChange)

    for (const [portId, entry] of this.inputHandlers) {
      entry.port.removeEventListener('midimessage', entry.handler)
      this.inputHandlers.delete(portId)
    }
    if (access) await this.closeAccessPorts(access)

    this.inputs.clear()
    this.outputs.clear()
    this.selectedInputIds.clear()
    this.updateState({
      status: this.provider ? 'idle' : 'unsupported',
      inputs: [],
      outputs: [],
    })
  }

  private readonly handleStateChange = () => {
    void this.refreshPorts()
  }

  private async refreshPorts() {
    if (!this.access) return
    this.inputs = inputPorts(this.access)
    this.outputs = outputPorts(this.access)
    const inputError = await this.reconcileInputHandlers()
    this.publishReadyState(inputError)
  }

  private async reconcileInputHandlers() {
    for (const [portId, entry] of this.inputHandlers) {
      const currentPort = this.inputs.get(portId)
      if (
        this.selectedInputIds.has(portId)
        && currentPort === entry.port
        && currentPort.state === 'connected'
      ) continue
      entry.port.removeEventListener('midimessage', entry.handler)
      this.inputHandlers.delete(portId)
      await safelyClose(entry.port)
    }

    let firstError: string | undefined
    for (const portId of this.selectedInputIds) {
      const port = this.inputs.get(portId)
      if (!port || port.state !== 'connected' || this.inputHandlers.has(portId)) continue
      const handler = (event: MIDIMessageEvent) => {
        if (!event.data || event.data.length === 0) return
        const message = {
          portId,
          bytes: Array.from(event.data),
          timestamp: event.timeStamp,
        } satisfies WebMidiMessage
        for (const listener of this.messageListeners) listener(message)
      }
      port.addEventListener('midimessage', handler)
      this.inputHandlers.set(portId, { port, handler })
      try {
        await port.open()
      } catch (caught) {
        port.removeEventListener('midimessage', handler)
        this.inputHandlers.delete(portId)
        firstError ??= errorMessage(caught)
      }
    }
    return firstError
  }

  private publishReadyState(error?: string) {
    if (!this.access) return
    this.updateState({
      status: 'ready',
      inputs: sortedPortDescriptors(this.inputs.values()),
      outputs: sortedPortDescriptors(this.outputs.values()),
      ...(error ? { error } : {}),
    })
  }

  private updateState(state: WebMidiDeviceState) {
    this.currentState = state
    for (const listener of this.stateListeners) listener(this.state)
  }

  private async closeAccessPorts(access: MIDIAccess) {
    const inputs = inputPorts(access)
    const outputs = outputPorts(access)
    for (const output of outputs.values()) {
      try {
        const clear = (output as MIDIOutput & { clear?: () => void }).clear
        clear?.call(output)
      } catch {
        // Ignore devices that disappeared while their send queue was cleared.
      }
    }
    await Promise.all([
      ...[...inputs.values()].map(safelyClose),
      ...[...outputs.values()].map(safelyClose),
    ])
  }
}
