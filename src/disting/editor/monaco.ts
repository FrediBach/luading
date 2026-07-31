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
    'editor.background': '#111614',
    'editor.foreground': '#D8E5DE',
    'editorLineNumber.foreground': '#43504B',
    'editorLineNumber.activeForeground': '#93A39D',
    'editorCursor.foreground': '#6DF0A8',
    'editor.selectionBackground': '#214936',
    'editor.inactiveSelectionBackground': '#173326',
    'editor.lineHighlightBackground': '#151D1A',
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
    'input.background': '#111614',
    'input.border': '#34413D',
    'focusBorder': '#6DF0A8',
    'scrollbarSlider.background': '#43504B55',
    'scrollbarSlider.hoverBackground': '#5C6B65AA',
    'scrollbarSlider.activeBackground': '#6DF0A899',
  },
})

monaco.editor.defineTheme('disting-nt-light', {
  base: 'vs',
  inherit: true,
  rules: [
    { token: 'comment', foreground: '68756F', fontStyle: 'italic' },
    { token: 'keyword', foreground: '087A48' },
    { token: 'number', foreground: '966000' },
    { token: 'string', foreground: '35664E' },
    { token: 'identifier', foreground: '26332E' },
    { token: 'support.function.disting', foreground: '006AA3' },
    { token: 'constant.disting', foreground: '966000' },
    { token: 'key', foreground: '197049' },
    { token: 'delimiter', foreground: '63716B' },
  ],
  colors: {
    'editor.background': '#EDF2EF',
    'editor.foreground': '#26332E',
    'editorLineNumber.foreground': '#9AA6A0',
    'editorLineNumber.activeForeground': '#56655E',
    'editorCursor.foreground': '#087A48',
    'editor.selectionBackground': '#B8E3CE',
    'editor.inactiveSelectionBackground': '#D7EDE2',
    'editor.lineHighlightBackground': '#E4ECE8',
    'editorIndentGuide.background1': '#DDE5E1',
    'editorIndentGuide.activeBackground1': '#AABAB2',
    'editorBracketHighlight.foreground1': '#087A48',
    'editorBracketHighlight.foreground2': '#966000',
    'editorBracketHighlight.foreground3': '#006AA3',
    'editorSuggestWidget.background': '#FFFFFF',
    'editorSuggestWidget.border': '#BBC7C1',
    'editorSuggestWidget.foreground': '#26332E',
    'editorSuggestWidget.highlightForeground': '#087A48',
    'editorSuggestWidget.selectedBackground': '#E3F1EA',
    'editorHoverWidget.background': '#FFFFFF',
    'editorHoverWidget.border': '#BBC7C1',
    'editorWidget.background': '#FFFFFF',
    'editorWidget.border': '#BBC7C1',
    'input.background': '#EDF2EF',
    'input.border': '#BBC7C1',
    'focusBorder': '#087A48',
    'scrollbarSlider.background': '#87968F55',
    'scrollbarSlider.hoverBackground': '#65756DAA',
    'scrollbarSlider.activeBackground': '#087A4899',
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
