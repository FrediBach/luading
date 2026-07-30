import { describe, expect, it } from 'vitest'
import { resolveWorkbenchShortcut } from './workbench-shortcuts'

function key(
  overrides: Partial<Parameters<typeof resolveWorkbenchShortcut>[0]> = {},
) {
  return {
    key: '',
    code: '',
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    ...overrides,
  }
}

describe('workbench shortcuts', () => {
  it('maps Run and Pause/Resume without treating them as signal-clock actions', () => {
    expect(resolveWorkbenchShortcut(key({
      key: 'Enter',
      code: 'Enter',
      ctrlKey: true,
    }), false)).toEqual({ type: 'run' })

    expect(resolveWorkbenchShortcut(key({
      key: 'p',
      code: 'KeyP',
      altKey: true,
      metaKey: true,
    }), false)).toEqual({ type: 'toggleRuntime' })
  })

  it('maps command-modified Alt digits to workspace presets', () => {
    expect(resolveWorkbenchShortcut(key({
      key: '1',
      code: 'Digit1',
      altKey: true,
      ctrlKey: true,
    }), false)).toEqual({ type: 'applyPreset', preset: 'code' })
    expect(resolveWorkbenchShortcut(key({
      key: '4',
      code: 'Digit4',
      altKey: true,
      metaKey: true,
    }), false)).toEqual({ type: 'applyPreset', preset: 'compact' })
  })

  it('maps command-modified Alt+Shift digits to drawer tabs', () => {
    expect(resolveWorkbenchShortcut(key({
      key: '2',
      code: 'Digit2',
      altKey: true,
      ctrlKey: true,
      shiftKey: true,
    }), false)).toEqual({ type: 'toggleDrawer', tab: 'problems' })
    expect(resolveWorkbenchShortcut(key({
      key: '4',
      code: 'Digit4',
      altKey: true,
      metaKey: true,
      shiftKey: true,
    }), false)).toEqual({ type: 'toggleDrawer', tab: 'performance' })
  })

  it('protects editable targets from unmodified layout keys', () => {
    expect(resolveWorkbenchShortcut(key({
      key: '1',
      code: 'Digit1',
      altKey: true,
    }), true)).toBeNull()
    expect(resolveWorkbenchShortcut(key({
      key: 'Enter',
      code: 'Enter',
      metaKey: true,
    }), true)).toEqual({ type: 'run' })
    expect(resolveWorkbenchShortcut(key({
      key: 'p',
      code: 'KeyP',
      altKey: true,
      ctrlKey: true,
    }), true)).toEqual({ type: 'toggleRuntime' })
    expect(resolveWorkbenchShortcut(key({
      key: '3',
      code: 'Digit3',
      altKey: true,
      metaKey: true,
    }), true)).toEqual({ type: 'applyPreset', preset: 'monitor' })
  })

  it('ignores repeats, prevented events, and unrelated keys', () => {
    expect(resolveWorkbenchShortcut(key({
      key: 'Enter',
      code: 'Enter',
      ctrlKey: true,
      repeat: true,
    }), false)).toBeNull()
    expect(resolveWorkbenchShortcut(key({
      key: 'Enter',
      code: 'Enter',
      ctrlKey: true,
      defaultPrevented: true,
    }), false)).toBeNull()
    expect(resolveWorkbenchShortcut(key({
      key: '5',
      code: 'Digit5',
      altKey: true,
      ctrlKey: true,
    }), false)).toBeNull()
  })
})
