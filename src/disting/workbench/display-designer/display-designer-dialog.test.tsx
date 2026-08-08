// @vitest-environment jsdom

import { act, createRef } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { serializeDisplayDesign } from './display-design-file'
import {
  createDefaultDisplayPrimitive,
  createEmptyDisplayDesign,
  createSequentialDisplayDesignIdFactory,
} from './display-design-model'
import { DisplayDesignerLauncher } from './DisplayDesignerLauncher'
import { DisplayDesignerDialog } from './DisplayDesignerDialog'

let container: HTMLDivElement
let root: ReturnType<typeof createRoot>
let createObjectUrlDescriptor: PropertyDescriptor | undefined
let revokeObjectUrlDescriptor: PropertyDescriptor | undefined

function button(label: string) {
  const match = [...document.querySelectorAll<HTMLButtonElement>('button')]
    .find((candidate) => candidate.getAttribute('aria-label') === label || candidate.textContent?.trim() === label)
  if (!match) throw new Error(`Missing button: ${label}`)
  return match
}

function field(label: string) {
  const match = [...document.querySelectorAll<HTMLLabelElement>('label')]
    .find((candidate) => candidate.querySelector(':scope > span')?.textContent === label)
    ?.querySelector<HTMLInputElement | HTMLSelectElement>('input, select')
  if (!match) throw new Error(`Missing field: ${label}`)
  return match
}

async function click(element: HTMLElement) {
  await act(async () => { element.dispatchEvent(new MouseEvent('click', { bubbles: true })); await Promise.resolve() })
}

async function addDefault(tool: string) {
  await click(button(tool))
  await click(button(`Add default ${tool}`))
}

async function openActions(label: string) {
  await click(button(label))
  expect(document.querySelector('[role="menu"]')).not.toBeNull()
}

async function choose(element: HTMLSelectElement, value: string) {
  await act(async () => {
    element.value = value
    element.dispatchEvent(new Event('change', { bubbles: true }))
  })
}

async function commitInput(element: HTMLInputElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(element, value)
    element.dispatchEvent(new Event('input', { bubbles: true }))
    element.dispatchEvent(new Event('change', { bubbles: true }))
  })
  await act(async () => { element.dispatchEvent(new FocusEvent('focusout', { bubbles: true })) })
}

async function chooseDesignFile(file: Pick<File, 'name' | 'type' | 'size' | 'text'>) {
  const input = document.querySelector<HTMLInputElement>('[aria-label="Choose display design file"]')!
  Object.defineProperty(input, 'files', { configurable: true, value: [file] })
  await act(async () => {
    input.dispatchEvent(new Event('change', { bubbles: true }))
    await Promise.resolve()
    await Promise.resolve()
  })
}

function source() {
  return document.querySelector('.display-designer-source')?.textContent ?? ''
}

function layer(name: string) {
  const match = [...document.querySelectorAll<HTMLButtonElement>('.display-designer-layer-select')]
    .find((candidate) => candidate.querySelector('span')?.textContent === name)
  if (!match) throw new Error(`Missing layer: ${name}`)
  return match
}

function bindingCard(name: string) {
  const match = [...document.querySelectorAll<HTMLElement>('.display-designer-state-binding')]
    .find((candidate) => candidate.querySelector('header strong')?.textContent === name)
  if (!match) throw new Error(`Missing binding: ${name}`)
  return match
}

async function pointer(element: Element, type: string, x: number, y: number, options: { pointerId?: number; shiftKey?: boolean; ctrlKey?: boolean } = {}) {
  await act(async () => {
    const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, shiftKey: options.shiftKey, ctrlKey: options.ctrlKey })
    Object.defineProperty(event, 'pointerId', { value: options.pointerId ?? 1 })
    element.dispatchEvent(event)
    await Promise.resolve()
  })
}

function prepareArtboard() {
  const artboard = document.querySelector<HTMLElement>('.display-designer-artboard')!
  vi.spyOn(artboard, 'getBoundingClientRect').mockReturnValue({
    x: 0, y: 0, left: 0, top: 0, right: 512, bottom: 128, width: 512, height: 128,
    toJSON: () => ({}),
  })
  Object.assign(artboard, { setPointerCapture: vi.fn(), releasePointerCapture: vi.fn() })
  return artboard
}

beforeEach(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    save: vi.fn(),
    restore: vi.fn(),
    fillRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    closePath: vi.fn(),
    arc: vi.fn(),
    imageSmoothingEnabled: false,
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
  } as unknown as CanvasRenderingContext2D)
  container = document.createElement('div')
  container.className = 'disting-app'
  document.body.append(container)
  root = createRoot(container)
  createObjectUrlDescriptor = Object.getOwnPropertyDescriptor(URL, 'createObjectURL')
  revokeObjectUrlDescriptor = Object.getOwnPropertyDescriptor(URL, 'revokeObjectURL')
})

afterEach(async () => {
  await act(async () => { root.unmount() })
  container.remove()
  if (createObjectUrlDescriptor) Object.defineProperty(URL, 'createObjectURL', createObjectUrlDescriptor)
  else delete (URL as Partial<typeof URL>).createObjectURL
  if (revokeObjectUrlDescriptor) Object.defineProperty(URL, 'revokeObjectURL', revokeObjectUrlDescriptor)
  else delete (URL as Partial<typeof URL>).revokeObjectURL
  vi.restoreAllMocks()
})

describe('Display designer dialog', () => {
  it('searches starter components, previews scenarios, inserts editable stateful symbols, and undoes atomically', async () => {
    await act(async () => { root.render(<DisplayDesignerLauncher />) })
    await click(button('Open Display designer'))

    expect(document.querySelectorAll('.display-component-card')).toHaveLength(18)
    await commitInput(field('Search components') as HTMLInputElement, '808-like')
    expect(document.querySelectorAll('.display-component-card')).toHaveLength(1)
    expect(document.querySelector('.display-component-card strong')?.textContent).toBe('Drum voice glyph')

    await commitInput(field('Search components') as HTMLInputElement, '')
    await choose(field('Component category') as HTMLSelectElement, 'patching')
    expect([...document.querySelectorAll('.display-component-card > header strong')].map((element) => element.textContent)).toEqual([
      'Input jack',
      'Output jack',
    ])

    const scenario = document.querySelector<HTMLSelectElement>('[aria-label="Input jack preview scenario"]')!
    await choose(scenario, 'active')
    await click(button('Insert Input jack'))

    expect(layer('Input jack instance')).toBeTruthy()
    expect(bindingCard('Input jack · State')).toBeTruthy()
    expect(bindingCard('Input jack · Activity')).toBeTruthy()
    expect(bindingCard('Input jack · Level')).toBeTruthy()
    expect(source()).toContain('input_jack_state = "patched"')
    expect(document.querySelector('.display-component-library-status')?.textContent).toBe('Inserted Input jack with 3 state bindings.')

    await click(button('Edit symbol'))
    await click(button('Insert Output jack'))
    expect(document.querySelector('.display-component-library-status')?.textContent).toBe(
      'Return to the scene before inserting a component; symbols cannot contain component instances.',
    )
    expect([...document.querySelectorAll('.display-designer-layer-select')]
      .some((candidate) => candidate.textContent?.includes('Output jack instance'))).toBe(false)

    await click(button('Undo'))
    expect(document.body.textContent).not.toContain('Input jack instance')
    expect(document.body.textContent).not.toContain('Input jack · Activity')
  })

  it('adds, names, duplicates, switches, and removes isolated screens with generated selector branches', async () => {
    await act(async () => { root.render(<DisplayDesignerLauncher />) })
    await click(button('Open Display designer'))
    await addDefault('Outline box')
    await commitInput(field('Screen name') as HTMLInputElement, 'Main')

    await click(button('Add screen'))
    await commitInput(field('Screen name') as HTMLInputElement, 'Settings')
    await addDefault('Standard text')

    const screenTabs = () => [...document.querySelectorAll<HTMLButtonElement>('.display-designer-screen-tabs [role="tab"]')]
    expect(screenTabs().map((tab) => tab.querySelector('span')?.textContent)).toEqual(['Main', 'Settings'])
    expect(document.querySelectorAll('.display-designer-layer-select')).toHaveLength(1)
    expect(layer('Standard text')).toBeTruthy()
    expect(source()).toContain('local screen = 2 -- TODO: connect this screen selector to self or a parameter.')
    expect(source()).toContain('if screen == 1 then')
    expect(source()).toContain('-- Screen 1: Main')
    expect(source()).toContain('elseif screen == 2 then')
    expect(source()).toContain('-- Screen 2: Settings')

    await act(async () => {
      screenTabs()[1]!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }))
      await Promise.resolve()
    })
    expect(screenTabs().map((tab) => tab.tabIndex)).toEqual([0, -1])
    expect(screenTabs()[0]?.getAttribute('aria-selected')).toBe('true')

    expect(layer('Outline box')).toBeTruthy()
    expect(document.querySelectorAll('.display-designer-layer-select')).toHaveLength(1)

    await click(screenTabs()[1]!)
    await click(button('Duplicate screen'))
    expect(screenTabs().map((tab) => tab.querySelector('span')?.textContent)).toEqual(['Main', 'Settings', 'Settings copy'])
    expect(layer('Standard text')).toBeTruthy()

    await click(button('Remove screen'))
    expect(screenTabs().map((tab) => tab.querySelector('span')?.textContent)).toEqual(['Main', 'Settings'])
    expect(screenTabs()[1]?.getAttribute('aria-selected')).toBe('true')
  })

  it('edits the document layout grid from Artboard properties and keeps view preferences out of history', async () => {
    await act(async () => { root.render(<DisplayDesignerLauncher />) })
    await click(button('Open Display designer'))
    await act(async () => { await new Promise((resolve) => requestAnimationFrame(resolve)) })

    expect(document.body.textContent).toContain('Artboard')
    expect(button('Undo').disabled).toBe(true)
    const viewOptions = button('View options')
    viewOptions.focus()
    await click(viewOptions)
    expect(button('Layout grid').disabled).toBe(true)
    expect(button('Snap to layout grid').disabled).toBe(true)
    await act(async () => {
      document.querySelector<HTMLElement>('[role="menu"]')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })
    expect(document.activeElement).toBe(viewOptions)

    const generatedBefore = source()
    await click(button('Add layout grid'))
    expect(document.querySelectorAll('.display-designer-layout-grid line')).toHaveLength(42)
    expect(source()).toBe(generatedBefore)
    expect(button('Undo').disabled).toBe(false)

    await commitInput(field('Grid size') as HTMLInputElement, '16')
    expect(document.querySelectorAll('.display-designer-layout-grid line')).toHaveLength(22)
    await commitInput(field('Grid opacity') as HTMLInputElement, '0')
    expect(field('Grid opacity')).toHaveProperty('value', '10')
    await click(button('Hide layout grid'))
    expect(document.querySelector('.display-designer-layout-grid')).toBeNull()
    await click(button('Undo'))
    expect(field('Grid size')).toHaveProperty('value', '8')
    expect(document.querySelector('.display-designer-layout-grid')).toBeNull()
    await click(button('Show layout grid'))
    await click(button('Remove layout grid'))
    expect(button('Add layout grid')).not.toBeNull()
    await click(button('Undo'))
    expect(field('Grid size')).toHaveProperty('value', '8')
  })

  it('operates checked View options, shortcuts, focus protection, and the four-CSS-pixel threshold', async () => {
    await act(async () => { root.render(<DisplayDesignerLauncher />) })
    await click(button('Open Display designer'))
    await click(button('Add layout grid'))
    const artboard = document.querySelector<HTMLElement>('.display-designer-artboard')!
    vi.spyOn(artboard, 'getBoundingClientRect').mockReturnValue({
      x: 0, y: 0, left: 0, top: 0, right: 1024, bottom: 256, width: 1024, height: 256,
      toJSON: () => ({}),
    })

    await click(button('View options'))
    expect(button('Layout grid').getAttribute('role')).toBe('menuitemcheckbox')
    expect(button('Layout grid').getAttribute('aria-checked')).toBe('true')
    await click(button('Pixel grid'))
    expect(artboard.classList.contains('has-pixel-grid')).toBe(false)
    await choose(document.querySelector<HTMLSelectElement>('[aria-label="Artboard zoom"]')!, '4')
    expect(artboard.classList.contains('has-pixel-grid')).toBe(true)

    const dialog = document.querySelector<HTMLElement>('.display-designer-dialog')!
    await act(async () => { dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'g', ctrlKey: true, bubbles: true })) })
    expect(document.querySelector('.display-designer-layout-grid')).toBeNull()
    await act(async () => { dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'g', ctrlKey: true, bubbles: true })) })
    expect(document.querySelector('.display-designer-layout-grid')).not.toBeNull()

    const size = field('Grid size') as HTMLInputElement
    await act(async () => {
      size.focus()
      size.dispatchEvent(new KeyboardEvent('keydown', { key: "'", ctrlKey: true, bubbles: true }))
    })
    await click(button('View options'))
    expect(button('Pixel grid').getAttribute('aria-checked')).toBe('true')
  })

  it('snaps pointer previews independently of grid visibility and honours Control through pointer up', async () => {
    await act(async () => { root.render(<DisplayDesignerLauncher />) })
    await click(button('Open Display designer'))
    await click(button('Add layout grid'))
    const artboard = prepareArtboard()
    await click(button('Hide layout grid'))
    await click(button('Pixel line'))

    await pointer(artboard, 'pointerdown', 18, 34)
    await pointer(artboard, 'pointermove', 50, 50)
    expect(source()).toContain('drawLine(8, 16, 24, 24, 15)')
    expect(document.querySelector('.display-designer-snap-guides')).not.toBeNull()
    expect(document.querySelector('.display-designer-layout-grid')).toBeNull()

    await pointer(artboard, 'pointermove', 50, 50, { ctrlKey: true })
    expect(source()).toContain('drawLine(9, 17, 25, 25, 15)')
    expect(document.querySelector('.display-designer-snap-guides')).toBeNull()
    await pointer(artboard, 'pointermove', 50, 50)
    expect(source()).toContain('drawLine(8, 16, 24, 24, 15)')
    await pointer(artboard, 'pointerup', 50, 50, { ctrlKey: true })
    expect(source()).toContain('drawLine(9, 17, 25, 25, 15)')
    expect(document.querySelector('.display-designer-snap-guides')).toBeNull()
    await click(button('Undo'))
    expect(source()).not.toContain('drawLine')
  })

  it('applies grid targets to box corners, circle centres/radii, and text anchors', async () => {
    await act(async () => { root.render(<DisplayDesignerLauncher />) })
    await click(button('Open Display designer'))
    await click(button('Add layout grid'))
    const artboard = prepareArtboard()
    expect(artboard.querySelector('canvas')?.classList.contains('is-hidden')).toBe(false)

    await click(button('Filled box'))
    await pointer(artboard, 'pointerdown', 18, 34)
    await pointer(artboard, 'pointerup', 50, 50)
    expect(source()).toContain('drawRectangle(8, 16, 24, 24, 15)')
    expect(artboard.querySelector('.display-designer-selection-geometry')).not.toBeNull()

    await click(button('Pixel circle'))
    await pointer(artboard, 'pointerdown', 18, 34)
    await pointer(artboard, 'pointerup', 50, 50)
    expect(source()).toContain('drawCircle(8, 16, 16, 15)')

    await click(button('Standard text'))
    await pointer(artboard, 'pointerdown', 18, 34)
    await pointer(artboard, 'pointerup', 70, 58)
    expect(source()).toContain('drawText(8, 16, "Text", 15, "left")')
  })

  it('operates responsive panels as linked roving tabs with arrow, Home, and End keys', async () => {
    await act(async () => {
      root.render(<DisplayDesignerDialog open viewportWidth={800} returnFocusRef={createRef<HTMLElement>()} onClose={() => undefined} />)
    })
    const layersTab = document.querySelector<HTMLButtonElement>('#display-designer-tab-layers')!
    expect(layersTab.getAttribute('aria-selected')).toBe('true')
    expect(layersTab.tabIndex).toBe(0)
    expect(document.querySelector('#display-designer-panel-layers')?.hasAttribute('hidden')).toBe(false)
    expect(document.querySelector('#display-designer-panel-symbols')?.hasAttribute('hidden')).toBe(true)

    await act(async () => {
      layersTab.focus()
      layersTab.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
      await new Promise((resolve) => requestAnimationFrame(resolve))
    })
    const componentsTab = document.querySelector<HTMLButtonElement>('#display-designer-tab-components')!
    expect(componentsTab.getAttribute('aria-selected')).toBe('true')
    expect(document.activeElement).toBe(componentsTab)
    expect(document.querySelector('#display-designer-panel-components')?.hasAttribute('hidden')).toBe(false)

    await act(async () => {
      componentsTab.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
      await new Promise((resolve) => requestAnimationFrame(resolve))
    })
    const symbolsTab = document.querySelector<HTMLButtonElement>('#display-designer-tab-symbols')!
    expect(symbolsTab.getAttribute('aria-selected')).toBe('true')
    expect(document.activeElement).toBe(symbolsTab)
    expect(document.querySelector('#display-designer-panel-symbols')?.hasAttribute('hidden')).toBe(false)

    await act(async () => {
      symbolsTab.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }))
      await new Promise((resolve) => requestAnimationFrame(resolve))
    })
    expect(document.querySelector('#display-designer-tab-lua')?.getAttribute('aria-selected')).toBe('true')
    expect(document.querySelector('#display-designer-panel-lua')?.hasAttribute('hidden')).toBe(false)
  })

  it('labels dynamic controls, shade state, findings, metrics, and preview announcements', async () => {
    await act(async () => { root.render(<DisplayDesignerLauncher />) })
    await click(button('Open Display designer'))
    await addDefault('Smooth line')

    expect(button('Smooth line').getAttribute('aria-pressed')).toBe('true')
    expect(button('Shade 15').getAttribute('aria-pressed')).toBe('true')
    expect(document.querySelector('#display-designer-warnings-title')?.textContent).toContain('Warnings')
    expect(document.querySelector('[data-severity="warning"] button')?.textContent).toContain('approximation')
    expect(document.querySelector('dl')?.getAttribute('aria-describedby')).toBe('display-designer-metrics-note')
    expect(document.querySelector('.display-designer-stage-status')?.getAttribute('aria-live')).toBe('polite')

    await click(button('Make X1 runtime dynamic'))
    const slider = document.querySelector<HTMLInputElement>('[type="range"]')!
    expect(slider.getAttribute('aria-label')).toBe('X1 preview value')
    expect(slider.getAttribute('aria-valuetext')).toBe('0')
    await click(button('Make visibility dynamic'))
    const previewSwitch = document.querySelector<HTMLButtonElement>('[role="switch"]')!
    expect(previewSwitch.getAttribute('aria-label')).toBe('Visibility boolean preview')
    expect(previewSwitch.getAttribute('aria-checked')).toBe('true')
  })

  it('opens from the utility command, edits every primitive type, and updates the raster source', async () => {
    await act(async () => { root.render(<DisplayDesignerLauncher />) })
    const trigger = button('Open Display designer')
    await click(trigger)

    expect(document.querySelector('[role="dialog"]')).not.toBeNull()
    expect(document.querySelector('.display-designer-backdrop')?.parentElement).toBe(container)
    expect(document.body.style.overflow).toBe('hidden')
    await act(async () => { await new Promise((resolve) => requestAnimationFrame(resolve)) })
    expect(document.activeElement).toBe(button('Select'))

    await addDefault('Pixel line')
    expect(button('Pixel line').getAttribute('aria-pressed')).toBe('true')
    expect(document.body.textContent).toContain('Pixel line')
    expect(source()).toContain('drawLine(8, 16, 32, 16, 15)')
    expect(document.querySelector('svg .display-designer-selection-geometry line')).not.toBeNull()

    await commitInput(field('X1') as HTMLInputElement, '12')
    expect(source()).toContain('drawLine(12, 16, 32, 16, 15)')
    const x1 = field('X1') as HTMLInputElement
    await act(async () => {
      x1.focus()
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(x1, '12.5')
      x1.dispatchEvent(new Event('input', { bubbles: true }))
      x1.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })
    expect(document.querySelector('[role="dialog"]')).not.toBeNull()
    expect(field('X1')).toHaveProperty('value', '12')
    await click(button('Shade 7'))
    expect(source()).toContain('drawLine(12, 16, 32, 16, 7)')

    await addDefault('Smooth line')
    await addDefault('Outline box')
    expect(document.body.textContent).toContain('Inclusive size: 25 × 9')
    await addDefault('Filled box')
    await addDefault('Pixel box')
    expect(document.querySelectorAll('[role="gridcell"]')).toHaveLength(64)
    expect(document.body.textContent).toContain('64 pixels · frame 1 · 1 optimized draw call')
    await click(button('Paint shade 7'))
    await click(button('Pixel 1, 1: shade 15'))
    expect(button('Pixel 1, 1: shade 7')).not.toBeNull()
    expect(document.body.textContent).toContain('64 pixels · frame 1 · 2 optimized draw calls')
    expect(source()).toContain('drawLine(8, 16, 8, 16, 7)')
    await addDefault('Pixel circle')
    await addDefault('Smooth circle')
    await addDefault('Polygon')
    expect(document.body.textContent).toContain('6 straight edges')
    await commitInput(field('Detail (sides)') as HTMLInputElement, '4')
    expect(source()).toContain('local function drawPolygon(x, y, radius, sides, shade)')
    expect(source()).toContain('drawPolygon(20, 20, 8, 4, 15)')
    await addDefault('Bézier curve')
    expect(document.body.textContent).toContain('24 straight line segments')
    await commitInput(field('Detail (segments)') as HTMLInputElement, '4')
    await commitInput(field('X') as HTMLInputElement, '9')
    expect(source()).toContain('local function drawBezier(points, segments, shade)')
    expect(source()).toContain('drawBezier({{9, 24}, {20, 12}, {36, 36}, {48, 24}}, 4, 15)')
    expect(document.querySelectorAll('.display-designer-bezier-point')).toHaveLength(4)
    await click(button('Remove point'))
    expect(document.querySelectorAll('.display-designer-bezier-point')).toHaveLength(3)
    await click(button('Add control point'))
    expect(document.querySelectorAll('.display-designer-bezier-point')).toHaveLength(4)
    await addDefault('Standard text')
    await commitInput(field('Text') as HTMLInputElement, 'Level')
    await choose(field('Alignment') as HTMLSelectElement, 'right')
    await addDefault('Tiny text')

    expect(source()).toContain('drawSmoothLine')
    expect(source()).toContain('drawBox')
    expect(source()).toContain('drawRectangle')
    expect(source()).toContain('drawCircle')
    expect(source()).toContain('drawSmoothCircle')
    expect(source()).toContain('drawPolygon')
    expect(source()).toContain('drawBezier')
    expect(source()).toContain('drawText')
    expect(source()).toContain('drawTinyText')
    expect(source()).toContain('"Level"')
    expect(document.body.textContent).toContain('Primitive elements11')
    expect(document.body.textContent).toContain('Visible draw calls18')

    await choose(field('Display mode') as HTMLSelectElement, 'full-screen')
    expect(source()).toContain('return true')
    expect(document.querySelector('.display-designer-reserved-rows')).toBeNull()

    await click(button('View options'))
    await click(button('Pixel grid'))
    expect(document.querySelector('.display-designer-artboard')?.getAttribute('data-pixel-grid-suppressed')).toBe('true')
    await click(button('View options'))
    await click(button('Pixel preview'))
    expect(document.querySelector('.display-designer-artboard canvas')?.classList.contains('is-hidden')).toBe(true)
    await click(button('View options'))
    await click(button('Geometry'))
    expect(document.querySelector('[aria-label="Display designer geometry overlay"]')).not.toBeNull()
    expect(document.querySelector('.display-designer-selection-geometry')).toBeNull()
    await choose(document.querySelector<HTMLSelectElement>('[aria-label="Artboard zoom"]')!, '1')
    expect(document.querySelector<HTMLElement>('.display-designer-artboard')).toMatchObject({
      dataset: { zoom: '1' },
      style: { width: '256px' },
    })
    await choose(document.querySelector<HTMLSelectElement>('[aria-label="Artboard zoom"]')!, '3')
    expect(document.querySelector<HTMLElement>('.display-designer-artboard')?.dataset.zoom).toBe('3')
  })

  it('animates pixel boxes by duplicating frames and exposes exact rate and hold controls', async () => {
    await act(async () => { root.render(<DisplayDesignerLauncher />) })
    await click(button('Open Display designer'))
    await addDefault('Pixel box')
    await click(button('Paint shade 7'))
    await click(button('Pixel 1, 1: shade 15'))

    const animationSwitch = button('Animate pixel box')
    expect(animationSwitch.getAttribute('aria-checked')).toBe('false')
    await click(animationSwitch)
    expect(button('Animate pixel box').getAttribute('aria-checked')).toBe('true')
    expect(document.querySelectorAll('.display-designer-pixel-frame-tabs button')).toHaveLength(2)
    expect(button('Pixel 1, 1: shade 7')).not.toBeNull()

    await click(button('Paint shade 4'))
    await click(button('Pixel 2, 1: shade 15'))
    await click(button('Add frame'))
    expect(document.querySelectorAll('.display-designer-pixel-frame-tabs button')).toHaveLength(3)
    expect(button('Pixel 2, 1: shade 4')).not.toBeNull()
    await click(button('Frame 1'))
    expect(button('Pixel 2, 1: shade 15')).not.toBeNull()

    await choose(field('Frame rate') as HTMLSelectElement, '5')
    await click(button('Frame 3'))
    await commitInput(field('Frame duration') as HTMLInputElement, '3')
    expect(source()).toContain('local displayFrame = 0')
    expect(source()).toContain('if displayFrame % 30 < 6 then')
    expect(source()).toContain('elseif displayFrame % 30 < 12 then')
    expect(source()).toContain('elseif displayFrame % 30 < 30 then')
  })

  it('authors axis-aligned two-shade animated lines with direction and speed controls', async () => {
    await act(async () => { root.render(<DisplayDesignerLauncher />) })
    await click(button('Open Display designer'))
    await addDefault('Animated line')

    expect(document.body.textContent).toContain('Four pixels of each shade alternate')
    expect(source()).toContain('local function drawAnimatedLine(x1, y1, x2, y2, primaryShade, secondaryShade, direction, speed, frame)')
    expect(source()).toContain('drawAnimatedLine(8, 16, 32, 16, 15, 0, "right", 10, displayFrame)')

    await click(button('Primary shade 12'))
    await click(button('Secondary shade 3'))
    await choose(field('Animation speed') as HTMLSelectElement, '15')
    await choose(field('Direction') as HTMLSelectElement, 'down')

    expect(field('X2')).toHaveProperty('value', '8')
    expect(source()).toContain('drawAnimatedLine(8, 16, 8, 40, 12, 3, "down", 15, displayFrame)')
  })

  it('supports layer selection, duplication, ordering, deletion, undo, and collapsed panels', async () => {
    await act(async () => { root.render(<DisplayDesignerLauncher />) })
    await click(button('Open Display designer'))
    await addDefault('Pixel line')
    await addDefault('Filled box')

    await openActions('Actions for Filled box')
    await click(button('Duplicate'))
    expect(document.body.textContent).toContain('Filled box copy')
    expect(source().match(/drawRectangle/g)).toHaveLength(2)
    await openActions('Actions for Filled box copy')
    await click(button('Backward'))
    await openActions('Actions for Filled box copy')
    await click(button('Delete'))
    expect(source().match(/drawRectangle/g)).toHaveLength(1)

    await click(button('Undo'))
    expect(source().match(/drawRectangle/g)).toHaveLength(2)
    await click(button('Redo'))
    expect(source().match(/drawRectangle/g)).toHaveLength(1)

    await click(button('Hide layers'))
    expect(document.querySelector('.display-designer-workspace')?.classList.contains('layers-collapsed')).toBe(true)
    await click(button('Show layers'))
    await click(button('Hide properties'))
    expect(document.querySelector('.display-designer-workspace')?.classList.contains('inspector-collapsed')).toBe(true)
    await click(button('Show properties'))

    await addDefault('Pixel line')
    await commitInput(field('Layer name') as HTMLInputElement, '')
    expect(document.body.textContent).toContain('Pixel line')
    await commitInput(field('Exact shade') as HTMLInputElement, '20')
    expect(field('Exact shade')).toHaveProperty('value', '15')
  })

  it('opens accessible contextual actions for non-selected layers without changing their action target', async () => {
    await act(async () => { root.render(<DisplayDesignerLauncher />) })
    await click(button('Open Display designer'))
    await addDefault('Pixel line')
    await addDefault('Filled box')

    expect(layer('Filled box').getAttribute('aria-pressed')).toBe('true')
    const lineActions = button('Actions for Pixel line')
    expect(lineActions.getAttribute('aria-haspopup')).toBe('menu')
    expect(lineActions.getAttribute('aria-expanded')).toBe('false')
    await act(async () => {
      lineActions.focus()
      lineActions.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
      await new Promise((resolve) => requestAnimationFrame(resolve))
    })
    expect(document.querySelector('[role="menu"]')?.getAttribute('aria-label')).toBe('Actions for Pixel line')
    expect(document.activeElement?.getAttribute('role')).toBe('menuitem')
    expect(document.activeElement?.textContent).toBe('Duplicate')

    await act(async () => {
      document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })
    expect(document.querySelector('[role="menu"]')).toBeNull()
    expect(document.activeElement).toBe(lineActions)

    await act(async () => {
      layer('Pixel line').closest('.display-designer-layer-row')?.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }))
      await new Promise((resolve) => requestAnimationFrame(resolve))
    })
    expect(document.querySelector('[role="menu"]')?.getAttribute('aria-label')).toBe('Actions for Pixel line')
    await click(button('Duplicate'))
    expect(source().match(/drawLine/g)).toHaveLength(2)
    expect(source().match(/drawRectangle/g)).toHaveLength(1)

    await click(layer('Filled box'))
    await openActions('Actions for Pixel line')
    await click(button('Delete'))
    expect(source().match(/drawLine/g)).toHaveLength(1)
    expect(layer('Filled box').getAttribute('aria-pressed')).toBe('true')
  })

  it('requires an explicit discard, restores body scroll, and returns focus to its trigger', async () => {
    document.body.style.overflow = 'clip'
    await act(async () => { root.render(<DisplayDesignerLauncher />) })
    const trigger = button('Open Display designer')
    await click(trigger)
    await act(async () => { await new Promise((resolve) => requestAnimationFrame(resolve)) })
    await addDefault('Pixel circle')
    await click(button('Close Display designer'))

    expect(document.querySelector('[role="alertdialog"]')).not.toBeNull()
    expect(document.body.textContent).toContain('Closing now removes the unsaved design')
    expect(document.activeElement).toBe(button('Discard design'))
    await act(async () => { button('Discard design').dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true })) })
    expect(document.activeElement).toBe(button('Keep editing'))
    await click(button('Keep editing'))
    expect(document.querySelector('[role="dialog"]')).not.toBeNull()

    await click(button('Close Display designer'))
    await click(button('Discard design'))
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    expect(document.body.style.overflow).toBe('clip')
    expect(document.activeElement).toBe(trigger)

    await click(trigger)
    expect(document.body.textContent).toContain('Choose a primitive tool to add its default shape.')
    await click(button('Close Display designer'))
    expect(document.querySelector('[role="dialog"]')).toBeNull()
  })

  it('creates, moves, resizes, cancels, and groups pointer gestures as semantic transactions', async () => {
    await act(async () => { root.render(<DisplayDesignerLauncher />) })
    await click(button('Open Display designer'))
    const artboard = prepareArtboard()

    await click(button('Pixel line'))
    await pointer(artboard, 'pointerdown', 20, 24)
    expect(source()).toContain('drawLine(10, 12, 10, 12, 15)')
    await pointer(artboard, 'pointermove', 80, 40)
    expect(source()).toContain('drawLine(10, 12, 40, 20, 15)')
    await pointer(artboard, 'pointerup', 80, 40)
    expect(source()).toContain('drawLine(10, 12, 40, 20, 15)')
    expect((artboard.setPointerCapture as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(1)

    await click(button('Select'))
    await pointer(artboard, 'pointerdown', 50, 32)
    await pointer(artboard, 'pointermove', 60, 36)
    await pointer(artboard, 'pointerup', 60, 36)
    expect(source()).toContain('drawLine(15, 14, 45, 22, 15)')
    await click(button('Undo'))
    expect(source()).toContain('drawLine(10, 12, 40, 20, 15)')

    const endHandle = document.querySelector<SVGCircleElement>('[data-display-handle="end"]')!
    await pointer(endHandle, 'pointerdown', 80, 40)
    await pointer(artboard, 'pointermove', 100, 48)
    await pointer(artboard, 'pointerup', 100, 48)
    expect(source()).toContain('drawLine(10, 12, 50, 24, 15)')

    await pointer(artboard, 'pointerdown', 60, 36)
    await pointer(artboard, 'pointermove', 90, 50)
    await pointer(artboard, 'pointercancel', 90, 50)
    expect(source()).toContain('drawLine(10, 12, 50, 24, 15)')

    await addDefault('Filled box')
    await pointer(layer('Pixel line'), 'click', 0, 0)
    await pointer(layer('Filled box'), 'click', 0, 0, { shiftKey: true })
    expect(document.body.textContent).toContain('2 selected')
    await openActions('Actions for 2 selected layers from Pixel line')
    await click(button('Group'))
    expect(document.body.textContent).toContain('Group2 layers')
    await openActions('Actions for group Group')
    await click(button('Rename group…'))
    await commitInput(field('Group name') as HTMLInputElement, 'Meter')
    expect(document.body.textContent).toContain('Meter2 layers')
    const beforeHide = source()
    await openActions('Actions for group Meter')
    await click(button('Hide in editor'))
    expect(source()).toBe(beforeHide)
    await openActions('Actions for group Meter')
    await click(button('Show in editor'))
    await openActions('Actions for group Meter')
    await click(button('Duplicate group'))
    expect(document.body.textContent).toContain('Meter copy2 layers')
    await openActions('Actions for group Meter copy')
    await click(button('Ungroup'))
    expect(document.body.textContent).not.toContain('Meter copy2 layers')
  })

  it('selects enclosed layers with a reversible, additive drag area', async () => {
    await act(async () => { root.render(<DisplayDesignerLauncher />) })
    await click(button('Open Display designer'))
    const artboard = prepareArtboard()

    await click(button('Filled box'))
    await pointer(artboard, 'pointerdown', 20, 24)
    await pointer(artboard, 'pointermove', 60, 40)
    await pointer(artboard, 'pointerup', 60, 40)
    await pointer(artboard, 'pointerdown', 200, 80)
    await pointer(artboard, 'pointermove', 240, 100)
    await pointer(artboard, 'pointerup', 240, 100)
    await click(button('Select'))
    const filledBoxLayers = () => [...document.querySelectorAll<HTMLButtonElement>('.display-designer-layer-select')]
      .filter((candidate) => candidate.querySelector('span')?.textContent === 'Filled box')

    await pointer(artboard, 'pointerdown', 4, 4)
    await pointer(artboard, 'pointermove', 80, 50)
    expect(document.querySelector('.display-designer-marquee')).not.toBeNull()
    expect(filledBoxLayers().map((candidate) => candidate.getAttribute('aria-pressed'))).toEqual(['false', 'true'])
    await pointer(artboard, 'pointerup', 80, 50)
    expect(document.querySelector('.display-designer-marquee')).toBeNull()
    expect(document.body.textContent).toContain('1 selected')

    await pointer(artboard, 'pointerdown', 180, 70, { shiftKey: true })
    await pointer(artboard, 'pointermove', 250, 110, { shiftKey: true })
    await pointer(artboard, 'pointerup', 250, 110, { shiftKey: true })
    expect(document.body.textContent).toContain('2 selected')

    await pointer(artboard, 'pointerdown', 260, 115)
    await pointer(artboard, 'pointermove', 180, 70)
    await pointer(artboard, 'pointerup', 180, 70)
    expect(document.body.textContent).toContain('1 selected')
    expect(filledBoxLayers().map((candidate) => candidate.getAttribute('aria-pressed'))).toEqual(['true', 'false'])

    await pointer(artboard, 'pointerdown', 4, 4)
    await pointer(artboard, 'pointermove', 80, 50)
    expect(filledBoxLayers().map((candidate) => candidate.getAttribute('aria-pressed'))).toEqual(['false', 'true'])
    await pointer(artboard, 'pointercancel', 80, 50)
    expect(filledBoxLayers().map((candidate) => candidate.getAttribute('aria-pressed'))).toEqual(['true', 'false'])
  })

  it('supports multi-layer alignment, distribution, ordering, nudge, duplicate, delete, and keyboard history', async () => {
    await act(async () => { root.render(<DisplayDesignerLauncher />) })
    await click(button('Open Display designer'))
    await addDefault('Pixel line')
    await addDefault('Filled box')
    await addDefault('Pixel circle')

    await pointer(layer('Pixel line'), 'click', 0, 0)
    await pointer(layer('Filled box'), 'click', 0, 0, { shiftKey: true })
    await pointer(layer('Pixel circle'), 'click', 0, 0, { shiftKey: true })
    await openActions('Actions for 3 selected layers from Pixel line')
    await click(button('Align left'))
    await openActions('Actions for 3 selected layers from Pixel line')
    await click(button('Distribute vertical'))
    await openActions('Actions for 3 selected layers from Pixel line')
    await click(button('To front'))

    const dialog = document.querySelector<HTMLElement>('.display-designer-dialog')!
    await act(async () => { dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })) })
    expect(source()).toContain('drawLine(9, 16, 33, 16, 15)')
    await act(async () => { dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })) })
    expect(source()).toContain('drawLine(9, 17, 33, 17, 15)')
    await act(async () => { dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true })) })
    expect(source()).toContain('drawLine(8, 17, 32, 17, 15)')
    await act(async () => { dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true })) })
    expect(source()).toContain('drawLine(8, 16, 32, 16, 15)')
    expect(document.querySelector('.display-designer-stage-status')?.textContent).toContain('Arrow keys move by 1 pixel')
    await act(async () => { dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', shiftKey: true, bubbles: true })) })
    expect(source()).toContain('drawLine(13, 16, 37, 16, 15)')
    await act(async () => { dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'd', ctrlKey: true, bubbles: true })) })
    expect(source().match(/drawLine/g)).toHaveLength(2)
    await act(async () => { dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true })) })
    expect(source().match(/drawLine/g)).toHaveLength(1)
    await act(async () => { dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true })) })
    expect(source().match(/drawLine/g)).toHaveLength(2)
    await act(async () => { dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, shiftKey: true, bubbles: true })) })
    expect(source().match(/drawLine/g)).toHaveLength(1)
  })

  it('creates, maps, previews, detaches, and safely deletes dynamic property bindings', async () => {
    await act(async () => { root.render(<DisplayDesignerLauncher />) })
    await click(button('Open Display designer'))
    await addDefault('Pixel line')

    await click(button('Make X1 runtime dynamic'))
    expect(source()).toContain('local x1 = 0')
    expect(source()).toContain('math.floor((8 + 16 * x1) + 0.5)')
    expect(bindingCard('X1').textContent).toContain('1 use')
    expect(document.body.textContent).toContain('Preview 8')
    const attachY1 = document.querySelector<HTMLSelectElement>('[aria-label="Attach Y1 runtime binding"]')!
    expect(attachY1.parentElement?.classList.contains('display-designer-dynamic-actions')).toBe(true)
    await choose(attachY1, attachY1.options[1]!.value)
    expect(bindingCard('X1').textContent).toContain('2 uses')
    await click(button('Make Y1 static from preview'))
    expect(bindingCard('X1').textContent).toContain('1 use')

    await commitInput(field('From formula') as HTMLInputElement, '20')
    await commitInput(field('To formula') as HTMLInputElement, '40')
    expect(source()).toContain('math.floor((20 + 20 * x1) + 0.5)')
    const preview = document.querySelector<HTMLInputElement>('[aria-label="X1 preview value"]')!
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(preview, '1')
      preview.dispatchEvent(new Event('input', { bubbles: true }))
      preview.dispatchEvent(new Event('change', { bubbles: true }))
    })
    expect(source()).toContain('local x1 = 1')
    expect(document.body.textContent).toContain('Preview 40')

    await click(button('Make X1 static from preview'))
    expect(source()).toContain('drawLine(40, 16, 32, 16, 15)')
    expect(bindingCard('X1').textContent).toContain('0 uses')

    await click(button('Make visibility dynamic'))
    expect(document.body.textContent).toContain('Visible draw calls1')
    await click(bindingCard('Visibility').querySelector<HTMLButtonElement>('[role="switch"]')!)
    expect(document.body.textContent).toContain('Visible draw calls0')
    await click(bindingCard('Visibility').querySelectorAll<HTMLButtonElement>('button')[1]!)
    expect(bindingCard('Visibility').textContent).toContain('converted to their current preview')
    await click(button('Convert uses and delete'))
    expect(document.body.textContent).toContain('Visible draw calls1')
    expect(document.body.textContent).not.toContain('Visibilityboolean')
  })

  it('creates, renames, formulas, navigates, substitutes, and undoes design tokens', async () => {
    await act(async () => { root.render(<DisplayDesignerLauncher />) })
    await click(button('Open Display designer'))
    await addDefault('Filled box')

    await click(button('Create X1 token from value'))
    expect(document.body.textContent).toContain('Tokens')
    expect(document.body.textContent).toContain('1 use')
    expect(source()).toContain('-- Design tokens: change these values to fine-tune the layout.')
    expect(source()).toContain('local x1 = 8')

    await click(button('Use X2 token/formula'))
    await commitInput(field('X2 formula') as HTMLInputElement, 'x1 + 11')
    expect(source()).toContain('x1 + 11')
    expect(document.body.textContent).toContain('2 uses')

    await commitInput(field('Token name') as HTMLInputElement, 'Start X')
    expect(source()).toContain('local start_x = 8')
    expect(source()).toContain('start_x + 11')
    expect(source()).not.toContain('local x1 = 8')

    await click(button('Show in Lua'))
    expect(document.body.textContent).toContain('Start X token · line 3')

    const formula = field('X2 formula') as HTMLInputElement
    await commitInput(formula, 'missing + 1')
    expect(formula.getAttribute('aria-invalid')).toBe('true')
    expect(document.body.textContent).toContain('Unknown design token')
    expect(source()).toContain('start_x + 11')
    await act(async () => { formula.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })) })

    await click(button('Delete token'))
    await click(button('Replace references with current value and delete'))
    expect(source()).not.toContain('Design tokens:')
    expect(source()).toContain('drawRectangle(8, 16, 19, 24, 15)')

    const dialog = document.querySelector<HTMLElement>('.display-designer-dialog')!
    await act(async () => { dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true })) })
    expect(source()).toContain('local start_x = 8')
    expect(source()).toContain('start_x + 11')
  })

  it('attaches shared text bindings, renames locals without breaking uses, and previews choice definitions in order', async () => {
    await act(async () => { root.render(<DisplayDesignerLauncher />) })
    await click(button('Open Display designer'))
    await addDefault('Standard text')
    await click(button('Make Text dynamic'))
    const textCard = bindingCard('Text')
    const previewText = [...textCard.querySelectorAll<HTMLLabelElement>('label')].find((label) => label.querySelector('span')?.textContent === 'Preview text')!.querySelector<HTMLInputElement>('input')!
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(previewText, 'Bound "text"')
      previewText.dispatchEvent(new Event('input', { bubbles: true }))
    })
    expect(source()).toContain('local text = "Bound \\"text\\""')

    const bindingName = [...textCard.querySelectorAll<HTMLLabelElement>('label')].find((label) => label.querySelector('span')?.textContent === 'Binding name')!.querySelector<HTMLInputElement>('input')!
    await commitInput(bindingName, 'local')
    expect(bindingCard('local').textContent).toContain('value_local')
    expect(source()).toContain('local value_local =')

    await click(button('Add choice binding'))
    const choiceCard = bindingCard('State')
    await click([...choiceCard.querySelectorAll<HTMLButtonElement>('button')].find((candidate) => candidate.textContent === 'Add choice')!)
    expect(choiceCard.querySelectorAll('select option')).toHaveLength(2)
    const choiceSelect = choiceCard.querySelector<HTMLSelectElement>('select')!
    await choose(choiceSelect, choiceSelect.options[1]!.value)
    expect(choiceSelect.selectedIndex).toBe(1)
    expect(source()).not.toContain('local state =')
    expect(document.body.textContent).toContain('Binding “State” is not used')
  })

  it('creates and edits multi-state symbols, maps instance state, detaches explicitly, and undoes across contexts', async () => {
    await act(async () => { root.render(<DisplayDesignerLauncher />) })
    await click(button('Open Display designer'))
    await addDefault('Outline box')
    await click(button('Create symbol from selection'))

    expect(document.body.textContent).toContain('Symbol1 states · 1 instances')
    expect(source()).toContain('draw = (function()')
    expect(source()).toContain('local function draw_symbol(x, y, state)')
    expect(source().match(/draw_symbol\(/g)).toHaveLength(2)
    expect(document.body.textContent).toContain('Maximum variant draw calls1')
    const helperNavigation = document.querySelector<HTMLButtonElement>('[aria-label="Generated source navigation"] button')!
    await click(helperNavigation)
    expect(document.querySelector('.lua-source-preview-line[aria-current="true"]')?.textContent).toContain('local function draw_symbol')

    await click(button('Edit symbol'))
    expect(document.querySelector('[aria-label="Symbol edit context"]')?.textContent).toContain('Scene›Symbol›Default')
    expect(document.querySelector('.display-designer-origin-marker')).not.toBeNull()
    await openActions('Actions for state Default')
    await click(button('Duplicate state'))
    expect(document.body.textContent).toContain('Symbols / variants / instances1 / 2 / 1')
    await commitInput(field('State name') as HTMLInputElement, 'Active')
    expect(document.querySelector('[aria-label="Symbol edit context"]')?.textContent).toContain('Active')
    const stateTabs = [...document.querySelectorAll<HTMLButtonElement>('.display-designer-variant-tabs [role="tab"]')]
    expect(stateTabs.map((tab) => tab.tabIndex)).toEqual([-1, 0])
    expect(stateTabs[1]?.getAttribute('aria-controls')).toBe('display-designer-symbol-state-panel')
    expect(document.querySelector('#display-designer-symbol-state-panel')?.getAttribute('aria-labelledby')).toBe(stateTabs[1]?.id)
    await act(async () => {
      stateTabs[1]!.focus()
      stateTabs[1]!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }))
      await new Promise((resolve) => requestAnimationFrame(resolve))
    })
    expect(document.activeElement?.textContent).toContain('Default')
    const defaultTab = document.querySelector<HTMLButtonElement>('.display-designer-variant-tabs [aria-selected="true"]')!
    await act(async () => {
      defaultTab.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
      await new Promise((resolve) => requestAnimationFrame(resolve))
    })
    expect(document.activeElement?.textContent).toContain('Active')
    expect(source()).toContain('if state == "default_copy" then')
    expect(source()).toContain('else\n      -- Default state: Default')

    await click(button('Scene'))
    await click(layer('Symbol instance'))
    await choose(field('State') as HTMLSelectElement, (field('State') as HTMLSelectElement).options[1]!.value)
    expect(source()).toContain('draw_symbol(8, 16, "default_copy")')
    await click(button('Make state dynamic'))
    expect(source()).toContain('local symbol_state')
    expect(source()).toContain('symbol_state = "default_copy"')
    expect(document.body.textContent).toContain('Dynamic state')

    await click(button('Edit symbol'))
    await openActions('Actions for state Active')
    await click(button('Add blank state'))
    expect(document.body.textContent).toContain('Symbols / variants / instances1 / 3 / 1')
    await click(button('Scene'))
    await click(layer('Symbol instance'))
    await click(button('Sync choices with states'))
    expect(bindingCard('Symbol state').querySelectorAll('.display-designer-choice-list li')).toHaveLength(3)
    await click(button('Detach instance…'))
    expect(document.querySelector('[role="alertdialog"]')?.textContent).toContain('alternate states will be lost')
    await click(button('Detach instance'))
    expect(source()).not.toContain('local function draw_symbol')
    expect(document.body.textContent).toContain('unused')

    await click(button('Undo'))
    expect(source()).toContain('local function draw_symbol')
    await openActions('Actions for symbol Symbol')
    await click(button('Delete symbol…'))
    expect(document.body.textContent).toContain('used by 1 instances')
    await click(button('Cancel'))
    expect(source()).toContain('local function draw_symbol')
    await openActions('Actions for symbol Symbol')
    await click(button('Delete symbol…'))
    await click(button('Detach all instances'))
    expect(source()).not.toContain('local function draw_symbol')
    await click(button('Undo'))
    expect(source()).toContain('local function draw_symbol')
    await openActions('Actions for symbol Symbol')
    await click(button('Delete symbol…'))
    await click(button('Delete instances and symbol'))
    expect(source()).not.toContain('local function draw_symbol')
  })

  it('opens files transactionally, preserves the current scene on read and validation failures, and confirms replacement', async () => {
    await act(async () => { root.render(<DisplayDesignerLauncher />) })
    await click(button('Open Display designer'))
    await addDefault('Pixel line')

    await click(button('Open design'))
    expect(document.querySelector('[role="alertdialog"]')?.textContent).toContain('Replace changed display design')
    await click(button('Discard changes and choose file'))
    await chooseDesignFile({
      name: 'unreadable.luading-display.json', type: 'application/json', size: 10,
      text: vi.fn().mockRejectedValue(new Error('read failed')),
    })
    expect(document.body.textContent).toContain('could not be read. The current design was kept')
    expect(source()).toContain('drawLine')

    await click(button('Open design'))
    await click(button('Discard changes and choose file'))
    await chooseDesignFile({
      name: 'malformed.luading-display.json', type: 'application/json', size: 1,
      text: vi.fn().mockResolvedValue('{'),
    })
    expect(document.body.textContent).toContain('does not contain valid JSON. The current design was kept')
    expect(source()).toContain('drawLine')

    const ids = createSequentialDisplayDesignIdFactory('designer')
    const openedDocument = {
      ...createEmptyDisplayDesign('Opened panel'),
      displayMode: 'full-screen' as const,
      elements: [createDefaultDisplayPrimitive('filled-box', ids)],
    }
    const serialized = serializeDisplayDesign(openedDocument)
    expect(serialized.ok).toBe(true)
    if (!serialized.ok) return
    await click(button('Open design'))
    await click(button('Discard changes and choose file'))
    await chooseDesignFile({
      name: serialized.fileName, type: 'application/json', size: serialized.bytes,
      text: vi.fn().mockResolvedValue(serialized.text),
    })
    expect(document.body.textContent).toContain(`Opened ${serialized.fileName}. The current Lua script was not changed.`)
    expect(source()).toContain('drawRectangle')
    expect(source()).not.toContain('drawLine')

    await addDefault('Pixel line')
    expect(document.body.textContent).not.toContain('ID “designer-element-1” is already used')
  })

  it('downloads deterministic JSON, marks only a dispatched revision clean, and uses download-start wording', async () => {
    const downloads: Array<{ name: string; href: string }> = []
    const createObjectURL = vi.fn(() => 'blob:display-design')
    const revokeObjectURL = vi.fn()
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL })
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectURL })
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      downloads.push({ name: this.download, href: this.href })
    })

    await act(async () => { root.render(<DisplayDesignerLauncher />) })
    const trigger = button('Open Display designer')
    await click(trigger)
    await addDefault('Pixel circle')
    await click(button('Download design'))

    expect(downloads).toEqual([{ name: 'Untitled display.luading-display.json', href: 'blob:display-design' }])
    expect(createObjectURL).toHaveBeenCalledWith(expect.objectContaining({ type: 'application/json;charset=utf-8' }))
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:display-design')
    expect(document.body.textContent).toContain('Download started: Untitled display.luading-display.json.')
    expect(document.body.textContent).not.toContain('Saved to disk')

    await click(button('Close Display designer'))
    expect(document.querySelector('[role="alertdialog"]')).toBeNull()
    await click(trigger)
    expect(source()).toContain('drawCircle')
    await addDefault('Filled box')
    await click(button('Undo'))
    await click(button('Close Display designer'))
    expect(document.querySelector('[role="alertdialog"]')).toBeNull()

    await click(trigger)
    await addDefault('Filled box')
    createObjectURL.mockImplementation(() => { throw new Error('download blocked') })
    await click(button('Download design'))
    expect(document.body.textContent).toContain('Download failed. The current design remains in memory.')
    await click(button('Close Display designer'))
    expect(document.querySelector('[role="alertdialog"]')).not.toBeNull()
  })

  it('copies the exact callback and exposes a selected source fallback when clipboard permission is denied', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('denied'))
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    await act(async () => { root.render(<DisplayDesignerLauncher />) })
    await click(button('Open Display designer'))
    await addDefault('Tiny text')
    await click(button('Copy draw callback'))
    await act(async () => { await new Promise((resolve) => requestAnimationFrame(resolve)) })

    expect(writeText).toHaveBeenCalledOnce()
    expect(writeText.mock.calls[0]?.[0]).toContain('drawTinyText')
    expect(document.body.textContent).toContain('Copy failed. The generated draw callback is selected below; copy it manually.')
    const fallback = document.querySelector<HTMLTextAreaElement>('[aria-label="Generated draw callback for manual copy"]')!
    expect(fallback.value).toBe(writeText.mock.calls[0]?.[0])
    expect(document.activeElement).toBe(fallback)
    expect(fallback.selectionStart).toBe(0)
    expect(fallback.selectionEnd).toBe(fallback.value.length)
  })

  it('announces successful callback copies without showing the manual fallback', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    await act(async () => { root.render(<DisplayDesignerLauncher />) })
    await click(button('Open Display designer'))
    await click(button('Copy draw callback'))

    expect(document.body.textContent).toContain('Draw callback copied.')
    expect(document.querySelector('[aria-label="Generated draw callback for manual copy"]')).toBeNull()
  })
})
