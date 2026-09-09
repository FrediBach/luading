import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const css = readFileSync(new URL('./workbench.css', import.meta.url), 'utf8')

function sharedRule(...selectors: string[]) {
  const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
  const rule = rules.find((match) => selectors.every((selector) => match[1].split(',').map((part) => part.trim()).includes(selector)))
  expect(rule, `Shared style for ${selectors.join(' and ')}`).toBeDefined()
  return rule![2]
}

describe('File dropdown theme', () => {
  it('shares script dropdown rows rather than native button styles', () => {
    const row = sharedRule('.script-menu-groups button', '.script-file-menu > button')
    expect(row).toContain('background: transparent')
    expect(row).toContain('color: var(--nt-text)')
    expect(row).toContain('font: var(--font-label)/1 var(--mono)')
    expect(row).toContain('min-height: var(--control-target)')
    sharedRule('.script-menu-groups button:hover', '.script-file-menu > button:hover:not(:disabled)')
  })

  it('shares directory typography, separators, and controls with script storage actions', () => {
    expect(sharedRule('.script-storage-actions h3', '.script-directory-actions h3')).toContain('text-transform: uppercase')
    expect(sharedRule('.script-storage-actions p', '.script-directory-actions p')).toContain('color: var(--nt-muted)')
    expect(sharedRule('.script-storage-actions', '.script-directory-actions')).toContain('border-top: 1px solid var(--nt-line)')
    expect(sharedRule('.script-storage-actions button', '.script-directory-actions button')).toContain('background: transparent')
    expect(sharedRule('.script-project-actions button:disabled', '.script-file-menu button:disabled')).toContain('opacity: 0.45')
    sharedRule('.commandbar-icon-command:focus-visible', '.script-file-menu button:focus-visible', '.script-file-menu input:focus-visible')
  })
})
