import {
  type DisplayPrimitiveElement,
  type DisplayScalar,
  type DisplayText,
  type DisplayVisibility,
} from './display-design-model'
import {
  type DisplayComponentBuildContext,
  type DisplayComponentInput,
  type DisplayComponentRecipe,
} from './display-component-library'

type ScalarValue = number | DisplayScalar
type TextValue = string | DisplayText

const shown: DisplayVisibility = { kind: 'visible' }
const scalar = (value: ScalarValue): DisplayScalar => typeof value === 'number' ? { kind: 'literal', value } : value
const textValue = (value: TextValue): DisplayText => typeof value === 'string' ? { kind: 'literal', value } : value

function line(
  context: DisplayComponentBuildContext,
  name: string,
  x1: ScalarValue,
  y1: ScalarValue,
  x2: ScalarValue,
  y2: ScalarValue,
  shade: ScalarValue = 15,
  visible: DisplayVisibility = shown,
): DisplayPrimitiveElement {
  return {
    kind: 'line', id: context.primitiveId(), name, smooth: false,
    x1: scalar(x1), y1: scalar(y1), x2: scalar(x2), y2: scalar(y2),
    shade: scalar(shade), visible,
  }
}

function box(
  context: DisplayComponentBuildContext,
  name: string,
  x1: ScalarValue,
  y1: ScalarValue,
  x2: ScalarValue,
  y2: ScalarValue,
  shade: ScalarValue = 15,
  fill = false,
  visible: DisplayVisibility = shown,
): DisplayPrimitiveElement {
  return {
    kind: 'box', id: context.primitiveId(), name, fill,
    x1: scalar(x1), y1: scalar(y1), x2: scalar(x2), y2: scalar(y2),
    shade: scalar(shade), visible,
  }
}

function circle(
  context: DisplayComponentBuildContext,
  name: string,
  x: ScalarValue,
  y: ScalarValue,
  radius: ScalarValue,
  shade: ScalarValue = 15,
  visible: DisplayVisibility = shown,
): DisplayPrimitiveElement {
  return {
    kind: 'circle', id: context.primitiveId(), name, smooth: false,
    x: scalar(x), y: scalar(y), radius: scalar(radius), shade: scalar(shade), visible,
  }
}

function tinyText(
  context: DisplayComponentBuildContext,
  name: string,
  x: ScalarValue,
  y: ScalarValue,
  text: TextValue,
  shade: ScalarValue = 15,
  align: 'left' | 'centre' | 'right' = 'left',
  visible: DisplayVisibility = shown,
): DisplayPrimitiveElement {
  return {
    kind: 'text', id: context.primitiveId(), name, tiny: true,
    x: scalar(x), y: scalar(y), text: textValue(text), shade: scalar(shade), align, visible,
  }
}

const numberInput = (key: string, name: string, description: string, defaultValue = 0.5): DisplayComponentInput => ({
  kind: 'number', key, name, description, defaultValue,
})

const booleanInput = (key: string, name: string, description: string, defaultValue = false): DisplayComponentInput => ({
  kind: 'boolean', key, name, description, defaultValue,
})

const textInput = (key: string, name: string, description: string, defaultValue: string): DisplayComponentInput => ({
  kind: 'text', key, name, description, defaultValue,
})

const common = {
  version: 1 as const,
  tags: [] as readonly string[],
}

const panelFrame: DisplayComponentRecipe = {
  ...common,
  id: 'panel-frame',
  name: 'Panel frame',
  category: 'layout',
  description: 'A compact section boundary with optional focus emphasis.',
  tags: ['container', 'group', 'section', 'card'],
  footprint: { width: 40, height: 20 },
  states: [{ value: 'normal', name: 'Normal' }, { value: 'warning', name: 'Warning' }, { value: 'disabled', name: 'Disabled' }],
  defaultState: 'normal',
  inputs: [booleanInput('focused', 'Focused', 'Shows bright selection corners.')],
  scenarios: [
    { id: 'default', name: 'Default', state: 'normal' },
    { id: 'active', name: 'Focused', state: 'normal', values: { focused: true } },
    { id: 'edge', name: 'Warning', state: 'warning', values: { focused: true } },
  ],
  build: (context, state) => {
    const shade = state === 'disabled' ? 2 : state === 'warning' ? 11 : 5
    const primitives = [box(context, 'Panel outline', 0, 0, 39, 19, shade)]
    if (state === 'warning') primitives.push(line(context, 'Warning rail', 1, 1, 38, 1, 15))
    if (state === 'disabled') primitives.push(line(context, 'Disabled strike', 2, 17, 37, 2, 3))
    primitives.push(
      line(context, 'Focus top left', 0, 0, 5, 0, 15, context.visible('focused')),
      line(context, 'Focus left', 0, 0, 0, 5, 15, context.visible('focused')),
      line(context, 'Focus bottom right', 34, 19, 39, 19, 15, context.visible('focused')),
      line(context, 'Focus right', 39, 14, 39, 19, 15, context.visible('focused')),
    )
    return primitives
  },
}

const sectionHeader: DisplayComponentRecipe = {
  ...common,
  id: 'section-header',
  name: 'Section header',
  category: 'layout',
  description: 'A tiny dynamic label with an active underline.',
  tags: ['title', 'label', 'heading'],
  footprint: { width: 48, height: 8 },
  states: [{ value: 'inactive', name: 'Inactive' }, { value: 'active', name: 'Active' }, { value: 'disabled', name: 'Disabled' }],
  defaultState: 'inactive',
  inputs: [textInput('label', 'Label', 'Short section title rendered in the tiny font.', 'CLOCK')],
  scenarios: [
    { id: 'default', name: 'Default', state: 'inactive' },
    { id: 'active', name: 'Active', state: 'active' },
    { id: 'edge', name: 'Disabled', state: 'disabled', values: { label: 'OFF' } },
  ],
  build: (context, state) => {
    const shade = state === 'active' ? 15 : state === 'disabled' ? 2 : 8
    return [
      tinyText(context, 'Header label', 0, 5, context.text('label'), shade),
      line(context, 'Header underline', 0, 7, 47, 7, state === 'active' ? 12 : state === 'disabled' ? 1 : 3),
    ]
  },
}

const inputJack: DisplayComponentRecipe = {
  ...common,
  id: 'input-jack',
  name: 'Input jack',
  category: 'patching',
  description: 'An inward-marked logical input with activity and level.',
  tags: ['patch', 'port', 'in', 'cv', 'audio', 'gate'],
  footprint: { width: 16, height: 16 },
  states: [{ value: 'unpatched', name: 'Unpatched' }, { value: 'patched', name: 'Patched' }, { value: 'overrange', name: 'Overrange' }, { value: 'disabled', name: 'Disabled' }],
  defaultState: 'unpatched',
  inputs: [
    booleanInput('activity', 'Activity', 'Shows a live centre mark when script state is active.'),
    numberInput('level', 'Level', 'Normalized signal level used for the inner-ring shade.'),
  ],
  scenarios: [
    { id: 'default', name: 'Unpatched', state: 'unpatched', values: { level: 0 } },
    { id: 'active', name: 'Patched + active', state: 'patched', values: { activity: true, level: 0.8 } },
    { id: 'edge', name: 'Overrange', state: 'overrange', values: { activity: true, level: 1 } },
  ],
  build: (context, state) => {
    const shade = state === 'disabled' ? 2 : state === 'overrange' ? 15 : state === 'patched' ? 9 : 4
    const primitives = [
      circle(context, 'Input jack ring', 8, 8, 6, shade),
      line(context, 'Input direction', 0, 8, 4, 8, shade),
      line(context, 'Input arrow upper', 2, 6, 4, 8, shade),
      line(context, 'Input arrow lower', 2, 10, 4, 8, shade),
    ]
    if (state !== 'unpatched') primitives.push(circle(context, 'Input level ring', 8, 8, 3, context.number('level', 5, 15)))
    if (state === 'overrange') primitives.push(line(context, 'Input overrange mark', 4, 2, 12, 14, 15))
    if (state === 'disabled') primitives.push(line(context, 'Input disabled mark', 3, 13, 13, 3, 3))
    primitives.push(box(context, 'Input activity', 7, 7, 9, 9, 15, true, context.visible('activity')))
    return primitives
  },
}

const outputJack: DisplayComponentRecipe = {
  ...common,
  id: 'output-jack',
  name: 'Output jack',
  category: 'patching',
  description: 'An outward-marked logical output with activity and clipping.',
  tags: ['patch', 'port', 'out', 'cv', 'audio', 'gate'],
  footprint: { width: 16, height: 16 },
  states: [{ value: 'idle', name: 'Idle' }, { value: 'connected', name: 'Connected' }, { value: 'clipped', name: 'Clipped' }, { value: 'disabled', name: 'Disabled' }],
  defaultState: 'idle',
  inputs: [
    booleanInput('activity', 'Activity', 'Shows a live centre mark when the output is active.'),
    numberInput('level', 'Level', 'Normalized output level used for the inner-ring shade.'),
  ],
  scenarios: [
    { id: 'default', name: 'Idle', state: 'idle', values: { level: 0 } },
    { id: 'active', name: 'Connected + active', state: 'connected', values: { activity: true, level: 0.75 } },
    { id: 'edge', name: 'Clipped', state: 'clipped', values: { activity: true, level: 1 } },
  ],
  build: (context, state) => {
    const shade = state === 'disabled' ? 2 : state === 'clipped' ? 15 : state === 'connected' ? 10 : 4
    const primitives = [
      circle(context, 'Output jack ring', 7, 8, 6, shade),
      line(context, 'Output direction', 11, 8, 15, 8, shade),
      line(context, 'Output arrow upper', 13, 6, 15, 8, shade),
      line(context, 'Output arrow lower', 13, 10, 15, 8, shade),
    ]
    if (state !== 'idle') primitives.push(circle(context, 'Output level ring', 7, 8, 3, context.number('level', 5, 15)))
    if (state === 'clipped') primitives.push(box(context, 'Output clip flag', 4, 0, 10, 2, 15, true))
    if (state === 'disabled') primitives.push(line(context, 'Output disabled mark', 2, 13, 12, 3, 3))
    primitives.push(box(context, 'Output activity', 6, 7, 8, 9, 15, true, context.visible('activity')))
    return primitives
  },
}

const momentaryButton: DisplayComponentRecipe = {
  ...common,
  id: 'momentary-button',
  name: 'Momentary button',
  category: 'controls',
  description: 'A compact labelled trigger, reset, tap, or latch button.',
  tags: ['button', 'pad', 'trigger', 'reset', 'tap'],
  footprint: { width: 24, height: 14 },
  states: [{ value: 'released', name: 'Released' }, { value: 'pressed', name: 'Pressed' }, { value: 'latched', name: 'Latched' }, { value: 'disabled', name: 'Disabled' }],
  defaultState: 'released',
  inputs: [textInput('label', 'Label', 'Short button label.', 'TRIG')],
  scenarios: [
    { id: 'default', name: 'Released', state: 'released' },
    { id: 'active', name: 'Pressed', state: 'pressed' },
    { id: 'edge', name: 'Disabled', state: 'disabled', values: { label: 'OFF' } },
  ],
  build: (context, state) => {
    const pressed = state === 'pressed'
    const shade = state === 'disabled' ? 2 : state === 'latched' ? 12 : pressed ? 15 : 7
    const primitives = [
      box(context, 'Button body', 0, 0, 23, 13, shade, pressed),
      tinyText(context, 'Button label', 12, 9, context.text('label'), pressed ? 0 : shade, 'centre'),
    ]
    if (state === 'latched') primitives.push(box(context, 'Latch mark', 19, 2, 21, 4, 15, true))
    if (state === 'disabled') primitives.push(line(context, 'Button disabled mark', 2, 11, 21, 2, 3))
    return primitives
  },
}

const toggleSwitch: DisplayComponentRecipe = {
  ...common,
  id: 'toggle-switch',
  name: 'Toggle switch',
  category: 'controls',
  description: 'A two-position switch for mute, invert, freeze, or enable.',
  tags: ['switch', 'boolean', 'on', 'off', 'mute'],
  footprint: { width: 24, height: 10 },
  states: [{ value: 'off', name: 'Off' }, { value: 'on', name: 'On' }, { value: 'disabled', name: 'Disabled' }],
  defaultState: 'off',
  inputs: [],
  scenarios: [
    { id: 'default', name: 'Off', state: 'off' },
    { id: 'active', name: 'On', state: 'on' },
    { id: 'edge', name: 'Disabled', state: 'disabled' },
  ],
  build: (context, state) => {
    const shade = state === 'disabled' ? 2 : state === 'on' ? 13 : 6
    const knobX = state === 'on' ? 18 : 5
    return [
      box(context, 'Toggle track', 0, 1, 23, 8, shade),
      circle(context, 'Toggle thumb', knobX, 5, 3, state === 'on' ? 15 : shade),
      ...(state === 'disabled' ? [line(context, 'Toggle disabled mark', 2, 8, 21, 1, 3)] : []),
    ]
  },
}

function signalBadgeGlyph(context: DisplayComponentBuildContext, state: string): DisplayPrimitiveElement[] {
  if (state === 'audio') return [
    line(context, 'Audio rise', 3, 7, 7, 3, 12), line(context, 'Audio fall', 7, 3, 11, 9, 12),
    line(context, 'Audio rise two', 11, 9, 15, 3, 12), line(context, 'Audio fall two', 15, 3, 19, 7, 12),
  ]
  if (state === 'cv') return [line(context, 'CV baseline', 3, 7, 19, 7, 8), line(context, 'CV level', 11, 3, 11, 10, 14)]
  if (state === 'gate') return [line(context, 'Gate low', 3, 9, 7, 9, 12), line(context, 'Gate rise', 7, 9, 7, 3, 12), line(context, 'Gate high', 7, 3, 15, 3, 12), line(context, 'Gate fall', 15, 3, 15, 9, 12), line(context, 'Gate tail', 15, 9, 19, 9, 12)]
  return [line(context, 'Clock stem', 11, 2, 11, 10, 13), line(context, 'Clock arm', 11, 6, 16, 4, 13), circle(context, 'Clock ring', 11, 6, 5, 8)]
}

const signalTypeBadge: DisplayComponentRecipe = {
  ...common,
  id: 'signal-type-badge',
  name: 'Signal type badge',
  category: 'signals',
  description: 'An original compact glyph for common modular signal roles.',
  tags: ['audio', 'cv', 'gate', 'trigger', 'clock', 'type'],
  footprint: { width: 32, height: 12 },
  states: [{ value: 'audio', name: 'Audio' }, { value: 'cv', name: 'CV' }, { value: 'gate', name: 'Gate' }, { value: 'clock', name: 'Clock' }],
  defaultState: 'audio',
  inputs: [],
  scenarios: [
    { id: 'default', name: 'Audio', state: 'audio' },
    { id: 'active', name: 'Gate', state: 'gate' },
    { id: 'edge', name: 'Clock', state: 'clock' },
  ],
  build: (context, state) => [
    box(context, 'Signal badge frame', 0, 0, 31, 11, 4),
    ...signalBadgeGlyph(context, state),
    tinyText(context, 'Signal badge label', 29, 9, state === 'audio' ? 'A' : state === 'cv' ? 'CV' : state === 'gate' ? 'G' : 'C', 9, 'right'),
  ],
}

const waveformGlyph: DisplayComponentRecipe = {
  ...common,
  id: 'waveform-glyph',
  name: 'Waveform glyph',
  category: 'signals',
  description: 'A waveform silhouette with an optional script-driven phase cursor.',
  tags: ['lfo', 'oscillator', 'sine', 'triangle', 'square', 'sample hold'],
  footprint: { width: 32, height: 12 },
  states: [{ value: 'sine', name: 'Sine' }, { value: 'triangle', name: 'Triangle' }, { value: 'square', name: 'Square' }, { value: 'sample-hold', name: 'Sample & hold' }],
  defaultState: 'sine',
  inputs: [
    numberInput('phase', 'Phase', 'Normalized phase used to place the cursor.', 0.25),
    booleanInput('showPhase', 'Show phase', 'Shows the phase cursor.', true),
  ],
  scenarios: [
    { id: 'default', name: 'Sine', state: 'sine', values: { phase: 0.25, showPhase: true } },
    { id: 'active', name: 'Square at 70%', state: 'square', values: { phase: 0.7, showPhase: true } },
    { id: 'edge', name: 'Held', state: 'sample-hold', values: { phase: 1, showPhase: false } },
  ],
  build: (context, state) => {
    let waveform: DisplayPrimitiveElement[]
    if (state === 'triangle') waveform = [line(context, 'Triangle rise', 1, 9, 9, 2, 12), line(context, 'Triangle fall', 9, 2, 17, 9, 12), line(context, 'Triangle rise two', 17, 9, 25, 2, 12), line(context, 'Triangle tail', 25, 2, 30, 7, 12)]
    else if (state === 'square') waveform = [line(context, 'Square low', 1, 9, 7, 9, 12), line(context, 'Square rise', 7, 9, 7, 2, 12), line(context, 'Square high', 7, 2, 19, 2, 12), line(context, 'Square fall', 19, 2, 19, 9, 12), line(context, 'Square tail', 19, 9, 30, 9, 12)]
    else if (state === 'sample-hold') waveform = [line(context, 'Hold one', 1, 8, 8, 8, 12), line(context, 'Hold step one', 8, 8, 8, 4, 12), line(context, 'Hold two', 8, 4, 18, 4, 12), line(context, 'Hold step two', 18, 4, 18, 9, 12), line(context, 'Hold three', 18, 9, 30, 9, 12)]
    else waveform = [line(context, 'Sine one', 1, 7, 6, 2, 12), line(context, 'Sine two', 6, 2, 11, 7, 12), line(context, 'Sine three', 11, 7, 16, 10, 12), line(context, 'Sine four', 16, 10, 22, 3, 12), line(context, 'Sine five', 22, 3, 30, 7, 12)]
    return [
      ...waveform,
      line(context, 'Phase cursor', context.number('phase', 1, 30), 0, context.number('phase', 1, 30), 11, 15, context.visible('showPhase')),
    ]
  },
}

const attenuator: DisplayComponentRecipe = {
  ...common,
  id: 'attenuator',
  name: 'Attenuator',
  category: 'processors',
  description: 'A level processor tile with a normalized amount display.',
  tags: ['gain', 'level', 'attenuate', 'vca'],
  footprint: { width: 32, height: 16 },
  states: [{ value: 'idle', name: 'Idle' }, { value: 'active', name: 'Active' }, { value: 'bypassed', name: 'Bypassed' }],
  defaultState: 'idle',
  inputs: [numberInput('amount', 'Amount', 'Normalized attenuation amount.', 0.5)],
  scenarios: [
    { id: 'default', name: 'Half level', state: 'idle', values: { amount: 0.5 } },
    { id: 'active', name: 'Active at 80%', state: 'active', values: { amount: 0.8 } },
    { id: 'edge', name: 'Bypassed', state: 'bypassed', values: { amount: 1 } },
  ],
  build: (context, state) => {
    const shade = state === 'active' ? 13 : state === 'bypassed' ? 4 : 7
    const primitives = [
      line(context, 'Attenuator input', 0, 8, 6, 8, shade),
      line(context, 'Attenuator output', 25, 8, 31, 8, shade),
      line(context, 'Attenuator upper edge', 6, 3, 25, 8, shade),
      line(context, 'Attenuator lower edge', 6, 13, 25, 8, shade),
      box(context, 'Attenuator amount', 7, 6, context.number('amount', 7, 23), 10, state === 'active' ? 15 : 9, true),
    ]
    if (state === 'bypassed') primitives.push(line(context, 'Attenuator bypass', 1, 2, 30, 2, 10))
    return primitives
  },
}

const mixer: DisplayComponentRecipe = {
  ...common,
  id: 'mixer',
  name: 'Mixer',
  category: 'processors',
  description: 'A two-input sum tile with independent input level bars.',
  tags: ['sum', 'mix', 'average', 'combine'],
  footprint: { width: 36, height: 18 },
  states: [{ value: 'idle', name: 'Idle' }, { value: 'active', name: 'Active' }, { value: 'saturated', name: 'Saturated' }],
  defaultState: 'idle',
  inputs: [
    numberInput('inputA', 'Input A', 'Normalized first input activity.', 0.35),
    numberInput('inputB', 'Input B', 'Normalized second input activity.', 0.65),
  ],
  scenarios: [
    { id: 'default', name: 'Balanced', state: 'idle' },
    { id: 'active', name: 'Active mix', state: 'active', values: { inputA: 0.8, inputB: 0.55 } },
    { id: 'edge', name: 'Saturated', state: 'saturated', values: { inputA: 1, inputB: 1 } },
  ],
  build: (context, state) => {
    const shade = state === 'saturated' ? 15 : state === 'active' ? 13 : 7
    return [
      box(context, 'Mixer input A', 1, context.number('inputA', 13, 3), 5, 13, 9, true),
      box(context, 'Mixer input B', 8, context.number('inputB', 13, 3), 12, 13, 9, true),
      line(context, 'Mixer route A', 5, 8, 19, 8, shade),
      line(context, 'Mixer route B', 12, 11, 19, 8, shade),
      circle(context, 'Mixer sum node', 21, 8, 3, shade),
      line(context, 'Mixer plus horizontal', 19, 8, 23, 8, shade),
      line(context, 'Mixer plus vertical', 21, 6, 21, 10, shade),
      line(context, 'Mixer output', 24, 8, 35, 8, shade),
      ...(state === 'saturated' ? [box(context, 'Mixer saturation flag', 31, 2, 35, 4, 15, true)] : []),
    ]
  },
}

const unipolarMeter: DisplayComponentRecipe = {
  ...common,
  id: 'unipolar-bar-meter',
  name: 'Unipolar bar meter',
  category: 'meters',
  description: 'A zero-to-one fill meter with an independent peak marker.',
  tags: ['level', 'progress', 'probability', 'positive cv'],
  footprint: { width: 48, height: 10 },
  states: [{ value: 'normal', name: 'Normal' }, { value: 'clipped', name: 'Clipped' }, { value: 'stale', name: 'Stale' }],
  defaultState: 'normal',
  inputs: [
    numberInput('value', 'Value', 'Normalized current value.', 0.55),
    numberInput('peak', 'Peak', 'Normalized script-maintained peak hold.', 0.7),
  ],
  scenarios: [
    { id: 'default', name: 'Normal', state: 'normal' },
    { id: 'active', name: 'High', state: 'normal', values: { value: 0.82, peak: 0.9 } },
    { id: 'edge', name: 'Clipped', state: 'clipped', values: { value: 1, peak: 1 } },
  ],
  build: (context, state) => {
    const shade = state === 'stale' ? 3 : state === 'clipped' ? 15 : 11
    return [
      box(context, 'Meter outline', 0, 0, 47, 9, state === 'stale' ? 2 : 4),
      box(context, 'Meter fill', 1, 2, context.number('value', 1, 46), 7, shade, true),
      line(context, 'Meter peak', context.number('peak', 1, 46), 1, context.number('peak', 1, 46), 8, state === 'stale' ? 4 : 15),
      ...(state === 'clipped' ? [box(context, 'Meter clip mark', 43, 0, 47, 2, 15, true)] : []),
    ]
  },
}

const bipolarMeter: DisplayComponentRecipe = {
  ...common,
  id: 'bipolar-bar-meter',
  name: 'Bipolar bar meter',
  category: 'meters',
  description: 'A centre-zero meter for signed CV, pan, offset, or modulation.',
  tags: ['signed', 'cv', 'bipolar', 'pan', 'offset'],
  footprint: { width: 48, height: 10 },
  states: [{ value: 'normal', name: 'Normal' }, { value: 'clipped', name: 'Clipped' }, { value: 'stale', name: 'Stale' }],
  defaultState: 'normal',
  inputs: [numberInput('value', 'Value', 'Signed source normalized from negative to positive into 0 through 1.', 0.5)],
  scenarios: [
    { id: 'default', name: 'Zero', state: 'normal', values: { value: 0.5 } },
    { id: 'active', name: 'Positive', state: 'normal', values: { value: 0.82 } },
    { id: 'edge', name: 'Negative clip', state: 'clipped', values: { value: 0 } },
  ],
  build: (context, state) => {
    const position = context.number('value', 1, 46)
    const shade = state === 'stale' ? 3 : state === 'clipped' ? 15 : 11
    return [
      box(context, 'Bipolar meter outline', 0, 0, 47, 9, state === 'stale' ? 2 : 4),
      line(context, 'Bipolar zero', 24, 1, 24, 8, 7),
      box(context, 'Bipolar fill', 24, 2, position, 7, shade, true),
      line(context, 'Bipolar pointer', position, 1, position, 8, state === 'stale' ? 4 : 15),
    ]
  },
}

const stepCell: DisplayComponentRecipe = {
  ...common,
  id: 'step-cell',
  name: 'Step cell',
  category: 'sequencing',
  description: 'A compact gate step with distinct off, on, accent, tie, and mute states.',
  tags: ['sequencer', 'x0x', 'gate', 'pattern', 'step'],
  footprint: { width: 12, height: 12 },
  states: [{ value: 'off', name: 'Off' }, { value: 'on', name: 'On' }, { value: 'accent', name: 'Accent' }, { value: 'tie', name: 'Tie' }, { value: 'muted', name: 'Muted' }],
  defaultState: 'off',
  inputs: [booleanInput('selected', 'Selected', 'Shows an outer playhead or focus bracket.')],
  scenarios: [
    { id: 'default', name: 'Off', state: 'off' },
    { id: 'active', name: 'Accent + selected', state: 'accent', values: { selected: true } },
    { id: 'edge', name: 'Muted', state: 'muted', values: { selected: true } },
  ],
  build: (context, state) => {
    const primitives = [box(context, 'Step outline', 1, 1, 10, 10, state === 'off' ? 4 : state === 'muted' ? 3 : 10)]
    if (state === 'on') primitives.push(box(context, 'Step hit', 3, 3, 8, 8, 12, true))
    if (state === 'accent') primitives.push(box(context, 'Step accent', 2, 2, 9, 9, 15, true), box(context, 'Step accent cutout', 4, 4, 7, 7, 0, true))
    if (state === 'tie') primitives.push(line(context, 'Step tie', 2, 6, 9, 6, 13), line(context, 'Step tie hook', 8, 4, 9, 6, 13))
    if (state === 'muted') primitives.push(line(context, 'Step mute', 2, 9, 9, 2, 5))
    primitives.push(
      line(context, 'Selected top', 0, 0, 11, 0, 15, context.visible('selected')),
      line(context, 'Selected bottom', 0, 11, 11, 11, 15, context.visible('selected')),
    )
    return primitives
  },
}

const valueStepCell: DisplayComponentRecipe = {
  ...common,
  id: 'value-step-cell',
  name: 'Value step cell',
  category: 'sequencing',
  description: 'A vertical value step for pitch or CV sequences.',
  tags: ['sequencer', 'pitch', 'cv', 'bar', 'step'],
  footprint: { width: 12, height: 20 },
  states: [{ value: 'normal', name: 'Normal' }, { value: 'current', name: 'Current' }, { value: 'muted', name: 'Muted' }],
  defaultState: 'normal',
  inputs: [
    numberInput('value', 'Value', 'Normalized step value.', 0.5),
    booleanInput('gate', 'Gate', 'Shows a gate marker above the value bar.'),
  ],
  scenarios: [
    { id: 'default', name: 'Half value', state: 'normal' },
    { id: 'active', name: 'Current + gate', state: 'current', values: { value: 0.8, gate: true } },
    { id: 'edge', name: 'Muted', state: 'muted', values: { value: 0.2 } },
  ],
  build: (context, state) => {
    const shade = state === 'current' ? 15 : state === 'muted' ? 3 : 10
    return [
      box(context, 'Value step outline', 1, 2, 10, 19, state === 'current' ? 12 : 4),
      box(context, 'Value step fill', 3, context.number('value', 17, 4), 8, 17, shade, true),
      box(context, 'Value step gate', 4, 0, 7, 1, 15, true, context.visible('gate')),
      ...(state === 'muted' ? [line(context, 'Value step mute', 2, 18, 9, 3, 5)] : []),
    ]
  },
}

const drumVoiceGlyph: DisplayComponentRecipe = {
  ...common,
  id: 'drum-voice-glyph',
  name: 'Drum voice glyph',
  category: 'drums',
  description: 'An original classic-analog kick glyph with hit, accent, and mute states.',
  tags: ['808-like', 'kick', 'drum', 'voice', 'percussion'],
  footprint: { width: 18, height: 18 },
  states: [{ value: 'idle', name: 'Idle' }, { value: 'hit', name: 'Hit' }, { value: 'accent', name: 'Accent' }, { value: 'muted', name: 'Muted' }],
  defaultState: 'idle',
  inputs: [numberInput('level', 'Hit level', 'Normalized event level used for the drum-body shade.', 0.5)],
  scenarios: [
    { id: 'default', name: 'Idle', state: 'idle', values: { level: 0.2 } },
    { id: 'active', name: 'Hit', state: 'hit', values: { level: 0.8 } },
    { id: 'edge', name: 'Accented hit', state: 'accent', values: { level: 1 } },
  ],
  build: (context, state) => {
    const bodyShade = state === 'muted' ? 3 : context.number('level', 5, 15)
    const primitives = [
      circle(context, 'Kick shell', 8, 9, 6, bodyShade),
      line(context, 'Kick stand', 8, 15, 8, 17, state === 'muted' ? 3 : 7),
      line(context, 'Kick beater', 13, 4, 16, 1, state === 'muted' ? 3 : 10),
      circle(context, 'Kick beater head', 13, 4, 1, state === 'accent' ? 15 : 9),
    ]
    if (state === 'hit') primitives.push(circle(context, 'Kick hit ring', 8, 9, 3, 15))
    if (state === 'accent') primitives.push(circle(context, 'Kick accent ring', 8, 9, 8, 15))
    if (state === 'muted') primitives.push(line(context, 'Kick mute', 2, 15, 15, 2, 5))
    return primitives
  },
}

const drumVoiceTile: DisplayComponentRecipe = {
  ...common,
  id: 'drum-voice-tile',
  name: 'Drum voice tile',
  category: 'drums',
  description: 'A labelled drum channel with voice event and level meter.',
  tags: ['909-like', 'drum', 'channel', 'meter', 'percussion'],
  footprint: { width: 48, height: 20 },
  states: [{ value: 'idle', name: 'Idle' }, { value: 'hit', name: 'Hit' }, { value: 'accent', name: 'Accent' }, { value: 'muted', name: 'Muted' }, { value: 'clipped', name: 'Clipped' }],
  defaultState: 'idle',
  inputs: [
    textInput('label', 'Label', 'Short drum voice label.', 'KICK'),
    numberInput('level', 'Level', 'Normalized voice output level.', 0.4),
  ],
  scenarios: [
    { id: 'default', name: 'Idle', state: 'idle' },
    { id: 'active', name: 'Accented hit', state: 'accent', values: { level: 0.9 } },
    { id: 'edge', name: 'Clipped', state: 'clipped', values: { level: 1 } },
  ],
  build: (context, state) => {
    const shade = state === 'muted' ? 3 : state === 'clipped' || state === 'accent' ? 15 : state === 'hit' ? 12 : 6
    const primitives = [
      box(context, 'Drum tile frame', 0, 0, 47, 19, state === 'clipped' ? 15 : 4),
      circle(context, 'Drum tile shell', 9, 9, state === 'accent' ? 7 : 6, shade),
      line(context, 'Drum tile transient', 9, 3, 14, 0, shade),
      tinyText(context, 'Drum tile label', 19, 7, context.text('label'), state === 'muted' ? 4 : 10),
      box(context, 'Drum tile meter frame', 18, 11, 45, 17, 4),
      box(context, 'Drum tile level', 19, 13, context.number('level', 19, 44), 15, shade, true),
    ]
    if (state === 'muted') primitives.push(line(context, 'Drum tile mute', 3, 16, 15, 3, 5))
    if (state === 'clipped') primitives.push(box(context, 'Drum tile clip', 42, 1, 46, 3, 15, true))
    return primitives
  },
}

const clockSourceBadge: DisplayComponentRecipe = {
  ...common,
  id: 'clock-source-badge',
  name: 'Clock source badge',
  category: 'status',
  description: 'A clock source and lock-state badge with a phase marker.',
  tags: ['clock', 'internal', 'external', 'sync', 'lock'],
  footprint: { width: 44, height: 12 },
  states: [{ value: 'internal', name: 'Internal' }, { value: 'searching', name: 'External searching' }, { value: 'locked', name: 'External locked' }, { value: 'stopped', name: 'Stopped' }, { value: 'invalid', name: 'Invalid' }],
  defaultState: 'internal',
  inputs: [numberInput('phase', 'Phase', 'Normalized clock phase used for the lower marker.', 0.25)],
  scenarios: [
    { id: 'default', name: 'Internal', state: 'internal' },
    { id: 'active', name: 'External locked', state: 'locked', values: { phase: 0.7 } },
    { id: 'edge', name: 'Searching', state: 'searching', values: { phase: 0 } },
  ],
  build: (context, state) => {
    const label = state === 'internal' ? 'INT' : state === 'locked' ? 'EXT' : state === 'searching' ? '...' : state === 'stopped' ? 'STOP' : 'ERR'
    const shade = state === 'invalid' ? 15 : state === 'locked' ? 14 : state === 'searching' ? 7 : state === 'stopped' ? 3 : 10
    return [
      box(context, 'Clock badge frame', 0, 0, 43, 11, shade),
      circle(context, 'Clock badge ring', 7, 6, 4, shade),
      line(context, 'Clock badge hand', 7, 6, 10, 4, shade),
      tinyText(context, 'Clock source label', 41, 8, label, shade, 'right'),
      line(context, 'Clock phase rail', 14, 10, 40, 10, 3),
      line(context, 'Clock phase marker', context.number('phase', 14, 40), 8, context.number('phase', 14, 40), 11, state === 'stopped' ? 3 : 15),
    ]
  },
}

const midiActivity: DisplayComponentRecipe = {
  ...common,
  id: 'midi-activity',
  name: 'MIDI activity',
  category: 'status',
  description: 'A script-level MIDI receive, send, filter, or error indicator.',
  tags: ['midi', 'receive', 'send', 'filter', 'status'],
  footprint: { width: 40, height: 12 },
  states: [{ value: 'idle', name: 'Idle' }, { value: 'receiving', name: 'Receiving' }, { value: 'sending', name: 'Sending' }, { value: 'filtered', name: 'Filtered' }, { value: 'error', name: 'Error' }],
  defaultState: 'idle',
  inputs: [],
  scenarios: [
    { id: 'default', name: 'Idle', state: 'idle' },
    { id: 'active', name: 'Receiving', state: 'receiving' },
    { id: 'edge', name: 'Error', state: 'error' },
  ],
  build: (context, state) => {
    const shade = state === 'error' ? 15 : state === 'idle' ? 5 : state === 'filtered' ? 6 : 13
    const primitives = [box(context, 'MIDI badge frame', 0, 0, 39, 11, shade), tinyText(context, 'MIDI label', 3, 8, 'MIDI', shade)]
    if (state === 'receiving') primitives.push(line(context, 'MIDI receive shaft', 35, 3, 25, 8, 15), line(context, 'MIDI receive head upper', 25, 8, 28, 4, 15), line(context, 'MIDI receive head lower', 25, 8, 30, 9, 15))
    else if (state === 'sending') primitives.push(line(context, 'MIDI send shaft', 25, 8, 35, 3, 15), line(context, 'MIDI send head upper', 35, 3, 31, 2, 15), line(context, 'MIDI send head lower', 35, 3, 33, 7, 15))
    else if (state === 'filtered') primitives.push(line(context, 'MIDI filter', 25, 2, 35, 9, 8), line(context, 'MIDI filter cross', 35, 2, 25, 9, 8))
    else if (state === 'error') primitives.push(line(context, 'MIDI error one', 27, 2, 35, 9, 15), line(context, 'MIDI error two', 35, 2, 27, 9, 15))
    else primitives.push(circle(context, 'MIDI idle dot', 31, 6, 2, 5))
    return primitives
  },
}

export const DISPLAY_COMPONENT_RECIPES: readonly DisplayComponentRecipe[] = [
  panelFrame,
  sectionHeader,
  inputJack,
  outputJack,
  momentaryButton,
  toggleSwitch,
  signalTypeBadge,
  waveformGlyph,
  attenuator,
  mixer,
  unipolarMeter,
  bipolarMeter,
  stepCell,
  valueStepCell,
  drumVoiceGlyph,
  drumVoiceTile,
  clockSourceBadge,
  midiActivity,
]
