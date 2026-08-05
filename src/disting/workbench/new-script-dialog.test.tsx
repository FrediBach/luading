// @vitest-environment jsdom

import { act, createRef } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NewScriptDialog } from './NewScriptDialog'
import { ScriptFileActions } from './ScriptFileActions'
import type { ScriptScaffoldDraft } from './script-scaffold'

let container: HTMLDivElement
let root: ReturnType<typeof createRoot>

function button(label: string) {
  const match = [...document.querySelectorAll<HTMLButtonElement>('button')]
    .find((candidate) => candidate.textContent?.includes(label) || candidate.getAttribute('aria-label') === label)
  if (!match) throw new Error(`Missing button: ${label}`)
  return match
}

function click(element: HTMLElement) {
  element.dispatchEvent(new MouseEvent('click', { bubbles: true }))
}

beforeEach(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => { root.unmount() })
  container.remove()
})

describe('new-script dialog', () => {
  it('opens from New and creates the default quick-start draft', async () => {
    const onCreate = vi.fn(async (draft: ScriptScaffoldDraft) => {
      void draft
      return true
    })
    await act(async () => {
      root.render(<ScriptFileActions projects={[]} onCreate={onCreate} onImport={vi.fn()} onExport={vi.fn()} />)
    })
    const trigger = button('Create new Lua script')
    await act(async () => { click(trigger) })
    expect(document.querySelector('[role="dialog"]')).not.toBeNull()
    expect(document.body.textContent).toContain('Quick start')
    expect(document.body.textContent).toContain('Guided setup')

    await act(async () => { click(button('Quick start')) })
    expect(document.body.textContent).toContain('The generated script passes Input 1 to Output 1.')
    await act(async () => { click(button('Create simple script')); await Promise.resolve() })

    expect(onCreate).toHaveBeenCalledTimes(1)
    expect(onCreate.mock.calls[0][0]).toMatchObject({
      name: 'New Script',
      inputs: [{ name: 'Input', kind: 'cv' }],
      outputs: [{ name: 'Output', kind: 'linear' }],
    })
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    expect(document.activeElement).toBe(trigger)
  })

  it('builds I/O, parameters, controls, MIDI, state, presets, and review source', async () => {
    const onCreate = vi.fn(async (draft: ScriptScaffoldDraft) => {
      void draft
      return true
    })
    const focusRef = createRef<HTMLButtonElement>()
    await act(async () => {
      root.render(<NewScriptDialog open projects={[]} returnFocusRef={focusRef} onClose={vi.fn()} onCreate={onCreate} />)
    })
    await act(async () => { click(button('Guided setup')) })

    await act(async () => { click(button('Inputs')) })
    await act(async () => { click(button('Add input')) })
    const inputTypes = document.querySelectorAll<HTMLSelectElement>('.script-scaffold-row select')
    await act(async () => {
      inputTypes[1].value = 'gate'
      inputTypes[1].dispatchEvent(new Event('change', { bubbles: true }))
    })

    await act(async () => { click(button('Parameters')) })
    await act(async () => { click(button('Add numeric parameter')) })
    await act(async () => { click(button('Add choice parameter')) })
    expect(document.body.textContent).toContain('Numeric')
    expect(document.body.textContent).toContain('Choice')

    await act(async () => { click(button('Hardware controls')) })
    const customUi = document.querySelectorAll<HTMLInputElement>('input[name="custom-ui"]')[1]
    await act(async () => { click(customUi) })
    const pot1 = [...document.querySelectorAll<HTMLLabelElement>('.script-scaffold-control-options label')]
      .find((label) => label.textContent?.includes('Pot 1 turn'))?.querySelector('input')
    expect(pot1).not.toBeNull()
    await act(async () => { click(pot1!) })

    await act(async () => { click(button('Extras & presets')) })
    const midiToggle = [...document.querySelectorAll<HTMLLabelElement>('.script-scaffold-toggle')]
      .find((label) => label.textContent?.includes('Receive filtered MIDI'))?.querySelector('input')
    await act(async () => { click(midiToggle!) })
    const stateToggle = [...document.querySelectorAll<HTMLLabelElement>('.script-scaffold-toggle')]
      .find((label) => label.textContent?.includes('Save extra'))?.querySelector('input')
    await act(async () => { click(stateToggle!) })
    await act(async () => { click(button('Add starting point')) })

    await act(async () => { click(button('Review')) })
    const source = document.querySelector('.script-scaffold-source')?.textContent ?? ''
    expect(document.querySelector('.script-scaffold-review-filename')?.textContent).toBe('New Script.lua')
    expect(document.querySelector('.lua-source-preview-code')).not.toBeNull()
    expect(source).toContain('gate = function(self, input, rising)')
    expect(source).toContain('pot1Turn = function(self, value)')
    expect(source).toContain('midiMessage = function(self, message)')
    expect(source).toContain('serialise = function(self)')
    expect(source).toContain('parameterPresets')
    expect(document.body.textContent).toContain('Luading extensions')

    await act(async () => { click(button('Create script')); await Promise.resolve() })
    expect(onCreate).toHaveBeenCalledTimes(1)
    expect(onCreate.mock.calls[0][0]).toMatchObject({
      inputs: expect.arrayContaining([expect.objectContaining({ kind: 'gate' })]),
      controls: expect.objectContaining({ customUi: true, callbacks: ['pot1Turn'] }),
      extras: expect.objectContaining({ serialise: true }),
    })
  })

  it('discloses and gates non-manual front-panel events', async () => {
    const focusRef = createRef<HTMLButtonElement>()
    await act(async () => {
      root.render(<NewScriptDialog open projects={[]} returnFocusRef={focusRef} onClose={vi.fn()} onCreate={async () => true} />)
    })
    await act(async () => { click(button('Guided setup')) })
    await act(async () => { click(button('Hardware controls')) })
    const customUi = document.querySelectorAll<HTMLInputElement>('input[name="custom-ui"]')[1]
    await act(async () => { click(customUi) })
    const buttonEvent = [...document.querySelectorAll<HTMLLabelElement>('.script-scaffold-control-options label')]
      .find((label) => label.textContent?.includes('Button 1 push'))
    expect(buttonEvent?.textContent).toContain('simulator extension')
    expect(buttonEvent?.querySelector('input')?.disabled).toBe(true)
    const consent = document.querySelector<HTMLInputElement>('.script-scaffold-extension-consent input')!
    await act(async () => { click(consent) })
    expect(buttonEvent?.querySelector('input')?.disabled).toBe(false)
  })
})
