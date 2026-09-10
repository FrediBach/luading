// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it } from 'vitest'

const css = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')
const globalCss = css('../../../index.css')
const foundation = css('./display-designer-foundation.css')
const components = css('./display-designer.css')
const svg = css('./display-designer-svg.css')

afterEach(() => {
  document.head.replaceChildren()
  document.body.replaceChildren()
})

describe('display designer CSS boundary', () => {
  for (const globalLast of [false, true]) for (const theme of ['light', 'dark']) {
    it(`owns element defaults with global styles ${globalLast ? 'last' : 'first'} in ${theme} theme`, () => {
      const style = document.createElement('style')
      // Include deliberately hostile element rules to catch future leakage as well
      // as the app's actual code badge and heading rules.
      const appStyles = `${globalCss}\ncode { display: inline-flex; padding: 30px; background: red; border-radius: 20px; font-size: 40px; } summary { font-size: 40px; } h3 { margin: 30px; }`
      // jsdom does not resolve custom properties. Supply theme token literals so
      // these assertions exercise the cascade, not its missing variable resolver.
      const tokens: Record<string, string> = { '--nt-text': theme === 'dark' ? '#eaf2ee' : '#17241d', '--nt-muted': '#718079', '--nt-line': '#637469', '--nt-green': '#62ffa6', '--font-label': '12px', '--font-micro': '11px', '--font-body': '14px', '--mono': 'monospace', '--surface-recessed': '#102018' }
      style.textContent = [globalLast ? '' : appStyles, foundation, components, svg, globalLast ? appStyles : ''].join('\n')
        .replace(/var\((--[a-z-]+)\)/g, (match, name: string) => tokens[name] ?? match)
      document.head.append(style)
      document.body.innerHTML = `
        <code id="outside">Outside</code>
        <div style="--nt-text: ${theme === 'dark' ? '#eaf2ee' : '#17241d'}; --nt-muted: #718079; --nt-line: #637469; --nt-green: #62ffa6; --font-label: 12px; --font-micro: 11px; --font-body: 14px; --mono: monospace; --surface-recessed: #102018;">
          <section class="display-designer-dialog">
            <h3>Properties</h3>
            <p class="display-designer-help"><code id="binding">long_binding_name_that_must_wrap</code></p>
            <details><summary>State mapping</summary></details>
            <label class="display-designer-field"><span>Choice</span><select><option>Long choice</option></select></label>
            <input type="checkbox" aria-label="Enabled" />
            <div class="display-designer-source"><pre><code class="lua-source-preview-code">  return true\n</code></pre></div>
          </section>
          <section class="display-designer-dialog svg-import-dialog"><h2>Import SVG</h2><code id="svg-code">SVG</code></section>
          <div class="display-designer-context-menu"><code id="menu-code">Menu</code><button disabled>Unavailable</button></div>
        </div>`
      const computed = (selector: string) => getComputedStyle(document.querySelector(selector)!)
      for (const selector of ['#binding', '#svg-code', '#menu-code']) {
        const code = computed(selector)
        expect(code.display, selector).toBe('inline')
        expect(code.padding).toBe('0px')
        expect(code.backgroundColor).toBe('rgba(0, 0, 0, 0)')
        expect(code.borderRadius).toBe('0px')
        expect(code.whiteSpace).toBe('normal')
        expect(code.overflowWrap).toBe('anywhere')
        expect(code.fontSize).not.toBe('40px')
      }
      expect(computed('#outside').display).toBe('inline-flex')
      expect(computed('#outside').padding).toBe('30px')
      expect(computed('summary').fontSize).toBe('11px')
      expect(computed('h3').margin).toBe('0px')
      expect(computed('h3').color).toBe(theme === 'dark' ? 'rgb(234, 242, 238)' : 'rgb(23, 36, 29)')
      expect(computed('select').minWidth).toBe('0px')
      expect(computed('select').maxWidth).toBe('100%')
      expect(computed('select').boxSizing).toBe('border-box')
      expect(computed('input[type=checkbox]').padding).toBe('0px')
      expect(computed('.display-designer-source code').display).toBe('block')
      expect(computed('.display-designer-source code').whiteSpace).toBe('pre')
      expect(computed('.svg-import-dialog').display).toBe('flex')
      expect(computed('.display-designer-context-menu button').opacity).toBe('0.4')
    })
  }
})
