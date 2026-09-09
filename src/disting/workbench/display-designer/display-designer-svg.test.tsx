// @vitest-environment jsdom
import { act, createRef } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DisplaySvgImportDialog } from './DisplaySvgImportDialog'
import { DisplayDesignerDialog } from './DisplayDesignerDialog'
import { createEmptyDisplayDesign } from './display-design-model'
let host: HTMLDivElement, root: ReturnType<typeof createRoot>
beforeEach(() => {
  ; (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
  host = document.createElement('div'); host.className = 'disting-app'; document.body.append(host); root = createRoot(host)
})
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks() })
const svg = (body: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 64">${body}</svg>`
function button(text: string) { const found = [...document.querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent === text); if (!found) throw new Error(`Missing ${text}`); return found }
async function click(element: HTMLElement) { await act(async () => { element.click(); await new Promise(r => setTimeout(r, 15)) }) }
async function upload(text: string) {
  const input = document.querySelector<HTMLInputElement>('input[aria-label="Choose SVG file"]')!
  Object.defineProperty(input, 'files', { configurable: true, value: [{ name: 'art.svg', size: text.length, type: 'image/svg+xml', text: async () => text }] })
  await act(async () => { input.dispatchEvent(new Event('change', { bubbles: true })); await new Promise(r => setTimeout(r, 20)) })
  await act(async () => { await new Promise(r => setTimeout(r, 20)) })
}
describe('SVG review dialog', () => {
  it('imports editable artwork, shows native conversion and leaves script handoff explicit', async () => {
    const onInsert = vi.fn()
    await act(async () => root.render(<DisplaySvgImportDialog document={createEmptyDisplayDesign()} onClose={() => { }} onInsert={onInsert} />))
    expect(button('Insert artwork').disabled).toBe(true)
    await upload(svg('<rect x="3" y="12" width="20" height="5" fill="white"/><text x="3" y="26" font-size="8" fill="white">Level</text>'))
    expect(document.querySelector('[aria-label="Converted Disting NT pixel preview"]')).not.toBeNull()
    expect(button('Insert artwork').disabled).toBe(false)
    await click(button('Insert artwork'))
    expect(onInsert).toHaveBeenCalledOnce()
    expect(onInsert.mock.calls[0]?.[0].elements.map((e: { kind: string }) => e.kind)).toEqual(['box', 'text'])
  })
  it('requires explicit exclusion for unsupported artwork and never mounts imported markup', async () => {
    const onInsert = vi.fn()
    await act(async () => root.render(<DisplaySvgImportDialog document={createEmptyDisplayDesign()} onClose={() => { }} onInsert={onInsert} />))
    await upload(svg('<rect x="2" y="12" width="4" height="4" fill="white"/><image id="photo" href="https://example.com/photo.png"/>'))
    expect(button('Insert artwork').disabled).toBe(true)
    expect(document.querySelector('image')).toBeNull()
    const exclusions = [...document.querySelectorAll<HTMLInputElement>('.svg-import-object-list input')]
    await click(exclusions[1]!)
    expect(button('Insert artwork').disabled).toBe(false)
    await click(button('Insert artwork'))
    expect(onInsert.mock.calls[0]?.[0].elements).toHaveLength(1)
  })
  it('surfaces parse failures and cancellation without insertion', async () => {
    const onInsert = vi.fn(), onClose = vi.fn()
    await act(async () => root.render(<DisplaySvgImportDialog document={createEmptyDisplayDesign()} onClose={onClose} onInsert={onInsert} />))
    await upload('<svg>')
    expect(document.querySelector('[role="alert"]')?.textContent).toContain('valid SVG')
    expect(button('Insert artwork').disabled).toBe(true)
    await click(button('Cancel import')); expect(onClose).toHaveBeenCalledOnce(); expect(onInsert).not.toHaveBeenCalled()
  })
  it('inserts into the designer as one undo transaction and restores launcher focus', async () => {
    await act(async () => root.render(<DisplayDesignerDialog open onClose={() => { }} returnFocusRef={createRef<HTMLButtonElement>()} viewportWidth={1200} />))
    await click(button('Import SVG'))
    expect(document.querySelector('.display-designer-dialog[inert]')).not.toBeNull()
    await upload(svg('<rect id="Imported meter" x="3" y="12" width="20" height="5" fill="white"/>'))
    await click(button('Insert artwork'))
    expect(document.querySelector('.svg-import-dialog')).toBeNull()
    expect(document.activeElement).toBe(button('Import SVG'))
    expect(document.querySelector('.display-designer-source')?.textContent).toContain('drawRectangle(3, 12, 22, 16, 15)')
    await click(button('Undo'))
    expect(document.querySelector('.display-designer-source')?.textContent).not.toContain('drawRectangle')
    await click(button('Redo'))
    expect(document.querySelector('.display-designer-source')?.textContent).toContain('drawRectangle')
  })
})

describe('SVG import revision and keyboard safety', () => {
  it('ignores a stale file read after a newer SVG is chosen', async () => {
    const onInsert = vi.fn()
    await act(async () => root.render(<DisplaySvgImportDialog document={createEmptyDisplayDesign()} onClose={() => { }} onInsert={onInsert} />))
    let finish!: (text: string) => void
    const input = document.querySelector<HTMLInputElement>('input[aria-label="Choose SVG file"]')!
    Object.defineProperty(input, 'files', { configurable: true, value: [{ name: 'old.svg', size: 100, type: 'image/svg+xml', text: () => new Promise<string>(resolve => { finish = resolve }) }] })
    await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })))
    await upload(svg('<rect id="New artwork" x="3" y="12" width="4" height="4" fill="white"/>'))
    await act(async () => { finish(svg('<rect id="Old artwork" width="99" height="99"/>')); await Promise.resolve() })
    expect(document.querySelector('.svg-import-object-list')?.textContent).toContain('New artwork')
    expect(document.querySelector('.svg-import-object-list')?.textContent).not.toContain('Old artwork')
    await click(button('Insert artwork'))
    expect(onInsert.mock.calls[0]?.[0].elements[0].name).toBe('New artwork')
  })
  it('revalidates against a changed destination before insertion and traps Escape', async () => {
    const onInsert = vi.fn(), onClose = vi.fn(), draft = createEmptyDisplayDesign()
    await act(async () => root.render(<DisplaySvgImportDialog document={draft} onClose={onClose} onInsert={onInsert} />))
    await upload(svg('<rect x="2" y="12" width="4" height="4" fill="white"/>'))
    expect(button('Insert artwork').disabled).toBe(false)
    const full = { ...draft, elements: Array.from({ length: 512 }, (_, i) => ({ id: `existing-${i}`, name: 'Existing', kind: 'box' as const, fill: true, x1: { kind: 'literal' as const, value: 1 }, y1: { kind: 'literal' as const, value: 12 }, x2: { kind: 'literal' as const, value: 2 }, y2: { kind: 'literal' as const, value: 13 }, shade: { kind: 'literal' as const, value: 15 }, visible: { kind: 'visible' as const } })) }
    await act(async () => root.render(<DisplaySvgImportDialog document={full} onClose={onClose} onInsert={onInsert} />))
    expect(button('Insert artwork').disabled).toBe(true)
    await act(async () => document.querySelector('.svg-import-dialog')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
    expect(onClose).toHaveBeenCalledOnce(); expect(onInsert).not.toHaveBeenCalled()
  })
})
