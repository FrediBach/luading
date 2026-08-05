import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { LuaSourcePreview } from './LuaSourcePreview'
import { tokenizeLuaSource } from './lua-source-highlight'

describe('Lua source preview', () => {
  it('preserves source while classifying Lua syntax', () => {
    const source = '-- comment\nlocal value = 12.5\nreturn { name = "Test", input = kCV }'
    const tokens = tokenizeLuaSource(source)
    expect(tokens.map(({ text }) => text).join('')).toBe(source)
    expect(tokens).toEqual(expect.arrayContaining([
      { kind: 'comment', text: '-- comment' },
      { kind: 'keyword', text: 'local' },
      { kind: 'number', text: '12.5' },
      { kind: 'string', text: '"Test"' },
      { kind: 'constant', text: 'kCV' },
    ]))
  })

  it('renders highlighted spans inside a labelled read-only code block', () => {
    const markup = renderToStaticMarkup(<LuaSourcePreview source={'return { kLinear, "Output" }\n-- next line'} />)
    expect(markup).toContain('aria-label="Generated Lua source"')
    expect(markup).toContain('class="lua-source-preview-code"')
    expect(markup).toContain('\n')
    expect(markup).toContain('lua-token--keyword')
    expect(markup).toContain('lua-token--constant')
    expect(markup).toContain('lua-token--string')
  })
})
