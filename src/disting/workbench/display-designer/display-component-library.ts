import { allocateDisplayLuaIdentifier } from './display-design-lua-identifiers'
import {
  DISPLAY_DESIGN_LIMITS,
  activeDisplayDesignScreen,
  cloneDisplayDesign,
  createEmptyDisplayDesign,
  createSequentialDisplayDesignIdFactory,
  type DisplayBooleanBinding,
  type DisplayChoiceBinding,
  type DisplayDesignBinding,
  type DisplayDesignDocument,
  type DisplayDesignIdFactory,
  type DisplayPrimitiveElement,
  type DisplayScalar,
  type DisplayScalarQuantization,
  type DisplaySymbolInstance,
  type DisplayText,
  type DisplayTextBinding,
  type DisplayVisibility,
  type DisplayNumberBinding,
  type DisplayDesignSymbol,
} from './display-design-model'
import { validateDisplayDesign } from './display-design-validation'

export type DisplayComponentCategoryId =
  | 'layout'
  | 'patching'
  | 'controls'
  | 'signals'
  | 'processors'
  | 'meters'
  | 'sequencing'
  | 'drums'
  | 'status'

export interface DisplayComponentCategory {
  id: DisplayComponentCategoryId
  label: string
}

export const DISPLAY_COMPONENT_CATEGORIES: readonly DisplayComponentCategory[] = [
  { id: 'layout', label: 'Layout' },
  { id: 'patching', label: 'Patch & routing' },
  { id: 'controls', label: 'Controls' },
  { id: 'signals', label: 'Signals' },
  { id: 'processors', label: 'Processors' },
  { id: 'meters', label: 'Meters' },
  { id: 'sequencing', label: 'Sequencing' },
  { id: 'drums', label: 'Drums' },
  { id: 'status', label: 'Status' },
]

export type DisplayComponentInput =
  | {
      kind: 'number'
      key: string
      name: string
      description: string
      defaultValue: number
    }
  | {
      kind: 'boolean'
      key: string
      name: string
      description: string
      defaultValue: boolean
    }
  | {
      kind: 'text'
      key: string
      name: string
      description: string
      defaultValue: string
    }

export interface DisplayComponentState {
  value: string
  name: string
}

export type DisplayComponentScenarioValue = number | boolean | string

export interface DisplayComponentScenario {
  id: string
  name: string
  state: string
  values?: Record<string, DisplayComponentScenarioValue>
}

export interface DisplayComponentBuildContext {
  primitiveId(): string
  number(
    key: string,
    from: number,
    to: number,
    quantize?: DisplayScalarQuantization,
  ): DisplayScalar
  visible(key: string, invert?: boolean): DisplayVisibility
  text(key: string): DisplayText
}

export interface DisplayComponentRecipe {
  id: string
  version: 1
  name: string
  category: DisplayComponentCategoryId
  description: string
  tags: readonly string[]
  footprint: { width: number; height: number }
  states: readonly DisplayComponentState[]
  defaultState: string
  inputs: readonly DisplayComponentInput[]
  scenarios: readonly DisplayComponentScenario[]
  build(context: DisplayComponentBuildContext, state: string): DisplayPrimitiveElement[]
}

export interface DisplayComponentCatalogFinding {
  recipeId: string
  message: string
}

export interface MaterializedDisplayComponent {
  ok: true
  document: DisplayDesignDocument
  instance: DisplaySymbolInstance
  symbol: DisplayDesignSymbol
  bindingIds: string[]
  warnings: string[]
}

export interface RejectedDisplayComponent {
  ok: false
  message: string
  findings: string[]
}

export type DisplayComponentMaterializationResult =
  | MaterializedDisplayComponent
  | RejectedDisplayComponent

function inputValueIsValid(input: DisplayComponentInput, value: unknown): boolean {
  if (input.kind === 'number') return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1
  if (input.kind === 'boolean') return typeof value === 'boolean'
  return typeof value === 'string' && [...value].length <= DISPLAY_DESIGN_LIMITS.maximumTextCodePoints
}

export function validateDisplayComponentCatalog(
  recipes: readonly DisplayComponentRecipe[],
): DisplayComponentCatalogFinding[] {
  const findings: DisplayComponentCatalogFinding[] = []
  const ids = new Set<string>()
  const categoryIds = new Set(DISPLAY_COMPONENT_CATEGORIES.map(({ id }) => id))
  for (const recipe of recipes) {
    const finding = (message: string) => findings.push({ recipeId: recipe.id, message })
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(recipe.id)) finding('Recipe ID must be a stable lowercase kebab-case value.')
    if (ids.has(recipe.id)) finding('Recipe ID must be unique.')
    ids.add(recipe.id)
    if (!recipe.name.trim()) finding('Recipe name is required.')
    if (!recipe.description.trim()) finding('Recipe description is required.')
    if (!categoryIds.has(recipe.category)) finding('Recipe category is unknown.')
    if (!Number.isInteger(recipe.footprint.width) || recipe.footprint.width < 1 || recipe.footprint.width > 256) finding('Footprint width must be a whole number from 1 through 256.')
    if (!Number.isInteger(recipe.footprint.height) || recipe.footprint.height < 1 || recipe.footprint.height > 64) finding('Footprint height must be a whole number from 1 through 64.')
    if (recipe.states.length < 2 || recipe.states.length > DISPLAY_DESIGN_LIMITS.maximumVariantsPerSymbol) finding(`Recipes need from 2 through ${DISPLAY_DESIGN_LIMITS.maximumVariantsPerSymbol} states.`)
    const stateValues = new Set<string>()
    for (const state of recipe.states) {
      if (!state.name.trim() || !state.value.trim()) finding('Every state needs a name and stable value.')
      if (stateValues.has(state.value)) finding(`State value “${state.value}” is duplicated.`)
      stateValues.add(state.value)
    }
    if (!stateValues.has(recipe.defaultState)) finding('Default state must reference a declared state.')
    const inputs = new Map<string, DisplayComponentInput>()
    for (const input of recipe.inputs) {
      if (!/^[a-z][A-Za-z0-9]*$/u.test(input.key)) finding(`Input key “${input.key}” must be lower camel case.`)
      if (inputs.has(input.key) || input.key === 'state') finding(`Input key “${input.key}” is duplicated or reserved.`)
      inputs.set(input.key, input)
      if (!input.name.trim() || !input.description.trim()) finding(`Input “${input.key}” needs a name and description.`)
      if (!inputValueIsValid(input, input.defaultValue)) finding(`Input “${input.key}” has an invalid default value.`)
    }
    const scenarioIds = new Set<string>()
    if (recipe.scenarios.length < 3) finding('Recipes need Default, Active, and Edge case preview scenarios.')
    for (const scenario of recipe.scenarios) {
      if (!scenario.id.trim() || !scenario.name.trim()) finding('Every scenario needs an ID and name.')
      if (scenarioIds.has(scenario.id)) finding(`Scenario ID “${scenario.id}” is duplicated.`)
      scenarioIds.add(scenario.id)
      if (!stateValues.has(scenario.state)) finding(`Scenario “${scenario.id}” references an unknown state.`)
      for (const [key, value] of Object.entries(scenario.values ?? {})) {
        const input = inputs.get(key)
        if (!input) finding(`Scenario “${scenario.id}” references unknown input “${key}”.`)
        else if (!inputValueIsValid(input, value)) finding(`Scenario “${scenario.id}” has an invalid value for “${key}”.`)
      }
    }
  }
  return findings
}

export function filterDisplayComponentRecipes(
  recipes: readonly DisplayComponentRecipe[],
  query: string,
  category: DisplayComponentCategoryId | 'all' = 'all',
): DisplayComponentRecipe[] {
  const normalized = query.trim().toLocaleLowerCase()
  return recipes.filter((recipe) => {
    if (category !== 'all' && recipe.category !== category) return false
    if (!normalized) return true
    const categoryLabel = DISPLAY_COMPONENT_CATEGORIES.find(({ id }) => id === recipe.category)?.label ?? ''
    return [recipe.name, recipe.description, categoryLabel, ...recipe.tags]
      .some((value) => value.toLocaleLowerCase().includes(normalized))
  })
}

function uniqueComponentName(document: DisplayDesignDocument, requested: string): string {
  const names = new Set(document.symbols.map(({ name }) => name))
  if (!names.has(requested)) return requested
  let suffix = 2
  while (names.has(`${requested} ${suffix}`)) suffix += 1
  return `${requested} ${suffix}`
}

function usedLuaNames(document: DisplayDesignDocument): Set<string> {
  return new Set([
    ...document.tokens.map(({ luaName }) => luaName),
    ...document.bindings.map(({ luaName }) => luaName),
    ...document.symbols.map(({ luaName }) => luaName),
  ])
}

function componentOrigin(
  document: DisplayDesignDocument,
  footprint: DisplayComponentRecipe['footprint'],
  requested?: { x: number; y: number },
): { x: number; y: number } {
  const minimumY = document.displayMode === 'parameter-line' ? 10 : 0
  const maximumX = Math.max(0, 256 - footprint.width)
  const maximumY = Math.max(minimumY, 64 - footprint.height)
  const centered = {
    x: Math.floor((256 - footprint.width) / 2),
    y: Math.floor((minimumY + 64 - footprint.height) / 2),
  }
  const origin = requested ?? centered
  return {
    x: Math.max(0, Math.min(maximumX, Math.round(origin.x))),
    y: Math.max(minimumY, Math.min(maximumY, Math.round(origin.y))),
  }
}

function scenarioForRecipe(
  recipe: DisplayComponentRecipe,
  scenarioId?: string,
): DisplayComponentScenario {
  return recipe.scenarios.find(({ id }) => id === scenarioId) ?? recipe.scenarios[0]!
}

function createBindings(
  document: DisplayDesignDocument,
  recipe: DisplayComponentRecipe,
  componentName: string,
  scenario: DisplayComponentScenario,
  idFactory: DisplayDesignIdFactory,
): {
  bindings: DisplayDesignBinding[]
  stateBinding: DisplayChoiceBinding
  inputs: Map<string, DisplayDesignBinding>
} {
  const usedNames = usedLuaNames(document)
  const allocate = (name: string, fallback: string) => {
    const luaName = allocateDisplayLuaIdentifier(name, usedNames, fallback)
    usedNames.add(luaName)
    return luaName
  }
  const choices = recipe.states.map((state) => ({ id: idFactory('choice'), name: state.name, luaValue: state.value }))
  const previewChoiceId = choices[recipe.states.findIndex(({ value }) => value === scenario.state)]?.id ?? choices[0]!.id
  const stateBinding: DisplayChoiceBinding = {
    kind: 'choice',
    id: idFactory('binding'),
    name: `${componentName} · State`,
    luaName: allocate(`${componentName} state`, 'state'),
    choices,
    previewChoiceId,
  }
  const bindings: DisplayDesignBinding[] = [stateBinding]
  const inputs = new Map<string, DisplayDesignBinding>()
  for (const input of recipe.inputs) {
    const previewValue = scenario.values?.[input.key] ?? input.defaultValue
    const common = {
      id: idFactory('binding'),
      name: `${componentName} · ${input.name}`,
      luaName: allocate(`${componentName} ${input.name}`, input.kind === 'boolean' ? 'enabled' : input.kind === 'text' ? 'label' : 'value'),
    }
    let binding: DisplayNumberBinding | DisplayBooleanBinding | DisplayTextBinding
    if (input.kind === 'number') binding = { ...common, kind: 'number', previewValue: previewValue as number }
    else if (input.kind === 'boolean') binding = { ...common, kind: 'boolean', previewValue: previewValue as boolean }
    else binding = { ...common, kind: 'text', previewValue: previewValue as string }
    bindings.push(binding)
    inputs.set(input.key, binding)
  }
  return { bindings, stateBinding, inputs }
}

export function materializeDisplayComponent(
  document: DisplayDesignDocument,
  recipe: DisplayComponentRecipe,
  idFactory: DisplayDesignIdFactory,
  options: { scenarioId?: string; origin?: { x: number; y: number } } = {},
): DisplayComponentMaterializationResult {
  const recipeFindings = validateDisplayComponentCatalog([recipe])
  if (recipeFindings.length > 0) return {
    ok: false,
    message: `${recipe.name} is not a valid component recipe.`,
    findings: recipeFindings.map(({ message }) => message),
  }
  const scenario = scenarioForRecipe(recipe, options.scenarioId)
  const componentName = uniqueComponentName(document, recipe.name)
  const created = createBindings(document, recipe, componentName, scenario, idFactory)
  const inputDefinition = new Map(recipe.inputs.map((input) => [input.key, input]))
  const context: DisplayComponentBuildContext = {
    primitiveId: () => idFactory('primitive'),
    number: (key, from, to, quantize = 'integer') => {
      const definition = inputDefinition.get(key)
      const binding = created.inputs.get(key)
      if (definition?.kind !== 'number' || binding?.kind !== 'number') throw new Error(`Unknown number input: ${key}`)
      return {
        kind: 'number-binding',
        bindingId: binding.id,
        from: { kind: 'literal', value: from },
        to: { kind: 'literal', value: to },
        quantize,
      }
    },
    visible: (key, invert = false) => {
      const definition = inputDefinition.get(key)
      const binding = created.inputs.get(key)
      if (definition?.kind !== 'boolean' || binding?.kind !== 'boolean') throw new Error(`Unknown boolean input: ${key}`)
      return { kind: 'boolean-binding', bindingId: binding.id, invert }
    },
    text: (key) => {
      const definition = inputDefinition.get(key)
      const binding = created.inputs.get(key)
      if (definition?.kind !== 'text' || binding?.kind !== 'text') throw new Error(`Unknown text input: ${key}`)
      return { kind: 'text-binding', bindingId: binding.id }
    },
  }

  try {
    const variants = recipe.states.map((state) => ({
      id: idFactory('variant'),
      name: state.name,
      luaValue: state.value,
      elements: recipe.build(context, state.value),
    }))
    const defaultVariantId = variants.find(({ luaValue }) => luaValue === recipe.defaultState)?.id ?? variants[0]!.id
    const symbol: DisplayDesignSymbol = {
      id: idFactory('symbol'),
      name: componentName,
      luaName: allocateDisplayLuaIdentifier(`draw ${componentName}`, [
        ...usedLuaNames(document),
        ...created.bindings.map(({ luaName }) => luaName),
      ], 'draw_component'),
      defaultVariantId,
      variants,
    }
    const stateByValue = new Map(variants.map((variant) => [variant.luaValue, variant.id]))
    const variantByChoiceId = Object.fromEntries(created.stateBinding.choices.map((choice) => [
      choice.id,
      stateByValue.get(choice.luaValue) ?? defaultVariantId,
    ]))
    const origin = componentOrigin(document, recipe.footprint, options.origin)
    const instance: DisplaySymbolInstance = {
      kind: 'symbol-instance',
      id: idFactory('element'),
      name: `${componentName} instance`,
      symbolId: symbol.id,
      x: { kind: 'literal', value: origin.x },
      y: { kind: 'literal', value: origin.y },
      visible: { kind: 'visible' },
      state: { kind: 'choice-binding', bindingId: created.stateBinding.id, variantByChoiceId },
      screenId: activeDisplayDesignScreen(document).id,
    }
    const candidate: DisplayDesignDocument = {
      ...cloneDisplayDesign(document),
      bindings: [...cloneDisplayDesign(document.bindings), ...cloneDisplayDesign(created.bindings)],
      symbols: [...cloneDisplayDesign(document.symbols), cloneDisplayDesign(symbol)],
      elements: [...cloneDisplayDesign(document.elements), cloneDisplayDesign(instance)],
    }
    const validation = validateDisplayDesign(candidate)
    const errors = validation.findings.filter(({ severity }) => severity === 'error').map(({ message }) => message)
    if (!validation.ok || !validation.document) return {
      ok: false,
      message: `${recipe.name} cannot be inserted into this design.`,
      findings: errors.length > 0 ? errors : ['The resulting display design is invalid.'],
    }
    return {
      ok: true,
      document: validation.document,
      instance: cloneDisplayDesign(instance),
      symbol: cloneDisplayDesign(symbol),
      bindingIds: created.bindings.map(({ id }) => id),
      warnings: validation.findings.filter(({ severity }) => severity === 'warning').map(({ message }) => message),
    }
  } catch (error) {
    return {
      ok: false,
      message: `${recipe.name} could not be materialized.`,
      findings: [error instanceof Error ? error.message : 'Unknown component recipe failure.'],
    }
  }
}

export function createDisplayComponentPreview(
  recipe: DisplayComponentRecipe,
  scenarioId?: string,
): DisplayDesignDocument {
  const document = { ...createEmptyDisplayDesign(`${recipe.name} preview`), displayMode: 'full-screen' as const }
  const result = materializeDisplayComponent(
    document,
    recipe,
    createSequentialDisplayDesignIdFactory(`component-preview-${recipe.id}`),
    { scenarioId },
  )
  return result.ok ? result.document : document
}
