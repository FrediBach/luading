import { useState } from 'react'
import type { ParameterDefinition } from '../types'
import { ParameterControl } from './ParameterControl'
import {
  DEFAULT_PARAMETER_PAGE_SIZE,
  parameterPageCount,
  parameterPageRange,
} from './parameter-controls'

interface Props {
  definitions: ParameterDefinition[]
  values: number[]
  pageSize?: number
  onChange(index: number, value: number): void
}

export function ParameterBank({
  definitions,
  values,
  pageSize = DEFAULT_PARAMETER_PAGE_SIZE,
  onChange,
}: Props) {
  const [requestedPage, setRequestedPage] = useState(0)
  if (definitions.length === 0) return null

  const range = parameterPageRange(
    requestedPage,
    definitions.length,
    pageSize,
  )
  const pageCount = parameterPageCount(definitions.length, pageSize)
  const visibleDefinitions = definitions.slice(range.start, range.end)

  return (
    <section className="parameter-bank" aria-label="Script parameters">
      <header className="device-panel-header">
        <span>
          <small>Parameters</small>
          <strong>
            {range.start + 1}–{range.end} of {definitions.length}
          </strong>
        </span>
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
      </header>

      <div className="parameter-bank-grid">
        {visibleDefinitions.map((definition, relativeIndex) => {
          const index = range.start + relativeIndex
          return (
            <ParameterControl
              definition={definition}
              value={values[index] ?? definition.value}
              onChange={(value) => onChange(index, value)}
              key={`${definition.name}-${index}`}
            />
          )
        })}
      </div>
    </section>
  )
}
