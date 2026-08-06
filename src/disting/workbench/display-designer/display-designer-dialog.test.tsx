// @vitest-environment jsdom

import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DisplayDesignerLauncher } from './DisplayDesignerLauncher'

let container: HTMLDivElement
let root: ReturnType<typeof createRoot>

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

function source() {
  return document.querySelector('.display-designer-source')?.textContent ?? ''
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
})

afterEach(async () => {
  await act(async () => { root.unmount() })
  container.remove()
  vi.restoreAllMocks()
})

describe('Display designer dialog', () => {
  it('opens from the utility command, edits every primitive type, and updates the raster source', async () => {
    await act(async () => { root.render(<DisplayDesignerLauncher />) })
    const trigger = button('Open Display designer')
    await click(trigger)

    expect(document.querySelector('[role="dialog"]')).not.toBeNull()
    expect(document.body.style.overflow).toBe('hidden')
    await act(async () => { await new Promise((resolve) => requestAnimationFrame(resolve)) })
    expect(document.activeElement).toBe(button('Select'))

    await click(button('Pixel line'))
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

    await click(button('Smooth line'))
    await click(button('Outline box'))
    expect(document.body.textContent).toContain('Inclusive size: 25 × 9')
    await click(button('Filled box'))
    await click(button('Pixel circle'))
    await click(button('Smooth circle'))
    await click(button('Standard text'))
    await commitInput(field('Text') as HTMLInputElement, 'Level')
    await choose(field('Alignment') as HTMLSelectElement, 'right')
    await click(button('Tiny text'))

    expect(source()).toContain('drawSmoothLine')
    expect(source()).toContain('drawBox')
    expect(source()).toContain('drawRectangle')
    expect(source()).toContain('drawCircle')
    expect(source()).toContain('drawSmoothCircle')
    expect(source()).toContain('drawText')
    expect(source()).toContain('drawTinyText')
    expect(source()).toContain('"Level"')
    expect(document.body.textContent).toContain('Primitive elements8')
    expect(document.body.textContent).toContain('Visible draw calls8')

    await choose(field('Display mode') as HTMLSelectElement, 'full-screen')
    expect(source()).toContain('return true')
    expect(document.querySelector('.display-designer-reserved-rows')).toBeNull()

    await click(button('Grid'))
    expect(document.querySelector('.display-designer-artboard')?.classList.contains('has-grid')).toBe(false)
    await click(button('Pixels'))
    expect(document.querySelector('.display-designer-artboard canvas')?.classList.contains('is-hidden')).toBe(true)
    await click(button('Geometry'))
    expect(document.querySelector('[aria-label="Display designer geometry overlay"]')).toBeNull()
    await choose(document.querySelector<HTMLSelectElement>('[aria-label="Artboard zoom"]')!, '3')
    expect(document.querySelector<HTMLElement>('.display-designer-artboard')?.dataset.zoom).toBe('3')
  })

  it('supports layer selection, duplication, ordering, deletion, undo, and collapsed panels', async () => {
    await act(async () => { root.render(<DisplayDesignerLauncher />) })
    await click(button('Open Display designer'))
    await click(button('Pixel line'))
    await click(button('Filled box'))

    await click(button('Duplicate Filled box'))
    expect(document.body.textContent).toContain('Filled box copy')
    expect(source().match(/drawRectangle/g)).toHaveLength(2)
    await click(button('Move Filled box copy backward'))
    await click(button('Delete Filled box copy'))
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

    await click(button('Pixel line'))
    await commitInput(field('Layer name') as HTMLInputElement, '')
    expect(document.body.textContent).toContain('Pixel line')
    await commitInput(field('Exact shade') as HTMLInputElement, '20')
    expect(field('Exact shade')).toHaveProperty('value', '15')
  })

  it('requires an explicit discard, restores body scroll, and returns focus to its trigger', async () => {
    document.body.style.overflow = 'clip'
    await act(async () => { root.render(<DisplayDesignerLauncher />) })
    const trigger = button('Open Display designer')
    await click(trigger)
    await act(async () => { await new Promise((resolve) => requestAnimationFrame(resolve)) })
    await click(button('Pixel circle'))
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
})
