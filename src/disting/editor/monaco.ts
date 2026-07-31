import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api'
import './monaco-features'
import { registerDistingIntelliSense } from './disting-intellisense'
import { registerDistingLuaLanguage } from './disting-lua'
import { registerDistingNavigation } from './disting-navigation'

window.MonacoEnvironment = {
  getWorker() {
    return new EditorWorker()
  },
}

monaco.editor.defineTheme('disting-nt', {
  base: 'vs-dark',
  inherit: true,
  rules: [
    { token: 'comment', foreground: '66736E', fontStyle: 'italic' },
    { token: 'keyword', foreground: '6DF0A8' },
    { token: 'number', foreground: 'FFC96B' },
    { token: 'string', foreground: 'B9D6C6' },
    { token: 'identifier', foreground: 'D8E5DE' },
    { token: 'support.function.disting', foreground: '72C7FF' },
    { token: 'constant.disting', foreground: 'FFC96B' },
    { token: 'key', foreground: 'A9E6C5' },
    { token: 'delimiter', foreground: '87958F' },
  ],
  colors: {
    'editor.background': '#0D1110',
    'editor.foreground': '#D8E5DE',
    'editorLineNumber.foreground': '#43504B',
    'editorLineNumber.activeForeground': '#93A39D',
    'editorCursor.foreground': '#6DF0A8',
    'editor.selectionBackground': '#214936',
    'editor.inactiveSelectionBackground': '#173326',
    'editor.lineHighlightBackground': '#111816',
    'editorIndentGuide.background1': '#1B2522',
    'editorIndentGuide.activeBackground1': '#34443E',
    'editorBracketHighlight.foreground1': '#6DF0A8',
    'editorBracketHighlight.foreground2': '#FFC96B',
    'editorBracketHighlight.foreground3': '#8BB8FF',
    'editorSuggestWidget.background': '#151B19',
    'editorSuggestWidget.border': '#34413D',
    'editorSuggestWidget.foreground': '#D8E5DE',
    'editorSuggestWidget.highlightForeground': '#6DF0A8',
    'editorSuggestWidget.selectedBackground': '#203229',
    'editorHoverWidget.background': '#151B19',
    'editorHoverWidget.border': '#34413D',
    'editorWidget.background': '#151B19',
    'editorWidget.border': '#34413D',
    'input.background': '#0D1110',
    'input.border': '#34413D',
    'focusBorder': '#6DF0A8',
    'scrollbarSlider.background': '#43504B55',
    'scrollbarSlider.hoverBackground': '#5C6B65AA',
    'scrollbarSlider.activeBackground': '#6DF0A899',
  },
})

const languageRegistration = registerDistingLuaLanguage(monaco)
const intelliSenseRegistration = registerDistingIntelliSense(monaco)
const navigationRegistration = registerDistingNavigation(monaco)

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    navigationRegistration.dispose()
    intelliSenseRegistration.dispose()
    languageRegistration.dispose()
  })
}

export { monaco }
