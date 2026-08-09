import { useEffect, useMemo, useRef, useState } from 'react'
import { renderDistingDisplay } from '../../emulation/display-renderer'
import { compileDisplayDesign } from './display-design-compiler'
import { DISPLAY_COMPONENT_RECIPES } from './display-component-catalog'
import {
  DISPLAY_COMPONENT_CATEGORIES,
  createDisplayComponentPreview,
  displayComponentRecipeDensity,
  filterDisplayComponentRecipes,
  type DisplayComponentCategoryId,
  type DisplayComponentDensity,
  type DisplayComponentDisplayMode,
  type DisplayComponentRecipe,
} from './display-component-library'

export interface DisplayComponentInsertFeedback {
  ok: boolean
  message: string
}

interface Props {
  onInsert(recipe: DisplayComponentRecipe, scenarioId: string, origin?: { x: number; y: number }): DisplayComponentInsertFeedback
}

function DisplayComponentCard({
  recipe,
  onInsert,
  onStatus,
}: {
  recipe: DisplayComponentRecipe
  onInsert(recipe: DisplayComponentRecipe, scenarioId: string): DisplayComponentInsertFeedback
  onStatus(message: string): void
}) {
  const [scenarioId, setScenarioId] = useState(recipe.scenarios[0]!.id)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const previewDocument = useMemo(() => createDisplayComponentPreview(recipe, scenarioId), [recipe, scenarioId])
  const compiled = useMemo(() => compileDisplayDesign(previewDocument), [previewDocument])
  const category = DISPLAY_COMPONENT_CATEGORIES.find(({ id }) => id === recipe.category)?.label ?? recipe.category

  useEffect(() => {
    const context = canvasRef.current?.getContext('2d')
    if (context) renderDistingDisplay(context, compiled.commands)
  }, [compiled.commands])

  return <li className="display-component-card" data-component-id={recipe.id} draggable onDragStart={(event) => {
    event.dataTransfer.effectAllowed = 'copy'
    event.dataTransfer.setData('application/x-luading-display-component', JSON.stringify({ recipeId: recipe.id, scenarioId }))
  }}>
    <header>
      <span>
        <strong>{recipe.name}</strong>
        <small>{category} · {displayComponentRecipeDensity(recipe)} · {recipe.footprint.width}×{recipe.footprint.height}</small>
      </span>
      <small>{compiled.metrics.drawCallCount} current / {compiled.metrics.maximumVariantDrawCallCount} max calls</small>
    </header>
    <div className="display-component-previews">
      <canvas ref={canvasRef} width="256" height="64" aria-label={`${recipe.name} pixel preview`} />
    </div>
    <p>{recipe.description}</p>
    {recipe.costNote && <p className="display-component-cost-note">{recipe.costNote}</p>}
    <label className="display-designer-field">
      <span>Preview scenario</span>
      <select
        aria-label={`${recipe.name} preview scenario`}
        value={scenarioId}
        onChange={(event) => setScenarioId(event.currentTarget.value)}
      >
        {recipe.scenarios.map((scenario) => <option key={scenario.id} value={scenario.id}>{scenario.name}</option>)}
      </select>
    </label>
    <details>
      <summary>State inputs</summary>
      <ul>
        <li><strong>State</strong>: {recipe.states.map(({ name }) => name).join(', ')}</li>
        {recipe.inputs.map((input) => <li key={input.key}><strong>{input.name}</strong> ({input.kind}, <code>{input.suggestedLuaName}</code>): {input.description} {input.sourceDomain}</li>)}
      </ul>
    </details>
    <p className="display-component-resources">Uses 1 symbol, {recipe.inputs.length + 1} bindings, and {previewDocument.symbols[0]?.variants.reduce((sum, variant) => sum + variant.elements.length, 0) ?? 0} state primitives. Modes: {recipe.compatibleDisplayModes.join(', ')}.</p>
    <button type="button" onClick={() => {
      const feedback = onInsert(recipe, scenarioId)
      onStatus(feedback.message)
    }}>Insert {recipe.name} at centre</button>
  </li>
}

export function DisplayComponentLibrary({ onInsert }: Props) {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<DisplayComponentCategoryId | 'all'>('all')
  const [density, setDensity] = useState<DisplayComponentDensity | 'all'>('all')
  const [displayMode, setDisplayMode] = useState<DisplayComponentDisplayMode | 'all'>('all')
  const [status, setStatus] = useState('')
  const recipes = useMemo(
    () => filterDisplayComponentRecipes(DISPLAY_COMPONENT_RECIPES, query, category, density, displayMode),
    [category, density, displayMode, query],
  )

  return <section className="display-designer-panel display-component-library" aria-labelledby="display-component-library-title">
    <h3 id="display-component-library-title">Components</h3>
    <p className="display-designer-empty">Built-in Disting UI kit. Inserted components become ordinary editable symbols and state bindings.</p>
    <div className="display-component-library-filters">
      <label className="display-designer-field">
        <span>Search components</span>
        <input type="search" value={query} onChange={(event) => setQuery(event.currentTarget.value)} />
      </label>
      <label className="display-designer-field">
        <span>Component density</span>
        <select value={density} onChange={(event) => setDensity(event.currentTarget.value as DisplayComponentDensity | 'all')}>
          <option value="all">All densities</option>
          <option value="micro">Micro</option><option value="compact">Compact</option><option value="regular">Regular</option><option value="screen">Screen</option>
        </select>
      </label>
      <label className="display-designer-field">
        <span>Compatible display mode</span>
        <select value={displayMode} onChange={(event) => setDisplayMode(event.currentTarget.value as DisplayComponentDisplayMode | 'all')}>
          <option value="all">All display modes</option>
          <option value="parameter-line">Parameter-line custom area</option><option value="full-screen">Full screen</option>
        </select>
      </label>
      <label className="display-designer-field">
        <span>Component category</span>
        <select value={category} onChange={(event) => setCategory(event.currentTarget.value as DisplayComponentCategoryId | 'all')}>
          <option value="all">All categories</option>
          {DISPLAY_COMPONENT_CATEGORIES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
        </select>
      </label>
    </div>
    <p className="display-component-library-count">{recipes.length} component{recipes.length === 1 ? '' : 's'}</p>
    {recipes.length > 0
      ? <ol className="display-component-library-list">{recipes.map((recipe) => <DisplayComponentCard key={recipe.id} recipe={recipe} onInsert={onInsert} onStatus={setStatus} />)}</ol>
      : <p className="display-designer-empty">No components match this search.</p>}
    <p className="display-component-library-status" role="status" aria-live="polite">{status}</p>
    <details className="display-component-integration-disclosure"><summary>Integration disclosure</summary><p>Components are browser-only authoring recipes. Insertion creates ordinary editable version-9 symbols and bindings; it adds no firmware widget runtime, does not inspect physical patching, and does not connect itself to the active Lua script. Generated TODO values must be wired to script-owned state.</p></details>
  </section>
}
