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

function animatedLine(
  context: DisplayComponentBuildContext,
  name: string,
  x1: ScalarValue,
  y1: ScalarValue,
  x2: ScalarValue,
  y2: ScalarValue,
  shade: ScalarValue = 15,
  secondaryShade: ScalarValue = 2,
  direction: 'left' | 'right' | 'up' | 'down' = 'right',
): DisplayPrimitiveElement {
  return {
    kind: 'animated-line', id: context.primitiveId(), name,
    x1: scalar(x1), y1: scalar(y1), x2: scalar(x2), y2: scalar(y2),
    shade: scalar(shade), secondaryShade: scalar(secondaryShade), visible: shown,
    direction, speed: 10,
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

const statusLamp: DisplayComponentRecipe = {
  ...common,
  id: 'status-lamp',
  name: 'Status lamp',
  category: 'layout',
  description: 'A shape-coded gate, pulse, warning, or error indicator driven by script state.',
  tags: ['led', 'gate', 'activity', 'sync', 'health', 'indicator'],
  footprint: { width: 9, height: 9 },
  states: [{ value: 'off', name: 'Off' }, { value: 'on', name: 'On' }, { value: 'pulse', name: 'Pulse' }, { value: 'warning', name: 'Warning' }, { value: 'error', name: 'Error' }],
  defaultState: 'off',
  inputs: [numberInput('level', 'Level', 'Normalized script-owned level used for the active centre shade.', 0.75)],
  scenarios: [
    { id: 'default', name: 'Off', state: 'off', values: { level: 0 } },
    { id: 'active', name: 'Pulse', state: 'pulse', values: { level: 1 } },
    { id: 'edge', name: 'Error', state: 'error', values: { level: 1 } },
  ],
  build: (context, state) => {
    const shade = state === 'off' ? 4 : state === 'warning' || state === 'error' ? 15 : context.number('level', 7, 15)
    const primitives: DisplayPrimitiveElement[] = [circle(context, 'Lamp ring', 4, 4, 3, shade)]
    if (state === 'on') primitives.push(box(context, 'Lamp centre', 3, 3, 5, 5, shade, true))
    if (state === 'pulse') primitives.push(line(context, 'Lamp pulse horizontal', 0, 4, 8, 4, 15), line(context, 'Lamp pulse vertical', 4, 0, 4, 8, 15))
    if (state === 'warning') primitives.push(line(context, 'Lamp warning base', 1, 7, 7, 7, 15), line(context, 'Lamp warning left', 1, 7, 4, 1, 15), line(context, 'Lamp warning right', 4, 1, 7, 7, 15))
    if (state === 'error') primitives.push(line(context, 'Lamp error one', 1, 1, 7, 7, 15), line(context, 'Lamp error two', 7, 1, 1, 7, 15))
    return primitives
  },
}

const dividerRuler: DisplayComponentRecipe = {
  ...common,
  id: 'divider-ruler',
  name: 'Divider ruler',
  category: 'layout',
  description: 'A five-tick section divider with a script-positioned active reference.',
  tags: ['divider', 'separator', 'ticks', 'scale', 'voltage', 'time', 'guide'],
  footprint: { width: 48, height: 7 },
  states: [{ value: 'normal', name: 'Normal' }, { value: 'active', name: 'Active' }, { value: 'disabled', name: 'Disabled' }],
  defaultState: 'normal',
  inputs: [numberInput('reference', 'Reference', 'Normalized location of the bright script-owned reference tick.', 0.5)],
  scenarios: [
    { id: 'default', name: 'Normal', state: 'normal', values: { reference: 0.5 } },
    { id: 'active', name: 'Active reference', state: 'active', values: { reference: 0.75 } },
    { id: 'edge', name: 'Disabled', state: 'disabled', values: { reference: 0 } },
  ],
  build: (context, state) => {
    const shade = state === 'disabled' ? 2 : state === 'active' ? 7 : 4
    const primitives: DisplayPrimitiveElement[] = [line(context, 'Divider rail', 0, 3, 47, 3, shade)]
    for (const x of [0, 12, 24, 36, 47]) primitives.push(line(context, `Divider tick ${x}`, x, 1, x, 5, shade))
    if (state === 'active') primitives.push(line(context, 'Divider active reference', context.number('reference', 0, 47), 0, context.number('reference', 0, 47), 6, 15))
    if (state === 'disabled') primitives.push(line(context, 'Divider disabled mark', 17, 6, 30, 0, 3))
    return primitives
  },
}

const labelValueRow: DisplayComponentRecipe = {
  ...common,
  id: 'label-value-row',
  name: 'Label value row',
  category: 'layout',
  description: 'A compact dynamic label and value readout with focus, stale, and error treatments.',
  tags: ['label', 'value', 'parameter', 'voltage', 'note', 'tempo', 'readout'],
  footprint: { width: 64, height: 10 },
  states: [{ value: 'normal', name: 'Normal' }, { value: 'focused', name: 'Focused' }, { value: 'stale', name: 'Stale' }, { value: 'error', name: 'Error' }],
  defaultState: 'normal',
  inputs: [
    textInput('label', 'Label', 'Short field label rendered in the tiny font.', 'RATE'),
    textInput('value', 'Value', 'Script-formatted value, note, ratio, voltage, or tempo.', '120'),
  ],
  scenarios: [
    { id: 'default', name: 'Normal value', state: 'normal' },
    { id: 'active', name: 'Focused note', state: 'focused', values: { label: 'NOTE', value: 'C4' } },
    { id: 'edge', name: 'Error', state: 'error', values: { label: 'CV', value: '--' } },
  ],
  build: (context, state) => {
    const shade = state === 'stale' ? 4 : state === 'error' ? 15 : state === 'focused' ? 14 : 9
    const primitives: DisplayPrimitiveElement[] = [
      tinyText(context, 'Row label', 1, 7, context.text('label'), state === 'stale' ? 3 : 8),
      line(context, 'Row divider', 31, 1, 31, 8, state === 'stale' ? 2 : 4),
      line(context, 'Row baseline', 0, 9, 63, 9, state === 'focused' ? 15 : state === 'error' ? 11 : 3),
    ]
    if (state === 'error') primitives.push(tinyText(context, 'Row error value', 62, 7, 'ERR', 15, 'right'), line(context, 'Row error mark', 35, 1, 39, 7, 15))
    else primitives.push(tinyText(context, 'Row value', 62, 7, context.text('value'), shade, 'right'))
    if (state === 'focused') primitives.push(line(context, 'Row focus left', 0, 0, 5, 0, 15), line(context, 'Row focus right', 58, 0, 63, 0, 15))
    if (state === 'stale') primitives.push(line(context, 'Row stale slash', 35, 8, 43, 1, 5))
    return primitives
  },
}

const stateBadge: DisplayComponentRecipe = {
  ...common,
  id: 'state-badge',
  name: 'State badge',
  category: 'layout',
  description: 'A short text badge with inactive, inverted-active, warning, and error treatments.',
  tags: ['badge', 'state', 'status', 'run', 'mute', 'arm', 'external', 'internal'],
  footprint: { width: 32, height: 10 },
  states: [{ value: 'inactive', name: 'Inactive' }, { value: 'active', name: 'Active' }, { value: 'warning', name: 'Warning' }, { value: 'error', name: 'Error' }],
  defaultState: 'inactive',
  inputs: [textInput('label', 'Label', 'Short state label such as EXT, RUN, MUTE, ARM, or CV.', 'RUN')],
  scenarios: [
    { id: 'default', name: 'Inactive', state: 'inactive' },
    { id: 'active', name: 'Active', state: 'active' },
    { id: 'edge', name: 'Error', state: 'error', values: { label: 'ERR' } },
  ],
  build: (context, state) => {
    const active = state === 'active'
    const shade = state === 'inactive' ? 5 : state === 'warning' ? 12 : 15
    const primitives: DisplayPrimitiveElement[] = [
      box(context, 'State badge frame', 0, 0, 31, 9, shade, active),
      tinyText(context, 'State badge label', 16, 7, context.text('label'), active ? 0 : shade, 'centre'),
    ]
    if (state === 'warning') primitives.push(line(context, 'State badge warning', 1, 1, 30, 1, 15))
    if (state === 'error') primitives.push(line(context, 'State badge error one', 2, 1, 8, 8, 15), line(context, 'State badge error two', 8, 1, 2, 8, 15))
    return primitives
  },
}

const segmentedSelector: DisplayComponentRecipe = {
  ...common,
  id: 'segmented-selector',
  name: 'Tabs segmented selector',
  category: 'layout',
  description: 'A three-mode selector whose chosen tab is marked by both fill and an underline.',
  tags: ['tabs', 'segmented', 'selector', 'mode', 'page', 'choice'],
  footprint: { width: 48, height: 10 },
  states: [{ value: 'first', name: 'First' }, { value: 'second', name: 'Second' }, { value: 'third', name: 'Third' }, { value: 'disabled', name: 'Disabled' }],
  defaultState: 'first',
  inputs: [
    textInput('firstLabel', 'First label', 'Short label for the first mode.', 'A'),
    textInput('secondLabel', 'Second label', 'Short label for the second mode.', 'B'),
    textInput('thirdLabel', 'Third label', 'Short label for the third mode.', 'C'),
    booleanInput('focused', 'Focused', 'Shows bright outer focus rails.'),
  ],
  scenarios: [
    { id: 'default', name: 'First mode', state: 'first' },
    { id: 'active', name: 'Second focused', state: 'second', values: { focused: true } },
    { id: 'edge', name: 'Disabled', state: 'disabled' },
  ],
  build: (context, state) => {
    const selected = state === 'first' ? 0 : state === 'second' ? 16 : state === 'third' ? 32 : -1
    const shade = state === 'disabled' ? 2 : 8
    const primitives: DisplayPrimitiveElement[] = [
      box(context, 'Selector frame', 0, 0, 47, 9, shade),
      line(context, 'Selector divider one', 16, 1, 16, 8, shade),
      line(context, 'Selector divider two', 32, 1, 32, 8, shade),
      tinyText(context, 'Selector first label', 8, 7, context.text('firstLabel'), state === 'first' ? 0 : shade, 'centre'),
      tinyText(context, 'Selector second label', 24, 7, context.text('secondLabel'), state === 'second' ? 0 : shade, 'centre'),
      tinyText(context, 'Selector third label', 40, 7, context.text('thirdLabel'), state === 'third' ? 0 : shade, 'centre'),
      line(context, 'Selector focus top', 0, 0, 47, 0, 15, context.visible('focused')),
      line(context, 'Selector focus bottom', 0, 9, 47, 9, 15, context.visible('focused')),
    ]
    if (selected >= 0) {
      primitives.splice(1, 0, box(context, 'Selector selected segment', selected + 1, 1, selected + 15, 8, 12, true))
      primitives.push(line(context, 'Selector selected marker', selected + 3, 9, selected + 13, 9, 15))
    } else primitives.push(line(context, 'Selector disabled mark', 3, 8, 44, 1, 3))
    return primitives
  },
}

const pageIndicator: DisplayComponentRecipe = {
  ...common,
  id: 'page-indicator',
  name: 'Page indicator',
  category: 'layout',
  description: 'A compact four-page strip with a position marker and explicit wrap, disabled, and error treatments.',
  tags: ['page', 'position', 'count', 'screen', 'pattern', 'pagination', 'wrapped'],
  footprint: { width: 48, height: 8 },
  states: [{ value: 'normal', name: 'Normal' }, { value: 'wrapped', name: 'Wrapped' }, { value: 'disabled', name: 'Disabled' }, { value: 'error', name: 'Error' }],
  defaultState: 'normal',
  inputs: [
    numberInput('position', 'Page position', 'Normalized page position across the four-page strip.', 0.33),
    textInput('pageCount', 'Page and count', 'Script-formatted page and count such as 2/4.', '2/4'),
  ],
  scenarios: [
    { id: 'default', name: 'Page two of four', state: 'normal' },
    { id: 'active', name: 'Wrapped to start', state: 'wrapped', values: { position: 0, pageCount: '1/4' } },
    { id: 'edge', name: 'Unavailable', state: 'disabled', values: { pageCount: '--' } },
  ],
  build: (context, state) => {
    const shade = state === 'disabled' ? 2 : state === 'error' ? 15 : state === 'wrapped' ? 13 : 8
    const position = context.number('position', 2, 29)
    const primitives: DisplayPrimitiveElement[] = [
      box(context, 'Page block one', 1, 2, 5, 6, shade),
      box(context, 'Page block two', 9, 2, 13, 6, shade),
      box(context, 'Page block three', 17, 2, 21, 6, shade),
      box(context, 'Page block four', 25, 2, 29, 6, shade),
      line(context, 'Page position', position, 0, position, 7, state === 'disabled' ? 3 : 15),
      tinyText(context, 'Page count', 47, 7, context.text('pageCount'), shade, 'right'),
    ]
    if (state === 'wrapped') primitives.push(line(context, 'Page wrap start', 0, 0, 0, 7, 15), line(context, 'Page wrap end', 30, 0, 30, 7, 15))
    if (state === 'disabled') primitives.push(line(context, 'Page disabled mark', 1, 7, 29, 0, 3))
    if (state === 'error') primitives.push(line(context, 'Page error one', 33, 1, 39, 7, 15), line(context, 'Page error two', 39, 1, 33, 7, 15))
    return primitives
  },
}

const focusSelectionBrackets: DisplayComponentRecipe = {
  ...common,
  id: 'focus-selection-brackets',
  name: 'Focus selection brackets',
  category: 'layout',
  description: 'An orthogonal corner overlay for focus or selection with warning, error, and inactive treatments.',
  tags: ['focus', 'selection', 'brackets', 'cursor', 'overlay', 'bounds', 'highlight'],
  footprint: { width: 40, height: 20 },
  states: [{ value: 'inactive', name: 'Inactive' }, { value: 'visible', name: 'Visible' }, { value: 'warning', name: 'Warning' }, { value: 'error', name: 'Error' }],
  defaultState: 'inactive',
  inputs: [booleanInput('scriptSelected', 'Script selected', 'Adds a centre selection mark supplied by script state.')],
  scenarios: [
    { id: 'default', name: 'Inactive guide', state: 'inactive' },
    { id: 'active', name: 'Selected', state: 'visible', values: { scriptSelected: true } },
    { id: 'edge', name: 'Warning selection', state: 'warning', values: { scriptSelected: true } },
  ],
  build: (context, state) => {
    const shade = state === 'inactive' ? 3 : state === 'warning' ? 12 : 15
    const primitives: DisplayPrimitiveElement[] = [
      line(context, 'Focus top left horizontal', 0, 0, 6, 0, shade),
      line(context, 'Focus top left vertical', 0, 0, 0, 6, shade),
      line(context, 'Focus top right horizontal', 33, 0, 39, 0, shade),
      line(context, 'Focus top right vertical', 39, 0, 39, 6, shade),
      line(context, 'Focus bottom left horizontal', 0, 19, 6, 19, shade),
      line(context, 'Focus bottom left vertical', 0, 13, 0, 19, shade),
      line(context, 'Focus bottom right horizontal', 33, 19, 39, 19, shade),
      line(context, 'Focus bottom right vertical', 39, 13, 39, 19, shade),
      box(context, 'Focus script selection', 18, 8, 21, 11, 15, true, context.visible('scriptSelected')),
    ]
    if (state === 'visible') primitives.push(line(context, 'Focus visible top', 14, 0, 25, 0, 15))
    if (state === 'warning') primitives.push(line(context, 'Focus warning rail', 8, 1, 31, 1, 15), line(context, 'Focus warning stem', 20, 1, 20, 5, 15))
    if (state === 'error') primitives.push(line(context, 'Focus error one', 15, 5, 25, 15, 15), line(context, 'Focus error two', 25, 5, 15, 15, 15))
    return primitives
  },
}

const emptyUnavailableMarker: DisplayComponentRecipe = {
  ...common,
  id: 'empty-unavailable-marker',
  name: 'Empty unavailable marker',
  category: 'layout',
  description: 'An explicit text fallback for empty, waiting, unavailable, and error states.',
  tags: ['empty', 'unavailable', 'waiting', 'missing', 'no data', 'fallback', 'placeholder'],
  footprint: { width: 64, height: 14 },
  states: [{ value: 'empty', name: 'Empty' }, { value: 'waiting', name: 'Waiting' }, { value: 'unavailable', name: 'Unavailable' }, { value: 'error', name: 'Error' }],
  defaultState: 'empty',
  inputs: [textInput('message', 'Message', 'Short script-owned fallback text such as EMPTY, WAIT, NO MIDI, or ERR.', 'EMPTY')],
  scenarios: [
    { id: 'default', name: 'Empty', state: 'empty' },
    { id: 'active', name: 'Waiting for clock', state: 'waiting', values: { message: 'WAIT CLK' } },
    { id: 'edge', name: 'Unavailable MIDI', state: 'unavailable', values: { message: 'NO MIDI' } },
  ],
  build: (context, state) => {
    const shade = state === 'empty' ? 5 : state === 'waiting' ? 10 : state === 'unavailable' ? 8 : 15
    const primitives: DisplayPrimitiveElement[] = [
      box(context, 'Empty marker frame', 0, 0, 63, 13, shade),
      tinyText(context, 'Empty marker message', 32, 9, context.text('message'), shade, 'centre'),
    ]
    if (state === 'empty') primitives.push(line(context, 'Empty marker dash', 3, 6, 11, 6, 6))
    if (state === 'waiting') primitives.push(line(context, 'Waiting hand', 7, 7, 7, 2, 15), line(context, 'Waiting hand tip', 7, 7, 11, 9, 15))
    if (state === 'unavailable') primitives.push(line(context, 'Unavailable slash', 3, 11, 13, 2, 12))
    if (state === 'error') primitives.push(line(context, 'Empty marker error one', 3, 2, 13, 11, 15), line(context, 'Empty marker error two', 13, 2, 3, 11, 15))
    return primitives
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

const bidirectionalJack: DisplayComponentRecipe = {
  ...common,
  id: 'bidirectional-jack',
  name: 'Bidirectional jack',
  category: 'patching',
  description: 'A configurable utility jack whose direction is explicit in every state.',
  tags: ['patch', 'port', 'utility', 'input', 'output', 'thru', 'configurable io'],
  footprint: { width: 16, height: 16 },
  states: [{ value: 'input', name: 'Input' }, { value: 'output', name: 'Output' }, { value: 'thru', name: 'Thru' }, { value: 'disabled', name: 'Disabled' }],
  defaultState: 'input',
  inputs: [booleanInput('activity', 'Activity', 'Shows a script-driven centre mark when the route is active.')],
  scenarios: [
    { id: 'default', name: 'Input', state: 'input' },
    { id: 'active', name: 'Output + active', state: 'output', values: { activity: true } },
    { id: 'edge', name: 'Thru', state: 'thru', values: { activity: true } },
  ],
  build: (context, state) => {
    const shade = state === 'disabled' ? 2 : state === 'thru' ? 13 : 9
    const primitives: DisplayPrimitiveElement[] = [circle(context, 'Utility jack ring', 8, 8, 5, shade)]
    if (state === 'input' || state === 'thru') primitives.push(
      line(context, 'Utility input shaft', 0, 8, 5, 8, shade),
      line(context, 'Utility input upper', 3, 6, 5, 8, shade),
      line(context, 'Utility input lower', 3, 10, 5, 8, shade),
    )
    if (state === 'output' || state === 'thru') primitives.push(
      line(context, 'Utility output shaft', 11, 8, 15, 8, shade),
      line(context, 'Utility output upper', 13, 6, 15, 8, shade),
      line(context, 'Utility output lower', 13, 10, 15, 8, shade),
    )
    if (state === 'disabled') primitives.push(line(context, 'Utility disabled mark', 3, 13, 13, 3, 3))
    primitives.push(box(context, 'Utility activity', 7, 7, 9, 9, 15, true, context.visible('activity')))
    return primitives
  },
}

const stereoJacks: DisplayComponentRecipe = {
  ...common,
  id: 'stereo-jacks',
  name: 'Stereo paired jacks',
  category: 'patching',
  description: 'Compact left/right jacks with linked, split, and disabled structures.',
  tags: ['stereo', 'paired', 'left', 'right', 'linked', 'split', 'patch'],
  footprint: { width: 24, height: 12 },
  states: [{ value: 'linked', name: 'Linked' }, { value: 'split', name: 'Split' }, { value: 'disabled', name: 'Disabled' }],
  defaultState: 'split',
  inputs: [
    booleanInput('leftPatched', 'Left patched', 'Shows the script-known left connection ring.'),
    booleanInput('rightPatched', 'Right patched', 'Shows the script-known right connection ring.'),
    booleanInput('leftActive', 'Left active', 'Shows a script-driven left activity centre.'),
    booleanInput('rightActive', 'Right active', 'Shows a script-driven right activity centre.'),
  ],
  scenarios: [
    { id: 'default', name: 'Split + unpatched', state: 'split' },
    { id: 'active', name: 'Linked + active', state: 'linked', values: { leftPatched: true, rightPatched: true, leftActive: true, rightActive: true } },
    { id: 'edge', name: 'Disabled', state: 'disabled', values: { leftPatched: true, rightPatched: true } },
  ],
  build: (context, state) => {
    const shade = state === 'disabled' ? 2 : state === 'linked' ? 11 : 7
    const primitives: DisplayPrimitiveElement[] = [
      circle(context, 'Left jack', 6, 6, 4, shade),
      circle(context, 'Right jack', 17, 6, 4, shade),
      circle(context, 'Left patch ring', 6, 6, 2, 12, context.visible('leftPatched')),
      circle(context, 'Right patch ring', 17, 6, 2, 12, context.visible('rightPatched')),
      box(context, 'Left activity', 5, 5, 7, 7, 15, true, context.visible('leftActive')),
      box(context, 'Right activity', 16, 5, 18, 7, 15, true, context.visible('rightActive')),
    ]
    if (state === 'linked') primitives.push(line(context, 'Stereo link bridge', 10, 6, 13, 6, 15), line(context, 'Stereo link top', 10, 4, 13, 4, 9))
    if (state === 'split') primitives.push(line(context, 'Stereo split divider', 11, 1, 11, 10, 5))
    if (state === 'disabled') primitives.push(line(context, 'Stereo disabled mark', 2, 10, 21, 1, 3))
    return primitives
  },
}

const normalledPair: DisplayComponentRecipe = {
  ...common,
  id: 'normalled-pair',
  name: 'Normalled pair',
  category: 'patching',
  description: 'Two logical ports with an explicit default route and broken-normal state.',
  tags: ['normalled', 'normal', 'broken', 'patch', 'default route', 'pair'],
  footprint: { width: 20, height: 20 },
  states: [{ value: 'normalled', name: 'Normalled' }, { value: 'broken', name: 'Broken' }, { value: 'active', name: 'Active' }, { value: 'disabled', name: 'Disabled' }],
  defaultState: 'normalled',
  inputs: [
    booleanInput('upperPatched', 'Upper patched', 'Shows the script-known upper connection ring.'),
    booleanInput('lowerPatched', 'Lower patched', 'Shows the script-known lower connection ring.'),
  ],
  scenarios: [
    { id: 'default', name: 'Normalled', state: 'normalled' },
    { id: 'active', name: 'Active normal', state: 'active' },
    { id: 'edge', name: 'Broken by patch', state: 'broken', values: { lowerPatched: true } },
  ],
  build: (context, state) => {
    const shade = state === 'disabled' ? 2 : state === 'active' ? 14 : state === 'broken' ? 9 : 6
    const primitives: DisplayPrimitiveElement[] = [
      circle(context, 'Normal upper jack', 6, 6, 4, shade),
      circle(context, 'Normal lower jack', 14, 14, 4, shade),
      circle(context, 'Normal upper patch', 6, 6, 2, 13, context.visible('upperPatched')),
      circle(context, 'Normal lower patch', 14, 14, 2, 13, context.visible('lowerPatched')),
    ]
    if (state === 'normalled' || state === 'active') primitives.push(line(context, 'Normal route', 9, 9, 11, 11, state === 'active' ? 15 : 8))
    if (state === 'active') primitives.push(box(context, 'Normal active mark', 9, 9, 11, 11, 15, true))
    if (state === 'broken') primitives.push(line(context, 'Normal break one', 8, 12, 12, 8, 15), line(context, 'Normal break two', 8, 8, 12, 12, 15))
    if (state === 'disabled') primitives.push(line(context, 'Normal disabled mark', 2, 18, 18, 2, 3))
    return primitives
  },
}

const labelledPortTile: DisplayComponentRecipe = {
  ...common,
  id: 'labelled-port-tile',
  name: 'Labelled port tile',
  category: 'patching',
  description: 'A standard channel tile combining direction, jack, short label, signal kind, and level.',
  tags: ['port', 'channel', 'jack', 'labelled', 'input', 'output', 'signal', 'io overview'],
  footprint: { width: 40, height: 18 },
  states: [{ value: 'input', name: 'Input' }, { value: 'output', name: 'Output' }, { value: 'thru', name: 'Thru' }, { value: 'warning', name: 'Warning' }, { value: 'disabled', name: 'Disabled' }],
  defaultState: 'input',
  inputs: [
    textInput('label', 'Label', 'Short channel or port name.', 'CV1'),
    textInput('signal', 'Signal kind', 'Short signal-kind label such as CV, G, A, or CLK.', 'CV'),
    booleanInput('activity', 'Activity', 'Shows a script-driven jack activity centre.'),
    numberInput('level', 'Level', 'Normalized script-owned signal level.', 0.4),
  ],
  scenarios: [
    { id: 'default', name: 'Input CV', state: 'input' },
    { id: 'active', name: 'Output active', state: 'output', values: { label: 'OUT1', activity: true, level: 0.8 } },
    { id: 'edge', name: 'Warning', state: 'warning', values: { activity: true, level: 1 } },
  ],
  build: (context, state) => {
    const shade = state === 'disabled' ? 2 : state === 'warning' ? 15 : state === 'output' ? 11 : state === 'thru' ? 13 : 8
    const primitives: DisplayPrimitiveElement[] = [
      box(context, 'Port tile frame', 0, 0, 39, 17, state === 'warning' ? 15 : 4),
      circle(context, 'Port tile jack', 8, 9, 5, shade),
      tinyText(context, 'Port tile label', 16, 7, context.text('label'), shade),
      tinyText(context, 'Port tile signal', 37, 7, context.text('signal'), state === 'disabled' ? 3 : 9, 'right'),
      line(context, 'Port tile level rail', 16, 14, 37, 14, 3),
      line(context, 'Port tile level', 16, 14, context.number('level', 16, 37), 14, shade),
      box(context, 'Port tile activity', 7, 8, 9, 10, 15, true, context.visible('activity')),
    ]
    if (state === 'input' || state === 'thru') primitives.push(line(context, 'Port input shaft', 0, 9, 3, 9, shade), line(context, 'Port input head', 1, 7, 3, 9, shade))
    if (state === 'output' || state === 'thru') primitives.push(line(context, 'Port output shaft', 13, 9, 16, 9, shade), line(context, 'Port output head', 16, 9, 14, 7, shade))
    if (state === 'warning') primitives.push(box(context, 'Port warning flag', 34, 0, 39, 2, 15, true))
    if (state === 'disabled') primitives.push(line(context, 'Port disabled mark', 2, 16, 14, 3, 3))
    return primitives
  },
}

const splitMultipleNode: DisplayComponentRecipe = {
  ...common,
  id: 'split-multiple-node',
  name: 'Split multiple node',
  category: 'patching',
  description: 'A one-to-three routing node with explicit active, partial, and disabled branch treatments.',
  tags: ['split', 'multiple', 'mult', 'one to many', 'fan out', 'routing'],
  footprint: { width: 28, height: 18 },
  states: [{ value: 'idle', name: 'Idle' }, { value: 'active', name: 'Active' }, { value: 'partial', name: 'Partial' }, { value: 'disabled', name: 'Disabled' }],
  defaultState: 'idle',
  inputs: [
    booleanInput('upperActive', 'Upper branch active', 'Highlights the upper output branch.'),
    booleanInput('middleActive', 'Middle branch active', 'Highlights the middle output branch.'),
    booleanInput('lowerActive', 'Lower branch active', 'Highlights the lower output branch.'),
  ],
  scenarios: [
    { id: 'default', name: 'Idle split', state: 'idle' },
    { id: 'active', name: 'All active', state: 'active', values: { upperActive: true, middleActive: true, lowerActive: true } },
    { id: 'edge', name: 'Partial split', state: 'partial', values: { upperActive: true, lowerActive: true } },
  ],
  build: (context, state) => {
    const shade = state === 'disabled' ? 2 : state === 'active' ? 13 : state === 'partial' ? 9 : 5
    const primitives: DisplayPrimitiveElement[] = [
      line(context, 'Multiple input', 0, 9, 9, 9, shade),
      box(context, 'Multiple node', 9, 6, 14, 12, shade, state === 'active'),
      line(context, 'Multiple upper branch', 14, 8, 27, 2, shade),
      line(context, 'Multiple middle branch', 14, 9, 27, 9, shade),
      line(context, 'Multiple lower branch', 14, 10, 27, 16, shade),
      box(context, 'Multiple upper activity', 24, 0, 27, 3, 15, true, context.visible('upperActive')),
      box(context, 'Multiple middle activity', 24, 7, 27, 10, 15, true, context.visible('middleActive')),
      box(context, 'Multiple lower activity', 24, 14, 27, 17, 15, true, context.visible('lowerActive')),
    ]
    if (state === 'partial') primitives.push(circle(context, 'Multiple partial mark', 12, 9, 1, 15))
    if (state === 'disabled') primitives.push(line(context, 'Multiple disabled mark', 3, 16, 23, 1, 3))
    return primitives
  },
}

const mergeMixNode: DisplayComponentRecipe = {
  ...common,
  id: 'merge-mix-node',
  name: 'Merge mix node',
  category: 'patching',
  description: 'A three-to-one routing node with independent input activity and a clipped output apex.',
  tags: ['merge', 'mix', 'sum', 'many to one', 'routing', 'combine'],
  footprint: { width: 28, height: 18 },
  states: [{ value: 'idle', name: 'Idle' }, { value: 'active', name: 'Active' }, { value: 'saturated', name: 'Saturated' }, { value: 'disabled', name: 'Disabled' }],
  defaultState: 'idle',
  inputs: [
    booleanInput('upperActive', 'Upper input active', 'Highlights the upper input branch.'),
    booleanInput('middleActive', 'Middle input active', 'Highlights the middle input branch.'),
    booleanInput('lowerActive', 'Lower input active', 'Highlights the lower input branch.'),
  ],
  scenarios: [
    { id: 'default', name: 'Idle merge', state: 'idle' },
    { id: 'active', name: 'Mixed inputs', state: 'active', values: { upperActive: true, lowerActive: true } },
    { id: 'edge', name: 'Saturated output', state: 'saturated', values: { upperActive: true, middleActive: true, lowerActive: true } },
  ],
  build: (context, state) => {
    const shade = state === 'disabled' ? 2 : state === 'saturated' ? 15 : state === 'active' ? 13 : 5
    const primitives: DisplayPrimitiveElement[] = [
      line(context, 'Merge upper branch', 0, 2, 13, 8, shade),
      line(context, 'Merge middle branch', 0, 9, 13, 9, shade),
      line(context, 'Merge lower branch', 0, 16, 13, 10, shade),
      box(context, 'Merge node', 13, 6, 18, 12, shade, state === 'active' || state === 'saturated'),
      line(context, 'Merge output', 18, 9, 27, 9, shade),
      box(context, 'Merge upper activity', 0, 0, 3, 3, 15, true, context.visible('upperActive')),
      box(context, 'Merge middle activity', 0, 7, 3, 10, 15, true, context.visible('middleActive')),
      box(context, 'Merge lower activity', 0, 14, 3, 17, 15, true, context.visible('lowerActive')),
    ]
    if (state === 'active') primitives.push(circle(context, 'Merge active centre', 16, 9, 1, 15))
    if (state === 'saturated') primitives.push(box(context, 'Merge saturation apex', 24, 6, 27, 8, 15, true))
    if (state === 'disabled') primitives.push(line(context, 'Merge disabled mark', 4, 1, 24, 16, 3))
    return primitives
  },
}

const routingMatrixCell: DisplayComponentRecipe = {
  ...common,
  id: 'routing-matrix-cell',
  name: 'Routing matrix cell',
  category: 'patching',
  description: 'A compact crosspoint with off, connected, modulated, selected, and conflict shapes.',
  tags: ['routing', 'matrix', 'crosspoint', 'cell', 'modulated', 'conflict', 'patch'],
  footprint: { width: 9, height: 9 },
  states: [{ value: 'off', name: 'Off' }, { value: 'on', name: 'On' }, { value: 'modulated', name: 'Modulated' }, { value: 'selected', name: 'Selected' }, { value: 'conflict', name: 'Conflict' }],
  defaultState: 'off',
  inputs: [numberInput('amount', 'Modulation amount', 'Normalized modulation amount used for the inner crosspoint shade.', 0.5)],
  scenarios: [
    { id: 'default', name: 'Disconnected', state: 'off', values: { amount: 0 } },
    { id: 'active', name: 'Modulated route', state: 'modulated', values: { amount: 0.8 } },
    { id: 'edge', name: 'Route conflict', state: 'conflict', values: { amount: 1 } },
  ],
  build: (context, state) => {
    const shade = state === 'off' ? 4 : state === 'conflict' || state === 'selected' ? 15 : state === 'modulated' ? context.number('amount', 7, 14) : 12
    const primitives: DisplayPrimitiveElement[] = [box(context, 'Matrix cell frame', 0, 0, 8, 8, state === 'selected' ? 15 : state === 'off' ? 3 : 7)]
    if (state === 'on') primitives.push(box(context, 'Matrix cell connection', 2, 2, 6, 6, shade, true))
    if (state === 'modulated') primitives.push(circle(context, 'Matrix cell modulation', 4, 4, 3, shade), box(context, 'Matrix cell modulation centre', 4, 4, 4, 4, 15, true))
    if (state === 'selected') primitives.push(line(context, 'Matrix cell selected horizontal', 1, 4, 7, 4, 15), line(context, 'Matrix cell selected vertical', 4, 1, 4, 7, 15))
    if (state === 'conflict') primitives.push(line(context, 'Matrix cell conflict one', 1, 1, 7, 7, 15), line(context, 'Matrix cell conflict two', 7, 1, 1, 7, 15))
    return primitives
  },
}

const patchLinkFlowLine: DisplayComponentRecipe = {
  ...common,
  id: 'patch-link-flow-line',
  name: 'Patch link flow line',
  category: 'patching',
  description: 'A directional route with idle, animated flow, selection, blocked, and feedback treatments.',
  tags: ['patch', 'link', 'flow', 'animated', 'animated route', 'route', 'connection', 'blocked', 'feedback'],
  footprint: { width: 40, height: 14 },
  states: [{ value: 'idle', name: 'Idle' }, { value: 'flowing', name: 'Flowing' }, { value: 'selected', name: 'Selected' }, { value: 'blocked', name: 'Blocked' }, { value: 'feedback', name: 'Feedback' }],
  defaultState: 'idle',
  inputs: [booleanInput('active', 'Route active', 'Shows a script-owned activity mark at the destination.')],
  scenarios: [
    { id: 'default', name: 'Idle route', state: 'idle' },
    { id: 'active', name: 'Flowing route', state: 'flowing', values: { active: true } },
    { id: 'edge', name: 'Blocked route', state: 'blocked' },
  ],
  build: (context, state) => {
    const shade = state === 'idle' ? 5 : state === 'blocked' ? 12 : 15
    const primitives: DisplayPrimitiveElement[] = []
    if (state === 'flowing') primitives.push(animatedLine(context, 'Patch flowing route', 1, 7, 33, 7, 15, 2))
    else primitives.push(line(context, 'Patch route', 1, 7, 33, 7, shade))
    primitives.push(
      line(context, 'Patch direction upper', 33, 7, 29, 4, shade),
      line(context, 'Patch direction lower', 33, 7, 29, 10, shade),
      box(context, 'Patch destination activity', 35, 5, 39, 9, 15, true, context.visible('active')),
    )
    if (state === 'selected') primitives.push(line(context, 'Patch selection top', 1, 1, 38, 1, 15), line(context, 'Patch selection bottom', 1, 12, 38, 12, 15))
    if (state === 'blocked') primitives.push(line(context, 'Patch blocked one', 15, 2, 23, 12, 15), line(context, 'Patch blocked two', 23, 2, 15, 12, 15))
    if (state === 'feedback') primitives.push(line(context, 'Patch feedback return', 33, 10, 33, 13, 15), line(context, 'Patch feedback lower', 33, 13, 7, 13, 15), line(context, 'Patch feedback hook', 7, 13, 10, 10, 15))
    return primitives
  },
}

const busRailTap: DisplayComponentRecipe = {
  ...common,
  id: 'bus-rail-tap',
  name: 'Bus rail and tap',
  category: 'patching',
  description: 'A shared bus diagram with three script-selected taps and explicit activity, overrange, and disabled states.',
  tags: ['bus', 'rail', 'tap', 'shared', 'routing', 'clock bus', 'signal bus'],
  footprint: { width: 48, height: 18 },
  states: [{ value: 'idle', name: 'Idle' }, { value: 'active', name: 'Active' }, { value: 'overrange', name: 'Overrange' }, { value: 'disabled', name: 'Disabled' }],
  defaultState: 'idle',
  inputs: [
    booleanInput('tap1Active', 'Tap 1 active', 'Highlights the first script-selected bus tap.'),
    booleanInput('tap2Active', 'Tap 2 active', 'Highlights the second script-selected bus tap.'),
    booleanInput('tap3Active', 'Tap 3 active', 'Highlights the third script-selected bus tap.'),
    numberInput('selection', 'Selected tap', 'Normalized selected-tap position along the rail.', 0.5),
  ],
  scenarios: [
    { id: 'default', name: 'Idle bus', state: 'idle' },
    { id: 'active', name: 'Two active taps', state: 'active', values: { tap1Active: true, tap3Active: true, selection: 1 } },
    { id: 'edge', name: 'Bus overrange', state: 'overrange', values: { tap1Active: true, tap2Active: true, tap3Active: true, selection: 0.5 } },
  ],
  build: (context, state) => {
    const shade = state === 'disabled' ? 2 : state === 'overrange' ? 15 : state === 'active' ? 12 : 6
    const primitives: DisplayPrimitiveElement[] = [line(context, 'Bus rail', 1, 8, 46, 8, shade)]
    for (const [index, x] of [10, 24, 38].entries()) {
      primitives.push(
        line(context, `Bus tap ${index + 1}`, x, 8, x, 16, shade),
        circle(context, `Bus tap node ${index + 1}`, x, 8, 2, shade),
        box(context, `Bus tap activity ${index + 1}`, x - 2, 13, x + 2, 17, 15, true, context.visible(`tap${index + 1}Active`)),
      )
    }
    const selection = context.number('selection', 10, 38)
    primitives.push(line(context, 'Bus selected tap', selection, 0, selection, 5, state === 'disabled' ? 3 : 15))
    if (state === 'active') primitives.push(line(context, 'Bus activity rail', 1, 6, 46, 6, 14))
    if (state === 'overrange') primitives.push(box(context, 'Bus overrange left', 0, 5, 3, 10, 15, true), box(context, 'Bus overrange right', 44, 5, 47, 10, 15, true))
    if (state === 'disabled') primitives.push(line(context, 'Bus disabled mark', 3, 16, 44, 1, 3))
    return primitives
  },
}

const routerSwitch: DisplayComponentRecipe = {
  ...common,
  id: 'router-switch',
  name: 'Router switch',
  category: 'patching',
  description: 'A one-to-three route whose selected destination and exceptional switching states are geometrically explicit.',
  tags: ['router', 'switch', 'mux', 'multiplexer', 'one of n', 'destination', 'sequential switch'],
  footprint: { width: 36, height: 20 },
  states: [{ value: 'route-a', name: 'Route A' }, { value: 'route-b', name: 'Route B' }, { value: 'route-c', name: 'Route C' }, { value: 'switching', name: 'Switching' }, { value: 'disabled', name: 'Disabled' }, { value: 'error', name: 'Error' }],
  defaultState: 'route-a',
  inputs: [booleanInput('pulse', 'Switch pulse', 'Shows a short script-maintained route-change event.')],
  scenarios: [
    { id: 'default', name: 'Route A', state: 'route-a' },
    { id: 'active', name: 'Switching routes', state: 'switching', values: { pulse: true } },
    { id: 'edge', name: 'Route error', state: 'error' },
  ],
  build: (context, state) => {
    const shade = state === 'disabled' ? 3 : state === 'error' ? 15 : state === 'switching' ? 13 : 9
    const primitives: DisplayPrimitiveElement[] = [
      line(context, 'Router input', 0, 10, 10, 10, shade),
      circle(context, 'Router pivot', 12, 10, 2, shade),
      line(context, 'Router output A', 26, 3, 35, 3, state === 'route-a' ? 15 : shade),
      line(context, 'Router output B', 26, 10, 35, 10, state === 'route-b' ? 15 : shade),
      line(context, 'Router output C', 26, 17, 35, 17, state === 'route-c' ? 15 : shade),
      box(context, 'Router switch pulse', 10, 8, 14, 12, 15, true, context.visible('pulse')),
    ]
    if (state === 'route-a') primitives.push(line(context, 'Router selected A', 14, 9, 26, 3, 15))
    if (state === 'route-b') primitives.push(line(context, 'Router selected B', 14, 10, 26, 10, 15))
    if (state === 'route-c') primitives.push(line(context, 'Router selected C', 14, 11, 26, 17, 15))
    if (state === 'switching') primitives.push(line(context, 'Router switching A', 14, 9, 25, 5, 12), line(context, 'Router switching B', 14, 11, 25, 15, 15))
    if (state === 'disabled') primitives.push(line(context, 'Router disabled mark', 3, 18, 32, 1, 5))
    if (state === 'error') primitives.push(line(context, 'Router error one', 17, 4, 27, 16, 15), line(context, 'Router error two', 27, 4, 17, 16, 15))
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

const horizontalFader: DisplayComponentRecipe = {
  ...common,
  id: 'horizontal-fader',
  name: 'Horizontal fader',
  category: 'controls',
  description: 'A compact linear control with base and effective value markers.',
  tags: ['slider', 'level', 'rate', 'probability', 'density', 'modulation'],
  footprint: { width: 48, height: 10 },
  states: [{ value: 'normal', name: 'Normal' }, { value: 'focused', name: 'Focused' }, { value: 'modulated', name: 'Modulated' }, { value: 'at-limit', name: 'At limit' }, { value: 'disabled', name: 'Disabled' }],
  defaultState: 'normal',
  inputs: [
    numberInput('value', 'Base value', 'Normalized authored or physical value.', 0.4),
    numberInput('effective', 'Effective value', 'Normalized value after script-owned modulation.', 0.7),
  ],
  scenarios: [
    { id: 'default', name: 'Normal', state: 'normal' },
    { id: 'active', name: 'Modulated', state: 'modulated', values: { value: 0.35, effective: 0.8 } },
    { id: 'edge', name: 'At upper limit', state: 'at-limit', values: { value: 1, effective: 1 } },
  ],
  build: (context, state) => {
    const base = context.number('value', 3, 44)
    const effective = context.number('effective', 3, 44)
    const shade = state === 'disabled' ? 3 : state === 'focused' ? 15 : 9
    const primitives: DisplayPrimitiveElement[] = [
      line(context, 'Fader rail', 2, 5, 45, 5, state === 'disabled' ? 2 : 5),
      line(context, 'Fader minimum tick', 2, 2, 2, 8, shade),
      line(context, 'Fader maximum tick', 45, 2, 45, 8, shade),
      line(context, 'Fader base marker', base, 2, base, 8, state === 'modulated' ? 7 : shade),
    ]
    if (state === 'modulated') primitives.push(line(context, 'Fader effective marker', effective, 1, effective, 9, 15), line(context, 'Fader modulation range', base, 5, effective, 5, 12))
    if (state === 'focused') primitives.push(line(context, 'Fader focus upper', 0, 0, 47, 0, 15), line(context, 'Fader focus lower', 0, 9, 47, 9, 15))
    if (state === 'at-limit') primitives.push(box(context, 'Fader limit stop', 43, 1, 47, 3, 15, true))
    if (state === 'disabled') primitives.push(line(context, 'Fader disabled mark', 4, 8, 43, 1, 3))
    return primitives
  },
}

const threeWaySwitch: DisplayComponentRecipe = {
  ...common,
  id: 'three-way-switch',
  name: 'Three-way switch',
  category: 'controls',
  description: 'A left, centre, or right selector for polarity, range, or direction.',
  tags: ['switch', 'three position', 'polarity', 'range', 'direction', 'mode'],
  footprint: { width: 24, height: 10 },
  states: [{ value: 'left', name: 'Left' }, { value: 'centre', name: 'Centre' }, { value: 'right', name: 'Right' }, { value: 'disabled', name: 'Disabled' }],
  defaultState: 'centre',
  inputs: [booleanInput('focused', 'Focused', 'Shows separate focus rails around the selected control.')],
  scenarios: [
    { id: 'default', name: 'Centre', state: 'centre' },
    { id: 'active', name: 'Right + focused', state: 'right', values: { focused: true } },
    { id: 'edge', name: 'Disabled', state: 'disabled' },
  ],
  build: (context, state) => {
    const shade = state === 'disabled' ? 2 : 8
    const selectedX = state === 'left' ? 4 : state === 'right' ? 19 : 12
    const primitives: DisplayPrimitiveElement[] = [
      line(context, 'Three-way rail', 3, 5, 20, 5, shade),
      line(context, 'Three-way left tick', 4, 2, 4, 8, shade),
      line(context, 'Three-way centre tick', 12, 2, 12, 8, shade),
      line(context, 'Three-way right tick', 19, 2, 19, 8, shade),
      circle(context, 'Three-way thumb', selectedX, 5, 3, state === 'disabled' ? 3 : 15),
      line(context, 'Three-way focus top', 0, 0, 23, 0, 15, context.visible('focused')),
      line(context, 'Three-way focus bottom', 0, 9, 23, 9, 15, context.visible('focused')),
    ]
    if (state === 'disabled') primitives.push(line(context, 'Three-way disabled mark', 2, 8, 21, 1, 3))
    return primitives
  },
}

const bipolarFader: DisplayComponentRecipe = {
  ...common,
  id: 'bipolar-fader',
  name: 'Bipolar fader',
  category: 'controls',
  description: 'A centre-zero fader for offset, pan, attenuversion, swing, or signed CV.',
  tags: ['fader', 'slider', 'bipolar', 'signed', 'pan', 'offset', 'attenuverter'],
  footprint: { width: 48, height: 10 },
  states: [{ value: 'normal', name: 'Normal' }, { value: 'focused', name: 'Focused' }, { value: 'at-limit', name: 'At limit' }, { value: 'disabled', name: 'Disabled' }],
  defaultState: 'normal',
  inputs: [numberInput('value', 'Signed value', 'Signed source normalized from negative to positive into 0 through 1.', 0.5)],
  scenarios: [
    { id: 'default', name: 'Zero', state: 'normal', values: { value: 0.5 } },
    { id: 'active', name: 'Negative focused', state: 'focused', values: { value: 0.2 } },
    { id: 'edge', name: 'Positive limit', state: 'at-limit', values: { value: 1 } },
  ],
  build: (context, state) => {
    const position = context.number('value', 2, 45)
    const shade = state === 'disabled' ? 3 : state === 'focused' ? 15 : 10
    const primitives: DisplayPrimitiveElement[] = [
      line(context, 'Bipolar fader rail', 2, 5, 45, 5, state === 'disabled' ? 2 : 5),
      line(context, 'Bipolar fader zero', 24, 1, 24, 9, 8),
      box(context, 'Bipolar fader amount', 24, 4, position, 6, shade, true),
      line(context, 'Bipolar fader handle', position, 1, position, 9, shade),
    ]
    if (state === 'focused') primitives.push(line(context, 'Bipolar focus top', 0, 0, 47, 0, 15), line(context, 'Bipolar focus bottom', 0, 9, 47, 9, 15))
    if (state === 'at-limit') primitives.push(box(context, 'Bipolar lower stop', 0, 2, 3, 4, 15, true), box(context, 'Bipolar upper stop', 44, 2, 47, 4, 15, true))
    if (state === 'disabled') primitives.push(line(context, 'Bipolar disabled mark', 4, 8, 43, 1, 3))
    return primitives
  },
}

const rangeSlider: DisplayComponentRecipe = {
  ...common,
  id: 'range-slider',
  name: 'Range slider',
  category: 'controls',
  description: 'Three-marker minimum, maximum, and current range control with invalid and clamped states.',
  tags: ['range', 'slider', 'minimum', 'maximum', 'window', 'note', 'voltage'],
  footprint: { width: 56, height: 10 },
  states: [{ value: 'normal', name: 'Normal' }, { value: 'focused', name: 'Focused' }, { value: 'invalid', name: 'Invalid' }, { value: 'clamped', name: 'Clamped' }],
  defaultState: 'normal',
  inputs: [
    numberInput('minimum', 'Minimum', 'Normalized lower range handle.', 0.2),
    numberInput('maximum', 'Maximum', 'Normalized upper range handle.', 0.8),
    numberInput('current', 'Current', 'Normalized current value marker.', 0.5),
  ],
  scenarios: [
    { id: 'default', name: 'Normal window', state: 'normal' },
    { id: 'active', name: 'Focused', state: 'focused', values: { minimum: 0.3, maximum: 0.7, current: 0.55 } },
    { id: 'edge', name: 'Crossed invalid range', state: 'invalid', values: { minimum: 0.8, maximum: 0.2, current: 0.5 } },
  ],
  build: (context, state) => {
    const minimum = context.number('minimum', 2, 53)
    const maximum = context.number('maximum', 2, 53)
    const current = context.number('current', 2, 53)
    const shade = state === 'invalid' ? 15 : state === 'focused' ? 14 : state === 'clamped' ? 12 : 9
    const primitives: DisplayPrimitiveElement[] = [
      line(context, 'Range rail', 2, 5, 53, 5, 4),
      box(context, 'Range window', minimum, 4, maximum, 6, state === 'invalid' ? 5 : 8, true),
      line(context, 'Range minimum', minimum, 1, minimum, 9, shade),
      line(context, 'Range maximum', maximum, 1, maximum, 9, shade),
      line(context, 'Range current', current, 0, current, 9, 15),
    ]
    if (state === 'focused') primitives.push(line(context, 'Range focus top', 0, 0, 55, 0, 15), line(context, 'Range focus bottom', 0, 9, 55, 9, 15))
    if (state === 'invalid') primitives.push(line(context, 'Range invalid one', 24, 1, 32, 8, 15), line(context, 'Range invalid two', 32, 1, 24, 8, 15))
    if (state === 'clamped') primitives.push(box(context, 'Range lower stop', 0, 2, 3, 4, 12, true), box(context, 'Range upper stop', 52, 2, 55, 4, 12, true))
    return primitives
  },
}

const verticalFader: DisplayComponentRecipe = {
  ...common,
  id: 'vertical-fader',
  name: 'Vertical fader',
  category: 'controls',
  description: 'A compact channel fader with separate base and effective-value handles.',
  tags: ['vertical', 'fader', 'slider', 'channel', 'level', 'mixer', 'modulated'],
  footprint: { width: 12, height: 40 },
  states: [{ value: 'normal', name: 'Normal' }, { value: 'focused', name: 'Focused' }, { value: 'modulated', name: 'Modulated' }, { value: 'at-limit', name: 'At limit' }, { value: 'disabled', name: 'Disabled' }],
  defaultState: 'normal',
  inputs: [
    numberInput('value', 'Value', 'Normalized base fader value.', 0.5),
    numberInput('effective', 'Effective value', 'Normalized value after script-owned modulation.', 0.7),
  ],
  scenarios: [
    { id: 'default', name: 'Mid level', state: 'normal' },
    { id: 'active', name: 'Modulated', state: 'modulated', values: { value: 0.35, effective: 0.8 } },
    { id: 'edge', name: 'Upper limit', state: 'at-limit', values: { value: 1, effective: 1 } },
  ],
  build: (context, state) => {
    const base = context.number('value', 37, 2)
    const effective = context.number('effective', 37, 2)
    const shade = state === 'disabled' ? 3 : state === 'focused' ? 15 : state === 'at-limit' ? 14 : 10
    const primitives: DisplayPrimitiveElement[] = [
      line(context, 'Vertical fader rail', 6, 2, 6, 37, state === 'disabled' ? 2 : 5),
      line(context, 'Vertical fader base handle', 2, base, 9, base, state === 'modulated' ? 6 : shade),
    ]
    if (state === 'modulated') primitives.push(line(context, 'Vertical fader effective handle', 1, effective, 10, effective, 15), line(context, 'Vertical fader modulation link', 10, base, 10, effective, 8))
    if (state === 'focused') primitives.push(line(context, 'Vertical fader focus left', 0, 0, 0, 39, 15), line(context, 'Vertical fader focus right', 11, 0, 11, 39, 15))
    if (state === 'at-limit') primitives.push(box(context, 'Vertical fader upper stop', 2, 0, 9, 2, 15, true))
    if (state === 'disabled') primitives.push(line(context, 'Vertical fader disabled mark', 1, 36, 10, 3, 3))
    return primitives
  },
}

const rotaryKnob: DisplayComponentRecipe = {
  ...common,
  id: 'rotary-knob',
  name: 'Rotary knob',
  category: 'controls',
  description: 'A compact continuous control with base, effective, focus, limit, and disabled marks.',
  tags: ['rotary', 'knob', 'pot', 'continuous', 'angle', 'modulated'],
  footprint: { width: 18, height: 18 },
  states: [{ value: 'normal', name: 'Normal' }, { value: 'focused', name: 'Focused' }, { value: 'modulated', name: 'Modulated' }, { value: 'at-limit', name: 'At limit' }, { value: 'disabled', name: 'Disabled' }],
  defaultState: 'normal',
  inputs: [
    numberInput('value', 'Value', 'Normalized base knob value.', 0.5),
    numberInput('effective', 'Effective value', 'Normalized script-owned effective value after modulation.', 0.7),
  ],
  scenarios: [
    { id: 'default', name: 'Midpoint', state: 'normal' },
    { id: 'active', name: 'Modulated high', state: 'modulated', values: { value: 0.35, effective: 0.8 } },
    { id: 'edge', name: 'Upper limit', state: 'at-limit', values: { value: 1, effective: 1 } },
  ],
  build: (context, state) => {
    const base = context.number('value', 3, 15)
    const effective = context.number('effective', 3, 15)
    const shade = state === 'disabled' ? 3 : state === 'focused' || state === 'at-limit' ? 15 : 10
    const primitives: DisplayPrimitiveElement[] = [
      circle(context, 'Rotary knob ring', 9, 9, 7, shade),
      circle(context, 'Rotary knob hub', 9, 9, 2, state === 'disabled' ? 3 : 8),
      line(context, 'Rotary base pointer', 9, 9, base, 4, state === 'modulated' ? 6 : shade),
      line(context, 'Rotary lower tick', 2, 15, 4, 13, 5),
      line(context, 'Rotary upper tick', 16, 15, 14, 13, 5),
    ]
    if (state === 'modulated') primitives.push(line(context, 'Rotary effective pointer', 9, 9, effective, 3, 15), line(context, 'Rotary modulation chord', base, 4, effective, 3, 8))
    if (state === 'focused') primitives.push(line(context, 'Rotary focus top', 3, 0, 15, 0, 15), line(context, 'Rotary focus bottom', 3, 17, 15, 17, 15))
    if (state === 'at-limit') primitives.push(box(context, 'Rotary limit mark', 14, 1, 17, 4, 15, true))
    if (state === 'disabled') primitives.push(line(context, 'Rotary disabled mark', 3, 15, 15, 3, 3))
    return primitives
  },
}

const encoderRing: DisplayComponentRecipe = {
  ...common,
  id: 'encoder-ring',
  name: 'Encoder ring',
  category: 'controls',
  description: 'A stepped encoder indicator with turning direction, push, focus, and disabled marks.',
  tags: ['encoder', 'ring', 'turn', 'push', 'pressed', 'stepped', 'navigation'],
  footprint: { width: 18, height: 18 },
  states: [{ value: 'idle', name: 'Idle' }, { value: 'turning-left', name: 'Turning left' }, { value: 'turning-right', name: 'Turning right' }, { value: 'pressed', name: 'Pressed' }, { value: 'focused', name: 'Focused' }, { value: 'disabled', name: 'Disabled' }],
  defaultState: 'idle',
  inputs: [numberInput('position', 'Step position', 'Normalized encoder or choice position.', 0.5)],
  scenarios: [
    { id: 'default', name: 'Idle midpoint', state: 'idle' },
    { id: 'active', name: 'Turning right', state: 'turning-right', values: { position: 0.75 } },
    { id: 'edge', name: 'Pressed', state: 'pressed', values: { position: 1 } },
  ],
  build: (context, state) => {
    const position = context.number('position', 3, 15)
    const shade = state === 'disabled' ? 3 : state === 'focused' || state === 'pressed' ? 15 : state === 'turning-left' || state === 'turning-right' ? 13 : 8
    const primitives: DisplayPrimitiveElement[] = [
      circle(context, 'Encoder outer ring', 9, 9, 7, shade),
      circle(context, 'Encoder push centre', 9, 9, state === 'pressed' ? 3 : 2, state === 'pressed' ? 15 : 7),
      line(context, 'Encoder position', 9, 9, position, 3, shade),
      line(context, 'Encoder left tick', 1, 9, 3, 9, 5),
      line(context, 'Encoder right tick', 15, 9, 17, 9, 5),
    ]
    if (state === 'turning-left') primitives.push(line(context, 'Encoder left arrow shaft', 3, 2, 8, 0, 15), line(context, 'Encoder left arrow head', 3, 2, 6, 4, 15))
    if (state === 'turning-right') primitives.push(line(context, 'Encoder right arrow shaft', 10, 0, 15, 2, 15), line(context, 'Encoder right arrow head', 15, 2, 12, 4, 15))
    if (state === 'focused') primitives.push(line(context, 'Encoder focus top', 3, 0, 15, 0, 15), line(context, 'Encoder focus bottom', 3, 17, 15, 17, 15))
    if (state === 'disabled') primitives.push(line(context, 'Encoder disabled mark', 3, 15, 15, 3, 3))
    return primitives
  },
}

const xyPadVectorPoint: DisplayComponentRecipe = {
  ...common,
  id: 'xy-pad-vector-point',
  name: 'XY pad vector point',
  category: 'controls',
  description: 'A compact two-axis control with a script-positioned point, optional centre vector, focus, and clipping marks.',
  tags: ['xy', 'vector', 'pad', 'joystick', 'two axis', 'random walk', 'control'],
  footprint: { width: 40, height: 28 },
  states: [{ value: 'idle', name: 'Idle' }, { value: 'moving', name: 'Moving' }, { value: 'focused', name: 'Focused' }, { value: 'clipped', name: 'Clipped' }, { value: 'disabled', name: 'Disabled' }],
  defaultState: 'idle',
  inputs: [
    numberInput('x', 'X position', 'Normalized script-owned horizontal position.', 0.5),
    numberInput('y', 'Y position', 'Normalized script-owned vertical position.', 0.5),
    booleanInput('showVector', 'Show centre vector', 'Connects the centre to the supplied point; this is not an inferred movement history.'),
  ],
  scenarios: [
    { id: 'default', name: 'Centred', state: 'idle' },
    { id: 'active', name: 'Moving vector', state: 'moving', values: { x: 0.78, y: 0.25, showVector: true } },
    { id: 'edge', name: 'Clipped corner', state: 'clipped', values: { x: 1, y: 0 } },
  ],
  build: (context, state) => {
    const x = context.number('x', 3, 36)
    const y = context.number('y', 3, 24)
    const shade = state === 'disabled' ? 2 : state === 'clipped' || state === 'focused' ? 15 : state === 'moving' ? 13 : 8
    const primitives: DisplayPrimitiveElement[] = [
      box(context, 'XY pad frame', 0, 0, 39, 27, shade),
      line(context, 'XY pad horizontal axis', 2, 14, 37, 14, state === 'disabled' ? 2 : 4),
      line(context, 'XY pad vertical axis', 20, 2, 20, 25, state === 'disabled' ? 2 : 4),
      line(context, 'XY centre vector', 20, 14, x, y, 7, context.visible('showVector')),
      circle(context, 'XY point', x, y, state === 'moving' ? 2 : 1, shade),
    ]
    if (state === 'moving') primitives.push(line(context, 'XY moving cross horizontal', context.number('x', 1, 34), y, context.number('x', 5, 38), y, 15))
    if (state === 'focused') primitives.push(line(context, 'XY focus top', 8, 0, 31, 0, 15), line(context, 'XY focus bottom', 8, 27, 31, 27, 15))
    if (state === 'clipped') primitives.push(box(context, 'XY clipped corner', 34, 0, 39, 5, 15, true), line(context, 'XY clipped stop', 32, 6, 38, 0, 15))
    if (state === 'disabled') primitives.push(line(context, 'XY disabled mark', 2, 25, 37, 2, 3))
    return primitives
  },
}

const softTakeoverControl: DisplayComponentRecipe = {
  ...common,
  id: 'soft-takeover-control',
  name: 'Soft takeover control',
  category: 'controls',
  description: 'A pickup display that keeps the target and physical control positions visibly separate until they meet.',
  tags: ['soft takeover', 'pickup', 'catch', 'target', 'physical', 'pot', 'parameter'],
  footprint: { width: 48, height: 12 },
  states: [{ value: 'waiting', name: 'Waiting' }, { value: 'moving', name: 'Moving' }, { value: 'caught', name: 'Caught' }, { value: 'disabled', name: 'Disabled' }, { value: 'error', name: 'Error' }],
  defaultState: 'waiting',
  inputs: [
    numberInput('target', 'Target value', 'Normalized parameter target position.', 0.7),
    numberInput('physical', 'Physical value', 'Normalized physical-control position supplied by the script.', 0.3),
  ],
  scenarios: [
    { id: 'default', name: 'Waiting for pickup', state: 'waiting' },
    { id: 'active', name: 'Moving toward target', state: 'moving', values: { target: 0.7, physical: 0.55 } },
    { id: 'edge', name: 'Caught target', state: 'caught', values: { target: 0.7, physical: 0.7 } },
  ],
  build: (context, state) => {
    const target = context.number('target', 3, 44)
    const physical = context.number('physical', 3, 44)
    const shade = state === 'disabled' ? 2 : state === 'error' ? 15 : state === 'caught' ? 14 : state === 'moving' ? 11 : 8
    const primitives: DisplayPrimitiveElement[] = [
      box(context, 'Takeover frame', 0, 0, 47, 11, shade),
      line(context, 'Takeover rail', 3, 6, 44, 6, state === 'disabled' ? 2 : 4),
      line(context, 'Takeover target', target, 1, target, 7, shade),
      line(context, 'Takeover physical', physical, 6, physical, 10, state === 'disabled' ? 3 : 15),
    ]
    if (state === 'waiting') primitives.push(line(context, 'Takeover waiting left', physical, 9, target, 3, 7), line(context, 'Takeover waiting target', context.number('target', 0, 41), 3, context.number('target', 6, 47), 3, 10))
    if (state === 'moving') primitives.push(line(context, 'Takeover moving link', physical, 9, target, 3, 12))
    if (state === 'caught') primitives.push(box(context, 'Takeover caught mark', context.number('target', 1, 42), 2, context.number('target', 5, 46), 9, 15))
    if (state === 'disabled') primitives.push(line(context, 'Takeover disabled mark', 2, 10, 45, 1, 3))
    if (state === 'error') primitives.push(line(context, 'Takeover error one', 18, 1, 29, 10, 15), line(context, 'Takeover error two', 29, 1, 18, 10, 15))
    return primitives
  },
}

const numericUnitReadout: DisplayComponentRecipe = {
  ...common,
  id: 'numeric-unit-readout',
  name: 'Numeric unit readout',
  category: 'controls',
  description: 'A script-formatted value and unit readout with distinct changing, invalid, and overflow treatments.',
  tags: ['numeric', 'unit', 'readout', 'value', 'voltage', 'frequency', 'bpm', 'milliseconds', 'percentage', 'note'],
  footprint: { width: 48, height: 12 },
  states: [{ value: 'normal', name: 'Normal' }, { value: 'changing', name: 'Changing' }, { value: 'invalid', name: 'Invalid' }, { value: 'overflow', name: 'Overflow' }],
  defaultState: 'normal',
  inputs: [
    textInput('value', 'Value', 'Short value formatted by script state before draw().', '5.00'),
    textInput('unit', 'Unit', 'Short unit suffix such as V, Hz, BPM, ms, %, dB, or st.', 'V'),
  ],
  scenarios: [
    { id: 'default', name: 'Five volts', state: 'normal' },
    { id: 'active', name: 'Changing tempo', state: 'changing', values: { value: '128', unit: 'BPM' } },
    { id: 'edge', name: 'Overflow', state: 'overflow', values: { value: '999+', unit: 'Hz' } },
  ],
  build: (context, state) => {
    const shade = state === 'invalid' || state === 'overflow' ? 15 : state === 'changing' ? 13 : 9
    const primitives: DisplayPrimitiveElement[] = [
      box(context, 'Numeric readout frame', 0, 0, 47, 11, shade),
      line(context, 'Numeric readout divider', 32, 1, 32, 10, state === 'normal' ? 4 : shade),
    ]
    if (state === 'invalid') primitives.push(tinyText(context, 'Numeric invalid value', 29, 8, 'ERR', 15, 'right'), line(context, 'Numeric invalid mark', 3, 10, 13, 1, 15))
    else primitives.push(tinyText(context, 'Numeric value', 29, 8, context.text('value'), shade, 'right'))
    primitives.push(tinyText(context, 'Numeric unit', 45, 8, context.text('unit'), shade, 'right'))
    if (state === 'changing') primitives.push(line(context, 'Numeric changing upper', 2, 1, 8, 1, 15), line(context, 'Numeric changing lower', 2, 10, 8, 10, 15))
    if (state === 'overflow') primitives.push(line(context, 'Numeric overflow left', 2, 3, 6, 6, 15), line(context, 'Numeric overflow right', 6, 6, 2, 9, 15))
    return primitives
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

const directionBadge: DisplayComponentRecipe = {
  ...common,
  id: 'direction-badge',
  name: 'Direction badge',
  category: 'signals',
  description: 'A compact arrow badge for input, output, thru, send, return, or feedback.',
  tags: ['arrow', 'routing', 'in', 'out', 'thru', 'send', 'return', 'feedback'],
  footprint: { width: 24, height: 12 },
  states: [{ value: 'in', name: 'In' }, { value: 'out', name: 'Out' }, { value: 'thru', name: 'Thru' }, { value: 'send', name: 'Send' }, { value: 'return', name: 'Return' }, { value: 'feedback', name: 'Feedback' }],
  defaultState: 'in',
  inputs: [booleanInput('active', 'Active', 'Adds a bright event marker without changing direction.')],
  scenarios: [
    { id: 'default', name: 'Input', state: 'in' },
    { id: 'active', name: 'Output active', state: 'out', values: { active: true } },
    { id: 'edge', name: 'Feedback', state: 'feedback', values: { active: true } },
  ],
  build: (context, state) => {
    const reversed = state === 'in' || state === 'return'
    const shade = state === 'feedback' ? 15 : state === 'send' || state === 'return' ? 12 : 9
    const primitives: DisplayPrimitiveElement[] = [box(context, 'Direction frame', 0, 0, 23, 11, 4)]
    if (state === 'thru') primitives.push(
      line(context, 'Thru shaft', 3, 6, 20, 6, shade),
      line(context, 'Thru left upper', 3, 6, 7, 2, shade),
      line(context, 'Thru left lower', 3, 6, 7, 10, shade),
      line(context, 'Thru right upper', 20, 6, 16, 2, shade),
      line(context, 'Thru right lower', 20, 6, 16, 10, shade),
    )
    else if (state === 'feedback') primitives.push(
      line(context, 'Feedback top', 4, 3, 18, 3, shade),
      line(context, 'Feedback right', 18, 3, 18, 9, shade),
      line(context, 'Feedback bottom', 18, 9, 6, 9, shade),
      line(context, 'Feedback head upper', 6, 9, 9, 6, shade),
      line(context, 'Feedback head lower', 6, 9, 9, 11, shade),
    )
    else {
      const start = reversed ? 20 : 3
      const end = reversed ? 4 : 20
      const headBase = reversed ? 8 : 16
      primitives.push(
        line(context, 'Direction shaft', start, 6, end, 6, shade),
        line(context, 'Direction head upper', end, 6, headBase, 2, shade),
        line(context, 'Direction head lower', end, 6, headBase, 10, shade),
      )
      if (state === 'send' || state === 'return') primitives.push(line(context, 'Direction bus mark', 11, 2, 11, 10, 7))
    }
    primitives.push(box(context, 'Direction activity', 1, 1, 3, 3, 15, true, context.visible('active')))
    return primitives
  },
}

const polarityBadge: DisplayComponentRecipe = {
  ...common,
  id: 'polarity-badge',
  name: 'Polarity range badge',
  category: 'signals',
  description: 'A compact shape-coded qualifier for positive, negative, bipolar, inverted, centred, or clamped CV.',
  tags: ['polarity', 'range', 'positive', 'negative', 'bipolar', 'invert', 'clamp', 'cv'],
  footprint: { width: 32, height: 12 },
  states: [{ value: 'positive', name: 'Positive' }, { value: 'negative', name: 'Negative' }, { value: 'bipolar', name: 'Bipolar' }, { value: 'inverted', name: 'Inverted' }, { value: 'zero-centred', name: 'Zero centred' }, { value: 'clamped', name: 'Clamped' }],
  defaultState: 'bipolar',
  inputs: [booleanInput('warning', 'Warning', 'Adds a bright top marker without replacing the range shape.')],
  scenarios: [
    { id: 'default', name: 'Bipolar', state: 'bipolar' },
    { id: 'active', name: 'Positive', state: 'positive' },
    { id: 'edge', name: 'Clamped warning', state: 'clamped', values: { warning: true } },
  ],
  build: (context, state) => {
    const primitives: DisplayPrimitiveElement[] = [box(context, 'Polarity frame', 0, 0, 31, 11, 4), line(context, 'Polarity zero rail', 3, 6, 20, 6, 6)]
    if (state === 'positive') primitives.push(line(context, 'Positive stem', 11, 9, 11, 2, 13), line(context, 'Positive head left', 11, 2, 8, 5, 13), line(context, 'Positive head right', 11, 2, 14, 5, 13))
    if (state === 'negative') primitives.push(line(context, 'Negative stem', 11, 2, 11, 9, 13), line(context, 'Negative head left', 11, 9, 8, 6, 13), line(context, 'Negative head right', 11, 9, 14, 6, 13))
    if (state === 'bipolar') primitives.push(line(context, 'Bipolar stem', 11, 1, 11, 10, 14), line(context, 'Bipolar positive bar', 8, 2, 14, 2, 12), line(context, 'Bipolar negative bar', 8, 9, 14, 9, 12))
    if (state === 'inverted') primitives.push(line(context, 'Inverted slope', 5, 2, 17, 9, 13), line(context, 'Inverted head', 17, 9, 13, 9, 13), line(context, 'Inverted cross', 8, 9, 15, 2, 7))
    if (state === 'zero-centred') primitives.push(line(context, 'Centred vertical', 11, 2, 11, 10, 15), box(context, 'Centred point', 9, 4, 13, 8, 10))
    if (state === 'clamped') primitives.push(line(context, 'Clamp lower stop', 5, 2, 5, 10, 13), line(context, 'Clamp upper stop', 17, 2, 17, 10, 13), line(context, 'Clamp range', 5, 4, 17, 8, 10))
    primitives.push(tinyText(context, 'Polarity label', 29, 9, state === 'positive' ? '+' : state === 'negative' ? '-' : state === 'bipolar' ? '+-' : state === 'inverted' ? 'INV' : state === 'zero-centred' ? '0' : 'CL', 9, 'right'))
    primitives.push(line(context, 'Polarity warning', 22, 1, 30, 1, 15, context.visible('warning')))
    return primitives
  },
}

const unitBadge: DisplayComponentRecipe = {
  ...common,
  id: 'unit-badge',
  name: 'Unit badge',
  category: 'signals',
  description: 'A compact unit label for voltage, pitch, time, rate, level, ratio, or steps.',
  tags: ['unit', 'volts', 'semitones', 'octaves', 'hertz', 'bpm', 'milliseconds', 'percent', 'db'],
  footprint: { width: 32, height: 12 },
  states: [
    { value: 'volts', name: 'Volts' }, { value: 'semitones', name: 'Semitones' }, { value: 'octaves', name: 'Octaves' },
    { value: 'hertz', name: 'Hertz' }, { value: 'bpm', name: 'BPM' }, { value: 'milliseconds', name: 'Milliseconds' },
    { value: 'seconds', name: 'Seconds' }, { value: 'percent', name: 'Percent' }, { value: 'decibels', name: 'Decibels' },
    { value: 'multiplier', name: 'Multiplier' }, { value: 'steps', name: 'Steps' }, { value: 'invalid', name: 'Invalid' },
  ],
  defaultState: 'volts',
  inputs: [],
  scenarios: [
    { id: 'default', name: 'Volts', state: 'volts' },
    { id: 'active', name: 'BPM', state: 'bpm' },
    { id: 'edge', name: 'Invalid', state: 'invalid' },
  ],
  build: (context, state) => {
    const label = state === 'volts' ? 'V' : state === 'semitones' ? 'st' : state === 'octaves' ? 'oct' : state === 'hertz' ? 'Hz' : state === 'bpm' ? 'BPM' : state === 'milliseconds' ? 'ms' : state === 'seconds' ? 's' : state === 'percent' ? '%' : state === 'decibels' ? 'dB' : state === 'multiplier' ? 'x' : state === 'steps' ? 'steps' : 'ERR'
    const shade = state === 'invalid' ? 15 : 9
    return [
      box(context, 'Unit frame', 0, 0, 31, 11, shade),
      tinyText(context, 'Unit label', 16, 8, label, shade, 'centre'),
      ...(state === 'invalid' ? [line(context, 'Unit invalid mark', 2, 10, 29, 1, 15)] : []),
    ]
  },
}

const channelVoiceBadge: DisplayComponentRecipe = {
  ...common,
  id: 'channel-voice-badge',
  name: 'Channel voice badge',
  category: 'signals',
  description: 'A consistent channel identity badge with active, mute, solo, and selection shapes.',
  tags: ['channel', 'voice', 'number', 'mixer', 'sequencer', 'mute', 'solo', 'selected'],
  footprint: { width: 32, height: 12 },
  states: [{ value: 'inactive', name: 'Inactive' }, { value: 'active', name: 'Active' }, { value: 'muted', name: 'Muted' }, { value: 'solo', name: 'Solo' }, { value: 'selected', name: 'Selected' }],
  defaultState: 'inactive',
  inputs: [textInput('label', 'Channel label', 'Short channel number, letter, or voice label.', '1')],
  scenarios: [
    { id: 'default', name: 'Channel 1', state: 'inactive' },
    { id: 'active', name: 'Active voice', state: 'active', values: { label: 'A' } },
    { id: 'edge', name: 'Muted', state: 'muted', values: { label: '4' } },
  ],
  build: (context, state) => {
    const shade = state === 'inactive' ? 5 : state === 'muted' ? 3 : state === 'solo' || state === 'selected' ? 15 : 12
    const primitives: DisplayPrimitiveElement[] = [
      box(context, 'Channel badge frame', 0, 0, 31, 11, shade, state === 'active'),
      tinyText(context, 'Channel badge label', 16, 8, context.text('label'), state === 'active' ? 0 : shade, 'centre'),
    ]
    if (state === 'muted') primitives.push(line(context, 'Channel mute', 2, 10, 29, 1, 6))
    if (state === 'solo') primitives.push(tinyText(context, 'Channel solo mark', 29, 8, 'S', 15, 'right'), line(context, 'Channel solo rail', 1, 1, 1, 10, 15))
    if (state === 'selected') primitives.push(line(context, 'Channel selected top', 0, 0, 31, 0, 15), line(context, 'Channel selected bottom', 0, 11, 31, 11, 15))
    return primitives
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

const clampProcessor: DisplayComponentRecipe = {
  ...common,
  id: 'clamp-processor',
  name: 'Clamp processor',
  category: 'processors',
  description: 'A transfer-shape tile with explicit lower and upper bounds.',
  tags: ['bounds', 'limit', 'window', 'clip', 'waveshaping', 'voltage'],
  footprint: { width: 36, height: 18 },
  states: [{ value: 'idle', name: 'Idle' }, { value: 'processing', name: 'Processing' }, { value: 'bypassed', name: 'Bypassed' }, { value: 'clipped', name: 'Clipped' }, { value: 'error', name: 'Error' }],
  defaultState: 'idle',
  inputs: [
    numberInput('lower', 'Lower bound', 'Normalized script-owned lower clamp threshold.', 0.25),
    numberInput('upper', 'Upper bound', 'Normalized script-owned upper clamp threshold.', 0.75),
  ],
  scenarios: [
    { id: 'default', name: 'Idle', state: 'idle' },
    { id: 'active', name: 'Processing', state: 'processing', values: { lower: 0.2, upper: 0.8 } },
    { id: 'edge', name: 'Clipped output', state: 'clipped', values: { lower: 0.1, upper: 0.65 } },
  ],
  build: (context, state) => {
    const lower = context.number('lower', 4, 14)
    const upper = context.number('upper', 19, 31)
    const shade = state === 'error' || state === 'clipped' ? 15 : state === 'processing' ? 13 : state === 'bypassed' ? 4 : 8
    const primitives: DisplayPrimitiveElement[] = [
      line(context, 'Clamp input', 0, 9, 4, 9, shade),
      line(context, 'Clamp lower shelf', 4, 13, lower, 13, shade),
      line(context, 'Clamp transfer', lower, 13, upper, 4, shade),
      line(context, 'Clamp upper shelf', upper, 4, 31, 4, shade),
      line(context, 'Clamp output', 31, 9, 35, 9, shade),
      line(context, 'Clamp lower rail', lower, 2, lower, 15, 5),
      line(context, 'Clamp upper rail', upper, 2, upper, 15, 5),
    ]
    if (state === 'bypassed') primitives.push(line(context, 'Clamp bypass', 1, 2, 34, 2, 10))
    if (state === 'clipped') primitives.push(box(context, 'Clamp clip flag', 31, 1, 35, 3, 15, true))
    if (state === 'error') primitives.push(line(context, 'Clamp error one', 13, 3, 23, 14, 15), line(context, 'Clamp error two', 23, 3, 13, 14, 15))
    return primitives
  },
}

const sampleHoldProcessor: DisplayComponentRecipe = {
  ...common,
  id: 'sample-hold-processor',
  name: 'Sample and hold',
  category: 'processors',
  description: 'A sampling tile that separates acquisition, hold, bypass, and error states.',
  tags: ['sample and hold', 's&h', 'sampling', 'hold', 'clock', 'random voltage'],
  footprint: { width: 36, height: 18 },
  states: [{ value: 'idle', name: 'Idle' }, { value: 'sampling', name: 'Sampling' }, { value: 'holding', name: 'Holding' }, { value: 'bypassed', name: 'Bypassed' }, { value: 'error', name: 'Error' }],
  defaultState: 'idle',
  inputs: [
    numberInput('value', 'Held value', 'Normalized script-owned held output value.', 0.5),
    booleanInput('clockPulse', 'Clock pulse', 'Shows a pulse captured by trigger or step state outside drawing.'),
  ],
  scenarios: [
    { id: 'default', name: 'Holding midpoint', state: 'holding', values: { value: 0.5 } },
    { id: 'active', name: 'Sampling pulse', state: 'sampling', values: { value: 0.8, clockPulse: true } },
    { id: 'edge', name: 'Error', state: 'error', values: { value: 0 } },
  ],
  build: (context, state) => {
    const shade = state === 'error' ? 15 : state === 'sampling' ? 14 : state === 'holding' ? 11 : state === 'bypassed' ? 4 : 7
    const valueY = context.number('value', 14, 3)
    const primitives: DisplayPrimitiveElement[] = [
      line(context, 'Sample input', 0, 9, 6, 9, shade),
      box(context, 'Sample body', 6, 2, 29, 15, shade),
      tinyText(context, 'Sample label', 9, 10, 'S/H', shade),
      line(context, 'Sample output', 29, valueY, 35, valueY, shade),
      line(context, 'Sample value marker', 27, valueY, 31, valueY, 15),
      line(context, 'Sample clock stem', 18, 15, 18, 17, 8),
      box(context, 'Sample clock pulse', 16, 14, 20, 17, 15, true, context.visible('clockPulse')),
    ]
    if (state === 'sampling') primitives.push(line(context, 'Sampling edge', 7, 13, 15, 4, 15))
    if (state === 'holding') primitives.push(line(context, 'Holding shelf', 20, valueY, 28, valueY, 15))
    if (state === 'bypassed') primitives.push(line(context, 'Sample bypass', 1, 1, 34, 1, 10))
    if (state === 'error') primitives.push(line(context, 'Sample error one', 10, 4, 25, 13, 15), line(context, 'Sample error two', 25, 4, 10, 13, 15))
    return primitives
  },
}

const logicProcessor: DisplayComponentRecipe = {
  ...common,
  id: 'logic-processor',
  name: 'Logic processor',
  category: 'processors',
  description: 'A gate-logic tile with independent input and output truth marks.',
  tags: ['logic', 'and', 'or', 'xor', 'not', 'gate', 'boolean'],
  footprint: { width: 40, height: 18 },
  states: [{ value: 'and', name: 'AND' }, { value: 'or', name: 'OR' }, { value: 'xor', name: 'XOR' }, { value: 'not', name: 'NOT' }, { value: 'error', name: 'Error' }],
  defaultState: 'and',
  inputs: [
    booleanInput('inputA', 'Input A high', 'Shows the script-owned first gate truth value.'),
    booleanInput('inputB', 'Input B high', 'Shows the script-owned second gate truth value.'),
    booleanInput('outputHigh', 'Output high', 'Shows the calculated output truth value.'),
    booleanInput('pulse', 'Pulse', 'Shows a short script-maintained event mark.'),
  ],
  scenarios: [
    { id: 'default', name: 'AND low', state: 'and' },
    { id: 'active', name: 'XOR high', state: 'xor', values: { inputA: true, outputHigh: true, pulse: true } },
    { id: 'edge', name: 'Error', state: 'error', values: { inputA: true, inputB: true } },
  ],
  build: (context, state) => {
    const shade = state === 'error' ? 15 : 9
    const label = state === 'and' ? 'AND' : state === 'or' ? 'OR' : state === 'xor' ? 'XOR' : state === 'not' ? 'NOT' : 'ERR'
    const primitives: DisplayPrimitiveElement[] = [
      box(context, 'Logic body', 7, 1, 32, 16, shade),
      tinyText(context, 'Logic label', 20, 11, label, shade, 'centre'),
      line(context, 'Logic input A', 0, 5, 7, 5, shade),
      line(context, 'Logic output', 32, 9, 39, 9, shade),
      box(context, 'Logic input A high', 1, 3, 4, 6, 15, true, context.visible('inputA')),
      box(context, 'Logic output high', 35, 7, 38, 10, 15, true, context.visible('outputHigh')),
      box(context, 'Logic pulse', 18, 0, 22, 2, 15, true, context.visible('pulse')),
    ]
    if (state !== 'not') primitives.push(line(context, 'Logic input B', 0, 13, 7, 13, shade), box(context, 'Logic input B high', 1, 11, 4, 14, 15, true, context.visible('inputB')))
    if (state === 'not') primitives.push(circle(context, 'Logic invert bubble', 32, 9, 2, 13))
    if (state === 'error') primitives.push(line(context, 'Logic error one', 11, 3, 28, 14, 15), line(context, 'Logic error two', 28, 3, 11, 14, 15))
    return primitives
  },
}

const bernoulliRouter: DisplayComponentRecipe = {
  ...common,
  id: 'bernoulli-router',
  name: 'Bernoulli router',
  category: 'processors',
  description: 'A probability-controlled A/B event router with an explicit most-recent decision.',
  tags: ['probability', 'bernoulli', 'random', 'router', 'skip', 'gate', 'chance'],
  footprint: { width: 48, height: 20 },
  states: [{ value: 'idle', name: 'Idle' }, { value: 'chosen-a', name: 'Chosen A' }, { value: 'chosen-b', name: 'Chosen B' }, { value: 'skipped', name: 'Skipped' }, { value: 'error', name: 'Error' }],
  defaultState: 'idle',
  inputs: [
    numberInput('probability', 'Probability', 'Normalized authored probability of choosing branch A.', 0.5),
    booleanInput('fired', 'Fired', 'Shows a short script-maintained decision event mark.'),
  ],
  scenarios: [
    { id: 'default', name: 'Idle at 50%', state: 'idle' },
    { id: 'active', name: 'Chose A', state: 'chosen-a', values: { probability: 0.75, fired: true } },
    { id: 'edge', name: 'Skipped', state: 'skipped', values: { probability: 0.1, fired: true } },
  ],
  build: (context, state) => {
    const shade = state === 'error' ? 15 : state === 'idle' ? 6 : state === 'skipped' ? 5 : 13
    const primitives: DisplayPrimitiveElement[] = [
      line(context, 'Bernoulli input', 0, 10, 10, 10, shade),
      circle(context, 'Bernoulli node', 13, 10, 3, shade),
      line(context, 'Bernoulli branch A', 16, 9, 30, 4, state === 'chosen-a' ? 15 : shade),
      line(context, 'Bernoulli branch B', 16, 11, 30, 16, state === 'chosen-b' ? 15 : shade),
      tinyText(context, 'Bernoulli A label', 34, 6, 'A', state === 'chosen-a' ? 15 : 7),
      tinyText(context, 'Bernoulli B label', 34, 19, 'B', state === 'chosen-b' ? 15 : 7),
      line(context, 'Bernoulli probability rail', 36, 10, 47, 10, 4),
      line(context, 'Bernoulli probability marker', context.number('probability', 36, 47), 8, context.number('probability', 36, 47), 12, 15),
      box(context, 'Bernoulli fired', 11, 8, 15, 12, 15, true, context.visible('fired')),
    ]
    if (state === 'skipped') primitives.push(line(context, 'Bernoulli skip', 19, 4, 28, 16, 10))
    if (state === 'error') primitives.push(line(context, 'Bernoulli error one', 18, 5, 29, 15, 15), line(context, 'Bernoulli error two', 29, 5, 18, 15, 15))
    return primitives
  },
}

const attenuverterProcessor: DisplayComponentRecipe = {
  ...common,
  id: 'attenuverter-processor',
  name: 'Attenuverter processor',
  category: 'processors',
  description: 'A centre-zero level and polarity tile with explicit processing, bypass, saturation, and error states.',
  tags: ['attenuverter', 'polarity', 'invert', 'signed', 'gain', 'level', 'vca'],
  footprint: { width: 40, height: 18 },
  states: [{ value: 'idle', name: 'Idle' }, { value: 'processing', name: 'Processing' }, { value: 'bypassed', name: 'Bypassed' }, { value: 'saturated', name: 'Saturated' }, { value: 'error', name: 'Error' }],
  defaultState: 'idle',
  inputs: [
    numberInput('amount', 'Signed amount', 'Signed amount normalized from negative to positive into 0 through 1.', 0.5),
    booleanInput('inputActive', 'Input active', 'Shows a script-owned input activity mark.'),
    booleanInput('outputActive', 'Output active', 'Shows a script-owned output activity mark.'),
  ],
  scenarios: [
    { id: 'default', name: 'Zero amount', state: 'idle' },
    { id: 'active', name: 'Inverting', state: 'processing', values: { amount: 0.2, inputActive: true, outputActive: true } },
    { id: 'edge', name: 'Saturated positive', state: 'saturated', values: { amount: 1, inputActive: true, outputActive: true } },
  ],
  build: (context, state) => {
    const amount = context.number('amount', 8, 31)
    const shade = state === 'error' || state === 'saturated' ? 15 : state === 'processing' ? 13 : state === 'bypassed' ? 4 : 8
    const primitives: DisplayPrimitiveElement[] = [
      line(context, 'Attenuverter input', 0, 9, 6, 9, shade),
      box(context, 'Attenuverter body', 6, 2, 33, 15, shade),
      line(context, 'Attenuverter zero rail', 20, 3, 20, 14, 6),
      line(context, 'Attenuverter amount rail', 8, 9, 31, 9, 5),
      line(context, 'Attenuverter amount', amount, 5, amount, 13, shade),
      line(context, 'Attenuverter output', 33, 9, 39, 9, shade),
      box(context, 'Attenuverter input activity', 0, 7, 3, 11, 15, true, context.visible('inputActive')),
      box(context, 'Attenuverter output activity', 36, 7, 39, 11, 15, true, context.visible('outputActive')),
    ]
    if (state === 'processing') primitives.push(line(context, 'Attenuverter transfer', 10, 13, 30, 4, 14))
    if (state === 'bypassed') primitives.push(line(context, 'Attenuverter bypass', 2, 1, 37, 1, 10))
    if (state === 'saturated') primitives.push(box(context, 'Attenuverter saturation', 29, 2, 33, 4, 15, true))
    if (state === 'error') primitives.push(line(context, 'Attenuverter error one', 14, 4, 26, 14, 15), line(context, 'Attenuverter error two', 26, 4, 14, 14, 15))
    return primitives
  },
}

const slewProcessor: DisplayComponentRecipe = {
  ...common,
  id: 'slew-processor',
  name: 'Slew processor',
  category: 'processors',
  description: 'A time-response tile that distinguishes rising, falling, holding, bypass, and error states.',
  tags: ['slew', 'lag', 'glide', 'smoothing', 'low pass', 'rise', 'fall', 'time response'],
  footprint: { width: 44, height: 20 },
  states: [{ value: 'idle', name: 'Idle' }, { value: 'rising', name: 'Rising' }, { value: 'falling', name: 'Falling' }, { value: 'holding', name: 'Holding' }, { value: 'bypassed', name: 'Bypassed' }, { value: 'error', name: 'Error' }],
  defaultState: 'idle',
  inputs: [
    numberInput('input', 'Input level', 'Normalized current input level.', 0.7),
    numberInput('output', 'Output level', 'Normalized current slewed output level.', 0.45),
    numberInput('rate', 'Slew rate', 'Normalized rise or fall rate marker.', 0.5),
  ],
  scenarios: [
    { id: 'default', name: 'Idle', state: 'idle' },
    { id: 'active', name: 'Rising output', state: 'rising', values: { input: 0.85, output: 0.5, rate: 0.7 } },
    { id: 'edge', name: 'Bypassed', state: 'bypassed', values: { input: 0.9, output: 0.9, rate: 1 } },
  ],
  build: (context, state) => {
    const inputY = context.number('input', 16, 3)
    const outputY = context.number('output', 16, 3)
    const rateX = context.number('rate', 14, 31)
    const shade = state === 'error' ? 15 : state === 'bypassed' ? 4 : state === 'rising' || state === 'falling' ? 13 : state === 'holding' ? 10 : 7
    const primitives: DisplayPrimitiveElement[] = [
      line(context, 'Slew input', 0, inputY, 8, inputY, shade),
      box(context, 'Slew body', 8, 1, 35, 18, shade),
      line(context, 'Slew response start', 11, inputY, rateX, outputY, shade),
      line(context, 'Slew response end', rateX, outputY, 32, outputY, shade),
      line(context, 'Slew output', 35, outputY, 43, outputY, shade),
      line(context, 'Slew rate marker', rateX, 3, rateX, 16, state === 'idle' ? 6 : 15),
    ]
    if (state === 'rising') primitives.push(line(context, 'Slew rise head left', 32, outputY, 29, 3, 15))
    if (state === 'falling') primitives.push(line(context, 'Slew fall head right', 32, outputY, 29, 16, 15))
    if (state === 'holding') primitives.push(box(context, 'Slew hold mark', 20, 7, 23, 11, 12, true))
    if (state === 'bypassed') primitives.push(line(context, 'Slew bypass', 2, 1, 41, 1, 10))
    if (state === 'error') primitives.push(line(context, 'Slew error one', 16, 4, 28, 16, 15), line(context, 'Slew error two', 28, 4, 16, 16, 15))
    return primitives
  },
}

const pitchQuantizerProcessor: DisplayComponentRecipe = {
  ...common,
  id: 'pitch-quantizer-processor',
  name: 'Pitch quantizer processor',
  category: 'processors',
  description: 'A pitch-grid tile that separates input, accepted output, rejected, bypass, and error states.',
  tags: ['pitch', 'quantizer', 'scale', 'grid', 'pitch grid', 'note', 'accepted', 'rejected', 'semitone'],
  footprint: { width: 52, height: 20 },
  states: [{ value: 'idle', name: 'Idle' }, { value: 'quantized', name: 'Quantized' }, { value: 'rejected', name: 'Rejected' }, { value: 'bypassed', name: 'Bypassed' }, { value: 'error', name: 'Error' }],
  defaultState: 'idle',
  inputs: [
    numberInput('input', 'Input pitch', 'Normalized input pitch position in the displayed range.', 0.42),
    numberInput('output', 'Output pitch', 'Normalized quantized output pitch position.', 0.5),
    textInput('scale', 'Scale', 'Short script-formatted scale label.', 'MAJ'),
  ],
  scenarios: [
    { id: 'default', name: 'Idle grid', state: 'idle' },
    { id: 'active', name: 'Accepted note', state: 'quantized', values: { input: 0.47, output: 0.5, scale: 'MIN' } },
    { id: 'edge', name: 'Rejected note', state: 'rejected', values: { input: 0.9, output: 0.75, scale: 'PENTA' } },
  ],
  build: (context, state) => {
    const inputX = context.number('input', 3, 36)
    const outputX = context.number('output', 3, 36)
    const shade = state === 'error' ? 15 : state === 'bypassed' ? 4 : state === 'quantized' ? 13 : state === 'rejected' ? 10 : 7
    const primitives: DisplayPrimitiveElement[] = [
      box(context, 'Quantizer frame', 0, 0, 51, 19, shade),
      line(context, 'Quantizer pitch rail', 3, 11, 36, 11, 5),
      line(context, 'Quantizer input marker', inputX, 4, inputX, 15, state === 'rejected' ? 15 : 9),
      line(context, 'Quantizer output marker', outputX, 2, outputX, 17, state === 'quantized' ? 15 : shade),
      tinyText(context, 'Quantizer scale label', 49, 8, context.text('scale'), shade, 'right'),
    ]
    for (const x of [8, 14, 20, 26, 32]) primitives.push(line(context, `Quantizer grid ${x}`, x, 9, x, 13, 4))
    if (state === 'quantized') primitives.push(line(context, 'Quantizer accepted link', inputX, 16, outputX, 16, 15))
    if (state === 'rejected') primitives.push(line(context, 'Quantizer reject one', 40, 10, 48, 17, 15), line(context, 'Quantizer reject two', 48, 10, 40, 17, 15))
    if (state === 'bypassed') primitives.push(line(context, 'Quantizer bypass', 2, 2, 49, 2, 10))
    if (state === 'error') primitives.push(line(context, 'Quantizer error one', 17, 4, 29, 16, 15), line(context, 'Quantizer error two', 29, 4, 17, 16, 15))
    return primitives
  },
}

const comparatorProcessor: DisplayComponentRecipe = {
  ...common,
  id: 'comparator-processor',
  name: 'Comparator processor',
  category: 'processors',
  description: 'A two-input comparison tile with explicit low/high result, selection, bypass, and error geometry.',
  tags: ['comparator', 'comparison', 'threshold', 'greater than', 'gate', 'logic', 'processor'],
  footprint: { width: 40, height: 18 },
  states: [{ value: 'low', name: 'Result low' }, { value: 'high', name: 'Result high' }, { value: 'selected', name: 'Selected' }, { value: 'bypassed', name: 'Bypassed' }, { value: 'error', name: 'Error' }],
  defaultState: 'low',
  inputs: [
    numberInput('a', 'Input A', 'Normalized first operand position.', 0.4),
    numberInput('b', 'Input B', 'Normalized second operand position or threshold.', 0.6),
  ],
  scenarios: [
    { id: 'default', name: 'A below B', state: 'low', values: { a: 0.35, b: 0.65 } },
    { id: 'active', name: 'A above B', state: 'high', values: { a: 0.8, b: 0.45 } },
    { id: 'edge', name: 'Invalid operands', state: 'error', values: { a: 1, b: 0 } },
  ],
  build: (context, state) => {
    const shade = state === 'bypassed' ? 3 : state === 'error' || state === 'selected' ? 15 : state === 'high' ? 13 : 7
    const primitives: DisplayPrimitiveElement[] = [
      box(context, 'Comparator frame', 0, 0, 39, 17, shade),
      line(context, 'Comparator input A', 0, 5, 9, 5, shade),
      line(context, 'Comparator input B', 0, 12, 9, 12, shade),
      line(context, 'Comparator A level', context.number('a', 2, 8), 3, context.number('a', 2, 8), 7, shade),
      line(context, 'Comparator B level', context.number('b', 2, 8), 10, context.number('b', 2, 8), 14, shade),
      line(context, 'Comparator upper glyph', 13, 5, 22, 9, shade),
      line(context, 'Comparator lower glyph', 13, 13, 22, 9, shade),
      line(context, 'Comparator output', 22, 9, 39, 9, shade),
    ]
    if (state === 'high') primitives.push(box(context, 'Comparator high result', 31, 6, 36, 12, 15, true))
    if (state === 'selected') primitives.push(line(context, 'Comparator selected top', 5, 0, 34, 0, 15), line(context, 'Comparator selected bottom', 5, 17, 34, 17, 15))
    if (state === 'bypassed') primitives.push(line(context, 'Comparator bypass', 7, 15, 33, 2, 5))
    if (state === 'error') primitives.push(line(context, 'Comparator error one', 26, 3, 36, 14, 15), line(context, 'Comparator error two', 36, 3, 26, 14, 15))
    return primitives
  },
}

const clockTransformProcessor: DisplayComponentRecipe = {
  ...common,
  id: 'clock-transform-processor',
  name: 'Clock transform processor',
  category: 'processors',
  description: 'A clock utility tile for divide, multiply, swing, ratchet, and burst operations with script-owned phase, pulse, and lock state.',
  tags: ['clock', 'divide', 'multiply', 'swing', 'ratchet', 'burst', 'clock transform', 'processor'],
  footprint: { width: 48, height: 18 },
  states: [{ value: 'divide', name: 'Divide' }, { value: 'multiply', name: 'Multiply' }, { value: 'swing', name: 'Swing' }, { value: 'ratchet', name: 'Ratchet' }, { value: 'burst', name: 'Burst' }, { value: 'error', name: 'Error' }],
  defaultState: 'divide',
  inputs: [
    textInput('ratio', 'Ratio', 'Short script-formatted clock ratio such as /4, x2, or 3:2.', '/4'),
    numberInput('phase', 'Phase', 'Normalized script-owned clock phase.', 0),
    booleanInput('pulse', 'Pulse', 'Shows a pulse captured by script state outside draw().'),
    booleanInput('locked', 'Locked', 'Shows that the script has a valid measured clock period.'),
    booleanInput('searching', 'Searching', 'Shows that the script is waiting for a valid clock period.'),
  ],
  scenarios: [
    { id: 'default', name: 'Divide by four', state: 'divide', values: { ratio: '/4', phase: 0.25 } },
    { id: 'active', name: 'Locked swing pulse', state: 'swing', values: { ratio: '54%', phase: 0.7, pulse: true, locked: true } },
    { id: 'edge', name: 'Searching multiplier', state: 'multiply', values: { ratio: 'x2', phase: 0, searching: true } },
  ],
  build: (context, state) => {
    const shade = state === 'error' ? 15 : state === 'burst' || state === 'ratchet' ? 13 : state === 'swing' ? 11 : 8
    const phase = context.number('phase', 20, 44)
    const primitives: DisplayPrimitiveElement[] = [
      box(context, 'Clock transform frame', 0, 0, 47, 17, shade),
      line(context, 'Clock transform input', 0, 9, 6, 9, shade),
      line(context, 'Clock transform output', 15, 9, 47, 9, shade),
      tinyText(context, 'Clock transform ratio', 44, 6, context.text('ratio'), shade, 'right'),
      line(context, 'Clock transform phase rail', 20, 14, 44, 14, 4),
      line(context, 'Clock transform phase', phase, 11, phase, 16, 15),
      box(context, 'Clock transform pulse', 42, 8, 47, 11, 15, true, context.visible('pulse')),
      box(context, 'Clock transform lock', 17, 1, 20, 4, 15, true, context.visible('locked')),
      tinyText(context, 'Clock transform searching', 17, 6, '?', 10, 'centre', context.visible('searching')),
    ]
    if (state === 'divide') primitives.push(line(context, 'Clock divide slash', 7, 13, 14, 5, 12))
    if (state === 'multiply') primitives.push(line(context, 'Clock multiply one', 7, 5, 14, 13, 12), line(context, 'Clock multiply two', 14, 5, 7, 13, 12))
    if (state === 'swing') primitives.push(line(context, 'Clock swing one', 7, 12, 10, 5, 12), line(context, 'Clock swing two', 10, 5, 14, 12, 15))
    if (state === 'ratchet') primitives.push(line(context, 'Clock ratchet one', 7, 5, 7, 13, 11), line(context, 'Clock ratchet two', 10, 5, 10, 13, 13), line(context, 'Clock ratchet three', 14, 5, 14, 13, 15))
    if (state === 'burst') primitives.push(line(context, 'Clock burst upper', 7, 9, 14, 4, 15), line(context, 'Clock burst centre', 7, 9, 15, 9, 15), line(context, 'Clock burst lower', 7, 9, 14, 14, 15))
    if (state === 'error') primitives.push(line(context, 'Clock transform error one', 7, 4, 15, 14, 15), line(context, 'Clock transform error two', 15, 4, 7, 14, 15))
    return primitives
  },
}

const feedbackUtility: DisplayComponentRecipe = {
  ...common,
  id: 'feedback-utility',
  name: 'Feedback utility',
  category: 'processors',
  description: 'A directional send/return processor with script-owned feedback amount, freeze, instability, clipping, and bypass states.',
  tags: ['feedback', 'send return', 'freeze', 'tamer', 'limiter', 'loop', 'delay', 'safety'],
  footprint: { width: 48, height: 20 },
  states: [{ value: 'idle', name: 'Idle' }, { value: 'active', name: 'Active' }, { value: 'frozen', name: 'Frozen' }, { value: 'unstable', name: 'Unstable' }, { value: 'clipped', name: 'Clipped' }, { value: 'bypassed', name: 'Bypassed' }, { value: 'error', name: 'Error' }],
  defaultState: 'idle',
  inputs: [
    numberInput('amount', 'Feedback amount', 'Normalized feedback amount calculated by script state.', 0.4),
    booleanInput('returnActive', 'Return active', 'Shows script-known activity on the return path.'),
  ],
  scenarios: [
    { id: 'default', name: 'Idle loop', state: 'idle' },
    { id: 'active', name: 'Active return', state: 'active', values: { amount: 0.7, returnActive: true } },
    { id: 'edge', name: 'Unstable feedback', state: 'unstable', values: { amount: 1, returnActive: true } },
  ],
  build: (context, state) => {
    const shade = state === 'bypassed' ? 3 : state === 'unstable' || state === 'clipped' || state === 'error' ? 15 : state === 'frozen' ? 12 : state === 'active' ? 13 : 7
    const amount = context.number('amount', 7, 39)
    const primitives: DisplayPrimitiveElement[] = [
      box(context, 'Feedback body', 12, 3, 35, 16, shade),
      line(context, 'Feedback send', 0, 7, 12, 7, shade),
      line(context, 'Feedback output', 35, 7, 47, 7, shade),
      line(context, 'Feedback return down', 42, 7, 42, 18, shade),
      line(context, 'Feedback return rail', 42, 18, 6, 18, shade),
      line(context, 'Feedback return up', 6, 18, 6, 11, shade),
      line(context, 'Feedback return arrow', 6, 11, 10, 14, shade),
      line(context, 'Feedback amount rail', 15, 12, 32, 12, 4),
      line(context, 'Feedback amount', amount, 9, amount, 15, shade),
      box(context, 'Feedback return activity', 39, 15, 45, 19, 15, true, context.visible('returnActive')),
    ]
    if (state === 'active') primitives.push(circle(context, 'Feedback active node', 24, 7, 2, 15))
    if (state === 'frozen') primitives.push(line(context, 'Feedback freeze horizontal', 17, 7, 31, 7, 15), line(context, 'Feedback freeze vertical', 24, 4, 24, 10, 15))
    if (state === 'unstable') primitives.push(line(context, 'Feedback unstable zig one', 14, 14, 20, 5, 15), line(context, 'Feedback unstable zig two', 20, 5, 27, 14, 15), line(context, 'Feedback unstable zig three', 27, 14, 33, 5, 15))
    if (state === 'clipped') primitives.push(box(context, 'Feedback clipped stop', 32, 2, 36, 6, 15, true))
    if (state === 'bypassed') primitives.push(line(context, 'Feedback bypass', 1, 1, 46, 1, 10))
    if (state === 'error') primitives.push(line(context, 'Feedback error one', 17, 5, 31, 15, 15), line(context, 'Feedback error two', 31, 5, 17, 15, 15))
    return primitives
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

const segmentedMeter: DisplayComponentRecipe = {
  ...common,
  id: 'segmented-meter',
  name: 'Segmented meter',
  category: 'meters',
  description: 'An eight-part coarse meter for stages, density, progress, or load categories.',
  tags: ['bar', 'discrete', 'stages', 'progress', 'density', 'coarse level'],
  footprint: { width: 48, height: 9 },
  states: [{ value: 'normal', name: 'Normal' }, { value: 'warning', name: 'Warning' }, { value: 'clipped', name: 'Clipped' }, { value: 'stale', name: 'Stale' }],
  defaultState: 'normal',
  inputs: [numberInput('value', 'Value', 'Normalized value mapped across eight visible segments.', 0.5)],
  scenarios: [
    { id: 'default', name: 'Half', state: 'normal', values: { value: 0.5 } },
    { id: 'active', name: 'Warning', state: 'warning', values: { value: 0.8 } },
    { id: 'edge', name: 'Clipped', state: 'clipped', values: { value: 1 } },
  ],
  build: (context, state) => {
    const shade = state === 'stale' ? 3 : state === 'clipped' ? 15 : state === 'warning' ? 13 : 10
    const primitives: DisplayPrimitiveElement[] = [
      box(context, 'Segmented meter outline', 0, 0, 47, 8, state === 'stale' ? 2 : 4),
      box(context, 'Segmented meter fill', 1, 2, context.number('value', 1, 46), 6, shade, true),
    ]
    for (const x of [6, 12, 18, 24, 30, 36, 42]) primitives.push(line(context, `Segment divider ${x}`, x, 1, x, 7, 0))
    if (state === 'warning') primitives.push(line(context, 'Segment warning mark', 40, 1, 46, 1, 15))
    if (state === 'clipped') primitives.push(box(context, 'Segment clip mark', 43, 0, 47, 2, 15, true))
    return primitives
  },
}

const verticalChannelMeter: DisplayComponentRecipe = {
  ...common,
  id: 'vertical-channel-meter',
  name: 'Vertical channel meter',
  category: 'meters',
  description: 'A narrow channel meter with script-owned level and peak hold.',
  tags: ['vertical', 'channel', 'mixer', 'level', 'peak', 'mute', 'solo'],
  footprint: { width: 9, height: 40 },
  states: [{ value: 'normal', name: 'Normal' }, { value: 'muted', name: 'Muted' }, { value: 'solo', name: 'Solo' }, { value: 'clipped', name: 'Clipped' }],
  defaultState: 'normal',
  inputs: [
    numberInput('value', 'Value', 'Normalized current channel level.', 0.55),
    numberInput('peak', 'Peak', 'Normalized script-maintained peak hold.', 0.7),
  ],
  scenarios: [
    { id: 'default', name: 'Normal', state: 'normal' },
    { id: 'active', name: 'Solo high', state: 'solo', values: { value: 0.82, peak: 0.9 } },
    { id: 'edge', name: 'Clipped', state: 'clipped', values: { value: 1, peak: 1 } },
  ],
  build: (context, state) => {
    const shade = state === 'muted' ? 3 : state === 'clipped' ? 15 : state === 'solo' ? 13 : 10
    const valueY = context.number('value', 37, 2)
    const peakY = context.number('peak', 37, 2)
    const primitives: DisplayPrimitiveElement[] = [
      box(context, 'Vertical meter outline', 0, 0, 8, 39, state === 'solo' ? 12 : state === 'muted' ? 2 : 4),
      box(context, 'Vertical meter fill', 2, valueY, 6, 37, shade, true),
      line(context, 'Vertical meter peak', 1, peakY, 7, peakY, state === 'muted' ? 4 : 15),
    ]
    if (state === 'muted') primitives.push(line(context, 'Vertical meter mute', 1, 32, 7, 7, 5))
    if (state === 'solo') primitives.push(line(context, 'Vertical meter solo left', 0, 0, 0, 39, 15), line(context, 'Vertical meter solo right', 8, 0, 8, 39, 15))
    if (state === 'clipped') primitives.push(box(context, 'Vertical meter clip', 1, 0, 7, 2, 15, true))
    return primitives
  },
}

const thresholdWindowMeter: DisplayComponentRecipe = {
  ...common,
  id: 'threshold-window-meter',
  name: 'Threshold window meter',
  category: 'meters',
  description: 'An input marker and two threshold rails for comparator or safe-range displays.',
  tags: ['threshold', 'window', 'comparator', 'range', 'voltage', 'gate'],
  footprint: { width: 64, height: 10 },
  states: [{ value: 'normal', name: 'Normal' }, { value: 'clamped', name: 'Clamped' }, { value: 'invalid', name: 'Invalid' }],
  defaultState: 'normal',
  inputs: [
    numberInput('input', 'Input', 'Normalized current input position.', 0.5),
    numberInput('lower', 'Lower threshold', 'Normalized lower comparison threshold.', 0.25),
    numberInput('upper', 'Upper threshold', 'Normalized upper comparison threshold.', 0.75),
    booleanInput('result', 'Result high', 'Shows the script-calculated comparator result.'),
  ],
  scenarios: [
    { id: 'default', name: 'Inside window', state: 'normal', values: { input: 0.5, lower: 0.25, upper: 0.75, result: true } },
    { id: 'active', name: 'Clamped high', state: 'clamped', values: { input: 1, lower: 0.2, upper: 0.8 } },
    { id: 'edge', name: 'Reversed invalid window', state: 'invalid', values: { input: 0.5, lower: 0.8, upper: 0.2 } },
  ],
  build: (context, state) => {
    const input = context.number('input', 2, 61)
    const lower = context.number('lower', 2, 61)
    const upper = context.number('upper', 2, 61)
    const shade = state === 'invalid' ? 15 : state === 'clamped' ? 13 : 9
    const primitives: DisplayPrimitiveElement[] = [
      box(context, 'Threshold outline', 0, 0, 63, 9, state === 'invalid' ? 15 : 4),
      box(context, 'Threshold window', lower, 3, upper, 6, state === 'invalid' ? 4 : 6, true),
      line(context, 'Threshold lower rail', lower, 1, lower, 8, shade),
      line(context, 'Threshold upper rail', upper, 1, upper, 8, shade),
      line(context, 'Threshold input', input, 0, input, 9, 15),
      box(context, 'Threshold result', 57, 2, 61, 5, 15, true, context.visible('result')),
    ]
    if (state === 'clamped') primitives.push(box(context, 'Threshold lower stop', 0, 1, 3, 3, 13, true), box(context, 'Threshold upper stop', 60, 1, 63, 3, 13, true))
    if (state === 'invalid') primitives.push(line(context, 'Threshold invalid one', 27, 1, 36, 8, 15), line(context, 'Threshold invalid two', 36, 1, 27, 8, 15))
    return primitives
  },
}

const modulationRangeMeter: DisplayComponentRecipe = {
  ...common,
  id: 'modulation-range-meter',
  name: 'Modulation range meter',
  category: 'meters',
  description: 'A base and effective value display bounded by authored modulation limits.',
  tags: ['modulation', 'base', 'effective', 'minimum', 'maximum', 'cv', 'range'],
  footprint: { width: 56, height: 10 },
  states: [{ value: 'normal', name: 'Normal' }, { value: 'clipped', name: 'Clipped' }, { value: 'stale', name: 'Stale' }],
  defaultState: 'normal',
  inputs: [
    numberInput('base', 'Base value', 'Normalized unmodulated parameter value.', 0.45),
    numberInput('effective', 'Effective value', 'Normalized value after script-owned modulation.', 0.65),
    numberInput('minimum', 'Minimum', 'Normalized lower modulation extent.', 0.2),
    numberInput('maximum', 'Maximum', 'Normalized upper modulation extent.', 0.8),
  ],
  scenarios: [
    { id: 'default', name: 'Normal range', state: 'normal' },
    { id: 'active', name: 'Positive modulation', state: 'normal', values: { base: 0.35, effective: 0.75, minimum: 0.15, maximum: 0.85 } },
    { id: 'edge', name: 'Clipped', state: 'clipped', values: { base: 0.8, effective: 1, minimum: 0.3, maximum: 1 } },
  ],
  build: (context, state) => {
    const base = context.number('base', 2, 53)
    const effective = context.number('effective', 2, 53)
    const minimum = context.number('minimum', 2, 53)
    const maximum = context.number('maximum', 2, 53)
    const shade = state === 'stale' ? 3 : state === 'clipped' ? 15 : 11
    const primitives: DisplayPrimitiveElement[] = [
      box(context, 'Modulation outline', 0, 0, 55, 9, state === 'stale' ? 2 : 4),
      box(context, 'Modulation extent', minimum, 4, maximum, 6, state === 'stale' ? 3 : 6, true),
      line(context, 'Modulation minimum', minimum, 2, minimum, 8, 8),
      line(context, 'Modulation maximum', maximum, 2, maximum, 8, 8),
      line(context, 'Modulation base', base, 1, base, 8, state === 'stale' ? 4 : 10),
      line(context, 'Modulation effective', effective, 0, effective, 9, shade),
      line(context, 'Modulation applied', base, 5, effective, 5, state === 'stale' ? 4 : 13),
    ]
    if (state === 'clipped') primitives.push(box(context, 'Modulation clip', 51, 0, 55, 2, 15, true))
    if (state === 'stale') primitives.push(line(context, 'Modulation stale', 20, 8, 35, 1, 5))
    return primitives
  },
}

const gateTriggerActivity: DisplayComponentRecipe = {
  ...common,
  id: 'gate-trigger-activity',
  name: 'Gate trigger activity',
  category: 'meters',
  description: 'A shape-coded gate level and edge-flash indicator driven entirely by script state.',
  tags: ['gate', 'trigger', 'activity', 'edge', 'rise', 'fall', 'pulse'],
  footprint: { width: 16, height: 10 },
  states: [{ value: 'low', name: 'Low' }, { value: 'high', name: 'High' }, { value: 'rise-flash', name: 'Rise flash' }, { value: 'fall-flash', name: 'Fall flash' }, { value: 'disabled', name: 'Disabled' }],
  defaultState: 'low',
  inputs: [],
  scenarios: [
    { id: 'default', name: 'Gate low', state: 'low' },
    { id: 'active', name: 'Gate high', state: 'high' },
    { id: 'edge', name: 'Rising edge flash', state: 'rise-flash' },
  ],
  build: (context, state) => {
    const shade = state === 'disabled' ? 2 : state === 'low' ? 5 : 13
    const primitives: DisplayPrimitiveElement[] = [box(context, 'Gate activity frame', 0, 0, 15, 9, shade)]
    if (state === 'low') primitives.push(line(context, 'Gate low level', 3, 7, 12, 7, shade))
    if (state === 'high') primitives.push(line(context, 'Gate high level', 3, 2, 12, 2, 15), box(context, 'Gate high fill', 5, 4, 10, 7, 11, true))
    if (state === 'rise-flash') primitives.push(line(context, 'Gate rise stem', 4, 8, 4, 2, 15), line(context, 'Gate rise head left', 4, 2, 2, 4, 15), line(context, 'Gate rise head right', 4, 2, 6, 4, 15), line(context, 'Gate rise level', 4, 2, 13, 2, 12))
    if (state === 'fall-flash') primitives.push(line(context, 'Gate fall stem', 11, 1, 11, 7, 15), line(context, 'Gate fall head left', 11, 7, 9, 5, 15), line(context, 'Gate fall head right', 11, 7, 13, 5, 15), line(context, 'Gate fall level', 2, 7, 11, 7, 12))
    if (state === 'disabled') primitives.push(line(context, 'Gate disabled mark', 2, 8, 13, 1, 3))
    return primitives
  },
}

const envelopeContour: DisplayComponentRecipe = {
  ...common,
  id: 'envelope-contour',
  name: 'Envelope contour',
  category: 'meters',
  description: 'An ADSR contour with script-owned stage geometry and a distinct current phase and level marker.',
  tags: ['envelope', 'adsr', 'attack', 'decay', 'sustain', 'release', 'contour', 'slew'],
  footprint: { width: 64, height: 24 },
  states: [{ value: 'idle', name: 'Idle' }, { value: 'gated', name: 'Gated' }, { value: 'released', name: 'Released' }, { value: 'finished', name: 'Finished' }, { value: 'invalid', name: 'Invalid' }],
  defaultState: 'idle',
  inputs: [
    numberInput('attack', 'Attack time', 'Normalized attack duration mapped into the attack segment.', 0.45),
    numberInput('decay', 'Decay time', 'Normalized decay duration mapped into the decay segment.', 0.45),
    numberInput('sustain', 'Sustain level', 'Normalized sustain level.', 0.6),
    numberInput('release', 'Release time', 'Normalized release duration mapped into the release segment.', 0.55),
    numberInput('phase', 'Current phase', 'Normalized script-owned position across the complete contour.', 0.3),
    numberInput('level', 'Current level', 'Normalized script-owned current envelope level.', 0.75),
  ],
  scenarios: [
    { id: 'default', name: 'Idle contour', state: 'idle', values: { phase: 0, level: 0 } },
    { id: 'active', name: 'Gate held', state: 'gated', values: { attack: 0.35, decay: 0.5, sustain: 0.65, phase: 0.42, level: 0.72 } },
    { id: 'edge', name: 'Invalid stages', state: 'invalid', values: { attack: 1, decay: 1, sustain: 0, release: 1, phase: 0.5, level: 0 } },
  ],
  build: (context, state) => {
    const attackX = context.number('attack', 6, 18)
    const decayX = context.number('decay', 22, 34)
    const sustainY = context.number('sustain', 20, 7)
    const releaseX = context.number('release', 48, 61)
    const phaseX = context.number('phase', 3, 61)
    const levelY = context.number('level', 20, 3)
    const shade = state === 'invalid' ? 15 : state === 'gated' ? 13 : state === 'released' ? 11 : state === 'finished' ? 5 : 7
    const primitives: DisplayPrimitiveElement[] = [
      line(context, 'Envelope baseline', 2, 21, 62, 21, state === 'finished' ? 3 : 4),
      line(context, 'Envelope attack', 3, 20, attackX, 3, shade),
      line(context, 'Envelope decay', attackX, 3, decayX, sustainY, shade),
      line(context, 'Envelope sustain', decayX, sustainY, 45, sustainY, shade),
      line(context, 'Envelope release', 45, sustainY, releaseX, 20, shade),
      circle(context, 'Envelope current point', phaseX, levelY, state === 'gated' ? 2 : 1, state === 'finished' ? 5 : 15),
    ]
    if (state === 'gated') primitives.push(line(context, 'Envelope gate rail', 1, 1, 1, 20, 15))
    if (state === 'released') primitives.push(line(context, 'Envelope release marker', 45, sustainY, 45, 21, 15))
    if (state === 'finished') primitives.push(box(context, 'Envelope finished mark', 59, 19, 62, 22, 6, true))
    if (state === 'invalid') primitives.push(line(context, 'Envelope invalid one', 26, 5, 38, 18, 15), line(context, 'Envelope invalid two', 38, 5, 26, 18, 15))
    return primitives
  },
}

const phaseClockRing: DisplayComponentRecipe = {
  ...common,
  id: 'phase-clock-ring',
  name: 'Phase clock ring',
  category: 'meters',
  description: 'A compact phase and division ring with stopped, running, searching, locked, and error shapes.',
  tags: ['phase', 'clock', 'ring', 'cycle', 'division', 'rotation', 'lfo', 'euclidean'],
  footprint: { width: 24, height: 24 },
  states: [{ value: 'stopped', name: 'Stopped' }, { value: 'running', name: 'Running' }, { value: 'searching', name: 'Searching' }, { value: 'locked', name: 'Locked' }, { value: 'error', name: 'Error' }],
  defaultState: 'stopped',
  inputs: [numberInput('phase', 'Phase', 'Normalized script-owned phase position.', 0)],
  scenarios: [
    { id: 'default', name: 'Stopped', state: 'stopped', values: { phase: 0 } },
    { id: 'active', name: 'Running locked', state: 'locked', values: { phase: 0.7 } },
    { id: 'edge', name: 'Searching', state: 'searching', values: { phase: 0.2 } },
  ],
  build: (context, state) => {
    const phase = context.number('phase', 4, 20)
    const shade = state === 'error' ? 15 : state === 'stopped' ? 4 : state === 'searching' ? 8 : state === 'locked' ? 15 : 12
    const primitives: DisplayPrimitiveElement[] = [
      circle(context, 'Phase ring', 12, 12, 9, shade),
      line(context, 'Phase top division', 12, 0, 12, 4, state === 'stopped' ? 3 : 8),
      line(context, 'Phase right division', 20, 12, 23, 12, state === 'stopped' ? 3 : 8),
      line(context, 'Phase bottom division', 12, 20, 12, 23, state === 'stopped' ? 3 : 8),
      line(context, 'Phase left division', 0, 12, 4, 12, state === 'stopped' ? 3 : 8),
      line(context, 'Phase hand', 12, 12, phase, 4, shade),
      circle(context, 'Phase hub', 12, 12, 1, state === 'stopped' ? 4 : 15),
    ]
    if (state === 'running') primitives.push(line(context, 'Phase running tail', phase, 4, context.number('phase', 3, 19), 7, 10))
    if (state === 'searching') primitives.push(line(context, 'Phase search left', 5, 20, 10, 22, 15), line(context, 'Phase search right', 14, 22, 19, 20, 15))
    if (state === 'locked') primitives.push(box(context, 'Phase lock mark', 9, 9, 15, 15, 13))
    if (state === 'error') primitives.push(line(context, 'Phase error one', 5, 5, 19, 19, 15), line(context, 'Phase error two', 19, 5, 5, 19, 15))
    return primitives
  },
}

const noteRangeLadder: DisplayComponentRecipe = {
  ...common,
  id: 'note-range-ladder',
  name: 'Note range ladder',
  category: 'meters',
  description: 'A compact pitch ladder showing input, output, accepted range, quantization, rejection, and invalid bounds.',
  tags: ['note', 'range', 'ladder', 'pitch', 'quantizer', 'transpose', 'clamp', 'midi'],
  footprint: { width: 64, height: 18 },
  states: [{ value: 'idle', name: 'Idle' }, { value: 'quantized', name: 'Quantized' }, { value: 'clamped', name: 'Clamped' }, { value: 'rejected', name: 'Rejected' }, { value: 'invalid', name: 'Invalid' }],
  defaultState: 'idle',
  inputs: [
    numberInput('input', 'Input note', 'Normalized input-note position over the displayed range.', 0.35),
    numberInput('output', 'Output note', 'Normalized output-note position after script processing.', 0.4),
    numberInput('minimum', 'Minimum note', 'Normalized lower accepted range boundary.', 0.2),
    numberInput('maximum', 'Maximum note', 'Normalized upper accepted range boundary.', 0.8),
  ],
  scenarios: [
    { id: 'default', name: 'Idle range', state: 'idle' },
    { id: 'active', name: 'Quantized note', state: 'quantized', values: { input: 0.46, output: 0.5, minimum: 0.2, maximum: 0.8 } },
    { id: 'edge', name: 'Rejected note', state: 'rejected', values: { input: 0.95, output: 0.8, minimum: 0.2, maximum: 0.8 } },
  ],
  build: (context, state) => {
    const input = context.number('input', 3, 60)
    const output = context.number('output', 3, 60)
    const minimum = context.number('minimum', 3, 60)
    const maximum = context.number('maximum', 3, 60)
    const shade = state === 'invalid' || state === 'rejected' ? 15 : state === 'clamped' ? 13 : state === 'quantized' ? 12 : 7
    const primitives: DisplayPrimitiveElement[] = [
      box(context, 'Note ladder frame', 0, 0, 63, 17, state === 'invalid' ? 15 : 5),
      line(context, 'Note ladder rail', 3, 9, 60, 9, 5),
      line(context, 'Note ladder tick one', 14, 6, 14, 12, 5),
      line(context, 'Note ladder tick two', 26, 6, 26, 12, 5),
      line(context, 'Note ladder tick three', 37, 6, 37, 12, 5),
      line(context, 'Note ladder tick four', 49, 6, 49, 12, 5),
      line(context, 'Note ladder minimum', minimum, 3, minimum, 15, state === 'invalid' ? 15 : 8),
      line(context, 'Note ladder maximum', maximum, 3, maximum, 15, state === 'invalid' ? 15 : 8),
      line(context, 'Note ladder input', input, 1, input, 8, shade),
      line(context, 'Note ladder output', output, 9, output, 16, state === 'idle' ? 6 : 15),
    ]
    if (state === 'quantized') primitives.push(line(context, 'Note ladder quantized link', input, 4, output, 13, 12))
    if (state === 'clamped') primitives.push(box(context, 'Note ladder clamp stop', output, 6, output, 12, 15, true))
    if (state === 'rejected') primitives.push(line(context, 'Note ladder reject one', context.number('input', 0, 57), 3, context.number('input', 6, 63), 15, 15), line(context, 'Note ladder reject two', context.number('input', 6, 63), 3, context.number('input', 0, 57), 15, 15))
    if (state === 'invalid') primitives.push(line(context, 'Note ladder invalid range', maximum, 2, minimum, 16, 15))
    return primitives
  },
}

const xyVectorMeter: DisplayComponentRecipe = {
  ...common,
  id: 'xy-vector-meter',
  name: 'XY vector meter',
  category: 'meters',
  description: 'A non-interactive two-axis signal meter with a script-supplied point, radius limit, stale, clip, and error treatments.',
  tags: ['xy', 'vector', 'meter', 'two axis', 'two channel cv', 'drift', 'uncertainty', 'radius', 'limit'],
  footprint: { width: 40, height: 28 },
  states: [{ value: 'live', name: 'Live' }, { value: 'limit', name: 'At limit' }, { value: 'clipped', name: 'Clipped' }, { value: 'stale', name: 'Stale' }, { value: 'error', name: 'Error' }],
  defaultState: 'live',
  inputs: [
    numberInput('x', 'X value', 'Normalized horizontal signal position.', 0.5),
    numberInput('y', 'Y value', 'Normalized vertical signal position.', 0.5),
    numberInput('radius', 'Radius limit', 'Normalized script-owned radius or safety limit.', 0.7),
  ],
  scenarios: [
    { id: 'default', name: 'Centred signal', state: 'live' },
    { id: 'active', name: 'At radius limit', state: 'limit', values: { x: 0.78, y: 0.25, radius: 0.75 } },
    { id: 'edge', name: 'Clipped signal', state: 'clipped', values: { x: 1, y: 0, radius: 0.8 } },
  ],
  build: (context, state) => {
    const x = context.number('x', 3, 36)
    const y = context.number('y', 3, 24)
    const shade = state === 'stale' ? 3 : state === 'clipped' || state === 'error' ? 15 : state === 'limit' ? 13 : 10
    const primitives: DisplayPrimitiveElement[] = [
      box(context, 'XY meter frame', 0, 0, 39, 27, state === 'stale' ? 2 : state === 'error' ? 15 : 5),
      line(context, 'XY meter horizontal axis', 2, 14, 37, 14, state === 'stale' ? 2 : 4),
      line(context, 'XY meter vertical axis', 20, 2, 20, 25, state === 'stale' ? 2 : 4),
      circle(context, 'XY meter radius', 20, 14, context.number('radius', 3, 12), state === 'stale' ? 2 : 6),
      circle(context, 'XY meter point', x, y, state === 'limit' ? 2 : 1, shade),
    ]
    if (state === 'live') primitives.push(line(context, 'XY meter live vector', 20, 14, x, y, 8))
    if (state === 'limit') primitives.push(line(context, 'XY meter limit ray', 20, 14, x, y, 15), box(context, 'XY meter limit mark', context.number('x', 1, 34), context.number('y', 1, 22), context.number('x', 5, 38), context.number('y', 5, 26), 15))
    if (state === 'clipped') primitives.push(box(context, 'XY meter clipped corner', 34, 0, 39, 5, 15, true), line(context, 'XY meter clip stop', 32, 6, 38, 0, 15))
    if (state === 'stale') primitives.push(line(context, 'XY meter stale mark', 2, 25, 37, 2, 5))
    if (state === 'error') primitives.push(line(context, 'XY meter error one', 13, 7, 27, 21, 15), line(context, 'XY meter error two', 27, 7, 13, 21, 15))
    return primitives
  },
}

const boundedScopeStrip: DisplayComponentRecipe = {
  ...common,
  id: 'bounded-scope-strip',
  name: 'Bounded scope strip',
  category: 'meters',
  description: 'An eight-sample scope whose chronological normalized history is supplied explicitly by script state.',
  tags: ['sparkline', 'scope', 'bounded history', 'ring buffer', 'waveform history', 'threshold', 'frozen'],
  footprint: { width: 64, height: 20 },
  states: [{ value: 'running', name: 'Running' }, { value: 'frozen', name: 'Frozen' }, { value: 'overflow', name: 'Overflow' }, { value: 'stale', name: 'Stale' }, { value: 'error', name: 'Error' }],
  defaultState: 'running',
  inputs: [
    ...Array.from({ length: 8 }, (_, index) => numberInput(`sample${index + 1}`, `Sample ${index + 1}`, `Chronological normalized history sample ${index + 1}, maintained outside draw().`, 0.5)),
    numberInput('threshold', 'Threshold', 'Normalized script-owned threshold shown across the history.', 0.75),
  ],
  scenarios: [
    { id: 'default', name: 'Flat history', state: 'running' },
    { id: 'active', name: 'Running waveform', state: 'running', values: { sample1: 0.2, sample2: 0.4, sample3: 0.8, sample4: 0.6, sample5: 0.3, sample6: 0.55, sample7: 0.9, sample8: 0.7, threshold: 0.8 } },
    { id: 'edge', name: 'History overflow', state: 'overflow', values: { sample1: 0, sample2: 1, sample3: 0, sample4: 1, sample5: 0, sample6: 1, sample7: 0, sample8: 1, threshold: 0.9 } },
  ],
  build: (context, state) => {
    const shade = state === 'stale' ? 3 : state === 'overflow' || state === 'error' ? 15 : state === 'frozen' ? 9 : 12
    const primitives: DisplayPrimitiveElement[] = [
      box(context, 'Scope frame', 0, 0, 63, 19, state === 'stale' ? 2 : state === 'error' ? 15 : 5),
      line(context, 'Scope zero line', 2, 10, 61, 10, state === 'stale' ? 2 : 4),
      line(context, 'Scope threshold', 2, context.number('threshold', 17, 2), 61, context.number('threshold', 17, 2), state === 'overflow' ? 15 : 6),
    ]
    for (let index = 0; index < 7; index += 1) {
      primitives.push(line(
        context,
        `Scope sample link ${index + 1}`,
        4 + index * 8,
        context.number(`sample${index + 1}`, 17, 2),
        12 + index * 8,
        context.number(`sample${index + 2}`, 17, 2),
        shade,
      ))
    }
    if (state === 'running') primitives.push(line(context, 'Scope running cursor', 60, 2, 60, 17, 15))
    if (state === 'frozen') primitives.push(line(context, 'Scope pause left', 56, 3, 56, 8, 15), line(context, 'Scope pause right', 60, 3, 60, 8, 15))
    if (state === 'overflow') primitives.push(box(context, 'Scope overflow corner', 57, 0, 63, 4, 15, true))
    if (state === 'stale') primitives.push(line(context, 'Scope stale mark', 2, 17, 61, 2, 5))
    if (state === 'error') primitives.push(line(context, 'Scope error one', 25, 3, 39, 17, 15), line(context, 'Scope error two', 39, 3, 25, 17, 15))
    return primitives
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

const playheadCursor: DisplayComponentRecipe = {
  ...common,
  id: 'playhead-cursor',
  name: 'Playhead cursor',
  category: 'sequencing',
  description: 'A script-positioned cursor overlay for a sequencer row or compact grid.',
  tags: ['sequencer', 'position', 'step', 'playhead', 'record', 'queued'],
  footprint: { width: 48, height: 12 },
  states: [{ value: 'stopped', name: 'Stopped' }, { value: 'running', name: 'Running' }, { value: 'recording', name: 'Recording' }, { value: 'queued', name: 'Queued' }],
  defaultState: 'stopped',
  inputs: [numberInput('position', 'Position', 'Normalized algorithm step position across the target row.', 0)],
  scenarios: [
    { id: 'default', name: 'Stopped at start', state: 'stopped', values: { position: 0 } },
    { id: 'active', name: 'Running', state: 'running', values: { position: 0.55 } },
    { id: 'edge', name: 'Recording at end', state: 'recording', values: { position: 1 } },
  ],
  build: (context, state) => {
    const position = context.number('position', 1, 46)
    const shade = state === 'stopped' ? 5 : state === 'recording' ? 15 : state === 'queued' ? 10 : 14
    const primitives: DisplayPrimitiveElement[] = [
      line(context, 'Playhead stem', position, 1, position, 10, shade),
      line(context, 'Playhead upper pointer', position, 1, context.number('position', 0, 45), 0, shade),
      line(context, 'Playhead lower pointer', position, 10, context.number('position', 0, 45), 11, shade),
    ]
    if (state === 'recording') primitives.push(box(context, 'Playhead record mark', position, 4, position, 7, 15, true))
    if (state === 'queued') primitives.push(line(context, 'Playhead queued left', position, 2, position, 9, 6), line(context, 'Playhead queued right', context.number('position', 2, 47), 2, context.number('position', 2, 47), 9, 10))
    return primitives
  },
}

const loopRangeBracket: DisplayComponentRecipe = {
  ...common,
  id: 'loop-range-bracket',
  name: 'Loop range bracket',
  category: 'sequencing',
  description: 'Explicit loop endpoints with pending and reversed-range treatments.',
  tags: ['sequencer', 'loop', 'range', 'start', 'end', 'pattern'],
  footprint: { width: 64, height: 10 },
  states: [{ value: 'inactive', name: 'Inactive' }, { value: 'active', name: 'Active' }, { value: 'pending', name: 'Pending' }, { value: 'invalid', name: 'Invalid' }],
  defaultState: 'inactive',
  inputs: [
    numberInput('start', 'Loop start', 'Normalized algorithm-owned loop start.', 0.2),
    numberInput('end', 'Loop end', 'Normalized algorithm-owned loop end.', 0.8),
  ],
  scenarios: [
    { id: 'default', name: 'Inactive range', state: 'inactive' },
    { id: 'active', name: 'Active loop', state: 'active', values: { start: 0.25, end: 0.75 } },
    { id: 'edge', name: 'Reversed invalid range', state: 'invalid', values: { start: 0.8, end: 0.2 } },
  ],
  build: (context, state) => {
    const start = context.number('start', 2, 61)
    const end = context.number('end', 2, 61)
    const shade = state === 'inactive' ? 4 : state === 'pending' ? 10 : 15
    const primitives: DisplayPrimitiveElement[] = [
      line(context, 'Loop range rail', start, 5, end, 5, shade),
      line(context, 'Loop start bracket', start, 2, start, 8, shade),
      line(context, 'Loop end bracket', end, 2, end, 8, shade),
    ]
    if (state === 'active') primitives.push(line(context, 'Loop active underline', start, 8, end, 8, 12))
    if (state === 'pending') primitives.push(line(context, 'Loop pending upper', start, 1, end, 1, 8), line(context, 'Loop pending marker', end, 0, end, 9, 15))
    if (state === 'invalid') primitives.push(line(context, 'Loop invalid one', 27, 1, 36, 8, 15), line(context, 'Loop invalid two', 36, 1, 27, 8, 15))
    return primitives
  },
}

const transportStrip: DisplayComponentRecipe = {
  ...common,
  id: 'transport-strip',
  name: 'Transport strip',
  category: 'sequencing',
  description: 'A compact stopped, playing, paused, recording, armed, or waiting-clock status strip.',
  tags: ['transport', 'play', 'pause', 'record', 'armed', 'clock', 'tempo', 'sequencer'],
  footprint: { width: 72, height: 10 },
  states: [{ value: 'stopped', name: 'Stopped' }, { value: 'playing', name: 'Playing' }, { value: 'paused', name: 'Paused' }, { value: 'recording', name: 'Recording' }, { value: 'armed', name: 'Armed' }, { value: 'waiting-clock', name: 'Waiting for clock' }],
  defaultState: 'stopped',
  inputs: [textInput('position', 'Tempo or position', 'Script-formatted tempo or position; use a placeholder until clock is valid.', '120')],
  scenarios: [
    { id: 'default', name: 'Stopped', state: 'stopped', values: { position: '1.1' } },
    { id: 'active', name: 'Playing', state: 'playing', values: { position: '120' } },
    { id: 'edge', name: 'Waiting for clock', state: 'waiting-clock', values: { position: '--' } },
  ],
  build: (context, state) => {
    const shade = state === 'stopped' ? 5 : state === 'waiting-clock' ? 8 : state === 'recording' || state === 'armed' ? 15 : 12
    const primitives: DisplayPrimitiveElement[] = [
      box(context, 'Transport frame', 0, 0, 71, 9, shade),
      tinyText(context, 'Transport value', 69, 7, context.text('position'), shade, 'right'),
      line(context, 'Transport divider', 22, 1, 22, 8, 4),
    ]
    if (state === 'stopped') primitives.push(box(context, 'Transport stop', 7, 2, 14, 7, shade, true))
    if (state === 'playing') primitives.push(line(context, 'Transport play upper', 7, 1, 16, 5, shade), line(context, 'Transport play lower', 16, 5, 7, 9, shade), line(context, 'Transport play back', 7, 1, 7, 9, shade))
    if (state === 'paused') primitives.push(box(context, 'Transport pause left', 6, 2, 9, 7, shade, true), box(context, 'Transport pause right', 13, 2, 16, 7, shade, true))
    if (state === 'recording') primitives.push(circle(context, 'Transport record', 11, 5, 4, shade), box(context, 'Transport record centre', 9, 3, 13, 7, 15, true))
    if (state === 'armed') primitives.push(circle(context, 'Transport armed ring', 11, 5, 4, shade), tinyText(context, 'Transport armed label', 11, 7, 'A', 15, 'centre'))
    if (state === 'waiting-clock') primitives.push(circle(context, 'Transport wait clock', 11, 5, 4, shade), line(context, 'Transport wait hand', 11, 5, 14, 3, 15), line(context, 'Transport wait question', 17, 2, 19, 4, 10))
    return primitives
  },
}

const patternPageStrip: DisplayComponentRecipe = {
  ...common,
  id: 'pattern-page-strip',
  name: 'Pattern page strip',
  category: 'sequencing',
  description: 'Pattern or page navigation with separate queued, playing, dirty, and error marks.',
  tags: ['pattern', 'page', 'song', 'queued', 'playing', 'dirty', 'navigation'],
  footprint: { width: 64, height: 10 },
  states: [{ value: 'idle', name: 'Idle' }, { value: 'queued', name: 'Queued' }, { value: 'playing', name: 'Playing' }, { value: 'dirty', name: 'Dirty' }, { value: 'error', name: 'Error' }],
  defaultState: 'idle',
  inputs: [
    textInput('label', 'Pattern label', 'Script-formatted pattern index and count.', '03/08'),
    numberInput('position', 'Pattern position', 'Normalized current pattern position.', 0.3),
  ],
  scenarios: [
    { id: 'default', name: 'Pattern 3', state: 'idle' },
    { id: 'active', name: 'Playing', state: 'playing', values: { label: '04/08', position: 0.55 } },
    { id: 'edge', name: 'Queued + dirty', state: 'dirty', values: { label: '05/08', position: 0.75 } },
  ],
  build: (context, state) => {
    const shade = state === 'error' ? 15 : state === 'playing' ? 14 : state === 'queued' ? 10 : state === 'dirty' ? 12 : 6
    const position = context.number('position', 25, 61)
    const primitives: DisplayPrimitiveElement[] = [
      box(context, 'Pattern strip frame', 0, 0, 63, 9, shade),
      tinyText(context, 'Pattern strip label', 3, 7, context.text('label'), shade),
      line(context, 'Pattern strip rail', 25, 6, 61, 6, 4),
      line(context, 'Pattern strip position', position, 3, position, 8, 15),
    ]
    if (state === 'queued') primitives.push(line(context, 'Pattern queued upper', 24, 1, 62, 1, 10), line(context, 'Pattern queued end', 62, 1, 62, 5, 15))
    if (state === 'playing') primitives.push(box(context, 'Pattern playing mark', 25, 1, position, 2, 13, true))
    if (state === 'dirty') primitives.push(box(context, 'Pattern dirty mark', 58, 1, 61, 3, 15, true))
    if (state === 'error') primitives.push(line(context, 'Pattern error one', 27, 1, 35, 8, 15), line(context, 'Pattern error two', 35, 1, 27, 8, 15))
    return primitives
  },
}

const trackerRow: DisplayComponentRecipe = {
  ...common,
  id: 'tracker-row',
  name: 'Tracker row',
  category: 'sequencing',
  description: 'A micro tracker event row with note, gate, effect, current, selection, mute, and empty treatments.',
  tags: ['tracker', 'note', 'effect', 'event', 'sequence', 'row', 'gate'],
  footprint: { width: 120, height: 10 },
  states: [{ value: 'normal', name: 'Normal' }, { value: 'current', name: 'Current' }, { value: 'selected', name: 'Selected' }, { value: 'muted', name: 'Muted' }, { value: 'empty', name: 'Empty' }],
  defaultState: 'normal',
  inputs: [
    textInput('note', 'Note', 'Script-formatted note or voltage text.', 'C4'),
    textInput('effect', 'Effect', 'Short effect, parameter, or command text.', 'A12'),
    booleanInput('gate', 'Gate', 'Shows whether this event contains a gate.'),
  ],
  scenarios: [
    { id: 'default', name: 'Note event', state: 'normal', values: { gate: true } },
    { id: 'active', name: 'Current event', state: 'current', values: { note: 'F#4', effect: 'R08', gate: true } },
    { id: 'edge', name: 'Empty row', state: 'empty', values: { note: '---', effect: '---' } },
  ],
  build: (context, state) => {
    const shade = state === 'muted' ? 3 : state === 'empty' ? 4 : state === 'current' || state === 'selected' ? 15 : 9
    const primitives: DisplayPrimitiveElement[] = [
      box(context, 'Tracker row frame', 0, 0, 119, 9, state === 'selected' ? 15 : state === 'current' ? 12 : state === 'muted' ? 2 : 4, state === 'selected'),
      tinyText(context, 'Tracker row note', 3, 7, state === 'empty' ? '---' : context.text('note'), state === 'selected' ? 0 : shade),
      line(context, 'Tracker row note divider', 31, 1, 31, 8, state === 'selected' ? 0 : 4),
      tinyText(context, 'Tracker row effect', 116, 7, state === 'empty' ? '---' : context.text('effect'), state === 'selected' ? 0 : shade, 'right'),
      box(context, 'Tracker row gate', 38, 3, 43, 7, state === 'selected' ? 0 : 13, true, context.visible('gate')),
    ]
    if (state === 'current') primitives.push(line(context, 'Tracker current pointer', 0, 0, 5, 4, 15), line(context, 'Tracker current pointer lower', 5, 4, 0, 8, 15))
    if (state === 'muted') primitives.push(line(context, 'Tracker mute', 2, 8, 117, 1, 5))
    if (state === 'empty') primitives.push(line(context, 'Tracker empty rail', 48, 5, 103, 5, 3))
    return primitives
  },
}

const miniKeyboardRow: DisplayComponentRecipe = {
  ...common,
  id: 'mini-keyboard-row',
  name: 'Mini keyboard note row',
  category: 'sequencing',
  description: 'A one-octave note row with separate note, root, output, rejection, and disabled marks.',
  tags: ['keyboard', 'note', 'piano', 'octave', 'scale', 'root', 'quantizer', 'chord'],
  footprint: { width: 72, height: 14 },
  states: [{ value: 'idle', name: 'Idle' }, { value: 'input', name: 'Input note' }, { value: 'output', name: 'Output note' }, { value: 'rejected', name: 'Rejected' }, { value: 'disabled', name: 'Disabled' }],
  defaultState: 'idle',
  inputs: [
    numberInput('note', 'Note position', 'Normalized active note position across the octave.', 0.5),
    numberInput('root', 'Root position', 'Normalized scale-root position across the octave.', 0),
  ],
  scenarios: [
    { id: 'default', name: 'Idle octave', state: 'idle' },
    { id: 'active', name: 'Quantized output', state: 'output', values: { note: 0.58, root: 0 } },
    { id: 'edge', name: 'Rejected note', state: 'rejected', values: { note: 0.92, root: 0.25 } },
  ],
  build: (context, state) => {
    const note = context.number('note', 2, 69)
    const root = context.number('root', 2, 69)
    const shade = state === 'disabled' ? 2 : state === 'rejected' ? 15 : state === 'output' ? 14 : state === 'input' ? 10 : 6
    const primitives: DisplayPrimitiveElement[] = [box(context, 'Keyboard frame', 0, 0, 71, 13, shade)]
    for (const x of [10, 20, 30, 40, 50, 60]) primitives.push(line(context, `Keyboard white divider ${x}`, x, 1, x, 12, shade))
    for (const x of [7, 17, 37, 47, 57]) primitives.push(box(context, `Keyboard black key ${x}`, x, 1, x + 5, 6, state === 'disabled' ? 2 : 8, true))
    primitives.push(line(context, 'Keyboard root', root, 10, root, 13, state === 'disabled' ? 3 : 12))
    if (state !== 'idle' && state !== 'disabled') primitives.push(box(context, 'Keyboard active note', note, 7, note, 11, shade, true))
    if (state === 'output') primitives.push(line(context, 'Keyboard output mark', note, 5, note, 12, 15))
    if (state === 'rejected') primitives.push(line(context, 'Keyboard rejection one', note, 5, note, 12, 15), line(context, 'Keyboard rejection two', context.number('note', 0, 67), 8, context.number('note', 4, 71), 8, 15))
    if (state === 'disabled') primitives.push(line(context, 'Keyboard disabled mark', 2, 12, 69, 1, 3))
    return primitives
  },
}

const pitchCvLane: DisplayComponentRecipe = {
  ...common,
  id: 'pitch-cv-lane',
  name: 'Eight-step pitch CV lane',
  category: 'sequencing',
  description: 'An eight-step pitch or CV lane with independent values, playhead, mute, clip, and error treatments.',
  tags: ['pitch', 'cv', 'lane', 'sequencer', 'eight step', 'piano roll', 'values'],
  footprint: { width: 120, height: 20 },
  states: [{ value: 'idle', name: 'Idle' }, { value: 'running', name: 'Running' }, { value: 'muted', name: 'Muted' }, { value: 'clipped', name: 'Clipped' }, { value: 'error', name: 'Error' }],
  defaultState: 'idle',
  inputs: [
    ...Array.from({ length: 8 }, (_, index) => numberInput(`step${index + 1}`, `Step ${index + 1}`, `Normalized pitch or CV value for step ${index + 1}.`, 0.25 + (index % 4) * 0.15)),
    numberInput('playhead', 'Playhead', 'Normalized algorithm-owned playhead position across eight steps.', 0),
  ],
  scenarios: [
    { id: 'default', name: 'Idle phrase', state: 'idle' },
    { id: 'active', name: 'Running', state: 'running', values: { step1: 0.2, step2: 0.4, step3: 0.6, step4: 0.8, step5: 0.7, step6: 0.5, step7: 0.3, step8: 0.65, playhead: 0.55 } },
    { id: 'edge', name: 'Clipped high step', state: 'clipped', values: { step4: 1, playhead: 0.43 } },
  ],
  build: (context, state) => {
    const shade = state === 'muted' ? 3 : state === 'clipped' || state === 'error' ? 15 : state === 'running' ? 12 : 8
    const primitives: DisplayPrimitiveElement[] = [
      box(context, 'Pitch lane frame', 0, 0, 119, 19, state === 'muted' ? 2 : state === 'error' ? 15 : 4),
      line(context, 'Pitch lane baseline', 2, 17, 117, 17, state === 'muted' ? 2 : 5),
    ]
    for (let index = 0; index < 8; index += 1) {
      const x = 7 + index * 15
      primitives.push(line(context, `Pitch lane step ${index + 1}`, x, 16, x, context.number(`step${index + 1}`, 16, 2), shade))
    }
    const playhead = context.number('playhead', 4, 115)
    primitives.push(line(context, 'Pitch lane playhead', playhead, 0, playhead, 19, state === 'running' ? 15 : 7))
    if (state === 'running') primitives.push(line(context, 'Pitch lane running rail', 2, 1, playhead, 1, 13))
    if (state === 'muted') primitives.push(line(context, 'Pitch lane mute', 3, 18, 116, 1, 5))
    if (state === 'clipped') primitives.push(box(context, 'Pitch lane clip', 108, 0, 119, 2, 15, true))
    if (state === 'error') primitives.push(line(context, 'Pitch lane error one', 52, 4, 66, 16, 15), line(context, 'Pitch lane error two', 66, 4, 52, 16, 15))
    return primitives
  },
}

const eightStepGateRow: DisplayComponentRecipe = {
  ...common,
  id: 'eight-step-gate-row',
  name: 'Eight-step gate row',
  category: 'sequencing',
  description: 'A bounded eight-step gate pattern with independent steps, algorithm-owned playhead, output activity, mute, record, and error states.',
  tags: ['eight step', '8 step', 'gate', 'row', 'sequencer', 'pattern', 'x0x', 'lane'],
  footprint: { width: 120, height: 12 },
  states: [{ value: 'stopped', name: 'Stopped' }, { value: 'running', name: 'Running' }, { value: 'recording', name: 'Recording' }, { value: 'muted', name: 'Muted' }, { value: 'error', name: 'Error' }],
  defaultState: 'stopped',
  inputs: [
    ...Array.from({ length: 8 }, (_, index) => booleanInput(`step${index + 1}`, `Step ${index + 1}`, `Whether gate step ${index + 1} is active.`, index % 3 === 0)),
    numberInput('playhead', 'Playhead', 'Normalized algorithm-owned current step position.', 0),
    booleanInput('outputHigh', 'Output high', 'Shows the current script-owned gate output state.'),
  ],
  scenarios: [
    { id: 'default', name: 'Stopped pattern', state: 'stopped' },
    { id: 'active', name: 'Running pattern', state: 'running', values: { step1: true, step2: false, step3: true, step4: false, step5: true, step6: false, step7: false, step8: true, playhead: 0.57, outputHigh: true } },
    { id: 'edge', name: 'Muted lane', state: 'muted', values: { playhead: 1, outputHigh: false } },
  ],
  build: (context, state) => {
    const shade = state === 'muted' ? 3 : state === 'error' ? 15 : state === 'recording' ? 14 : state === 'running' ? 12 : 7
    const primitives: DisplayPrimitiveElement[] = [
      line(context, 'Gate row rail', 4, 6, 115, 6, state === 'muted' ? 2 : 5),
      line(context, 'Gate row quarter one', 32, 3, 32, 9, 5),
      line(context, 'Gate row quarter two', 60, 3, 60, 9, 5),
      line(context, 'Gate row quarter three', 88, 3, 88, 9, 5),
    ]
    for (let index = 0; index < 8; index += 1) {
      const x = 8 + index * 14
      primitives.push(box(context, `Gate row step ${index + 1}`, x - 2, 3, x + 2, 9, shade, true, context.visible(`step${index + 1}`)))
    }
    const playhead = context.number('playhead', 5, 115)
    primitives.push(
      line(context, 'Gate row playhead', playhead, 0, playhead, 11, state === 'running' || state === 'recording' ? 15 : 7),
      box(context, 'Gate row output high', 116, 4, 119, 8, 15, true, context.visible('outputHigh')),
    )
    if (state === 'running') primitives.push(line(context, 'Gate row running rail', 4, 1, playhead, 1, 13))
    if (state === 'recording') primitives.push(circle(context, 'Gate row record mark', 2, 2, 1, 15))
    if (state === 'muted') primitives.push(line(context, 'Gate row mute', 3, 10, 114, 1, 5))
    if (state === 'error') primitives.push(line(context, 'Gate row error one', 52, 1, 66, 10, 15), line(context, 'Gate row error two', 66, 1, 52, 10, 15))
    return primitives
  },
}

const probabilityAccentLane: DisplayComponentRecipe = {
  ...common,
  id: 'probability-accent-lane',
  name: 'Probability accent lane',
  category: 'sequencing',
  description: 'An eight-step authored probability lane with a separate most-recent fired, skipped, or accented event marker.',
  tags: ['probability', 'accent', 'lane', 'sequencer', 'random', 'fired', 'skipped', 'eight step'],
  footprint: { width: 120, height: 16 },
  states: [{ value: 'idle', name: 'Idle' }, { value: 'fired', name: 'Fired' }, { value: 'skipped', name: 'Skipped' }, { value: 'accent', name: 'Accent' }, { value: 'muted', name: 'Muted' }, { value: 'error', name: 'Error' }],
  defaultState: 'idle',
  inputs: [
    ...Array.from({ length: 8 }, (_, index) => numberInput(`step${index + 1}`, `Step ${index + 1}`, `Normalized authored probability for step ${index + 1}.`, 0.25 + (index % 4) * 0.2)),
    numberInput('recentStep', 'Recent step', 'Normalized position of the most recent random decision.', 0),
  ],
  scenarios: [
    { id: 'default', name: 'Authored probabilities', state: 'idle' },
    { id: 'active', name: 'Recent fired accent', state: 'accent', values: { step1: 1, step2: 0.25, step3: 0.5, step4: 0.75, step5: 0.2, step6: 0.6, step7: 0.4, step8: 0.9, recentStep: 0.57 } },
    { id: 'edge', name: 'Recent skip', state: 'skipped', values: { step1: 0, step2: 0.1, step3: 0.2, step4: 0.3, step5: 0.4, step6: 0.5, step7: 0.6, step8: 0.7, recentStep: 1 } },
  ],
  build: (context, state) => {
    const shade = state === 'muted' ? 3 : state === 'error' || state === 'skipped' ? 15 : state === 'accent' ? 14 : state === 'fired' ? 12 : 8
    const primitives: DisplayPrimitiveElement[] = [
      box(context, 'Probability lane frame', 0, 0, 119, 15, state === 'muted' ? 2 : state === 'error' ? 15 : 4),
      line(context, 'Probability lane baseline', 3, 13, 116, 13, state === 'muted' ? 2 : 5),
    ]
    for (let index = 0; index < 8; index += 1) {
      const x = 8 + index * 14
      primitives.push(line(context, `Probability step ${index + 1}`, x, 12, x, context.number(`step${index + 1}`, 12, 2), shade))
    }
    const recentStep = context.number('recentStep', 5, 115)
    primitives.push(line(context, 'Probability recent step', recentStep, 0, recentStep, 15, state === 'idle' ? 6 : 15))
    if (state === 'fired') primitives.push(box(context, 'Probability fired mark', context.number('recentStep', 3, 113), 1, context.number('recentStep', 7, 117), 4, 15, true))
    if (state === 'skipped') primitives.push(line(context, 'Probability skipped one', context.number('recentStep', 1, 111), 1, context.number('recentStep', 9, 119), 9, 15), line(context, 'Probability skipped two', context.number('recentStep', 9, 119), 1, context.number('recentStep', 1, 111), 9, 15))
    if (state === 'accent') primitives.push(line(context, 'Probability accent rail', context.number('recentStep', 1, 111), 1, context.number('recentStep', 9, 119), 1, 15))
    if (state === 'muted') primitives.push(line(context, 'Probability mute', 3, 14, 116, 1, 5))
    if (state === 'error') primitives.push(line(context, 'Probability error one', 52, 2, 67, 13, 15), line(context, 'Probability error two', 67, 2, 52, 13, 15))
    return primitives
  },
}

const euclideanRing: DisplayComponentRecipe = {
  ...common,
  id: 'eight-step-euclidean-ring',
  name: 'Eight-step Euclidean ring',
  category: 'sequencing',
  description: 'A bounded eight-position Euclidean rhythm ring with explicit hits, current position, rotation, mute, and invalid states.',
  tags: ['euclidean', 'ring', 'rhythm', 'rotation', 'fills', 'eight step', 'pattern', 'clock'],
  footprint: { width: 32, height: 32 },
  states: [{ value: 'stopped', name: 'Stopped' }, { value: 'running', name: 'Running' }, { value: 'hit', name: 'Current hit' }, { value: 'muted', name: 'Muted' }, { value: 'invalid', name: 'Invalid' }],
  defaultState: 'stopped',
  inputs: [
    ...Array.from({ length: 8 }, (_, index) => booleanInput(`step${index + 1}`, `Step ${index + 1}`, `Whether Euclidean position ${index + 1} is filled.`, index % 3 === 0)),
    numberInput('currentStep', 'Current step', 'Normalized algorithm-owned current position across the eight-step cycle.', 0),
    numberInput('rotation', 'Rotation', 'Normalized authored Euclidean rotation shown on the upper reference rail.', 0),
  ],
  scenarios: [
    { id: 'default', name: 'Stopped 3-in-8', state: 'stopped' },
    { id: 'active', name: 'Running hit', state: 'hit', values: { step1: true, step2: false, step3: false, step4: true, step5: false, step6: false, step7: true, step8: false, currentStep: 0.43, rotation: 0.25 } },
    { id: 'edge', name: 'Muted rotated ring', state: 'muted', values: { currentStep: 1, rotation: 0.75 } },
  ],
  build: (context, state) => {
    const shade = state === 'muted' ? 3 : state === 'invalid' ? 15 : state === 'hit' ? 15 : state === 'running' ? 12 : 7
    const positions = [[16, 4], [24, 7], [28, 15], [24, 23], [16, 26], [8, 23], [4, 15], [8, 7]] as const
    const primitives: DisplayPrimitiveElement[] = [circle(context, 'Euclidean ring rail', 16, 15, 12, state === 'muted' ? 2 : 5)]
    for (const [index, [x, y]] of positions.entries()) {
      primitives.push(circle(context, `Euclidean hit ${index + 1}`, x, y, 2, shade, context.visible(`step${index + 1}`)))
    }
    primitives.push(
      line(context, 'Euclidean current position', context.number('currentStep', 3, 28), 29, context.number('currentStep', 3, 28), 31, state === 'stopped' ? 6 : 15),
      line(context, 'Euclidean rotation', context.number('rotation', 6, 26), 0, context.number('rotation', 6, 26), 3, state === 'muted' ? 3 : 11),
    )
    if (state === 'stopped') primitives.push(box(context, 'Euclidean stop mark', 14, 13, 18, 17, 7))
    if (state === 'running') primitives.push(circle(context, 'Euclidean running centre', 16, 15, 2, 13))
    if (state === 'hit') primitives.push(line(context, 'Euclidean hit horizontal', 12, 15, 20, 15, 15), line(context, 'Euclidean hit vertical', 16, 11, 16, 19, 15))
    if (state === 'muted') primitives.push(line(context, 'Euclidean mute', 4, 27, 28, 3, 5))
    if (state === 'invalid') primitives.push(line(context, 'Euclidean invalid one', 9, 8, 23, 22, 15), line(context, 'Euclidean invalid two', 23, 8, 9, 22, 15))
    return primitives
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

const drumStepCell: DisplayComponentRecipe = {
  ...common,
  id: 'drum-step-cell',
  name: 'Drum step cell',
  category: 'drums',
  description: 'A rhythm step with distinct hit, accent, flam, roll, probability, ghost, and mute marks.',
  tags: ['drum', 'x0x', 'pattern', 'step', 'flam', 'roll', 'probability'],
  footprint: { width: 12, height: 12 },
  states: [{ value: 'off', name: 'Off' }, { value: 'hit', name: 'Hit' }, { value: 'accent', name: 'Accent' }, { value: 'flam', name: 'Flam' }, { value: 'roll', name: 'Roll' }, { value: 'probability', name: 'Probability' }, { value: 'ghost', name: 'Ghost' }, { value: 'muted', name: 'Muted' }],
  defaultState: 'off',
  inputs: [booleanInput('selected', 'Selected', 'Shows a separate playhead or editor-selection bracket.')],
  scenarios: [
    { id: 'default', name: 'Off', state: 'off' },
    { id: 'active', name: 'Accent + selected', state: 'accent', values: { selected: true } },
    { id: 'edge', name: 'Roll', state: 'roll', values: { selected: true } },
  ],
  build: (context, state) => {
    const primitives: DisplayPrimitiveElement[] = [box(context, 'Drum step outline', 1, 1, 10, 10, state === 'off' ? 4 : state === 'muted' ? 3 : 9)]
    if (state === 'hit') primitives.push(box(context, 'Drum step hit', 3, 3, 8, 8, 12, true))
    if (state === 'accent') primitives.push(box(context, 'Drum step accent', 2, 2, 9, 9, 15, true), box(context, 'Drum step accent cutout', 4, 4, 7, 7, 0, true))
    if (state === 'flam') primitives.push(line(context, 'Drum step flam one', 4, 3, 4, 8, 13), line(context, 'Drum step flam two', 7, 3, 7, 8, 15))
    if (state === 'roll') primitives.push(line(context, 'Drum step roll one', 3, 3, 3, 8, 12), line(context, 'Drum step roll two', 6, 3, 6, 8, 13), line(context, 'Drum step roll three', 9, 3, 9, 8, 15))
    if (state === 'probability') primitives.push(line(context, 'Drum step probability slash', 3, 8, 8, 3, 13), box(context, 'Drum step probability low', 3, 3, 3, 3, 15, true), box(context, 'Drum step probability high', 8, 8, 8, 8, 15, true))
    if (state === 'ghost') primitives.push(box(context, 'Drum step ghost', 4, 4, 7, 7, 6))
    if (state === 'muted') primitives.push(line(context, 'Drum step mute', 2, 9, 9, 2, 5))
    primitives.push(
      line(context, 'Drum selected top', 0, 0, 11, 0, 15, context.visible('selected')),
      line(context, 'Drum selected bottom', 0, 11, 11, 11, 15, context.visible('selected')),
    )
    return primitives
  },
}

const fillRollIndicator: DisplayComponentRecipe = {
  ...common,
  id: 'fill-roll-indicator',
  name: 'Fill roll indicator',
  category: 'drums',
  description: 'A bounded fill or roll meter that separates armed, firing, and finished states.',
  tags: ['drum', 'fill', 'roll', 'ratchet', 'burst', 'density', 'rate'],
  footprint: { width: 40, height: 12 },
  states: [{ value: 'idle', name: 'Idle' }, { value: 'armed', name: 'Armed' }, { value: 'firing', name: 'Firing' }, { value: 'finished', name: 'Finished' }],
  defaultState: 'idle',
  inputs: [
    numberInput('density', 'Density', 'Normalized authored fill density.', 0.5),
    numberInput('rate', 'Rate', 'Normalized script-owned roll rate marker.', 0.5),
  ],
  scenarios: [
    { id: 'default', name: 'Idle', state: 'idle', values: { density: 0.25, rate: 0.25 } },
    { id: 'active', name: 'Firing roll', state: 'firing', values: { density: 0.8, rate: 0.75 } },
    { id: 'edge', name: 'Finished', state: 'finished', values: { density: 1, rate: 1 } },
  ],
  build: (context, state) => {
    const shade = state === 'idle' ? 5 : state === 'armed' ? 10 : state === 'firing' ? 15 : 12
    const primitives: DisplayPrimitiveElement[] = [
      box(context, 'Fill frame', 0, 0, 39, 11, shade),
      tinyText(context, 'Fill label', 3, 8, state === 'idle' ? 'FILL' : state === 'armed' ? 'ARM' : state === 'firing' ? 'ROLL' : 'DONE', shade),
      line(context, 'Fill density rail', 20, 8, 37, 8, 4),
      box(context, 'Fill density', 20, 6, context.number('density', 20, 37), 9, shade, true),
      line(context, 'Fill rate marker', context.number('rate', 20, 37), 4, context.number('rate', 20, 37), 10, 15),
    ]
    if (state === 'armed') primitives.push(line(context, 'Fill armed upper', 18, 1, 38, 1, 15), line(context, 'Fill armed side', 38, 1, 38, 5, 15))
    if (state === 'firing') primitives.push(line(context, 'Fill firing one', 22, 2, 22, 4, 12), line(context, 'Fill firing two', 28, 2, 28, 4, 14), line(context, 'Fill firing three', 34, 2, 34, 4, 15))
    if (state === 'finished') primitives.push(box(context, 'Fill finished mark', 35, 1, 38, 4, 15, true))
    return primitives
  },
}

const drumOverview: DisplayComponentRecipe = {
  ...common,
  id: 'drum-overview',
  name: 'Two voice drum overview',
  category: 'drums',
  description: 'A two-voice performance view with independent hit, accent, mute, level, and step inputs.',
  tags: ['drum', 'overview', 'performance', 'kick', 'snare', 'hit', 'accent', 'mute'],
  footprint: { width: 64, height: 24 },
  states: [{ value: 'idle', name: 'Idle' }, { value: 'playing', name: 'Playing' }, { value: 'clock-lost', name: 'Clock lost' }, { value: 'disabled', name: 'Disabled' }],
  defaultState: 'idle',
  inputs: [
    booleanInput('voiceAHit', 'Kick hit', 'Shows the script-maintained kick event flash.'),
    booleanInput('voiceAAccent', 'Kick accent', 'Shows an outer kick accent ring.'),
    booleanInput('voiceAMuted', 'Kick muted', 'Shows a kick strike-through.'),
    numberInput('voiceALevel', 'Kick level', 'Normalized kick output level used for its body shade.', 0.4),
    booleanInput('voiceBHit', 'Snare hit', 'Shows the script-maintained snare event flash.'),
    booleanInput('voiceBAccent', 'Snare accent', 'Shows an outer snare accent ring.'),
    booleanInput('voiceBMuted', 'Snare muted', 'Shows a snare strike-through.'),
    numberInput('voiceBLevel', 'Snare level', 'Normalized snare output level used for its body shade.', 0.4),
    numberInput('step', 'Step position', 'Normalized current algorithm step position.', 0),
  ],
  scenarios: [
    { id: 'default', name: 'Idle', state: 'idle' },
    { id: 'active', name: 'Playing accents', state: 'playing', values: { voiceAHit: true, voiceAAccent: true, voiceALevel: 0.9, voiceBHit: true, voiceBLevel: 0.7, step: 0.45 } },
    { id: 'edge', name: 'Clock lost + muted snare', state: 'clock-lost', values: { voiceBMuted: true, step: 1 } },
  ],
  build: (context, state) => {
    const shade = state === 'disabled' ? 2 : state === 'clock-lost' ? 8 : state === 'playing' ? 12 : 5
    const primitives: DisplayPrimitiveElement[] = [
      box(context, 'Drum overview frame', 0, 0, 63, 23, shade),
      tinyText(context, 'Drum overview state', 61, 7, state === 'idle' ? 'IDLE' : state === 'playing' ? 'RUN' : state === 'clock-lost' ? 'NO CLK' : 'OFF', shade, 'right'),
      circle(context, 'Overview kick', 11, 10, 6, context.number('voiceALevel', 5, 15)),
      tinyText(context, 'Overview kick label', 11, 12, 'K', 15, 'centre'),
      circle(context, 'Overview snare', 29, 10, 6, context.number('voiceBLevel', 5, 15)),
      tinyText(context, 'Overview snare label', 29, 12, 'S', 15, 'centre'),
      box(context, 'Overview kick hit', 9, 8, 13, 12, 15, true, context.visible('voiceAHit')),
      box(context, 'Overview snare hit', 27, 8, 31, 12, 15, true, context.visible('voiceBHit')),
      circle(context, 'Overview kick accent', 11, 10, 8, 15, context.visible('voiceAAccent')),
      circle(context, 'Overview snare accent', 29, 10, 8, 15, context.visible('voiceBAccent')),
      line(context, 'Overview kick mute', 5, 16, 17, 4, 6, context.visible('voiceAMuted')),
      line(context, 'Overview snare mute', 23, 16, 35, 4, 6, context.visible('voiceBMuted')),
      line(context, 'Overview step rail', 42, 19, 61, 19, 4),
      line(context, 'Overview step marker', context.number('step', 42, 61), 17, context.number('step', 42, 61), 22, 15),
    ]
    if (state === 'playing') primitives.push(box(context, 'Overview clock pulse', 43, 4, 46, 7, 15, true))
    if (state === 'clock-lost') primitives.push(line(context, 'Overview clock lost one', 43, 3, 51, 10, 15), line(context, 'Overview clock lost two', 51, 3, 43, 10, 15))
    if (state === 'disabled') primitives.push(line(context, 'Overview disabled mark', 2, 21, 39, 2, 3))
    return primitives
  },
}

const punchySnareGlyph: DisplayComponentRecipe = {
  ...common,
  id: 'punchy-snare-glyph',
  name: 'Punchy hybrid snare glyph',
  category: 'drums',
  description: 'An original angular snare glyph with hit, accent, mute, selection, and solo overlays.',
  tags: ['909-like', 'punchy hybrid', 'snare', 'drum', 'voice', 'percussion'],
  footprint: { width: 18, height: 18 },
  states: [{ value: 'idle', name: 'Idle' }, { value: 'hit', name: 'Hit' }, { value: 'accent', name: 'Accent' }, { value: 'muted', name: 'Muted' }],
  defaultState: 'idle',
  inputs: [
    numberInput('level', 'Hit level', 'Normalized event level used for the snare body shade.', 0.5),
    booleanInput('selected', 'Selected', 'Shows selection rails outside the shell.'),
    booleanInput('solo', 'Solo', 'Shows a distinct solo corner marker.'),
  ],
  scenarios: [
    { id: 'default', name: 'Idle', state: 'idle', values: { level: 0.25 } },
    { id: 'active', name: 'Accented selected hit', state: 'accent', values: { level: 1, selected: true } },
    { id: 'edge', name: 'Muted + solo', state: 'muted', values: { level: 0.4, solo: true } },
  ],
  build: (context, state) => {
    const shade = state === 'muted' ? 3 : context.number('level', 5, 15)
    const primitives: DisplayPrimitiveElement[] = [
      box(context, 'Snare shell', 3, 5, 14, 14, shade),
      line(context, 'Snare top', 5, 3, 12, 3, state === 'accent' ? 15 : shade),
      line(context, 'Snare left shell', 3, 5, 5, 3, shade),
      line(context, 'Snare right shell', 14, 5, 12, 3, shade),
      line(context, 'Snare noise one', 5, 7, 12, 12, state === 'hit' || state === 'accent' ? 15 : 8),
      line(context, 'Snare noise two', 12, 7, 5, 12, state === 'hit' || state === 'accent' ? 15 : 8),
      line(context, 'Snare selected top', 1, 1, 16, 1, 15, context.visible('selected')),
      line(context, 'Snare selected bottom', 1, 16, 16, 16, 15, context.visible('selected')),
      box(context, 'Snare solo mark', 14, 1, 17, 4, 15, true, context.visible('solo')),
    ]
    if (state === 'hit') primitives.push(box(context, 'Snare hit centre', 7, 8, 10, 11, 15, true))
    if (state === 'accent') primitives.push(box(context, 'Snare accent frame', 1, 1, 16, 16, 15))
    if (state === 'muted') primitives.push(line(context, 'Snare mute', 2, 15, 15, 2, 6))
    return primitives
  },
}

const classicSnareGlyph: DisplayComponentRecipe = {
  ...common,
  id: 'classic-snare-glyph',
  name: 'Classic analog snare glyph',
  category: 'drums',
  description: 'An original rounded shell-and-noise snare glyph for the Classic analog drum family.',
  tags: ['808-like', 'classic analog', 'snare', 'drum', 'voice', 'percussion', 'noise'],
  footprint: { width: 18, height: 16 },
  states: [{ value: 'idle', name: 'Idle' }, { value: 'hit', name: 'Hit' }, { value: 'accent', name: 'Accent' }, { value: 'muted', name: 'Muted' }, { value: 'error', name: 'Error' }],
  defaultState: 'idle',
  inputs: [numberInput('noise', 'Noise amount', 'Normalized script-owned noise/body mix.', 0.5)],
  scenarios: [
    { id: 'default', name: 'Idle', state: 'idle', values: { noise: 0.35 } },
    { id: 'active', name: 'Snare hit', state: 'hit', values: { noise: 0.7 } },
    { id: 'edge', name: 'Accented hit', state: 'accent', values: { noise: 1 } },
  ],
  build: (context, state) => {
    const shade = state === 'muted' ? 3 : state === 'error' ? 15 : context.number('noise', 7, 14)
    const primitives: DisplayPrimitiveElement[] = [
      circle(context, 'Classic snare shell', 8, 9, 5, shade),
      line(context, 'Classic snare wire one', 3, 8, 13, 11, state === 'muted' ? 3 : 9),
      line(context, 'Classic snare wire two', 3, 11, 13, 8, state === 'muted' ? 3 : 11),
      tinyText(context, 'Classic snare label', 17, 7, 'S', state === 'muted' ? 3 : 9, 'right'),
    ]
    if (state === 'hit') primitives.push(circle(context, 'Classic snare hit ring', 8, 9, 7, 15))
    if (state === 'accent') primitives.push(circle(context, 'Classic snare accent ring', 8, 9, 7, 15), line(context, 'Classic snare accent top', 3, 1, 13, 1, 15))
    if (state === 'muted') primitives.push(line(context, 'Classic snare mute', 2, 14, 14, 2, 5))
    if (state === 'error') primitives.push(line(context, 'Classic snare error one', 2, 2, 14, 14, 15), line(context, 'Classic snare error two', 14, 2, 2, 14, 15))
    return primitives
  },
}

const punchyKickGlyph: DisplayComponentRecipe = {
  ...common,
  id: 'punchy-kick-glyph',
  name: 'Punchy hybrid kick glyph',
  category: 'drums',
  description: 'An original angular shell-and-transient kick glyph for the Punchy hybrid drum family.',
  tags: ['909-like', 'punchy hybrid', 'kick', 'drum', 'voice', 'percussion', 'transient'],
  footprint: { width: 18, height: 16 },
  states: [{ value: 'idle', name: 'Idle' }, { value: 'hit', name: 'Hit' }, { value: 'accent', name: 'Accent' }, { value: 'muted', name: 'Muted' }, { value: 'error', name: 'Error' }],
  defaultState: 'idle',
  inputs: [numberInput('body', 'Body level', 'Normalized script-owned body and transient level.', 0.5)],
  scenarios: [
    { id: 'default', name: 'Idle', state: 'idle', values: { body: 0.3 } },
    { id: 'active', name: 'Kick hit', state: 'hit', values: { body: 0.8 } },
    { id: 'edge', name: 'Accented hit', state: 'accent', values: { body: 1 } },
  ],
  build: (context, state) => {
    const shade = state === 'muted' ? 3 : state === 'error' ? 15 : context.number('body', 7, 14)
    const primitives: DisplayPrimitiveElement[] = [
      box(context, 'Punchy kick shell', 2, 5, 13, 14, shade),
      line(context, 'Punchy kick face', 5, 3, 15, 8, shade),
      line(context, 'Punchy kick transient', 15, 8, 17, 2, state === 'accent' ? 15 : 10),
      tinyText(context, 'Punchy kick label', 17, 15, 'K', state === 'muted' ? 3 : 9, 'right'),
    ]
    if (state === 'hit') primitives.push(box(context, 'Punchy kick hit core', 5, 8, 10, 12, 15, true))
    if (state === 'accent') primitives.push(box(context, 'Punchy kick accent core', 4, 7, 11, 13, 15, true), line(context, 'Punchy kick accent rail', 1, 1, 15, 1, 15))
    if (state === 'muted') primitives.push(line(context, 'Punchy kick mute', 1, 14, 15, 2, 5))
    if (state === 'error') primitives.push(line(context, 'Punchy kick error one', 2, 2, 15, 14, 15), line(context, 'Punchy kick error two', 15, 2, 2, 14, 15))
    return primitives
  },
}

const classicClapGlyph: DisplayComponentRecipe = {
  ...common,
  id: 'classic-clap-glyph',
  name: 'Classic analog clap glyph',
  category: 'drums',
  description: 'An original layered transient glyph for the Classic analog drum family.',
  tags: ['808-like', 'classic analog', 'clap', 'handclap', 'drum', 'voice', 'percussion'],
  footprint: { width: 18, height: 16 },
  states: [{ value: 'idle', name: 'Idle' }, { value: 'hit', name: 'Hit' }, { value: 'accent', name: 'Accent' }, { value: 'muted', name: 'Muted' }, { value: 'error', name: 'Error' }],
  defaultState: 'idle',
  inputs: [numberInput('spread', 'Transient spread', 'Normalized script-owned clap spread or event level.', 0.5)],
  scenarios: [
    { id: 'default', name: 'Idle', state: 'idle', values: { spread: 0.3 } },
    { id: 'active', name: 'Clap hit', state: 'hit', values: { spread: 0.75 } },
    { id: 'edge', name: 'Accented clap', state: 'accent', values: { spread: 1 } },
  ],
  build: (context, state) => {
    const shade = state === 'muted' ? 3 : state === 'error' ? 15 : context.number('spread', 7, 14)
    const primitives: DisplayPrimitiveElement[] = [
      line(context, 'Classic clap left transient', 2, 5, 8, 12, shade),
      line(context, 'Classic clap centre transient', 8, 2, 9, 13, state === 'muted' ? 3 : 11),
      line(context, 'Classic clap right transient', 15, 5, 9, 12, shade),
      tinyText(context, 'Classic clap label', 17, 15, 'CP', state === 'muted' ? 3 : 9, 'right'),
    ]
    if (state === 'hit') primitives.push(line(context, 'Classic clap hit rail', 1, 8, 16, 8, 15))
    if (state === 'accent') primitives.push(line(context, 'Classic clap accent top', 2, 1, 15, 1, 15), line(context, 'Classic clap accent rail', 1, 8, 16, 8, 15))
    if (state === 'muted') primitives.push(line(context, 'Classic clap mute', 2, 14, 15, 2, 5))
    if (state === 'error') primitives.push(line(context, 'Classic clap error one', 2, 2, 15, 14, 15), line(context, 'Classic clap error two', 15, 2, 2, 14, 15))
    return primitives
  },
}

const punchyClapGlyph: DisplayComponentRecipe = {
  ...common,
  id: 'punchy-clap-glyph',
  name: 'Punchy hybrid clap glyph',
  category: 'drums',
  description: 'An original angular layered-clap glyph for the Punchy hybrid drum family.',
  tags: ['909-like', 'punchy hybrid', 'clap', 'handclap', 'drum', 'voice', 'percussion', 'transient'],
  footprint: { width: 18, height: 16 },
  states: [{ value: 'idle', name: 'Idle' }, { value: 'hit', name: 'Hit' }, { value: 'accent', name: 'Accent' }, { value: 'muted', name: 'Muted' }, { value: 'error', name: 'Error' }],
  defaultState: 'idle',
  inputs: [numberInput('snap', 'Snap level', 'Normalized script-owned clap snap or event level.', 0.5)],
  scenarios: [
    { id: 'default', name: 'Idle', state: 'idle', values: { snap: 0.3 } },
    { id: 'active', name: 'Clap hit', state: 'hit', values: { snap: 0.8 } },
    { id: 'edge', name: 'Accented clap', state: 'accent', values: { snap: 1 } },
  ],
  build: (context, state) => {
    const shade = state === 'muted' ? 3 : state === 'error' ? 15 : context.number('snap', 7, 14)
    const primitives: DisplayPrimitiveElement[] = [
      line(context, 'Punchy clap upper transient', 2, 4, 14, 7, shade),
      line(context, 'Punchy clap centre transient', 1, 8, 16, 8, state === 'muted' ? 3 : 11),
      line(context, 'Punchy clap lower transient', 3, 12, 15, 9, shade),
      tinyText(context, 'Punchy clap label', 17, 15, 'CP', state === 'muted' ? 3 : 9, 'right'),
    ]
    if (state === 'hit') primitives.push(box(context, 'Punchy clap hit core', 6, 5, 11, 11, 15, true))
    if (state === 'accent') primitives.push(box(context, 'Punchy clap accent core', 5, 4, 12, 12, 15), line(context, 'Punchy clap accent rail', 1, 1, 16, 1, 15))
    if (state === 'muted') primitives.push(line(context, 'Punchy clap mute', 2, 14, 15, 2, 5))
    if (state === 'error') primitives.push(line(context, 'Punchy clap error one', 2, 2, 15, 14, 15), line(context, 'Punchy clap error two', 15, 2, 2, 14, 15))
    return primitives
  },
}

const classicRimClavesGlyph: DisplayComponentRecipe = {
  ...common,
  id: 'classic-rim-claves-glyph',
  name: 'Classic analog rim claves glyph',
  category: 'drums',
  description: 'An original paired-stick and rim transient glyph for the Classic analog drum family.',
  tags: ['808-like', 'classic analog', 'rim', 'claves', 'clave', 'drum', 'voice', 'percussion'],
  footprint: { width: 18, height: 16 },
  states: [{ value: 'idle', name: 'Idle' }, { value: 'hit', name: 'Hit' }, { value: 'accent', name: 'Accent' }, { value: 'muted', name: 'Muted' }, { value: 'error', name: 'Error' }],
  defaultState: 'idle',
  inputs: [numberInput('tone', 'Tone level', 'Normalized script-owned rim or claves event level.', 0.5)],
  scenarios: [
    { id: 'default', name: 'Idle', state: 'idle', values: { tone: 0.3 } },
    { id: 'active', name: 'Rim hit', state: 'hit', values: { tone: 0.8 } },
    { id: 'edge', name: 'Accented claves', state: 'accent', values: { tone: 1 } },
  ],
  build: (context, state) => {
    const shade = state === 'muted' ? 3 : state === 'error' ? 15 : context.number('tone', 7, 14)
    const primitives: DisplayPrimitiveElement[] = [
      circle(context, 'Classic rim shell', 8, 9, 5, shade),
      line(context, 'Classic claves stick one', 3, 4, 13, 12, state === 'muted' ? 3 : 10),
      line(context, 'Classic claves stick two', 13, 4, 3, 12, shade),
      tinyText(context, 'Classic rim label', 17, 15, 'R', state === 'muted' ? 3 : 9, 'right'),
    ]
    if (state === 'hit') primitives.push(line(context, 'Classic rim hit edge', 2, 9, 14, 9, 15))
    if (state === 'accent') primitives.push(circle(context, 'Classic rim accent ring', 8, 9, 7, 15), line(context, 'Classic rim accent top', 3, 1, 13, 1, 15))
    if (state === 'muted') primitives.push(line(context, 'Classic rim mute', 2, 14, 15, 2, 5))
    if (state === 'error') primitives.push(line(context, 'Classic rim error one', 2, 2, 15, 14, 15), line(context, 'Classic rim error two', 15, 2, 2, 14, 15))
    return primitives
  },
}

const punchyRimClavesGlyph: DisplayComponentRecipe = {
  ...common,
  id: 'punchy-rim-claves-glyph',
  name: 'Punchy hybrid rim claves glyph',
  category: 'drums',
  description: 'An original angular rim-and-stick transient glyph for the Punchy hybrid drum family.',
  tags: ['909-like', 'punchy hybrid', 'rim', 'claves', 'clave', 'drum', 'voice', 'percussion'],
  footprint: { width: 18, height: 16 },
  states: [{ value: 'idle', name: 'Idle' }, { value: 'hit', name: 'Hit' }, { value: 'accent', name: 'Accent' }, { value: 'muted', name: 'Muted' }, { value: 'error', name: 'Error' }],
  defaultState: 'idle',
  inputs: [numberInput('snap', 'Snap level', 'Normalized script-owned rim or claves transient level.', 0.5)],
  scenarios: [
    { id: 'default', name: 'Idle', state: 'idle', values: { snap: 0.3 } },
    { id: 'active', name: 'Claves hit', state: 'hit', values: { snap: 0.8 } },
    { id: 'edge', name: 'Accented rim', state: 'accent', values: { snap: 1 } },
  ],
  build: (context, state) => {
    const shade = state === 'muted' ? 3 : state === 'error' ? 15 : context.number('snap', 7, 14)
    const primitives: DisplayPrimitiveElement[] = [
      box(context, 'Punchy rim shell', 2, 6, 14, 13, shade),
      line(context, 'Punchy claves upper', 3, 3, 15, 9, state === 'muted' ? 3 : 11),
      line(context, 'Punchy claves lower', 14, 3, 2, 10, shade),
      tinyText(context, 'Punchy rim label', 17, 15, 'R', state === 'muted' ? 3 : 9, 'right'),
    ]
    if (state === 'hit') primitives.push(box(context, 'Punchy rim hit core', 6, 7, 11, 12, 15, true))
    if (state === 'accent') primitives.push(box(context, 'Punchy rim accent frame', 1, 1, 16, 14, 15), line(context, 'Punchy rim accent rail', 3, 1, 14, 1, 15))
    if (state === 'muted') primitives.push(line(context, 'Punchy rim mute', 2, 14, 15, 2, 5))
    if (state === 'error') primitives.push(line(context, 'Punchy rim error one', 2, 2, 15, 14, 15), line(context, 'Punchy rim error two', 15, 2, 2, 14, 15))
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

const i2cActivity: DisplayComponentRecipe = {
  ...common,
  id: 'i2c-activity',
  name: 'I2C activity',
  category: 'status',
  description: 'A script-owned I2C transaction indicator that performs no bus work from drawing.',
  tags: ['i2c', 'bus', 'send', 'receive', 'waiting', 'timeout', 'status'],
  footprint: { width: 40, height: 12 },
  states: [{ value: 'idle', name: 'Idle' }, { value: 'sending', name: 'Sending' }, { value: 'waiting', name: 'Waiting' }, { value: 'received', name: 'Received' }, { value: 'timeout', name: 'Timeout' }, { value: 'error', name: 'Error' }],
  defaultState: 'idle',
  inputs: [],
  scenarios: [
    { id: 'default', name: 'Idle', state: 'idle' },
    { id: 'active', name: 'Received', state: 'received' },
    { id: 'edge', name: 'Timeout', state: 'timeout' },
  ],
  build: (context, state) => {
    const shade = state === 'error' || state === 'timeout' ? 15 : state === 'idle' ? 5 : state === 'waiting' ? 8 : 13
    const primitives: DisplayPrimitiveElement[] = [
      box(context, 'I2C badge frame', 0, 0, 39, 11, shade),
      tinyText(context, 'I2C label', 3, 8, 'I2C', shade),
      line(context, 'I2C clock rail', 21, 3, 36, 3, state === 'idle' ? 4 : shade),
      line(context, 'I2C data rail', 21, 8, 36, 8, state === 'idle' ? 4 : shade),
    ]
    if (state === 'sending') primitives.push(line(context, 'I2C send marker', 27, 1, 32, 5, 15), line(context, 'I2C send head', 32, 5, 29, 5, 15))
    if (state === 'received') primitives.push(line(context, 'I2C receive marker', 32, 6, 27, 10, 15), line(context, 'I2C receive head', 27, 10, 30, 10, 15))
    if (state === 'waiting') primitives.push(line(context, 'I2C waiting mark', 27, 2, 27, 9, 10), line(context, 'I2C waiting mark two', 31, 2, 31, 9, 10))
    if (state === 'timeout') primitives.push(line(context, 'I2C timeout slash', 21, 10, 37, 1, 15))
    if (state === 'error') primitives.push(line(context, 'I2C error one', 25, 2, 34, 9, 15), line(context, 'I2C error two', 34, 2, 25, 9, 15))
    return primitives
  },
}

const presetStateMarker: DisplayComponentRecipe = {
  ...common,
  id: 'preset-state-marker',
  name: 'Preset state marker',
  category: 'status',
  description: 'Script-owned preset feedback for clean, changed, saving, saved, or error state.',
  tags: ['preset', 'state', 'save', 'dirty', 'changed', 'stored', 'status'],
  footprint: { width: 48, height: 12 },
  states: [{ value: 'clean', name: 'Clean' }, { value: 'changed', name: 'Changed' }, { value: 'saving', name: 'Saving' }, { value: 'saved', name: 'Saved' }, { value: 'error', name: 'Error' }],
  defaultState: 'clean',
  inputs: [textInput('label', 'Preset label', 'Short script-owned preset or state label.', 'P1')],
  scenarios: [
    { id: 'default', name: 'Clean', state: 'clean' },
    { id: 'active', name: 'Changed', state: 'changed', values: { label: 'P2' } },
    { id: 'edge', name: 'Save error', state: 'error', values: { label: 'P2' } },
  ],
  build: (context, state) => {
    const shade = state === 'error' ? 15 : state === 'saved' ? 14 : state === 'saving' ? 11 : state === 'changed' ? 10 : 6
    const primitives: DisplayPrimitiveElement[] = [
      box(context, 'Preset frame', 0, 0, 47, 11, shade),
      tinyText(context, 'Preset label', 3, 8, context.text('label'), shade),
      line(context, 'Preset divider', 25, 1, 25, 10, 4),
    ]
    if (state === 'clean') primitives.push(circle(context, 'Preset clean mark', 36, 6, 2, shade))
    if (state === 'changed') primitives.push(line(context, 'Preset changed horizontal', 31, 6, 41, 6, 15), line(context, 'Preset changed vertical', 36, 1, 36, 10, 15))
    if (state === 'saving') primitives.push(line(context, 'Preset saving shaft', 31, 3, 41, 8, 15), line(context, 'Preset saving head', 41, 8, 37, 9, 15))
    if (state === 'saved') primitives.push(line(context, 'Preset saved left', 31, 6, 35, 9, 15), line(context, 'Preset saved right', 35, 9, 42, 2, 15))
    if (state === 'error') primitives.push(line(context, 'Preset error one', 31, 2, 41, 9, 15), line(context, 'Preset error two', 41, 2, 31, 9, 15))
    return primitives
  },
}

const warningErrorBanner: DisplayComponentRecipe = {
  ...common,
  id: 'warning-error-banner',
  name: 'Warning error banner',
  category: 'status',
  description: 'A compact text-required warning or error treatment with latched and dismissed states.',
  tags: ['warning', 'error', 'banner', 'fault', 'message', 'latched', 'dismissed'],
  footprint: { width: 80, height: 16 },
  states: [{ value: 'warning', name: 'Warning' }, { value: 'error', name: 'Error' }, { value: 'latched', name: 'Latched' }, { value: 'dismissed', name: 'Dismissed' }],
  defaultState: 'warning',
  inputs: [textInput('message', 'Message', 'Short required script-owned warning or error text.', 'CHECK CV')],
  scenarios: [
    { id: 'default', name: 'Warning', state: 'warning' },
    { id: 'active', name: 'Latched warning', state: 'latched', values: { message: 'NO CLOCK' } },
    { id: 'edge', name: 'Error', state: 'error', values: { message: 'OVERLOAD' } },
  ],
  build: (context, state) => {
    const shade = state === 'dismissed' ? 3 : state === 'error' ? 15 : state === 'latched' ? 13 : 10
    const primitives: DisplayPrimitiveElement[] = [
      box(context, 'Banner frame', 0, 0, 79, 15, shade),
      tinyText(context, 'Banner message', 18, 10, context.text('message'), shade),
    ]
    if (state === 'warning') primitives.push(line(context, 'Banner warning base', 3, 12, 14, 12, 15), line(context, 'Banner warning left', 3, 12, 9, 2, 15), line(context, 'Banner warning right', 9, 2, 14, 12, 15))
    if (state === 'error') primitives.push(line(context, 'Banner error one', 3, 3, 14, 12, 15), line(context, 'Banner error two', 14, 3, 3, 12, 15))
    if (state === 'latched') primitives.push(box(context, 'Banner latch', 4, 3, 13, 11, 15), box(context, 'Banner latch centre', 7, 5, 10, 8, 0, true))
    if (state === 'dismissed') primitives.push(line(context, 'Banner dismissed mark', 2, 13, 77, 2, 5))
    return primitives
  },
}

const busyProgressIndicator: DisplayComponentRecipe = {
  ...common,
  id: 'busy-progress-indicator',
  name: 'Busy progress indicator',
  category: 'status',
  description: 'A bounded script-owned progress display with idle, working, complete, and error states.',
  tags: ['busy', 'progress', 'working', 'complete', 'loading', 'operation', 'status'],
  footprint: { width: 48, height: 12 },
  states: [{ value: 'idle', name: 'Idle' }, { value: 'working', name: 'Working' }, { value: 'complete', name: 'Complete' }, { value: 'error', name: 'Error' }],
  defaultState: 'idle',
  inputs: [numberInput('progress', 'Progress', 'Normalized progress for a bounded operation known to the script.', 0)],
  scenarios: [
    { id: 'default', name: 'Idle', state: 'idle', values: { progress: 0 } },
    { id: 'active', name: 'Working 60%', state: 'working', values: { progress: 0.6 } },
    { id: 'edge', name: 'Error', state: 'error', values: { progress: 0.8 } },
  ],
  build: (context, state) => {
    const shade = state === 'error' ? 15 : state === 'complete' ? 14 : state === 'working' ? 11 : 5
    const primitives: DisplayPrimitiveElement[] = [
      box(context, 'Progress frame', 0, 0, 47, 11, shade),
      line(context, 'Progress rail', 3, 8, 44, 8, 3),
      box(context, 'Progress fill', 3, 6, context.number('progress', 3, 44), 9, shade, true),
      tinyText(context, 'Progress label', 3, 5, state === 'idle' ? 'IDLE' : state === 'working' ? 'WORK' : state === 'complete' ? 'DONE' : 'ERR', shade),
    ]
    if (state === 'working') primitives.push(line(context, 'Progress working one', 34, 2, 34, 4, 9), line(context, 'Progress working two', 39, 2, 39, 4, 12), line(context, 'Progress working three', 44, 2, 44, 4, 15))
    if (state === 'complete') primitives.push(line(context, 'Progress complete left', 34, 3, 38, 6, 15), line(context, 'Progress complete right', 38, 6, 45, 1, 15))
    if (state === 'error') primitives.push(line(context, 'Progress error one', 35, 1, 44, 6, 15), line(context, 'Progress error two', 44, 1, 35, 6, 15))
    return primitives
  },
}

export const DISPLAY_COMPONENT_RECIPES: readonly DisplayComponentRecipe[] = [
  panelFrame,
  sectionHeader,
  statusLamp,
  dividerRuler,
  labelValueRow,
  stateBadge,
  segmentedSelector,
  pageIndicator,
  focusSelectionBrackets,
  emptyUnavailableMarker,
  inputJack,
  outputJack,
  bidirectionalJack,
  stereoJacks,
  normalledPair,
  labelledPortTile,
  splitMultipleNode,
  mergeMixNode,
  routingMatrixCell,
  patchLinkFlowLine,
  busRailTap,
  routerSwitch,
  momentaryButton,
  toggleSwitch,
  horizontalFader,
  threeWaySwitch,
  bipolarFader,
  rangeSlider,
  verticalFader,
  rotaryKnob,
  encoderRing,
  xyPadVectorPoint,
  softTakeoverControl,
  numericUnitReadout,
  signalTypeBadge,
  waveformGlyph,
  directionBadge,
  polarityBadge,
  unitBadge,
  channelVoiceBadge,
  attenuator,
  mixer,
  clampProcessor,
  sampleHoldProcessor,
  logicProcessor,
  bernoulliRouter,
  attenuverterProcessor,
  slewProcessor,
  pitchQuantizerProcessor,
  comparatorProcessor,
  clockTransformProcessor,
  feedbackUtility,
  unipolarMeter,
  bipolarMeter,
  segmentedMeter,
  verticalChannelMeter,
  thresholdWindowMeter,
  modulationRangeMeter,
  gateTriggerActivity,
  envelopeContour,
  phaseClockRing,
  noteRangeLadder,
  xyVectorMeter,
  boundedScopeStrip,
  stepCell,
  valueStepCell,
  playheadCursor,
  loopRangeBracket,
  transportStrip,
  patternPageStrip,
  trackerRow,
  miniKeyboardRow,
  pitchCvLane,
  eightStepGateRow,
  probabilityAccentLane,
  euclideanRing,
  drumVoiceGlyph,
  drumVoiceTile,
  drumStepCell,
  fillRollIndicator,
  drumOverview,
  punchySnareGlyph,
  classicSnareGlyph,
  punchyKickGlyph,
  classicClapGlyph,
  punchyClapGlyph,
  classicRimClavesGlyph,
  punchyRimClavesGlyph,
  clockSourceBadge,
  midiActivity,
  i2cActivity,
  presetStateMarker,
  warningErrorBanner,
  busyProgressIndicator,
]
