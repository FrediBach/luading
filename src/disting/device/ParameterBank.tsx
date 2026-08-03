import { useState } from 'react'
import { ControlIcon } from '../controls'
import { Tooltip } from '../controls/Tooltip'
import { PanelEmptyState } from '../PanelEmptyState'
import type { ParameterDefinition } from '../types'
import type { ScriptParameterPreset } from '../types'
import { matchingParameterPresetIndex } from '../emulation/parameter-presets'
import { ParameterControl } from './ParameterControl'
import { ParameterPresetSelector } from './ParameterPresetSelector'
import {
  DEFAULT_PARAMETER_PAGE_SIZE,
  parameterPageCount,
  parameterPageRange,
  randomParameterValue,
} from './parameter-controls'

interface Props {
  definitions: ParameterDefinition[]
  values: number[]
  pageSize?: number
  presets?: readonly ScriptParameterPreset[]
  presetsDisabled?: boolean
  onChange(index: number, value: number): void
  onApplyPreset?(index: number): void
}

export function ParameterBank({
  definitions,
  values,
  pageSize = DEFAULT_PARAMETER_PAGE_SIZE,
  presets = [],
  presetsDisabled = false,
  onChange,
  onApplyPreset,
}: Props) {
  const [requestedPage, setRequestedPage] = useState(0)

  const range = parameterPageRange(
    requestedPage,
    definitions.length,
    pageSize,
  )
  const pageCount = parameterPageCount(definitions.length, pageSize)
  const visibleDefinitions = definitions.slice(range.start, range.end)
  const activePresetIndex = matchingParameterPresetIndex(presets, values)

  return (
    <section className="parameter-bank" aria-label="Script parameters">
      <header className="device-panel-header parameter-bank-header">
        <span>
          <small>Parameters</small>
          <strong>
            {definitions.length === 0
              ? '0 defined'
              : `${range.start + 1}–${range.end} of ${definitions.length}`}
          </strong>
        </span>
        <div className="parameter-bank-actions">
          {presets.length > 0 && onApplyPreset && (
            <ParameterPresetSelector
              presets={presets}
              activeIndex={activePresetIndex}
              disabled={presetsDisabled}
              onApply={onApplyPreset}
            />
          )}
          <Tooltip content="Randomize all parameters" placement="bottom">
            <button
              type="button"
              className="control-icon-toggle parameter-randomize-button"
              aria-label="Randomize all parameters"
              disabled={definitions.length === 0 || presetsDisabled}
              onClick={() => definitions.forEach((definition, index) => {
                onChange(index, randomParameterValue(definition))
              })}
            >
              <ControlIcon name="random" size={15} />
            </button>
          </Tooltip>
          {pageCount > 1 && (
            <div className="parameter-bank-paging">
            <button
              type="button"
              aria-label="Previous parameter page"
              disabled={range.page === 0}
              onClick={() => setRequestedPage(range.page - 1)}
            >
              ‹
            </button>
            <output>{range.page + 1} / {pageCount}</output>
            <button
              type="button"
              aria-label="Next parameter page"
              disabled={range.page === pageCount - 1}
              onClick={() => setRequestedPage(range.page + 1)}
            >
              ›
            </button>
            </div>
          )}
        </div>
      </header>

      <div className="parameter-bank-grid">
        {definitions.length === 0 ? (
          <PanelEmptyState title="No parameters">
            Add parameters to the script&apos;s init configuration to expose
            adjustable controls here.
          </PanelEmptyState>
        ) : (
          visibleDefinitions.map((definition, relativeIndex) => {
            const index = range.start + relativeIndex
            return (
              <ParameterControl
                definition={definition}
                value={values[index] ?? definition.value}
                onChange={(value) => onChange(index, value)}
                key={`${definition.name}-${index}`}
              />
            )
          })
        )}
      </div>
    </section>
  )
}
