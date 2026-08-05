import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
  type RefObject,
} from 'react'
import { createPortal } from 'react-dom'
import { ControlIcon } from '../controls'
import { DISTING_CONTRACT_PROVENANCE } from '../validation/api-manifest'
import { allocateProjectFilename, type ScriptProject } from './projects'
import { LuaSourcePreview } from './LuaSourcePreview'
import {
  MIDI_MESSAGE_OPTIONS,
  PARAMETER_UNITS,
  SCAFFOLD_CONTROL_OPTIONS,
  createChoiceScaffoldParameter,
  createDefaultScriptScaffold,
  createMidiChannelParameter,
  createNumericScaffoldParameter,
  createScaffoldInput,
  createScaffoldOutput,
  createScaffoldParameterPreset,
  generateScriptScaffold,
  isCompatibleMidiParameter,
  type ScaffoldChoiceParameter,
  type ScaffoldControlCallback,
  type ScaffoldFinding,
  type ScaffoldNumericParameter,
  type ScaffoldParameter,
  type ScaffoldParameterPreset,
  type ScaffoldStep,
  type ScriptScaffoldDraft,
} from './script-scaffold'

interface Props {
  open: boolean
  projects: ScriptProject[]
  returnFocusRef: RefObject<HTMLButtonElement | null>
  onClose(): void
  onCreate(draft: ScriptScaffoldDraft): Promise<boolean>
}

type DialogPath = 'choose' | 'quick' | 'guided'

const STEPS: readonly { id: ScaffoldStep | 'review'; label: string }[] = [
  { id: 'basics', label: 'Basics' },
  { id: 'inputs', label: 'Inputs' },
  { id: 'outputs', label: 'Outputs' },
  { id: 'parameters', label: 'Parameters' },
  { id: 'controls', label: 'Hardware controls' },
  { id: 'extras', label: 'Extras & presets' },
  { id: 'review', label: 'Review' },
]

function moveItem<T>(items: T[], index: number, offset: -1 | 1) {
  const destination = index + offset
  if (destination < 0 || destination >= items.length) return items
  const next = [...items]
  const [item] = next.splice(index, 1)
  next.splice(destination, 0, item)
  return next
}

function numberFromInput(event: ChangeEvent<HTMLInputElement>) {
  return event.currentTarget.value === '' ? Number.NaN : event.currentTarget.valueAsNumber
}

function parameterDefaultValue(parameter: ScaffoldParameter) {
  return parameter.kind === 'numeric'
    ? parameter.defaultValue
    : Math.max(1, parameter.choices.findIndex(({ id }) => id === parameter.defaultChoiceId) + 1)
}

function FindingList({ findings, onOpen }: {
  findings: ScaffoldFinding[]
  onOpen(finding: ScaffoldFinding): void
}) {
  if (findings.length === 0) return null
  return (
    <div className="script-scaffold-findings" role="alert" aria-label="Scaffold problems">
      <strong>Fix {findings.length} {findings.length === 1 ? 'problem' : 'problems'} before creating.</strong>
      <ul>
        {findings.map((finding, index) => (
          <li key={`${finding.code}-${finding.entityId ?? ''}-${finding.field ?? ''}-${index}`}>
            <button type="button" onClick={() => onOpen(finding)}>{finding.message}</button>
          </li>
        ))}
      </ul>
    </div>
  )
}

function BasicsFields({ draft, onChange }: {
  draft: ScriptScaffoldDraft
  onChange(draft: ScriptScaffoldDraft): void
}) {
  const generated = generateScriptScaffold(draft)
  const update = (field: 'name' | 'description' | 'author', value: string) => onChange({ ...draft, [field]: value })
  return (
    <div className="script-scaffold-form-grid">
      <label>
        <span>Script name</span>
        <input data-scaffold-field="name" value={draft.name} onChange={(event) => update('name', event.currentTarget.value)} placeholder="New Script" />
      </label>
      <label className="script-scaffold-wide-field">
        <span>Short description</span>
        <input data-scaffold-field="description" value={draft.description} onChange={(event) => update('description', event.currentTarget.value)} placeholder="What does this script do?" />
        <small>The module reads this from the second source comment.</small>
      </label>
      <label>
        <span>Author</span>
        <input data-scaffold-field="author" value={draft.author} onChange={(event) => update('author', event.currentTarget.value)} placeholder="Your Name" />
      </label>
      <div className="script-scaffold-filename">
        <span>Suggested filename</span>
        <code>{generated.ok ? generated.filename : 'New Script.lua'}</code>
      </div>
    </div>
  )
}

function ListActions({ label, index, count, onMove, onRemove }: {
  label: string
  index: number
  count: number
  onMove(offset: -1 | 1): void
  onRemove(): void
}) {
  return (
    <div className="script-scaffold-row-actions">
      <button type="button" aria-label={`Move ${label} up`} disabled={index === 0} onClick={() => onMove(-1)}>↑</button>
      <button type="button" aria-label={`Move ${label} down`} disabled={index === count - 1} onClick={() => onMove(1)}>↓</button>
      <button type="button" aria-label={`Remove ${label}`} onClick={onRemove}>Remove</button>
    </div>
  )
}

interface StepProps {
  draft: ScriptScaffoldDraft
  onChange(draft: ScriptScaffoldDraft): void
  newId(prefix: string): string
}

function InputsStep({ draft, onChange, newId }: StepProps) {
  const update = (index: number, values: Partial<ScriptScaffoldDraft['inputs'][number]>) => onChange({
    ...draft,
    inputs: draft.inputs.map((input, candidate) => candidate === index ? { ...input, ...values } : input),
  })
  return (
    <div className="script-scaffold-step-content">
      <p>Inputs are ordered from 1 to 28. Gate and trigger choices add their matching edge callbacks.</p>
      <div className="script-scaffold-rows">
        {draft.inputs.map((input, index) => (
          <div className="script-scaffold-row" key={input.id}>
            <span className="script-scaffold-index">{index + 1}</span>
            <label><span>Name</span><input data-scaffold-field={`${input.id}:name`} value={input.name} onChange={(event) => update(index, { name: event.currentTarget.value })} /></label>
            <label><span>Type</span><select value={input.kind} onChange={(event) => update(index, { kind: event.currentTarget.value as typeof input.kind })}><option value="cv">CV</option><option value="gate">Gate</option><option value="trigger">Trigger</option></select></label>
            <ListActions label={input.name || `input ${index + 1}`} index={index} count={draft.inputs.length} onMove={(offset) => onChange({ ...draft, inputs: moveItem(draft.inputs, index, offset) })} onRemove={() => onChange({ ...draft, inputs: draft.inputs.filter((_, candidate) => candidate !== index) })} />
          </div>
        ))}
      </div>
      <button type="button" className="script-scaffold-add" disabled={draft.inputs.length >= 28} onClick={() => onChange({ ...draft, inputs: [...draft.inputs, createScaffoldInput(draft.inputs.length + 1, newId('input'))] })}>Add input</button>
    </div>
  )
}

function OutputsStep({ draft, onChange, newId }: StepProps) {
  const update = (index: number, values: Partial<ScriptScaffoldDraft['outputs'][number]>) => onChange({
    ...draft,
    outputs: draft.outputs.map((output, candidate) => candidate === index ? { ...output, ...values } : output),
  })
  return (
    <div className="script-scaffold-step-content">
      <p>Linear outputs suit smooth CV. Stepped outputs hold each 1 ms update. Unassigned outputs retain their prior voltage.</p>
      <div className="script-scaffold-rows">
        {draft.outputs.map((output, index) => (
          <div className="script-scaffold-row" key={output.id}>
            <span className="script-scaffold-index">{index + 1}</span>
            <label><span>Name</span><input data-scaffold-field={`${output.id}:name`} value={output.name} onChange={(event) => update(index, { name: event.currentTarget.value })} /></label>
            <label><span>Mode</span><select value={output.kind} onChange={(event) => update(index, { kind: event.currentTarget.value as typeof output.kind })}><option value="linear">Linear</option><option value="stepped">Stepped</option></select></label>
            <ListActions label={output.name || `output ${index + 1}`} index={index} count={draft.outputs.length} onMove={(offset) => onChange({ ...draft, outputs: moveItem(draft.outputs, index, offset) })} onRemove={() => onChange({ ...draft, outputs: draft.outputs.filter((_, candidate) => candidate !== index) })} />
          </div>
        ))}
      </div>
      <button type="button" className="script-scaffold-add" disabled={draft.outputs.length >= 28} onClick={() => onChange({ ...draft, outputs: [...draft.outputs, createScaffoldOutput(draft.outputs.length + 1, newId('output'))] })}>Add output</button>
    </div>
  )
}

function NumericParameterFields({ parameter, onChange }: {
  parameter: ScaffoldNumericParameter
  onChange(parameter: ScaffoldNumericParameter): void
}) {
  return (
    <div className="script-scaffold-parameter-fields">
      <label><span>Minimum</span><input data-scaffold-field={`${parameter.id}:minimum`} type="number" value={Number.isNaN(parameter.minimum) ? '' : parameter.minimum} onChange={(event) => onChange({ ...parameter, minimum: numberFromInput(event) })} /></label>
      <label><span>Maximum</span><input type="number" value={Number.isNaN(parameter.maximum) ? '' : parameter.maximum} onChange={(event) => onChange({ ...parameter, maximum: numberFromInput(event) })} /></label>
      <label><span>Default</span><input type="number" value={Number.isNaN(parameter.defaultValue) ? '' : parameter.defaultValue} onChange={(event) => onChange({ ...parameter, defaultValue: numberFromInput(event) })} /></label>
      <label><span>Unit</span><select value={parameter.unit} onChange={(event) => onChange({ ...parameter, unit: event.currentTarget.value as typeof parameter.unit })}>{PARAMETER_UNITS.map((unit) => <option key={unit.name} value={unit.name}>{unit.label}</option>)}</select></label>
      <label><span>Precision</span><select value={parameter.precision} onChange={(event) => onChange({ ...parameter, precision: Number(event.currentTarget.value) as typeof parameter.precision })}><option value={1}>Whole</option><option value={10}>0.1</option><option value={100}>0.01</option><option value={1000}>0.001</option></select></label>
    </div>
  )
}

function ChoiceParameterFields({ parameter, onChange, newId }: {
  parameter: ScaffoldChoiceParameter
  onChange(parameter: ScaffoldChoiceParameter): void
  newId(prefix: string): string
}) {
  const removeChoice = (choiceIndex: number) => {
    const choices = parameter.choices.filter((_, index) => index !== choiceIndex)
    const defaultChoiceId = choices.some(({ id }) => id === parameter.defaultChoiceId) ? parameter.defaultChoiceId : choices[0]?.id ?? ''
    onChange({ ...parameter, choices, defaultChoiceId })
  }
  return (
    <div className="script-scaffold-choice-editor">
      {parameter.choices.map((choice, index) => (
        <div key={choice.id} className="script-scaffold-choice-row">
          <input data-scaffold-field={`${parameter.id}:${choice.id}`} aria-label={`Choice ${index + 1} label`} value={choice.label} onChange={(event) => onChange({ ...parameter, choices: parameter.choices.map((candidate) => candidate.id === choice.id ? { ...candidate, label: event.currentTarget.value } : candidate) })} />
          <label className="script-scaffold-default-choice"><input type="radio" name={`default-${parameter.id}`} checked={parameter.defaultChoiceId === choice.id} onChange={() => onChange({ ...parameter, defaultChoiceId: choice.id })} /> Default</label>
          <button type="button" aria-label={`Move choice ${index + 1} up`} disabled={index === 0} onClick={() => onChange({ ...parameter, choices: moveItem(parameter.choices, index, -1) })}>↑</button>
          <button type="button" aria-label={`Move choice ${index + 1} down`} disabled={index === parameter.choices.length - 1} onClick={() => onChange({ ...parameter, choices: moveItem(parameter.choices, index, 1) })}>↓</button>
          <button type="button" aria-label={`Remove choice ${index + 1}`} onClick={() => removeChoice(index)}>Remove</button>
        </div>
      ))}
      <button type="button" onClick={() => { const id = newId('choice'); onChange({ ...parameter, choices: [...parameter.choices, { id, label: `Choice ${parameter.choices.length + 1}` }] }) }}>Add choice</button>
    </div>
  )
}

function ParametersStep({ draft, onChange, newId }: StepProps) {
  const syncParameters = (parameters: ScaffoldParameter[]) => {
    const ids = new Set(parameters.map(({ id }) => id))
    const parameterPresets = draft.extras.parameterPresets.map((preset) => ({
      ...preset,
      valuesByParameterId: Object.fromEntries(parameters.map((parameter) => [
        parameter.id,
        ids.has(parameter.id) && preset.valuesByParameterId[parameter.id] !== undefined
          ? preset.valuesByParameterId[parameter.id]
          : parameterDefaultValue(parameter),
      ])),
    }))
    onChange({ ...draft, parameters, extras: { ...draft.extras, parameterPresets } })
  }
  const update = (index: number, parameter: ScaffoldParameter) => syncParameters(draft.parameters.map((candidate, candidateIndex) => candidateIndex === index ? parameter : candidate))
  return (
    <div className="script-scaffold-step-content">
      <p>Numeric parameters use script-visible values; the generator converts precision to raw integer metadata.</p>
      <div className="script-scaffold-rows">
        {draft.parameters.map((parameter, index) => (
          <section className="script-scaffold-parameter" key={parameter.id} aria-label={`${parameter.name || 'Parameter'} settings`}>
            <div className="script-scaffold-parameter-heading">
              <span className="script-scaffold-index">{index + 1}</span>
              <label><span>Name</span><input data-scaffold-field={`${parameter.id}:name`} value={parameter.name} onChange={(event) => update(index, { ...parameter, name: event.currentTarget.value })} /></label>
              <span className="script-scaffold-kind">{parameter.kind === 'numeric' ? 'Numeric' : 'Choice'}</span>
              <ListActions label={parameter.name || `parameter ${index + 1}`} index={index} count={draft.parameters.length} onMove={(offset) => syncParameters(moveItem(draft.parameters, index, offset))} onRemove={() => syncParameters(draft.parameters.filter((_, candidate) => candidate !== index))} />
            </div>
            {parameter.kind === 'numeric' ? <NumericParameterFields parameter={parameter} onChange={(next) => update(index, next)} /> : <ChoiceParameterFields parameter={parameter} onChange={(next) => update(index, next)} newId={newId} />}
          </section>
        ))}
      </div>
      <div className="script-scaffold-add-group">
        <button type="button" onClick={() => syncParameters([...draft.parameters, createNumericScaffoldParameter(draft.parameters.length + 1, newId('parameter'))])}>Add numeric parameter</button>
        <button type="button" onClick={() => syncParameters([...draft.parameters, createChoiceScaffoldParameter(draft.parameters.length + 1, newId('parameter'))])}>Add choice parameter</button>
      </div>
    </div>
  )
}

function ControlsStep({ draft, onChange }: StepProps) {
  const selectCallback = (callback: ScaffoldControlCallback, checked: boolean) => onChange({ ...draft, controls: { ...draft.controls, callbacks: checked ? [...draft.controls.callbacks, callback] : draft.controls.callbacks.filter((candidate) => candidate !== callback) } })
  const groups = [
    { title: 'Disting NT algorithm controls', options: SCAFFOLD_CONTROL_OPTIONS.filter(({ provenance }) => provenance === 'manual-1.12') },
    { title: 'Non-manual and Luading-only control events', options: SCAFFOLD_CONTROL_OPTIONS.filter(({ provenance }) => provenance !== 'manual-1.12') },
  ]
  return (
    <div className="script-scaffold-step-content">
      <div className="script-scaffold-choice-cards" role="radiogroup" aria-label="Front-panel UI behavior">
        <label><input type="radio" name="custom-ui" checked={!draft.controls.customUi} onChange={() => onChange({ ...draft, controls: { ...draft.controls, customUi: false, callbacks: [] } })} /><strong>Use the standard parameter UI</strong><small>Recommended when the three pots should navigate and edit parameters normally.</small></label>
        <label><input type="radio" name="custom-ui" checked={draft.controls.customUi} onChange={() => onChange({ ...draft, controls: { ...draft.controls, customUi: true } })} /><strong>Build a custom algorithm UI</strong><small>Generates `ui()` and selected event stubs. Standard parameter control is replaced.</small></label>
      </div>
      {draft.controls.customUi && groups.map((group, groupIndex) => (
        <section className="script-scaffold-control-group" key={group.title}>
          <h4>{group.title}</h4>
          {groupIndex === 1 && <label className="script-scaffold-extension-consent"><input type="checkbox" checked={draft.controls.allowSimulatorExtensions} onChange={(event) => onChange({ ...draft, controls: { ...draft.controls, allowSimulatorExtensions: event.currentTarget.checked } })} />Allow callbacks that are not documented for hardware algorithm scripts</label>}
          <div className="script-scaffold-control-options">
            {group.options.map((option) => (
              <label key={option.callback}><input type="checkbox" checked={draft.controls.callbacks.includes(option.callback)} disabled={groupIndex === 1 && !draft.controls.allowSimulatorExtensions} onChange={(event) => selectCallback(option.callback, event.currentTarget.checked)} /><span>{option.label}</span>{option.provenance !== 'manual-1.12' && <small>{DISTING_CONTRACT_PROVENANCE[option.provenance].label}</small>}</label>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

function PresetEditor({ draft, preset, onChange, onRemove }: {
  draft: ScriptScaffoldDraft
  preset: ScaffoldParameterPreset
  onChange(preset: ScaffoldParameterPreset): void
  onRemove(): void
}) {
  return (
    <section className="script-scaffold-preset" aria-label={`${preset.name || 'Named starting point'} values`}>
      <div className="script-scaffold-preset-heading"><label><span>Name</span><input data-scaffold-field={`${preset.id}:name`} value={preset.name} onChange={(event) => onChange({ ...preset, name: event.currentTarget.value })} /></label><button type="button" onClick={onRemove}>Remove</button></div>
      <div className="script-scaffold-preset-values">
        {draft.parameters.map((parameter) => (
          <label key={parameter.id}><span>{parameter.name}</span>{parameter.kind === 'numeric'
            ? <input type="number" step={1 / parameter.precision} min={parameter.minimum} max={parameter.maximum} value={preset.valuesByParameterId[parameter.id] ?? ''} onChange={(event) => onChange({ ...preset, valuesByParameterId: { ...preset.valuesByParameterId, [parameter.id]: numberFromInput(event) } })} />
            : <select value={preset.valuesByParameterId[parameter.id] ?? 1} onChange={(event) => onChange({ ...preset, valuesByParameterId: { ...preset.valuesByParameterId, [parameter.id]: Number(event.currentTarget.value) } })}>{parameter.choices.map((choice, index) => <option key={choice.id} value={index + 1}>{choice.label || `Choice ${index + 1}`}</option>)}</select>}</label>
        ))}
      </div>
    </section>
  )
}

function ExtrasStep({ draft, onChange, newId }: StepProps) {
  const compatibleMidi = draft.parameters.filter(isCompatibleMidiParameter)
  const toggleMidi = (enabled: boolean) => {
    if (!enabled) {
      const extras = { ...draft.extras }
      delete extras.midi
      onChange({ ...draft, extras })
    } else if (compatibleMidi[0]) {
      onChange({ ...draft, extras: { ...draft.extras, midi: { parameterId: compatibleMidi[0].id, messages: ['note'] } } })
    } else {
      const parameter = createMidiChannelParameter(newId('parameter'))
      const parameterPresets = draft.extras.parameterPresets.map((preset) => ({ ...preset, valuesByParameterId: { ...preset.valuesByParameterId, [parameter.id]: parameter.defaultValue } }))
      onChange({ ...draft, parameters: [...draft.parameters, parameter], extras: { ...draft.extras, midi: { parameterId: parameter.id, messages: ['note'] }, parameterPresets } })
    }
  }
  const updatePreset = (id: string, preset: ScaffoldParameterPreset) => onChange({ ...draft, extras: { ...draft.extras, parameterPresets: draft.extras.parameterPresets.map((candidate) => candidate.id === id ? preset : candidate) } })
  return (
    <div className="script-scaffold-step-content script-scaffold-extras">
      <section><h4>Display</h4><label><span>Display scaffold</span><select value={draft.extras.display} onChange={(event) => onChange({ ...draft, extras: { ...draft.extras, display: event.currentTarget.value as typeof draft.extras.display } })}><option value="standard">Standard parameter display</option><option value="custom-with-parameter-line">Custom drawing + standard parameter line</option><option value="custom-full">Custom drawing uses the whole display</option></select></label></section>
      <section>
        <h4>MIDI input</h4><label className="script-scaffold-toggle"><input type="checkbox" checked={Boolean(draft.extras.midi)} onChange={(event) => toggleMidi(event.currentTarget.checked)} />Receive filtered MIDI messages</label>
        {draft.extras.midi && <div className="script-scaffold-nested-options">
          <label><span>Channel parameter</span><select data-scaffold-field="midiParameter" value={draft.extras.midi.parameterId} onChange={(event) => onChange({ ...draft, extras: { ...draft.extras, midi: { ...draft.extras.midi!, parameterId: event.currentTarget.value } } })}>{compatibleMidi.map((parameter) => <option key={parameter.id} value={parameter.id}>{parameter.name}</option>)}</select></label>
          <fieldset><legend>Message types</legend><div className="script-scaffold-inline-options">{MIDI_MESSAGE_OPTIONS.map((message) => <label key={message}><input type="checkbox" checked={draft.extras.midi?.messages.includes(message)} onChange={(event) => { const current = draft.extras.midi!; const messages = event.currentTarget.checked ? [...current.messages, message] : current.messages.filter((candidate) => candidate !== message); onChange({ ...draft, extras: { ...draft.extras, midi: { ...current, messages } } }) }} /> {message}</label>)}</div></fieldset>
        </div>}
      </section>
      <section><h4>Preset state</h4><label className="script-scaffold-toggle"><input type="checkbox" checked={draft.extras.serialise} onChange={(event) => onChange({ ...draft, extras: { ...draft.extras, serialise: event.currentTarget.checked } })} />Save extra JSON-friendly state with the Disting preset</label></section>
      <section>
        <div className="script-scaffold-section-heading"><div><h4>Named parameter starting points</h4><p><strong>Luading simulator extension.</strong> Hardware ignores this source field.</p></div><button type="button" disabled={draft.parameters.length === 0} onClick={() => onChange({ ...draft, extras: { ...draft.extras, parameterPresets: [...draft.extras.parameterPresets, createScaffoldParameterPreset(draft, newId('preset'))] } })}>Add starting point</button></div>
        {draft.parameters.length === 0 && <small>Add a parameter before defining starting points.</small>}
        {draft.extras.parameterPresets.map((preset) => <PresetEditor key={preset.id} draft={draft} preset={preset} onChange={(next) => updatePreset(preset.id, next)} onRemove={() => onChange({ ...draft, extras: { ...draft.extras, parameterPresets: draft.extras.parameterPresets.filter(({ id }) => id !== preset.id) } })} />)}
      </section>
    </div>
  )
}

export function NewScriptDialog({ open, projects, returnFocusRef, onClose, onCreate }: Props) {
  const [path, setPath] = useState<DialogPath>('choose')
  const [stepIndex, setStepIndex] = useState(0)
  const [draft, setDraft] = useState(createDefaultScriptScaffold)
  const [creating, setCreating] = useState(false)
  const [showErrors, setShowErrors] = useState(false)
  const dialogRef = useRef<HTMLDivElement>(null)
  const idRef = useRef(1)
  const result = useMemo(() => generateScriptScaffold(draft), [draft])
  const findings = result.ok ? [] : result.findings
  const allocatedFilename = result.ok ? allocateProjectFilename(result.filename, projects) : undefined
  const currentStep = STEPS[stepIndex]
  const newId = (prefix: string) => `${prefix}-draft-${idRef.current++}`

  useEffect(() => {
    if (!open) return
    setPath('choose'); setStepIndex(0); setDraft(createDefaultScriptScaffold()); setCreating(false); setShowErrors(false); idRef.current = 1
  }, [open])

  useEffect(() => {
    if (!open) return
    const previousOverflow = document.body.style.overflow
    const returnFocus = returnFocusRef.current
    document.body.style.overflow = 'hidden'
    const frame = window.requestAnimationFrame(() => dialogRef.current?.querySelector<HTMLElement>('button, input, select, [tabindex]:not([tabindex="-1"])')?.focus())
    return () => { window.cancelAnimationFrame(frame); document.body.style.overflow = previousOverflow; returnFocus?.focus() }
  }, [open, returnFocusRef])

  if (!open) return null
  const focusStep = (index: number) => { setStepIndex(index); window.requestAnimationFrame(() => dialogRef.current?.querySelector<HTMLElement>('[data-scaffold-step-heading]')?.focus()) }
  const openFinding = (finding: ScaffoldFinding) => {
    setPath('guided')
    setStepIndex(Math.max(0, STEPS.findIndex(({ id }) => id === finding.step)))
    window.requestAnimationFrame(() => {
      const target = finding.entityId ? `${finding.entityId}:${finding.field ?? ''}` : finding.field
      const field = dialogRef.current?.querySelector<HTMLElement>(`[data-scaffold-field="${target ?? ''}"]`)
      if (field) field.focus()
      else dialogRef.current?.querySelector<HTMLElement>('[data-scaffold-step-heading]')?.focus()
    })
  }
  const submit = async () => {
    if (!result.ok) { setShowErrors(true); if (result.findings[0]) openFinding(result.findings[0]); return }
    setCreating(true)
    try { if (await onCreate(result.draft)) onClose() } finally { setCreating(false) }
  }
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') { event.preventDefault(); onClose(); return }
    if (event.key !== 'Tab') return
    const focusable = [...(dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])') ?? [])]
    if (focusable.length === 0) return
    const first = focusable[0]; const last = focusable.at(-1)!
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
  }

  let content
  if (path === 'choose') {
    content = <div className="script-scaffold-paths"><button type="button" onClick={() => setPath('quick')}><strong>Quick start</strong><span>One CV input, one linear output, and working pass-through logic.</span></button><button type="button" onClick={() => setPath('guided')}><strong>Guided setup</strong><span>Choose I/O, parameters, hardware controls, presets, and optional callbacks.</span></button></div>
  } else if (path === 'quick') {
    content = <div className="script-scaffold-quick"><button type="button" className="script-scaffold-back-link" onClick={() => setPath('choose')}>← Creation choices</button><h3 tabIndex={-1} data-scaffold-step-heading>Quick start</h3><p>Keep these defaults or change only the identity. The generated script passes Input 1 to Output 1.</p><BasicsFields draft={draft} onChange={setDraft} /></div>
  } else {
    content = <div className="script-scaffold-guided">
      <nav className="script-scaffold-steps" aria-label="Script setup steps"><ol>{STEPS.map((step, index) => <li key={step.id}><button type="button" className={index === stepIndex ? 'is-active' : ''} aria-current={index === stepIndex ? 'step' : undefined} onClick={() => focusStep(index)}><span>{index + 1}</span>{step.label}</button></li>)}</ol></nav>
      <div className="script-scaffold-step-panel" aria-labelledby={`script-scaffold-step-${currentStep.id}`}><p className="script-scaffold-step-count">Step {stepIndex + 1} of {STEPS.length}</p><h3 id={`script-scaffold-step-${currentStep.id}`} data-scaffold-step-heading tabIndex={-1}>{currentStep.label}</h3>
        {currentStep.id === 'basics' && <BasicsFields draft={draft} onChange={setDraft} />}
        {currentStep.id === 'inputs' && <InputsStep draft={draft} onChange={setDraft} newId={newId} />}
        {currentStep.id === 'outputs' && <OutputsStep draft={draft} onChange={setDraft} newId={newId} />}
        {currentStep.id === 'parameters' && <ParametersStep draft={draft} onChange={setDraft} newId={newId} />}
        {currentStep.id === 'controls' && <ControlsStep draft={draft} onChange={setDraft} newId={newId} />}
        {currentStep.id === 'extras' && <ExtrasStep draft={draft} onChange={setDraft} newId={newId} />}
        {currentStep.id === 'review' && <div className="script-scaffold-review"><FindingList findings={findings} onOpen={openFinding} />{result.ok && <><dl><div><dt>File</dt><dd><code className="script-scaffold-review-filename">{allocatedFilename}</code></dd></div><div><dt>Inputs</dt><dd>{result.summary.inputCount}</dd></div><div><dt>Outputs</dt><dd>{result.summary.outputCount}</dd></div><div><dt>Parameters</dt><dd>{result.summary.parameterCount}</dd></div><div><dt>Callbacks</dt><dd>{result.summary.callbacks.join(', ')}</dd></div></dl><div className="script-scaffold-compatibility"><section><h4>Disting NT</h4><p>{result.summary.hardwareFeatures.join(', ') || 'Basic algorithm scaffold'}</p></section><section className={result.summary.simulatorExtensions.length > 0 ? 'has-extensions' : ''}><h4>Luading extensions</h4><p>{result.summary.simulatorExtensions.join(', ') || 'None'}</p></section></div><details className="script-scaffold-source" open><summary>Generated Lua source</summary><LuaSourcePreview source={result.source} /></details></>}</div>}
      </div>
    </div>
  }

  const dialog = <div className="script-scaffold-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}><div ref={dialogRef} className="script-scaffold-dialog" role="dialog" aria-modal="true" aria-labelledby="script-scaffold-title" aria-describedby="script-scaffold-description" onKeyDown={handleKeyDown}>
    <header><div><h2 id="script-scaffold-title">Create Lua script</h2><p id="script-scaffold-description">Start immediately or build a valid Disting NT algorithm scaffold step by step.</p></div><button type="button" aria-label="Close Create Lua script" onClick={onClose}><ControlIcon name="close" size={16} /></button></header>
    <main>{content}</main>
    {showErrors && path !== 'guided' && <FindingList findings={findings} onOpen={openFinding} />}
    <footer><button type="button" onClick={onClose}>Cancel</button>{path === 'quick' && <button type="button" className="is-primary" disabled={creating} onClick={() => void submit()}>{creating ? 'Creating…' : 'Create simple script'}</button>}{path === 'guided' && <><button type="button" disabled={stepIndex === 0} onClick={() => focusStep(stepIndex - 1)}>Back</button>{stepIndex < STEPS.length - 1 && <><button type="button" onClick={() => focusStep(Math.min(STEPS.length - 1, stepIndex + 1))}>Skip</button><button type="button" className="is-primary" onClick={() => focusStep(stepIndex + 1)}>Next</button><button type="button" onClick={() => focusStep(STEPS.length - 1)}>Review</button></>}{stepIndex === STEPS.length - 1 && <button type="button" className="is-primary" disabled={creating || !result.ok} onClick={() => void submit()}>{creating ? 'Creating…' : 'Create script'}</button>}</>}</footer>
  </div></div>
  if (typeof document === 'undefined') return dialog
  const portalHost = returnFocusRef.current?.closest('.disting-app') ?? document.body
  return createPortal(dialog, portalHost)
}
