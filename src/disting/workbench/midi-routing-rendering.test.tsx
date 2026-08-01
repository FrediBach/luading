import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { MidiRoutingPanel } from './MidiEventTool'

const handlers = {
  onConnect: () => undefined,
  onToggleInput: () => undefined,
  onAssignmentChange: () => undefined,
}

describe('Web MIDI routing controls', () => {
  it('renders unsupported and permission-request states', () => {
    const unsupported = renderToStaticMarkup(
      <MidiRoutingPanel
        devices={{ status: 'unsupported', inputs: [], outputs: [] }}
        enabledInputIds={[]}
        assignments={{}}
        {...handlers}
      />,
    )
    const requesting = renderToStaticMarkup(
      <MidiRoutingPanel
        devices={{ status: 'requesting', inputs: [], outputs: [] }}
        enabledInputIds={[]}
        assignments={{}}
        {...handlers}
      />,
    )

    expect(unsupported).toContain('Web MIDI is unavailable')
    expect(unsupported).not.toContain('Connect Web MIDI')
    expect(requesting).toContain('Requesting access')
    expect(requesting).toContain('disabled=""')
  })

  it('renders input selection and all documented destination routes', () => {
    const markup = renderToStaticMarkup(
      <MidiRoutingPanel
        devices={{
          status: 'ready',
          inputs: [
            {
              id: 'keys',
              type: 'input',
              name: 'Keys',
              manufacturer: 'Maker',
              state: 'connected',
              connection: 'open',
            },
            {
              id: 'offline',
              type: 'input',
              name: 'Offline input',
              manufacturer: '',
              state: 'disconnected',
              connection: 'pending',
            },
          ],
          outputs: [{
            id: 'synth',
            type: 'output',
            name: 'Synth',
            manufacturer: 'Maker',
            state: 'connected',
            connection: 'closed',
          }],
          error: 'One device is busy',
        }}
        enabledInputIds={['keys']}
        assignments={{ usb: 'synth' }}
        {...handlers}
      />,
    )

    expect(markup).toContain('Inputs sent to the Lua MIDI callback')
    expect(markup).toContain('checked=""')
    expect(markup).toContain('Offline input')
    expect(markup).toContain('MIDI breakout · 0x1')
    expect(markup).toContain('Select Bus · 0x2')
    expect(markup).toContain('USB · 0x4')
    expect(markup).toContain('Internal · 0x8')
    expect(markup).toContain('value="synth" selected=""')
    expect(markup).toContain('One device is busy')
  })

  it('shows an empty ready input list', () => {
    const markup = renderToStaticMarkup(
      <MidiRoutingPanel
        devices={{ status: 'ready', inputs: [], outputs: [] }}
        enabledInputIds={[]}
        assignments={{}}
        {...handlers}
      />,
    )

    expect(markup).toContain('No MIDI inputs found.')
    expect(markup).toContain('Not connected')
  })
})
