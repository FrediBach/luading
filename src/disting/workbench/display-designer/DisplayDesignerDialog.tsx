import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react'
import { createPortal } from 'react-dom'
import { ControlIcon } from '../../controls'
import { buildParameterLineCommands } from '../../emulation/display-api'
import { renderDistingDisplay } from '../../emulation/display-renderer'
import { DISTING_DISPLAY, type DrawCommand } from '../../types'
import { LuaSourcePreview } from '../LuaSourcePreview'
import { compileDisplayDesign } from './display-design-compiler'
import { generateDisplayDesignLua } from './display-design-generator'
import {
  createDisplayBindingInDocument,
  deleteDisplayBindingAndConvertUses,
  listDisplayBindingUsages,
  staticDisplayScalarValue,
  staticDisplayTextValue,
} from './display-design-bindings'
import { allocateDisplayLuaIdentifier } from './display-design-lua-identifiers'
import {
  alignDisplayElements,
  clientToLogical,
  constrainDisplayCreationPoint,
  constrainDisplayPointerTranslation,
  createDisplayPrimitiveFromGesture,
  displayElementHandles,
  distributeDisplayElements,
  hitTestDisplayElements,
  reorderDisplayDesignSelection,
  resizeDisplayElement,
  screenTargetToLogical,
  snapDisplayCoordinate,
  translateDisplayElements,
  type DisplayDesignAlignment,
  type DisplayDesignDistribution,
  type DisplayDesignHandle,
  type DisplayDesignPoint,
} from './display-design-geometry'
import {
  applyDisplayDesignTransaction,
  createDisplayDesignHistory,
  redoDisplayDesign,
  undoDisplayDesign,
  type DisplayDesignHistory,
} from './display-design-history'
import {
  addDisplayDesignElement,
  addDisplayDesignGroup,
  assignDisplayDesignGroup,
  cloneDisplayDesign,
  createDefaultDisplayGroup,
  createDefaultDisplayPrimitive,
  createEmptyDisplayDesign,
  createEmptyDisplayDesignSelection,
  createSequentialDisplayDesignIdFactory,
  deleteDisplayDesignElements,
  deleteDisplayDesignGroup,
  DISPLAY_DESIGN_LIMITS,
  duplicateDisplayDesignElements,
  duplicateDisplayDesignGroup,
  selectDisplayDesignElements,
  setDisplayDesignMode,
  updateDisplayDesignBinding,
  updateDisplayDesignElement,
  updateDisplayDesignGroup,
  updateDisplayDesignSymbol,
  type DisplayDesignDocumentV1,
  type DisplayDesignElement,
  type DisplayDesignBinding,
  type DisplayDesignIdFactory,
  type DisplayDesignSelection,
  type DisplayScalar,
  type DisplayPrimitiveElement,
  type DisplayPrimitivePreset,
  type DisplayTextElement,
  type DisplaySymbolInstance,
} from './display-design-model'
import {
  addDisplaySymbolVariant,
  createDisplaySymbolFromSelection,
  deleteDisplaySymbolVariant,
  deleteUsedDisplaySymbol,
  detachDisplaySymbolInstance,
  listDisplaySymbolUsages,
  makeDisplaySymbolStateDynamic,
  reorderDisplaySymbolVariant,
  setDefaultDisplaySymbolVariant,
  syncDisplaySymbolChoiceMap,
  updateDisplaySymbolVariant,
} from './display-design-symbols'
import './display-designer.css'

interface Props {
  open: boolean
  returnFocusRef: RefObject<HTMLElement | null>
  onClose(): void
}

type DesignerTool = 'select' | DisplayPrimitivePreset
type DesignerZoom = 'fit' | 2 | 3 | 4
type DisplayScalarProperty = 'shade' | 'x1' | 'y1' | 'x2' | 'y2' | 'x' | 'y' | 'radius'
type DisplayScenePrimitive = Exclude<DisplayDesignElement, { kind: 'symbol-instance' }>

interface DisplayDesignerGesture {
  kind: 'create' | 'move' | 'resize'
  pointerId: number
  start: DisplayDesignPoint
  baseDocument: DisplayDesignDocumentV1
  document: DisplayDesignDocumentV1
  selection: DisplayDesignSelection
  elementId?: string
  handle?: DisplayDesignHandle
  preset?: DisplayPrimitivePreset
}

const TOOLS: Array<{ id: DesignerTool; label: string; shortLabel: string }> = [
  { id: 'select', label: 'Select', shortLabel: 'Select' },
  { id: 'pixel-line', label: 'Pixel line', shortLabel: 'Line' },
  { id: 'smooth-line', label: 'Smooth line', shortLabel: 'Smooth line' },
  { id: 'outline-box', label: 'Outline box', shortLabel: 'Box' },
  { id: 'filled-box', label: 'Filled box', shortLabel: 'Fill' },
  { id: 'pixel-circle', label: 'Pixel circle', shortLabel: 'Circle' },
  { id: 'smooth-circle', label: 'Smooth circle', shortLabel: 'Smooth circle' },
  { id: 'standard-text', label: 'Standard text', shortLabel: 'Text' },
  { id: 'tiny-text', label: 'Tiny text', shortLabel: 'Tiny text' },
]

function elementTypeName(element: DisplayDesignElement): string {
  if (element.kind === 'symbol-instance') return 'Symbol instance'
  if (element.kind === 'line') return element.smooth ? 'Smooth line' : 'Pixel line'
  if (element.kind === 'box') return element.fill ? 'Filled box' : 'Outline box'
  if (element.kind === 'circle') return element.smooth ? 'Smooth circle' : 'Pixel circle'
  return element.tiny ? 'Tiny text' : 'Standard text'
}

function CommitInput({
  label,
  value,
  type = 'text',
  min,
  max,
  step,
  onCommit,
}: {
  label: string
  value: string | number
  type?: 'text' | 'number'
  min?: number
  max?: number
  step?: number | 'any'
  onCommit(value: string): boolean
}) {
  const committed = String(value)
  const [draft, setDraft] = useState<string | null>(null)
  const displayed = draft ?? committed

  const commit = () => {
    onCommit(displayed)
    setDraft(null)
  }

  return (
    <label className="display-designer-field">
      <span>{label}</span>
      <input
        type={type}
        value={displayed}
        min={min}
        max={max}
        step={step}
        onChange={(event) => setDraft(event.currentTarget.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            commit()
            event.currentTarget.blur()
          } else if (event.key === 'Escape') {
            event.preventDefault()
            event.stopPropagation()
            setDraft(null)
            event.currentTarget.blur()
          }
        }}
      />
    </label>
  )
}

function GeometryOverlay({ command }: { command?: DrawCommand }) {
  if (!command) return null
  if (command.kind === 'line') {
    return (
      <g>
        <line x1={command.x1} y1={command.y1} x2={command.x2} y2={command.y2} />
        <circle cx={command.x1} cy={command.y1} r="1.5" />
        <circle cx={command.x2} cy={command.y2} r="1.5" />
      </g>
    )
  }
  if (command.kind === 'box') {
    return <rect x={Math.min(command.x1, command.x2)} y={Math.min(command.y1, command.y2)} width={Math.abs(command.x2 - command.x1) + 1} height={Math.abs(command.y2 - command.y1) + 1} />
  }
  if (command.kind === 'circle') {
    return (
      <g>
        <circle cx={command.x} cy={command.y} r={command.radius} />
        <circle cx={command.x} cy={command.y} r="1.5" />
        <line x1={command.x} y1={command.y} x2={command.x + command.radius} y2={command.y} />
      </g>
    )
  }
  return (
    <g>
      <line x1={command.x - 3} y1={command.y} x2={command.x + 3} y2={command.y} />
      <line x1={command.x} y1={command.y - 3} x2={command.x} y2={command.y + 3} />
    </g>
  )
}

function DisplayDesignerArtboard({
  document,
  commands,
  displayMode,
  selectedElementIds,
  commandSources,
  activeTool,
  zoom,
  showGrid,
  showPixels,
  showGeometry,
  showOriginMarker,
  onPointerStart,
  onPointerMove,
  onPointerEnd,
  onPointerCancel,
}: {
  document: DisplayDesignDocumentV1
  commands: DrawCommand[]
  displayMode: DisplayDesignDocumentV1['displayMode']
  selectedElementIds: string[]
  commandSources: Array<{ elementId: string; firstCommand: number }>
  activeTool: DesignerTool
  zoom: DesignerZoom
  showGrid: boolean
  showPixels: boolean
  showGeometry: boolean
  showOriginMarker?: boolean
  onPointerStart(input: { point: DisplayDesignPoint; pointerId: number; elementId?: string; handle?: DisplayDesignHandle; shiftKey: boolean }): void
  onPointerMove(point: DisplayDesignPoint, pointerId: number): void
  onPointerEnd(pointerId: number): void
  onPointerCancel(pointerId: number): void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const previewCommands = useMemo(() => displayMode === 'parameter-line'
    ? [...buildParameterLineCommands('Parameter', 'Value'), ...commands]
    : commands, [commands, displayMode])
  const selectedElements = document.elements.filter(({ id }) => selectedElementIds.includes(id))

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const context = canvas.getContext('2d')
    if (context) renderDistingDisplay(context, previewCommands)
  }, [previewCommands])

  const scaleStyle = zoom === 'fit'
    ? { width: '100%' }
    : { width: `${DISTING_DISPLAY.width * zoom}px` }

  const logicalEventPoint = (event: ReactPointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    return clientToLogical({ x: event.clientX, y: event.clientY }, rect)
  }

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    const point = logicalEventPoint(event)
    const handleTarget = (event.target as Element).closest<SVGElement>('[data-display-handle]')
    const rect = event.currentTarget.getBoundingClientRect()
    const logicalTarget = screenTargetToLogical(12, rect)
    const elementId = handleTarget?.dataset.elementId
      ?? (activeTool === 'select' ? hitTestDisplayElements(document, point, Math.max(logicalTarget.x, logicalTarget.y)) : undefined)
    event.currentTarget.setPointerCapture?.(event.pointerId)
    event.preventDefault()
    onPointerStart({
      point,
      pointerId: event.pointerId,
      elementId,
      handle: handleTarget?.dataset.displayHandle as DisplayDesignHandle | undefined,
      shiftKey: event.shiftKey,
    })
  }

  return (
    <section className="display-designer-stage" aria-label="Display artboard">
      <div className="display-designer-rulers" aria-hidden="true"><span>0,0</span><span>256 × 64</span></div>
      <div className="display-designer-artboard-scroll">
        <div
          className={`display-designer-artboard${showGrid ? ' has-grid' : ''}`}
          style={scaleStyle}
          data-zoom={zoom}
          data-active-tool={activeTool}
          onPointerDown={handlePointerDown}
          onPointerMove={(event) => onPointerMove(logicalEventPoint(event), event.pointerId)}
          onPointerUp={(event) => { onPointerEnd(event.pointerId); event.currentTarget.releasePointerCapture?.(event.pointerId) }}
          onPointerCancel={(event) => onPointerCancel(event.pointerId)}
        >
          <canvas
            ref={canvasRef}
            width={DISTING_DISPLAY.width}
            height={DISTING_DISPLAY.height}
            aria-label="Display designer pixel preview"
            className={showPixels ? '' : 'is-hidden'}
          />
          <svg viewBox="0 0 256 64" aria-label="Display designer geometry overlay">
            {showGeometry && displayMode === 'parameter-line' && <rect className="display-designer-reserved-rows" x="0" y="0" width="256" height="10" />}
            {showGeometry && showOriginMarker && <g className="display-designer-origin-marker" aria-label="Symbol origin"><line x1="-4" y1="0" x2="4" y2="0" /><line x1="0" y1="-4" x2="0" y2="4" /><circle cx="0" cy="0" r="2" /></g>}
            {showGeometry && selectedElements.map((element) => {
              const source = commandSources.find(({ elementId }) => elementId === element.id)
              const command = source ? commands[source.firstCommand] : undefined
              return <g key={element.id} className="display-designer-selection-geometry">
                <GeometryOverlay command={command} />
                {displayElementHandles(element, document).map(({ id, point }) => <g key={id}>
                  <circle
                    className="display-designer-handle-target"
                    data-display-handle={id}
                    data-element-id={element.id}
                    cx={point.x}
                    cy={point.y}
                    r="1"
                  />
                  <circle className="display-designer-handle" cx={point.x} cy={point.y} r="1.6" />
                </g>)}
              </g>
            })}
          </svg>
        </div>
      </div>
      <p className="display-designer-stage-status" role="status">
        {selectedElements.length > 0
          ? `${selectedElements.length} selected: ${selectedElements.map(({ name }) => name).join(', ')}.`
          : activeTool === 'select' ? 'Select a layer or drag a primitive on the artboard.' : `Drag to create ${TOOLS.find(({ id }) => id === activeTool)?.label}.`}
      </p>
    </section>
  )
}

function DisplayDesignerLayers({
  document,
  selectedIds,
  onSelect,
  onDuplicateSelection,
  onDeleteSelection,
  onReorderSelection,
  onAlign,
  onDistribute,
  onCreateGroup,
  onAssignGroup,
  onSelectGroup,
  onRenameGroup,
  onDuplicateGroup,
  onDeleteGroup,
  hiddenGroupIds,
  onToggleGroup,
}: {
  document: DisplayDesignDocumentV1
  selectedIds: string[]
  onSelect(id: string, toggle: boolean): void
  onDuplicateSelection(): void
  onDeleteSelection(): void
  onReorderSelection(operation: 'forward' | 'backward' | 'front' | 'back'): void
  onAlign(alignment: DisplayDesignAlignment): void
  onDistribute(direction: DisplayDesignDistribution): void
  onCreateGroup(): void
  onAssignGroup(groupId?: string): void
  onSelectGroup(groupId: string): void
  onRenameGroup(groupId: string, name: string): void
  onDuplicateGroup(groupId: string): void
  onDeleteGroup(groupId: string, choice: 'ungroup' | 'delete-elements'): void
  hiddenGroupIds: Set<string>
  onToggleGroup(groupId: string): void
}) {
  const layers = [...document.elements].reverse()
  return (
    <section className="display-designer-panel display-designer-layers" aria-labelledby="display-designer-layers-title">
      <h3 id="display-designer-layers-title">Layers</h3>
      {selectedIds.length > 0 && <div className="display-designer-selection-actions" aria-label="Selected layer actions">
        <span>{selectedIds.length} selected</span>
        <button type="button" onClick={onDuplicateSelection}>Duplicate</button>
        <button type="button" onClick={onDeleteSelection}>Delete</button>
        <button type="button" aria-label="Bring selection forward" onClick={() => onReorderSelection('forward')}>Forward</button>
        <button type="button" aria-label="Send selection backward" onClick={() => onReorderSelection('backward')}>Backward</button>
        <button type="button" aria-label="Move selection to front" onClick={() => onReorderSelection('front')}>To front</button>
        <button type="button" aria-label="Move selection to back" onClick={() => onReorderSelection('back')}>To back</button>
        <button type="button" onClick={onCreateGroup}>Group</button>
        {document.groups.length > 0 && <label className="display-designer-layer-group"><span>Assign to</span><select aria-label="Assign selected layers to group" value="" onChange={(event) => onAssignGroup(event.currentTarget.value || undefined)}><option value="">No group</option>{document.groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select></label>}
      </div>}
      {selectedIds.length >= 2 && <div className="display-designer-alignment-actions" aria-label="Align selected layers">
        {(['left', 'centre', 'right', 'top', 'middle', 'bottom'] as const).map((alignment) => <button key={alignment} type="button" onClick={() => onAlign(alignment)}>Align {alignment}</button>)}
        <button type="button" disabled={selectedIds.length < 3} onClick={() => onDistribute('horizontal')}>Distribute horizontal</button>
        <button type="button" disabled={selectedIds.length < 3} onClick={() => onDistribute('vertical')}>Distribute vertical</button>
      </div>}
      {layers.length === 0 ? <p className="display-designer-empty">Choose a primitive tool to add its default shape.</p> : (
        <ol>
          {layers.map((element) => (
            <li key={element.id} className={selectedIds.includes(element.id) ? 'is-selected' : ''}>
              <button type="button" className="display-designer-layer-select" aria-pressed={selectedIds.includes(element.id)} onClick={(event) => onSelect(element.id, event.shiftKey)}>
                <span>{element.name}</span><small>{elementTypeName(element)} · {element.visible.kind === 'visible' ? 'Visible' : 'Dynamic visibility'}</small>
              </button>
            </li>
          ))}
        </ol>
      )}
      <h3>Groups</h3>
      {document.groups.length === 0 ? <p className="display-designer-empty">Select layers and choose Group.</p> : <ul className="display-designer-groups">{document.groups.map((group) => {
        const count = document.elements.filter(({ groupId }) => groupId === group.id).length
        return <li key={group.id}>
          <CommitInput label="Group name" value={group.name} onCommit={(name) => {
            const trimmed = name.trim()
            if (!trimmed || [...trimmed].length > DISPLAY_DESIGN_LIMITS.maximumNameCodePoints) return false
            onRenameGroup(group.id, trimmed)
            return true
          }} />
          <button type="button" onClick={() => onSelectGroup(group.id)}>Select {group.name} ({count})</button><div>
          <button type="button" aria-pressed={hiddenGroupIds.has(group.id)} onClick={() => onToggleGroup(group.id)}>{hiddenGroupIds.has(group.id) ? 'Show in editor' : 'Hide in editor'}</button>
          <button type="button" aria-label={`Duplicate group ${group.name}`} onClick={() => onDuplicateGroup(group.id)}>Duplicate</button>
          <button type="button" aria-label={`Ungroup ${group.name}`} onClick={() => onDeleteGroup(group.id, 'ungroup')}>Ungroup</button>
          <button type="button" aria-label={`Delete group ${group.name} and its layers`} onClick={() => onDeleteGroup(group.id, 'delete-elements')}>Delete artwork</button>
        </div></li>
      })}</ul>}
    </section>
  )
}

function DisplayDesignerSymbols({
  document,
  selection,
  onCreate,
  onEdit,
  onExit,
  onSelectPrimitive,
  onAddVariant,
  onRenameSymbol,
  onRenameVariant,
  onChangeLuaValue,
  onSetDefault,
  onReorderVariant,
  onDeleteVariant,
  onDeleteSymbol,
}: {
  document: DisplayDesignDocumentV1
  selection: DisplayDesignSelection
  onCreate(): void
  onEdit(symbolId: string, variantId: string): void
  onExit(): void
  onSelectPrimitive(primitiveId: string): void
  onAddVariant(symbolId: string, sourceVariantId: string, blank: boolean): void
  onRenameSymbol(symbolId: string, name: string): void
  onRenameVariant(symbolId: string, variantId: string, name: string): void
  onChangeLuaValue(symbolId: string, variantId: string, value: string): void
  onSetDefault(symbolId: string, variantId: string): void
  onReorderVariant(symbolId: string, fromIndex: number, toIndex: number): void
  onDeleteVariant(symbolId: string, variantId: string, replacementVariantId: string): void
  onDeleteSymbol(symbolId: string, choice: 'detach-instances' | 'delete-instances'): void
}) {
  const [pendingSymbolId, setPendingSymbolId] = useState<string>()
  const [pendingVariantId, setPendingVariantId] = useState<string>()
  const usages = new Map(listDisplaySymbolUsages(document).map((usage) => [usage.symbolId, usage]))
  const activeSymbol = selection.symbolId ? document.symbols.find(({ id }) => id === selection.symbolId) : undefined
  const activeVariant = activeSymbol?.variants.find(({ id }) => id === selection.variantId)
  const canCreate = selection.elementIds.length > 0 && selection.elementIds.every((id) => document.elements.find((element) => element.id === id)?.kind !== 'symbol-instance')

  return <section className="display-designer-panel display-designer-symbols" aria-labelledby="display-designer-symbols-title">
    <h3 id="display-designer-symbols-title">Symbols</h3>
    {activeSymbol && activeVariant ? <>
      <nav className="display-designer-breadcrumb" aria-label="Symbol edit context">
        <button type="button" onClick={onExit}>Scene</button><span>›</span><span>{activeSymbol.name}</span><span>›</span><span>{activeVariant.name}</span>
      </nav>
      <CommitInput label="Symbol name" value={activeSymbol.name} onCommit={(value) => {
        const name = value.trim(); if (!name) return false; onRenameSymbol(activeSymbol.id, name); return true
      }} />
      <div className="display-designer-variant-tabs" role="tablist" aria-label={`${activeSymbol.name} states`}>
        {activeSymbol.variants.map((variant) => <button key={variant.id} type="button" role="tab" aria-selected={variant.id === activeVariant.id} onClick={() => onEdit(activeSymbol.id, variant.id)}>{variant.name}{variant.id === activeSymbol.defaultVariantId ? ' · default' : ''}</button>)}
      </div>
      <div className="display-designer-symbol-actions">
        <button type="button" disabled={activeSymbol.variants.length >= DISPLAY_DESIGN_LIMITS.maximumVariantsPerSymbol} onClick={() => onAddVariant(activeSymbol.id, activeVariant.id, false)}>Duplicate state</button>
        <button type="button" disabled={activeSymbol.variants.length >= DISPLAY_DESIGN_LIMITS.maximumVariantsPerSymbol} onClick={() => onAddVariant(activeSymbol.id, activeVariant.id, true)}>Add blank state</button>
        <button type="button" disabled={activeSymbol.variants.indexOf(activeVariant) === 0} onClick={() => onReorderVariant(activeSymbol.id, activeSymbol.variants.indexOf(activeVariant), activeSymbol.variants.indexOf(activeVariant) - 1)}>State earlier</button>
        <button type="button" disabled={activeSymbol.variants.indexOf(activeVariant) === activeSymbol.variants.length - 1} onClick={() => onReorderVariant(activeSymbol.id, activeSymbol.variants.indexOf(activeVariant), activeSymbol.variants.indexOf(activeVariant) + 1)}>State later</button>
      </div>
      <CommitInput label="State name" value={activeVariant.name} onCommit={(value) => { const name = value.trim(); if (!name) return false; onRenameVariant(activeSymbol.id, activeVariant.id, name); return true }} />
      <CommitInput label="Stable Lua value" value={activeVariant.luaValue} onCommit={(value) => { const stable = value.trim(); if (!stable || activeSymbol.variants.some((variant) => variant.id !== activeVariant.id && variant.luaValue === stable)) return false; onChangeLuaValue(activeSymbol.id, activeVariant.id, stable); return true }} />
      <button type="button" disabled={activeSymbol.defaultVariantId === activeVariant.id} onClick={() => onSetDefault(activeSymbol.id, activeVariant.id)}>Make default state</button>
      {activeSymbol.variants.length > 1 && <button type="button" onClick={() => setPendingVariantId(activeVariant.id)}>Delete state…</button>}
      {pendingVariantId === activeVariant.id && <div role="alert" className="display-designer-inline-confirm"><p>Replace every use of {activeVariant.name} before deleting it.</p>{activeSymbol.variants.filter(({ id }) => id !== activeVariant.id).map((replacement) => <button key={replacement.id} type="button" onClick={() => { onDeleteVariant(activeSymbol.id, activeVariant.id, replacement.id); setPendingVariantId(undefined) }}>Replace with {replacement.name}</button>)}<button type="button" onClick={() => setPendingVariantId(undefined)}>Cancel</button></div>}
      <h4>State layers</h4>
      {activeVariant.elements.length === 0 ? <p className="display-designer-empty">This state is blank.</p> : <ol>{[...activeVariant.elements].reverse().map((primitive) => <li key={primitive.id}><button type="button" aria-pressed={selection.primitiveIds.includes(primitive.id)} onClick={() => onSelectPrimitive(primitive.id)}>{primitive.name} · {elementTypeName(primitive)}</button></li>)}</ol>}
    </> : <>
      <button type="button" disabled={!canCreate || document.symbols.length >= DISPLAY_DESIGN_LIMITS.maximumSymbols} onClick={onCreate}>Create symbol from selection</button>
      {document.symbols.length === 0 ? <p className="display-designer-empty">Select one or more primitive layers to create a local symbol.</p> : <ol>{document.symbols.map((symbol) => {
        const usage = usages.get(symbol.id)
        return <li key={symbol.id} className="display-designer-symbol-row"><button type="button" onClick={() => onEdit(symbol.id, symbol.defaultVariantId)}><strong>{symbol.name}</strong><small>{symbol.variants.length} states · {usage?.instanceCount ?? 0} instances{usage?.unused ? ' · unused' : ''}</small></button><button type="button" aria-label={`Delete symbol ${symbol.name}`} onClick={() => setPendingSymbolId(symbol.id)}>Delete…</button>{pendingSymbolId === symbol.id && <div role="alert" className="display-designer-inline-confirm">{usage?.instanceCount ? <><p>{symbol.name} is used by {usage.instanceCount} instances.</p><button type="button" onClick={() => { onDeleteSymbol(symbol.id, 'detach-instances'); setPendingSymbolId(undefined) }}>Detach all instances</button><button type="button" onClick={() => { onDeleteSymbol(symbol.id, 'delete-instances'); setPendingSymbolId(undefined) }}>Delete instances and symbol</button></> : <button type="button" onClick={() => { onDeleteSymbol(symbol.id, 'delete-instances'); setPendingSymbolId(undefined) }}>Delete unused symbol</button>}<button type="button" onClick={() => setPendingSymbolId(undefined)}>Cancel</button></div>}</li>
      })}</ol>}
    </>}
  </section>
}

function DisplayScalarEditor({
  document,
  scalar,
  label,
  integer,
  minimum = DISPLAY_DESIGN_LIMITS.minimumCoordinate,
  maximum = DISPLAY_DESIGN_LIMITS.maximumCoordinate,
  onChange,
  onMakeDynamic,
}: {
  document: DisplayDesignDocumentV1
  scalar: DisplayScalar
  label: string
  integer: boolean
  minimum?: number
  maximum?: number
  onChange(value: DisplayScalar, action: string): void
  onMakeDynamic(): void
}) {
  const bindings = document.bindings.filter((binding) => binding.kind === 'number')
  const preview = staticDisplayScalarValue(document, scalar)
  const commitLiteral = (draft: string) => {
    const value = Number(draft)
    if (!Number.isFinite(value) || value < minimum || value > maximum || (integer && !Number.isInteger(value))) return false
    onChange({ kind: 'literal', value }, `Change ${label}`)
    return true
  }
  const attach = (bindingId: string) => onChange({
    kind: 'number-binding',
    bindingId,
    from: scalar.kind === 'number-binding' ? scalar.from : scalar.value,
    to: scalar.kind === 'number-binding' ? scalar.to : Math.min(maximum, scalar.value + (label.toLowerCase().includes('shade') ? 0 : 16)),
    quantize: integer ? 'integer' : 'none',
  }, `Attach ${label} binding`)

  if (scalar.kind === 'literal') return <div className="display-designer-dynamic-property">
    <CommitInput label={label} type="number" min={minimum} max={maximum} step={integer ? 1 : 'any'} value={scalar.value} onCommit={commitLiteral} />
    <div className="display-designer-dynamic-actions">
      <button type="button" onClick={onMakeDynamic}>Make {label} dynamic</button>
      {bindings.length > 0 && <label><span className="sr-only">Attach {label} binding</span><select aria-label={`Attach ${label} binding`} value="" onChange={(event) => { if (event.currentTarget.value) attach(event.currentTarget.value) }}><option value="">Attach existing…</option>{bindings.map((binding) => <option key={binding.id} value={binding.id}>{binding.name}</option>)}</select></label>}
    </div>
  </div>

  return <fieldset className="display-designer-binding-map"><legend>{label} · Preview {preview}</legend>
    <label className="display-designer-field"><span>Binding</span><select value={scalar.bindingId} onChange={(event) => attach(event.currentTarget.value)}>{bindings.map((binding) => <option key={binding.id} value={binding.id}>{binding.name}</option>)}</select></label>
    <div className="display-designer-field-grid">
      <CommitInput label="From" type="number" min={minimum} max={maximum} step={integer ? 1 : 'any'} value={scalar.from} onCommit={(draft) => {
        const value = Number(draft)
        if (!Number.isFinite(value) || value < minimum || value > maximum || (integer && !Number.isInteger(value))) return false
        onChange({ ...scalar, from: value }, `Change ${label} mapping`)
        return true
      }} />
      <CommitInput label="To" type="number" min={minimum} max={maximum} step={integer ? 1 : 'any'} value={scalar.to} onCommit={(draft) => {
        const value = Number(draft)
        if (!Number.isFinite(value) || value < minimum || value > maximum || (integer && !Number.isInteger(value))) return false
        onChange({ ...scalar, to: value }, `Change ${label} mapping`)
        return true
      }} />
    </div>
    <button type="button" onClick={() => onChange({ kind: 'literal', value: preview }, `Make ${label} static`)}>Make {label} static</button>
  </fieldset>
}

function DisplayDesignerInspector({
  element,
  document,
  idFactory,
  onCommit,
  onEditSymbol,
  onDetachInstance,
}: {
  element?: DisplayDesignElement
  document: DisplayDesignDocumentV1
  idFactory: DisplayDesignIdFactory
  onCommit(label: string, document: DisplayDesignDocumentV1): void
  onEditSymbol?(instance: DisplaySymbolInstance): void
  onDetachInstance?(instance: DisplaySymbolInstance): void
}) {
  if (!element) return (
    <section className="display-designer-panel display-designer-inspector" aria-labelledby="display-designer-properties-title">
      <h3 id="display-designer-properties-title">Properties</h3>
      <p className="display-designer-empty">Select a layer to edit exact values.</p>
    </section>
  )
  if (element.kind === 'symbol-instance') {
    const symbol = document.symbols.find(({ id }) => id === element.symbolId)
    if (!symbol) return null
    const elementState = element.state
    const updateInstance = (label: string, update: (instance: DisplaySymbolInstance) => DisplaySymbolInstance) => onCommit(label, updateDisplayDesignElement(document, element.id, (current) => current.kind === 'symbol-instance' ? update(current) : current))
    const binding = elementState.kind === 'choice-binding' ? document.bindings.find(({ id }) => id === elementState.bindingId) : undefined
    return <section className="display-designer-panel display-designer-inspector" aria-labelledby="display-designer-properties-title">
      <h3 id="display-designer-properties-title">Properties</h3>
      <p className="display-designer-element-kind">Symbol instance · {symbol.name}</p>
      <CommitInput label="Layer name" value={element.name} onCommit={(value) => { const name = value.trim(); if (!name) return false; updateInstance('Rename instance', (instance) => ({ ...instance, name })); return true }} />
      <div className="display-designer-field-grid">{(['x', 'y'] as const).map((property) => <DisplayScalarEditor key={property} document={document} scalar={element[property]} label={property.toUpperCase()} integer={false} onChange={(value, label) => updateInstance(label, (instance) => ({ ...instance, [property]: value }))} onMakeDynamic={() => {
        const created = createDisplayBindingInDocument(document, 'number', idFactory, `${symbol.name} ${property.toUpperCase()}`)
        onCommit(`Make instance ${property} dynamic`, updateDisplayDesignElement(created.document, element.id, (current) => current.kind === 'symbol-instance' ? { ...current, [property]: { kind: 'number-binding', bindingId: created.binding.id, from: staticDisplayScalarValue(document, element[property]), to: staticDisplayScalarValue(document, element[property]) + 16, quantize: 'none' } } : current))
      }} />)}</div>
      {element.state.kind === 'literal' ? <label className="display-designer-field"><span>State</span><select value={element.state.variantId} onChange={(event) => updateInstance('Change instance state', (instance) => ({ ...instance, state: { kind: 'literal', variantId: event.currentTarget.value } }))}>{symbol.variants.map((variant) => <option key={variant.id} value={variant.id}>{variant.name}</option>)}</select></label> : <fieldset className="display-designer-binding-map"><legend>Dynamic state</legend><label className="display-designer-field"><span>Choice binding</span><select value={element.state.bindingId} onChange={(event) => updateInstance('Change state binding', (instance) => ({ ...instance, state: { kind: 'choice-binding', bindingId: event.currentTarget.value, variantByChoiceId: instance.state.kind === 'choice-binding' ? instance.state.variantByChoiceId : {} } }))}>{document.bindings.filter(({ kind }) => kind === 'choice').map((choiceBinding) => <option key={choiceBinding.id} value={choiceBinding.id}>{choiceBinding.name}</option>)}</select></label>{binding?.kind === 'choice' && binding.choices.map((choice) => <label key={choice.id} className="display-designer-field"><span>{choice.name}</span><select value={element.state.kind === 'choice-binding' ? element.state.variantByChoiceId[choice.id] ?? '' : ''} onChange={(event) => updateInstance('Map instance state', (instance) => instance.state.kind === 'choice-binding' ? { ...instance, state: { ...instance.state, variantByChoiceId: { ...instance.state.variantByChoiceId, [choice.id]: event.currentTarget.value } } } : instance)}>{symbol.variants.map((variant) => <option key={variant.id} value={variant.id}>{variant.name}</option>)}</select></label>)}<button type="button" onClick={() => onCommit('Sync choices with states', syncDisplaySymbolChoiceMap(document, element.id))}>Sync choices with states</button><button type="button" onClick={() => {
        const choice = binding?.kind === 'choice' ? binding.previewChoiceId : ''
        updateInstance('Make instance state static', (instance) => ({ ...instance, state: { kind: 'literal', variantId: instance.state.kind === 'choice-binding' ? instance.state.variantByChoiceId[choice] ?? symbol.defaultVariantId : symbol.defaultVariantId } }))
      }}>Make state static</button></fieldset>}
      {element.state.kind === 'literal' && <><button type="button" onClick={() => { const dynamic = makeDisplaySymbolStateDynamic(document, element.id, idFactory); onCommit('Make instance state dynamic', dynamic.document) }}>Make state dynamic</button>{document.bindings.some(({ kind }) => kind === 'choice') && <label className="display-designer-field"><span>Attach choice binding</span><select value="" onChange={(event) => {
        const choiceBinding = document.bindings.find((candidate) => candidate.id === event.currentTarget.value)
        if (choiceBinding?.kind !== 'choice') return
        const byValue = new Map(symbol.variants.map((variant) => [variant.luaValue, variant.id]))
        updateInstance('Attach choice binding', (instance) => ({ ...instance, state: { kind: 'choice-binding', bindingId: choiceBinding.id, variantByChoiceId: Object.fromEntries(choiceBinding.choices.map((choice) => [choice.id, byValue.get(choice.luaValue) ?? symbol.defaultVariantId])) } }))
      }}><option value="">Attach existing…</option>{document.bindings.filter(({ kind }) => kind === 'choice').map((choiceBinding) => <option key={choiceBinding.id} value={choiceBinding.id}>{choiceBinding.name}</option>)}</select></label>}</>}
      <div className="display-designer-symbol-actions"><button type="button" onClick={() => onEditSymbol?.(element)}>Edit symbol</button><button type="button" onClick={() => onDetachInstance?.(element)}>Detach instance…</button></div>
    </section>
  }

  const update = (label: string, change: (element: DisplayScenePrimitive) => DisplayScenePrimitive) => {
    onCommit(label, updateDisplayDesignElement(document, element.id, (current) => current.kind === 'symbol-instance' ? current : change(current)))
  }

  const bindWithNewDocument = (
    kind: DisplayDesignBinding['kind'],
    name: string,
    change: (current: DisplayScenePrimitive, bindingId: string) => DisplayScenePrimitive,
  ) => {
    const created = createDisplayBindingInDocument(document, kind, idFactory, name)
    let withPreview = created.document
    if (kind === 'number') withPreview = updateDisplayDesignBinding(withPreview, created.binding.id, (binding) => binding.kind === 'number' ? { ...binding, previewValue: 0 } : binding)
    if (kind === 'text' && element.kind === 'text') {
      const previewValue = staticDisplayTextValue(document, element)
      withPreview = updateDisplayDesignBinding(withPreview, created.binding.id, (binding) => binding.kind === 'text' ? { ...binding, previewValue } : binding)
    }
    onCommit(`Make ${name} dynamic`, updateDisplayDesignElement(withPreview, element.id, (current) => current.kind === 'symbol-instance' ? current : change(current, created.binding.id)))
    return created.binding.id
  }

  const scalar = (property: DisplayScalarProperty) => (element as unknown as Record<DisplayScalarProperty, DisplayScalar>)[property]
  const setScalar = (property: DisplayScalarProperty, value: DisplayScalar, label: string) => update(label, (current) => ({ ...current, [property]: value } as DisplayPrimitiveElement))
  const createScalarBinding = (property: DisplayScalarProperty, label: string) => {
    const currentScalar = scalar(property)
    bindWithNewDocument('number', label, (current, id) => {
      return { ...current, [property]: {
        kind: 'number-binding', bindingId: id,
        from: currentScalar.kind === 'literal' ? currentScalar.value : currentScalar.from,
        to: currentScalar.kind === 'literal' ? currentScalar.value + (label.toLowerCase().includes('shade') ? 0 : 16) : currentScalar.to,
        quantize: label.toLowerCase().includes('shade') || !((element.kind === 'line' || element.kind === 'circle') && element.smooth) ? 'integer' : 'none',
      } } as DisplayScenePrimitive
    })
  }
  const coordinateStep = (element.kind === 'line' || element.kind === 'circle') && element.smooth ? 'any' : 1

  return (
    <section className="display-designer-panel display-designer-inspector" aria-labelledby="display-designer-properties-title">
      <h3 id="display-designer-properties-title">Properties</h3>
      <p className="display-designer-element-kind">{elementTypeName(element)}</p>
      <CommitInput label="Layer name" value={element.name} onCommit={(name) => {
        const trimmed = name.trim()
        if (!trimmed || [...trimmed].length > DISPLAY_DESIGN_LIMITS.maximumNameCodePoints) return false
        update('Rename layer', (current) => ({ ...current, name: trimmed }))
        return true
      }} />
      <label className="display-designer-field"><span>Group</span><select value={element.groupId ?? ''} onChange={(event) => {
        const groupId = event.currentTarget.value || undefined
        update('Assign group', (current) => {
          const next = { ...current }
          if (groupId) next.groupId = groupId
          else delete next.groupId
          return next
        })
      }}><option value="">No group</option>{document.groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select></label>
      {(element.kind === 'line' || element.kind === 'box') && <div className="display-designer-field-grid">
        {(['x1', 'y1', 'x2', 'y2'] as const).map((property) => <DisplayScalarEditor key={property} document={document} scalar={scalar(property)} label={property.toUpperCase()} integer={coordinateStep === 1} onChange={(value, label) => setScalar(property, value, label)} onMakeDynamic={() => createScalarBinding(property, property.toUpperCase())} />)}
      </div>}
      {element.kind === 'box' && <p className="display-designer-computed">Inclusive size: {Math.abs(staticDisplayScalarValue(document, scalar('x2')) - staticDisplayScalarValue(document, scalar('x1'))) + 1} × {Math.abs(staticDisplayScalarValue(document, scalar('y2')) - staticDisplayScalarValue(document, scalar('y1'))) + 1}</p>}
      {element.kind === 'circle' && <div className="display-designer-field-grid">
        {(['x', 'y', 'radius'] as const).map((property) => {
          const label = property === 'radius' ? 'Radius' : property.toUpperCase()
          return <DisplayScalarEditor key={property} document={document} scalar={scalar(property)} label={label} integer={coordinateStep === 1} minimum={property === 'radius' ? 0 : undefined} maximum={property === 'radius' ? DISPLAY_DESIGN_LIMITS.maximumRadius : undefined} onChange={(value, action) => setScalar(property, value, action)} onMakeDynamic={() => createScalarBinding(property, label)} />
        })}
      </div>}
      {element.kind === 'text' && <>
        <div className="display-designer-field-grid">
          {(['x', 'y'] as const).map((property) => <DisplayScalarEditor key={property} document={document} scalar={scalar(property)} label={property.toUpperCase()} integer onChange={(value, action) => setScalar(property, value, action)} onMakeDynamic={() => createScalarBinding(property, property.toUpperCase())} />)}
        </div>
        {element.text.kind === 'literal' ? <div className="display-designer-dynamic-property"><CommitInput label="Text" value={element.text.value} onCommit={(text) => {
          if ([...text].length > DISPLAY_DESIGN_LIMITS.maximumTextCodePoints) return false
          update('Change text', (current) => current.kind === 'text' ? { ...current, text: { kind: 'literal', value: text } } : current)
          return true
        }} /><div className="display-designer-dynamic-actions"><button type="button" onClick={() => bindWithNewDocument('text', 'Text', (current, bindingId) => current.kind === 'text' ? { ...current, text: { kind: 'text-binding', bindingId } } : current)}>Make Text dynamic</button>{document.bindings.some(({ kind }) => kind === 'text') && <select aria-label="Attach Text binding" value="" onChange={(event) => { const bindingId = event.currentTarget.value; if (bindingId) update('Attach Text binding', (current) => current.kind === 'text' ? { ...current, text: { kind: 'text-binding', bindingId } } : current) }}><option value="">Attach existing…</option>{document.bindings.filter(({ kind }) => kind === 'text').map((binding) => <option key={binding.id} value={binding.id}>{binding.name}</option>)}</select>}</div></div> : <fieldset className="display-designer-binding-map"><legend>Text · Preview {staticDisplayTextValue(document, element)}</legend><label className="display-designer-field"><span>Binding</span><select value={element.text.bindingId} onChange={(event) => update('Attach Text binding', (current) => current.kind === 'text' ? { ...current, text: { kind: 'text-binding', bindingId: event.currentTarget.value } } : current)}>{document.bindings.filter(({ kind }) => kind === 'text').map((binding) => <option key={binding.id} value={binding.id}>{binding.name}</option>)}</select></label><button type="button" onClick={() => update('Make Text static', (current) => current.kind === 'text' ? { ...current, text: { kind: 'literal', value: staticDisplayTextValue(document, element) } } : current)}>Make Text static</button></fieldset>}
        <label className="display-designer-field"><span>Alignment</span><select value={element.align} onChange={(event) => {
          const align = event.currentTarget.value as DisplayTextElement['align']
          update('Change text alignment', (current) => current.kind === 'text' ? { ...current, align } : current)
        }}><option value="left">Left</option><option value="centre">Centre</option><option value="right">Right</option></select></label>
      </>}

      <fieldset className="display-designer-shades"><legend>Shade: {staticDisplayScalarValue(document, scalar('shade'))}</legend><div>{Array.from({ length: 16 }, (_, shade) => <button key={shade} type="button" aria-label={`Shade ${shade}`} aria-pressed={staticDisplayScalarValue(document, scalar('shade')) === shade} style={{ '--shade': shade } as CSSProperties} onClick={() => setScalar('shade', { kind: 'literal', value: shade }, 'Change shade')}>{shade}</button>)}</div></fieldset>
      <DisplayScalarEditor document={document} scalar={scalar('shade')} label="Exact shade" integer minimum={0} maximum={15} onChange={(value, action) => setScalar('shade', value, action)} onMakeDynamic={() => createScalarBinding('shade', 'Shade')} />
      {element.visible.kind === 'visible' ? <div className="display-designer-dynamic-property"><p>Visibility · Always visible</p><div className="display-designer-dynamic-actions"><button type="button" onClick={() => bindWithNewDocument('boolean', 'Visibility', (current, bindingId) => ({ ...current, visible: { kind: 'boolean-binding', bindingId, invert: false } }))}>Make visibility dynamic</button>{document.bindings.some(({ kind }) => kind === 'boolean') && <select aria-label="Attach visibility binding" value="" onChange={(event) => { if (event.currentTarget.value) update('Attach visibility binding', (current) => ({ ...current, visible: { kind: 'boolean-binding', bindingId: event.currentTarget.value, invert: false } })) }}><option value="">Attach existing…</option>{document.bindings.filter(({ kind }) => kind === 'boolean').map((binding) => <option key={binding.id} value={binding.id}>{binding.name}</option>)}</select>}</div></div> : <fieldset className="display-designer-binding-map"><legend>Visibility</legend><label className="display-designer-field"><span>Binding</span><select value={element.visible.bindingId} onChange={(event) => update('Attach visibility binding', (current) => ({ ...current, visible: { kind: 'boolean-binding', bindingId: event.currentTarget.value, invert: current.visible.kind === 'boolean-binding' ? current.visible.invert : false } }))}>{document.bindings.filter(({ kind }) => kind === 'boolean').map((binding) => <option key={binding.id} value={binding.id}>{binding.name}</option>)}</select></label><label className="display-designer-check"><input type="checkbox" checked={element.visible.invert} onChange={(event) => update('Invert visibility', (current) => ({ ...current, visible: { kind: 'boolean-binding', bindingId: element.visible.kind === 'boolean-binding' ? element.visible.bindingId : '', invert: event.currentTarget.checked } }))} />Invert binding</label><button type="button" onClick={() => update('Make visibility static', (current) => ({ ...current, visible: { kind: 'visible' } }))}>Make visibility static</button></fieldset>}
    </section>
  )
}

function DisplayDesignerStatePanel({
  document,
  idFactory,
  onCommit,
  onPreviewUpdate,
}: {
  document: DisplayDesignDocumentV1
  idFactory: DisplayDesignIdFactory
  onCommit(label: string, document: DisplayDesignDocumentV1): void
  onPreviewUpdate(bindingId: string, update: (binding: DisplayDesignBinding) => DisplayDesignBinding): void
}) {
  const [pendingDeleteId, setPendingDeleteId] = useState<string>()
  const usages = listDisplayBindingUsages(document)

  const addBinding = (kind: DisplayDesignBinding['kind']) => {
    const created = createDisplayBindingInDocument(document, kind, idFactory)
    onCommit(`Create ${kind} binding`, created.document)
  }

  const renameBinding = (binding: DisplayDesignBinding, name: string) => {
    const trimmed = name.trim()
    if (!trimmed || [...trimmed].length > DISPLAY_DESIGN_LIMITS.maximumNameCodePoints) return false
    const luaName = allocateDisplayLuaIdentifier(
      trimmed,
      [
        ...document.bindings.filter(({ id }) => id !== binding.id).map((other) => other.luaName),
        ...document.symbols.map((symbol) => symbol.luaName),
      ],
      binding.kind === 'choice' ? 'state' : 'value',
    )
    onCommit('Rename binding', updateDisplayDesignBinding(document, binding.id, (current) => ({ ...current, name: trimmed, luaName })))
    return true
  }

  const requestDelete = (binding: DisplayDesignBinding) => {
    if (usages.some(({ bindingId }) => bindingId === binding.id)) setPendingDeleteId(binding.id)
    else onCommit('Delete unused binding', deleteDisplayBindingAndConvertUses(document, binding.id))
  }

  return <section className="display-designer-panel display-designer-state" aria-labelledby="display-designer-state-title">
    <h3 id="display-designer-state-title">State</h3>
    <p className="display-designer-empty">Preview controls are browser-only placeholders for generated Lua locals.</p>
    <div className="display-designer-state-add" aria-label="Add binding">
      {(['number', 'boolean', 'text', 'choice'] as const).map((kind) => <button key={kind} type="button" disabled={document.bindings.length >= DISPLAY_DESIGN_LIMITS.maximumBindings} onClick={() => addBinding(kind)}>Add {kind} binding</button>)}
    </div>
    {document.bindings.length === 0 ? <p className="display-designer-empty">Make a property dynamic or add a binding here.</p> : <ol>{document.bindings.map((binding) => {
      const bindingUsages = usages.filter(({ bindingId }) => bindingId === binding.id)
      return <li key={binding.id} className="display-designer-state-binding">
        <header><strong>{binding.name}</strong><span>{binding.kind} · <code>{binding.luaName}</code></span></header>
        <CommitInput label="Binding name" value={binding.name} onCommit={(name) => renameBinding(binding, name)} />
        {binding.kind === 'number' && <>
          <label className="display-designer-field"><span>Preview value: {binding.previewValue}</span><input aria-label={`${binding.name} preview value`} type="range" min="0" max="1" step="0.01" value={binding.previewValue} onChange={(event) => {
            const previewValue = Number(event.currentTarget.value)
            onPreviewUpdate(binding.id, (current) => current.kind === 'number' ? { ...current, previewValue } : current)
          }} /></label>
          <CommitInput label="Exact preview" type="number" min={0} max={1} step="any" value={binding.previewValue} onCommit={(draft) => {
            const value = Number(draft)
            if (!Number.isFinite(value) || value < 0 || value > 1) return false
            onPreviewUpdate(binding.id, (current) => current.kind === 'number' ? { ...current, previewValue: value } : current)
            return true
          }} />
        </>}
        {binding.kind === 'boolean' && <button type="button" role="switch" aria-checked={binding.previewValue} onClick={() => onPreviewUpdate(binding.id, (current) => current.kind === 'boolean' ? { ...current, previewValue: !current.previewValue } : current)}>{binding.previewValue ? 'Preview on' : 'Preview off'}</button>}
        {binding.kind === 'text' && <label className="display-designer-field"><span>Preview text</span><input value={binding.previewValue} onChange={(event) => {
          const previewValue = event.currentTarget.value
          if ([...previewValue].length <= DISPLAY_DESIGN_LIMITS.maximumTextCodePoints) onPreviewUpdate(binding.id, (current) => current.kind === 'text' ? { ...current, previewValue } : current)
        }} /></label>}
        {binding.kind === 'choice' && <>
          <label className="display-designer-field"><span>Preview choice</span><select value={binding.previewChoiceId} onChange={(event) => {
            const previewChoiceId = event.currentTarget.value
            onPreviewUpdate(binding.id, (current) => current.kind === 'choice' ? { ...current, previewChoiceId } : current)
          }}>{binding.choices.map((choice) => <option key={choice.id} value={choice.id}>{choice.name}</option>)}</select></label>
          <ol className="display-designer-choice-list">{binding.choices.map((choice) => <li key={choice.id}>
            <CommitInput label="Choice name" value={choice.name} onCommit={(name) => {
              const trimmed = name.trim()
              if (!trimmed || [...trimmed].length > DISPLAY_DESIGN_LIMITS.maximumNameCodePoints) return false
              onCommit('Rename binding choice', updateDisplayDesignBinding(document, binding.id, (current) => current.kind === 'choice' ? { ...current, choices: current.choices.map((item) => item.id === choice.id ? { ...item, name: trimmed } : item) } : current))
              return true
            }} />
            <CommitInput label="Lua value" value={choice.luaValue} onCommit={(luaValue) => {
              const trimmed = luaValue.trim()
              if (!trimmed || [...trimmed].length > DISPLAY_DESIGN_LIMITS.maximumNameCodePoints || binding.choices.some((item) => item.id !== choice.id && item.luaValue === trimmed)) return false
              onCommit('Change binding choice value', updateDisplayDesignBinding(document, binding.id, (current) => current.kind === 'choice' ? { ...current, choices: current.choices.map((item) => item.id === choice.id ? { ...item, luaValue: trimmed } : item) } : current))
              return true
            }} />
            <button type="button" disabled={binding.choices.length === 1} onClick={() => onCommit('Delete binding choice', updateDisplayDesignBinding(document, binding.id, (current) => {
              if (current.kind !== 'choice' || current.choices.length === 1) return current
              const choices = current.choices.filter(({ id }) => id !== choice.id)
              return { ...current, choices, previewChoiceId: current.previewChoiceId === choice.id ? choices[0]!.id : current.previewChoiceId }
            }))}>Delete choice</button>
          </li>)}</ol>
          <button type="button" onClick={() => onCommit('Add binding choice', updateDisplayDesignBinding(document, binding.id, (current) => {
            if (current.kind !== 'choice') return current
            const id = idFactory('choice')
            let suffix = current.choices.length + 1
            let luaValue = `choice_${suffix}`
            while (current.choices.some((choice) => choice.luaValue === luaValue)) luaValue = `choice_${++suffix}`
            return { ...current, choices: [...current.choices, { id, name: `Choice ${suffix}`, luaValue }] }
          }))}>Add choice</button>
        </>}
        <details><summary>{bindingUsages.length} {bindingUsages.length === 1 ? 'use' : 'uses'}</summary>{bindingUsages.length === 0 ? <p>Not attached.</p> : <ul>{bindingUsages.map((usage, index) => <li key={`${usage.property}-${index}`}>{usage.ownerName} · {usage.property}</li>)}</ul>}</details>
        <button type="button" className="is-danger" onClick={() => requestDelete(binding)}>Delete binding</button>
        {pendingDeleteId === binding.id && <div className="display-designer-binding-delete" role="alert"><p>{bindingUsages.length} attached {bindingUsages.length === 1 ? 'property' : 'properties'} will be converted to their current preview. Dynamic visibility becomes always visible.</p><div><button type="button" onClick={() => setPendingDeleteId(undefined)}>Cancel</button><button type="button" className="is-danger" onClick={() => { onCommit('Convert binding uses to static', deleteDisplayBindingAndConvertUses(document, binding.id)); setPendingDeleteId(undefined) }}>Convert uses and delete</button></div></div>}
      </li>
    })}</ol>}
  </section>
}

function DisplayDesignerReview({
  document,
  compiled,
  generated,
  bindingCount,
  variantCount,
  onFocusFinding,
}: {
  document: DisplayDesignDocumentV1
  compiled: ReturnType<typeof compileDisplayDesign>
  generated: ReturnType<typeof generateDisplayDesignLua>
  bindingCount: number
  variantCount: number
  onFocusFinding(elementId?: string): void
}) {
  const findings = compiled.findings
  const [activeSourceLine, setActiveSourceLine] = useState<number>()
  const sourceLines = generated.ok ? generated.source.split('\n') : []
  let instanceSearchIndex = sourceLines.findIndex((sourceLine) => sourceLine.includes('return function(self)')) + 1
  const instanceSourceNavigation = document.elements.flatMap((element) => {
    if (element.kind !== 'symbol-instance') return []
    const symbol = document.symbols.find(({ id }) => id === element.symbolId)
    if (!symbol) return []
    const index = sourceLines.findIndex((sourceLine, lineIndex) => lineIndex >= instanceSearchIndex && sourceLine.includes(`${symbol.luaName}(`))
    if (index < 0) return []
    instanceSearchIndex = index + 1
    return [{ label: `${element.name} call`, line: index + 1 }]
  })
  const sourceNavigation = generated.ok ? [
    ...document.symbols.flatMap((symbol) => {
      if (!document.elements.some((element) => element.kind === 'symbol-instance' && element.symbolId === symbol.id)) return []
      const line = sourceLines.findIndex((sourceLine) => sourceLine.includes(`local function ${symbol.luaName}(`)) + 1
      return line > 0 ? [{ label: `${symbol.name} helper`, line }] : []
    }),
    ...instanceSourceNavigation,
  ] : []
  return (
    <section className="display-designer-review" aria-label="Design review">
      <section aria-labelledby="display-designer-findings-title">
        <h3 id="display-designer-findings-title">Findings <span>{findings.length}</span></h3>
        {findings.length === 0 ? <p>No design findings.</p> : <ul>{findings.map((finding, index) => <li key={`${finding.ruleId}-${finding.path}-${index}`} data-severity={finding.severity}><button type="button" onClick={() => onFocusFinding(finding.focus?.elementId)}><strong>{finding.severity}</strong> {finding.message}</button></li>)}</ul>}
      </section>
      <section aria-labelledby="display-designer-metrics-title">
        <h3 id="display-designer-metrics-title">Metrics</h3>
        <dl>
          <div><dt>Primitive elements</dt><dd>{compiled.metrics.elementCount}</dd></div>
          <div><dt>Visible draw calls</dt><dd>{compiled.metrics.drawCallCount}</dd></div>
          <div><dt>Maximum variant draw calls</dt><dd>{compiled.metrics.maximumVariantDrawCallCount}</dd></div>
          <div><dt>Smooth calls</dt><dd>{compiled.metrics.smoothCallCount}</dd></div>
          <div><dt>Symbols / variants / instances</dt><dd>{compiled.metrics.symbolCount} / {variantCount} / {compiled.metrics.instanceCount}</dd></div>
          <div><dt>Bindings</dt><dd>{bindingCount}</dd></div>
          <div><dt>Generated UTF-8</dt><dd>{compiled.metrics.generatedUtf8Bytes} bytes</dd></div>
        </dl>
        <p>Descriptive only; measure actual performance on Disting NT hardware.</p>
      </section>
      <details className="display-designer-source" open>
        <summary>Generated Lua</summary>
        {sourceNavigation.length > 0 && <nav className="display-designer-source-navigation" aria-label="Generated source navigation">{sourceNavigation.map((target) => <button key={`${target.label}-${target.line}`} type="button" onClick={() => setActiveSourceLine(target.line)}>{target.label} · line {target.line}</button>)}</nav>}
        {generated.ok ? <LuaSourcePreview source={generated.source} activeLine={activeSourceLine} /> : <p role="status">Generation is blocked until design errors are repaired.</p>}
      </details>
    </section>
  )
}

function initialHistory(): DisplayDesignHistory {
  return createDisplayDesignHistory(createEmptyDisplayDesign(), createEmptyDisplayDesignSelection())
}

export function DisplayDesignerDialog({ open, returnFocusRef, onClose }: Props) {
  const [history, setHistory] = useState(initialHistory)
  const [activeTool, setActiveTool] = useState<DesignerTool>('select')
  const [zoom, setZoom] = useState<DesignerZoom>('fit')
  const [showGrid, setShowGrid] = useState(true)
  const [showPixels, setShowPixels] = useState(true)
  const [showGeometry, setShowGeometry] = useState(true)
  const [layersCollapsed, setLayersCollapsed] = useState(false)
  const [inspectorCollapsed, setInspectorCollapsed] = useState(false)
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const [pendingDetachId, setPendingDetachId] = useState<string>()
  const [hiddenGroupIds, setHiddenGroupIds] = useState<Set<string>>(() => new Set())
  const [gesture, setGesture] = useState<DisplayDesignerGesture | null>(null)
  const gestureRef = useRef<DisplayDesignerGesture | null>(null)
  const [idFactory] = useState<DisplayDesignIdFactory>(() => createSequentialDisplayDesignIdFactory('designer'))
  const dialogRef = useRef<HTMLDivElement>(null)
  const discardRef = useRef<HTMLButtonElement>(null)
  const document = gesture?.document ?? history.present.document
  const selection = gesture?.selection ?? history.present.selection
  const selectedId = selection.elementIds[0]
  const activeSymbol = selection.symbolId ? document.symbols.find(({ id }) => id === selection.symbolId) : undefined
  const activeVariant = activeSymbol?.variants.find(({ id }) => id === selection.variantId)
  const selectedPrimitiveId = selection.primitiveIds[0]
  const selectedElement = activeVariant && selection.primitiveIds.length === 1
    ? activeVariant.elements.find(({ id }) => id === selectedPrimitiveId)
    : selection.elementIds.length === 1 ? document.elements.find(({ id }) => id === selectedId) : undefined
  const compiled = useMemo(() => compileDisplayDesign(document), [document])
  const previewDocument = useMemo(() => ({
    ...document,
    displayMode: activeVariant ? 'full-screen' as const : document.displayMode,
    elements: activeVariant
      ? cloneDisplayDesign(activeVariant.elements)
      : document.elements.filter(({ groupId }) => !groupId || !hiddenGroupIds.has(groupId)),
    groups: activeVariant ? [] : document.groups,
    symbols: activeVariant ? [] : document.symbols,
  }), [activeVariant, document, hiddenGroupIds])
  const previewCompiled = useMemo(() => compileDisplayDesign(previewDocument), [previewDocument])
  const generated = useMemo(() => generateDisplayDesignLua(document), [document])
  const dirty = history.past.length > 0

  useEffect(() => {
    if (!open) return
    const previousOverflow = globalThis.document.body.style.overflow
    const returnFocus = returnFocusRef.current
    globalThis.document.body.style.overflow = 'hidden'
    const frame = window.requestAnimationFrame(() => dialogRef.current?.querySelector<HTMLElement>('[data-display-designer-initial-focus]')?.focus())
    return () => {
      window.cancelAnimationFrame(frame)
      globalThis.document.body.style.overflow = previousOverflow
      returnFocus?.focus()
    }
  }, [open, returnFocusRef])

  useEffect(() => {
    if (confirmDiscard) discardRef.current?.focus()
  }, [confirmDiscard])

  if (!open) return null

  const updateGesture = (next: DisplayDesignerGesture | null) => {
    gestureRef.current = next
    setGesture(next)
  }

  const commit = (
    label: string,
    nextDocument: DisplayDesignDocumentV1,
    nextSelection: DisplayDesignSelection = selection,
  ) => setHistory((current) => applyDisplayDesignTransaction(current, label, () => ({ document: nextDocument, selection: nextSelection })))

  const setSelection = (nextSelection: DisplayDesignSelection) => setHistory((current) => ({
    ...current,
    present: { ...current.present, selection: nextSelection },
  }))

  const updateBindingPreview = (
    bindingId: string,
    update: (binding: DisplayDesignBinding) => DisplayDesignBinding,
  ) => setHistory((current) => ({
    ...current,
    present: {
      ...current.present,
      document: updateDisplayDesignBinding(current.present.document, bindingId, update),
    },
  }))

  const selectElement = (id: string, toggle = false) => setSelection(selectDisplayDesignElements(
    history.present.document,
    history.present.selection,
    [id],
    toggle ? 'toggle' : 'replace',
  ))

  const addPrimitive = (preset: DisplayPrimitivePreset) => {
    const primitive = createDefaultDisplayPrimitive(preset, idFactory, activeVariant ? 'primitive' : 'element')
    if (activeSymbol && activeVariant) {
      const nextDocument = updateDisplaySymbolVariant(document, activeSymbol.id, activeVariant.id, (variant) => ({ ...variant, elements: [...variant.elements, primitive] }))
      commit(`Add ${primitive.name} to state`, nextDocument, { ...selection, primitiveIds: [primitive.id] })
      return
    }
    const nextDocument = addDisplayDesignElement(document, primitive)
    commit(`Add ${primitive.name}`, nextDocument, { ...createEmptyDisplayDesignSelection(), elementIds: [primitive.id] })
  }

  const beginPointerGesture = ({ point, pointerId, elementId, handle, shiftKey }: { point: DisplayDesignPoint; pointerId: number; elementId?: string; handle?: DisplayDesignHandle; shiftKey: boolean }) => {
    if (activeSymbol && activeVariant) {
      if (activeTool !== 'select' || !elementId) return
      setSelection({ ...createEmptyDisplayDesignSelection(), symbolId: activeSymbol.id, variantId: activeVariant.id, primitiveIds: [elementId] })
      return
    }
    if (activeTool !== 'select') {
      const primitive = createDisplayPrimitiveFromGesture(activeTool, point, point, document.displayMode, idFactory)
      const nextDocument = addDisplayDesignElement(document, primitive)
      updateGesture({
        kind: 'create', pointerId, start: point, baseDocument: document, document: nextDocument,
        selection: { ...createEmptyDisplayDesignSelection(), elementIds: [primitive.id] },
        elementId: primitive.id, preset: activeTool,
      })
      return
    }
    if (!elementId) {
      setSelection(createEmptyDisplayDesignSelection())
      return
    }
    const nextSelection = selectDisplayDesignElements(document, selection, [elementId], shiftKey ? 'toggle' : selection.elementIds.includes(elementId) ? 'add' : 'replace')
    setSelection(nextSelection)
    if (shiftKey || !nextSelection.elementIds.includes(elementId)) return
    updateGesture({
      kind: handle ? 'resize' : 'move', pointerId, start: point, baseDocument: document, document,
      selection: nextSelection, elementId, handle,
    })
  }

  const movePointerGesture = (point: DisplayDesignPoint, pointerId: number) => {
    const current = gestureRef.current
    if (!current || current.pointerId !== pointerId) return
    let nextDocument = current.document
    if (current.kind === 'create' && current.preset && current.elementId) {
      const primitive = createDisplayPrimitiveFromGesture(current.preset, current.start, point, current.baseDocument.displayMode, () => current.elementId!)
      nextDocument = addDisplayDesignElement(current.baseDocument, primitive)
    } else if (current.kind === 'move') {
      const selected = current.baseDocument.elements.filter(({ id }) => current.selection.elementIds.includes(id))
      const smoothOnly = selected.length > 0 && selected.every((element) => (element.kind === 'line' || element.kind === 'circle') && element.smooth)
      const delta = constrainDisplayPointerTranslation(current.baseDocument, current.selection.elementIds, {
        x: snapDisplayCoordinate(point.x - current.start.x, smoothOnly),
        y: snapDisplayCoordinate(point.y - current.start.y, smoothOnly),
      })
      nextDocument = translateDisplayElements(current.baseDocument, current.selection.elementIds, delta.x, delta.y)
    } else if (current.kind === 'resize' && current.elementId && current.handle) {
      const element = current.baseDocument.elements.find(({ id }) => id === current.elementId)
      const smooth = element ? (element.kind === 'line' || element.kind === 'circle') && element.smooth : false
      const constrained = constrainDisplayCreationPoint(point, current.baseDocument.displayMode, smooth)
      nextDocument = updateDisplayDesignElement(current.baseDocument, current.elementId, (currentElement) => resizeDisplayElement(currentElement, current.handle!, constrained))
    }
    updateGesture({ ...current, document: nextDocument })
  }

  const finishPointerGesture = (pointerId: number) => {
    const current = gestureRef.current
    if (!current || current.pointerId !== pointerId) return
    updateGesture(null)
    const label = current.kind === 'create' ? `Add ${current.preset}` : current.kind === 'move' ? 'Move selection' : 'Resize layer'
    commit(label, current.document, current.selection)
    if (current.kind === 'create' && current.preset?.includes('text')) {
      window.requestAnimationFrame(() => dialogRef.current?.querySelector<HTMLInputElement>('.display-designer-inspector input[type="text"]')?.focus())
    }
  }

  const cancelPointerGesture = (pointerId: number) => {
    if (gestureRef.current?.pointerId === pointerId) updateGesture(null)
  }

  const requestClose = () => {
    if (dirty) setConfirmDiscard(true)
    else onClose()
  }

  const discardAndClose = () => {
    setHistory(initialHistory())
    setActiveTool('select')
    updateGesture(null)
    setConfirmDiscard(false)
    onClose()
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement
    const protectsEditing = target.matches('input, textarea, select') || target.isContentEditable
    if (event.key === 'Escape') {
      event.preventDefault()
      if (confirmDiscard) setConfirmDiscard(false)
      else if (gestureRef.current) updateGesture(null)
      else if (activeTool !== 'select') setActiveTool('select')
      else requestClose()
      return
    }
    if (!protectsEditing && (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
      event.preventDefault()
      setHistory(event.shiftKey ? redoDisplayDesign : undoDisplayDesign)
      return
    }
    if (!protectsEditing && (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'y') {
      event.preventDefault()
      setHistory(redoDisplayDesign)
      return
    }
    if (!protectsEditing && (event.key === 'Delete' || event.key === 'Backspace') && selection.elementIds.length > 0) {
      event.preventDefault()
      commit('Delete selection', deleteDisplayDesignElements(document, selection.elementIds), createEmptyDisplayDesignSelection())
      return
    }
    if (!protectsEditing && (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'd' && selection.elementIds.length > 0) {
      event.preventDefault()
      const duplicate = duplicateDisplayDesignElements(document, selection.elementIds, idFactory)
      commit('Duplicate selection', duplicate.document, { ...createEmptyDisplayDesignSelection(), elementIds: duplicate.duplicatedIds })
      return
    }
    if (!protectsEditing && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key) && selection.elementIds.length > 0) {
      event.preventDefault()
      const distance = event.shiftKey ? 5 : 1
      const dx = event.key === 'ArrowLeft' ? -distance : event.key === 'ArrowRight' ? distance : 0
      const dy = event.key === 'ArrowUp' ? -distance : event.key === 'ArrowDown' ? distance : 0
      commit('Nudge selection', translateDisplayElements(document, selection.elementIds, dx, dy))
      return
    }
    if (event.key !== 'Tab') return
    const focusRoot = confirmDiscard
      ? dialogRef.current?.querySelector<HTMLElement>('[role="alertdialog"]')
      : dialogRef.current
    const focusable = [...(focusRoot?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary, [tabindex]:not([tabindex="-1"])') ?? [])]
    if (focusable.length === 0) return
    const first = focusable[0]
    const last = focusable.at(-1)!
    if (event.shiftKey && globalThis.document.activeElement === first) { event.preventDefault(); last.focus() }
    else if (!event.shiftKey && globalThis.document.activeElement === last) { event.preventDefault(); first.focus() }
  }

  const dialog = (
    <div className="display-designer-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) requestClose() }}>
      <div ref={dialogRef} className="display-designer-dialog" role="dialog" aria-modal="true" aria-labelledby="display-designer-title" aria-describedby="display-designer-description" onKeyDown={handleKeyDown}>
        <header className="display-designer-header">
          <div className="display-designer-title"><h2 id="display-designer-title">Display designer</h2><p id="display-designer-description">Browser-only authoring for the 256 × 64 Disting NT display.</p></div>
          <label><span>Display mode</span><select value={document.displayMode} onChange={(event) => commit('Change display mode', setDisplayDesignMode(document, event.currentTarget.value as DisplayDesignDocumentV1['displayMode']))}><option value="parameter-line">Keep standard parameter line</option><option value="full-screen">Use full display</option></select></label>
          <label><span>Zoom</span><select aria-label="Artboard zoom" value={zoom} onChange={(event) => setZoom(event.currentTarget.value === 'fit' ? 'fit' : Number(event.currentTarget.value) as DesignerZoom)}><option value="fit">Fit</option><option value="2">2×</option><option value="3">3×</option><option value="4">4×</option></select></label>
          <button type="button" aria-pressed={showGrid} onClick={() => setShowGrid((value) => !value)}>Grid</button>
          <button type="button" aria-pressed={showPixels} onClick={() => setShowPixels((value) => !value)}>Pixels</button>
          <button type="button" aria-pressed={showGeometry} onClick={() => setShowGeometry((value) => !value)}>Geometry</button>
          <button type="button" disabled={history.past.length === 0} onClick={() => setHistory(undoDisplayDesign)}>Undo</button>
          <button type="button" disabled={history.future.length === 0} onClick={() => setHistory(redoDisplayDesign)}>Redo</button>
          <button type="button" aria-label="Close Display designer" onClick={requestClose}><ControlIcon name="close" size={16} /></button>
        </header>

        <div className="display-designer-toolbar" role="toolbar" aria-label="Display primitives">
          {TOOLS.map((tool) => <button key={tool.id} type="button" data-display-designer-initial-focus={tool.id === 'select' ? '' : undefined} aria-label={tool.label} aria-pressed={activeTool === tool.id} onClick={() => {
            setActiveTool(tool.id)
          }}><span className="display-designer-tool-glyph" aria-hidden="true">{tool.id === 'select' ? '↖' : tool.id.includes('text') ? 'T' : tool.id.includes('circle') ? '○' : tool.id.includes('box') ? '□' : '╱'}</span>{tool.shortLabel}</button>)}
          {activeTool !== 'select' && <button type="button" onClick={() => addPrimitive(activeTool)}>Add default {TOOLS.find(({ id }) => id === activeTool)?.label}</button>}
        </div>

        <main className={`display-designer-workspace${layersCollapsed ? ' layers-collapsed' : ''}${inspectorCollapsed ? ' inspector-collapsed' : ''}`}>
          <aside className="display-designer-sidebar display-designer-sidebar--layers">
            <button type="button" className="display-designer-collapse" aria-expanded={!layersCollapsed} onClick={() => setLayersCollapsed((value) => !value)}>{layersCollapsed ? 'Show layers' : 'Hide layers'}</button>
            {!layersCollapsed && <DisplayDesignerLayers
              document={document}
              selectedIds={selection.elementIds}
              onSelect={selectElement}
              onDuplicateSelection={() => {
                const duplicate = duplicateDisplayDesignElements(document, selection.elementIds, idFactory)
                commit('Duplicate selection', duplicate.document, { ...createEmptyDisplayDesignSelection(), elementIds: duplicate.duplicatedIds })
              }}
              onDeleteSelection={() => commit('Delete selection', deleteDisplayDesignElements(document, selection.elementIds), createEmptyDisplayDesignSelection())}
              onReorderSelection={(operation) => commit(`Reorder selection ${operation}`, reorderDisplayDesignSelection(document, selection.elementIds, operation))}
              onAlign={(alignment) => commit(`Align ${alignment}`, alignDisplayElements(document, selection.elementIds, alignment))}
              onDistribute={(direction) => commit(`Distribute ${direction}`, distributeDisplayElements(document, selection.elementIds, direction))}
              onCreateGroup={() => {
                const group = createDefaultDisplayGroup(idFactory)
                const withGroup = addDisplayDesignGroup(document, group)
                commit('Group selection', assignDisplayDesignGroup(withGroup, selection.elementIds, group.id), { ...selection, groupIds: [group.id] })
              }}
              onAssignGroup={(groupId) => commit(groupId ? 'Assign selection to group' : 'Ungroup selection', assignDisplayDesignGroup(document, selection.elementIds, groupId))}
              onSelectGroup={(groupId) => setSelection({
                ...createEmptyDisplayDesignSelection(),
                groupIds: [groupId],
                elementIds: document.elements.filter((element) => element.groupId === groupId).map(({ id }) => id),
              })}
              onRenameGroup={(groupId, name) => commit('Rename group', updateDisplayDesignGroup(document, groupId, (group) => ({ ...group, name })))}
              onDuplicateGroup={(groupId) => {
                const duplicate = duplicateDisplayDesignGroup(document, groupId, idFactory)
                commit('Duplicate group', duplicate.document, {
                  ...createEmptyDisplayDesignSelection(),
                  groupIds: duplicate.groupId ? [duplicate.groupId] : [],
                  elementIds: duplicate.duplicatedElementIds,
                })
              }}
              onDeleteGroup={(groupId, choice) => commit(choice === 'ungroup' ? 'Ungroup layers' : 'Delete group and layers', deleteDisplayDesignGroup(document, groupId, choice), createEmptyDisplayDesignSelection())}
              hiddenGroupIds={hiddenGroupIds}
              onToggleGroup={(groupId) => setHiddenGroupIds((current) => {
                const next = new Set(current)
                if (next.has(groupId)) next.delete(groupId)
                else next.add(groupId)
                return next
              })}
            />}
            {!layersCollapsed && <DisplayDesignerSymbols
              document={document}
              selection={selection}
              onCreate={() => {
                const created = createDisplaySymbolFromSelection(document, selection.elementIds, idFactory)
                if (!created.symbol || !created.instance) return
                commit('Create symbol from selection', created.document, { ...createEmptyDisplayDesignSelection(), elementIds: [created.instance.id] })
              }}
              onEdit={(symbolId, variantId) => setSelection({ ...createEmptyDisplayDesignSelection(), symbolId, variantId, primitiveIds: [] })}
              onExit={() => setSelection(createEmptyDisplayDesignSelection())}
              onSelectPrimitive={(primitiveId) => activeSymbol && activeVariant && setSelection({ ...createEmptyDisplayDesignSelection(), symbolId: activeSymbol.id, variantId: activeVariant.id, primitiveIds: [primitiveId] })}
              onAddVariant={(symbolId, sourceVariantId, blank) => {
                const added = addDisplaySymbolVariant(document, symbolId, idFactory, { sourceVariantId, blank })
                commit(blank ? 'Add blank symbol state' : 'Duplicate symbol state', added.document, { ...createEmptyDisplayDesignSelection(), symbolId, variantId: added.variantId, primitiveIds: [] })
              }}
              onRenameSymbol={(symbolId, name) => commit('Rename symbol', updateDisplayDesignSymbol(document, symbolId, (symbol) => ({ ...symbol, name })))}
              onRenameVariant={(symbolId, variantId, name) => commit('Rename symbol state', updateDisplaySymbolVariant(document, symbolId, variantId, (variant) => ({ ...variant, name })))}
              onChangeLuaValue={(symbolId, variantId, luaValue) => commit('Change stable state value', updateDisplaySymbolVariant(document, symbolId, variantId, (variant) => ({ ...variant, luaValue })))}
              onSetDefault={(symbolId, variantId) => commit('Set default symbol state', setDefaultDisplaySymbolVariant(document, symbolId, variantId))}
              onReorderVariant={(symbolId, fromIndex, toIndex) => commit('Reorder symbol state', reorderDisplaySymbolVariant(document, symbolId, fromIndex, toIndex))}
              onDeleteVariant={(symbolId, variantId, replacementVariantId) => commit('Replace and delete symbol state', deleteDisplaySymbolVariant(document, symbolId, variantId, replacementVariantId), { ...createEmptyDisplayDesignSelection(), symbolId, variantId: replacementVariantId, primitiveIds: [] })}
              onDeleteSymbol={(symbolId, choice) => commit(choice === 'detach-instances' ? 'Detach instances and delete symbol' : 'Delete instances and symbol', deleteUsedDisplaySymbol(document, symbolId, choice, idFactory), createEmptyDisplayDesignSelection())}
            />}
          </aside>

          <DisplayDesignerArtboard
            document={previewDocument}
            commands={previewCompiled.commands}
            displayMode={activeVariant ? 'full-screen' : document.displayMode}
            selectedElementIds={activeVariant ? selection.primitiveIds : selection.elementIds}
            commandSources={previewCompiled.commandSources}
            activeTool={activeTool}
            zoom={zoom}
            showGrid={showGrid}
            showPixels={showPixels}
            showGeometry={showGeometry}
            showOriginMarker={Boolean(activeVariant)}
            onPointerStart={beginPointerGesture}
            onPointerMove={movePointerGesture}
            onPointerEnd={finishPointerGesture}
            onPointerCancel={cancelPointerGesture}
          />

          <aside className="display-designer-sidebar display-designer-sidebar--inspector">
            <button type="button" className="display-designer-collapse" aria-expanded={!inspectorCollapsed} onClick={() => setInspectorCollapsed((value) => !value)}>{inspectorCollapsed ? 'Show properties' : 'Hide properties'}</button>
            {!inspectorCollapsed && <>
              <DisplayDesignerInspector
                element={selectedElement}
                document={activeVariant ? previewDocument : document}
                idFactory={idFactory}
                onCommit={(label, nextDocument) => {
                  if (!activeSymbol || !activeVariant) { commit(label, nextDocument); return }
                  const merged = updateDisplaySymbolVariant(document, activeSymbol.id, activeVariant.id, (variant) => ({
                    ...variant,
                    elements: nextDocument.elements.filter((element): element is DisplayPrimitiveElement => element.kind !== 'symbol-instance'),
                  }))
                  commit(label, { ...merged, bindings: nextDocument.bindings }, selection)
                }}
                onEditSymbol={(instance) => {
                  const symbol = document.symbols.find(({ id }) => id === instance.symbolId)
                  if (!symbol) return
                  let variantId = symbol.defaultVariantId
                  const instanceState = instance.state
                  if (instanceState.kind === 'literal') variantId = instanceState.variantId
                  else {
                    const binding = document.bindings.find(({ id }) => id === instanceState.bindingId)
                    if (binding?.kind === 'choice') variantId = instanceState.variantByChoiceId[binding.previewChoiceId] ?? variantId
                  }
                  setSelection({ ...createEmptyDisplayDesignSelection(), symbolId: symbol.id, variantId, primitiveIds: [] })
                }}
                onDetachInstance={(instance) => setPendingDetachId(instance.id)}
              />
              <DisplayDesignerStatePanel document={document} idFactory={idFactory} onCommit={commit} onPreviewUpdate={updateBindingPreview} />
            </>}
          </aside>
        </main>

        <DisplayDesignerReview document={document} compiled={compiled} generated={generated} bindingCount={document.bindings.length} variantCount={document.symbols.reduce((count, symbol) => count + symbol.variants.length, 0)} onFocusFinding={(elementId) => { if (elementId) selectElement(elementId) }} />

        {pendingDetachId && <div className="display-designer-confirm-shell"><section role="alertdialog" aria-modal="true" aria-labelledby="display-designer-detach-title"><h3 id="display-designer-detach-title">Detach symbol instance?</h3><p>Only the current preview state will remain as ordinary layers. Reuse and alternate states will be lost for this instance.</p><div><button type="button" onClick={() => setPendingDetachId(undefined)}>Cancel</button><button type="button" onClick={() => { const next = detachDisplaySymbolInstance(document, pendingDetachId, idFactory); setPendingDetachId(undefined); commit('Detach symbol instance', next, createEmptyDisplayDesignSelection()) }}>Detach instance</button></div></section></div>}

        {confirmDiscard && <div className="display-designer-confirm-shell"><section role="alertdialog" aria-modal="true" aria-labelledby="display-designer-discard-title" aria-describedby="display-designer-discard-description"><h3 id="display-designer-discard-title">Discard display design?</h3><p id="display-designer-discard-description">Closing now removes the unsaved design from this session.</p><div><button type="button" onClick={() => setConfirmDiscard(false)}>Keep editing</button><button ref={discardRef} type="button" className="is-danger" onClick={discardAndClose}>Discard design</button></div></section></div>}
      </div>
    </div>
  )

  if (typeof globalThis.document === 'undefined') return dialog
  return createPortal(dialog, globalThis.document.body)
}
