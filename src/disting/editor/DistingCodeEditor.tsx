import { memo, useEffect, useRef, useState } from 'react'
import { monacoTheme, type ThemeMode } from '../theme'
import type { ScriptDiagnostic, SourceRange } from '../validation/types'
import { registerDiagnosticCodeActions } from './diagnostic-code-actions'
import {
  diagnosticMarkerSignature,
  DIAGNOSTIC_MARKER_OWNERS,
  prepareDiagnosticMarkers,
} from './diagnostic-markers'
import { DISTING_LUA_LANGUAGE_ID, DISTING_LUA_MODEL_URI } from './disting-lua'

type DistingCodeEditorProps = {
  value: string
  diagnostics: ScriptDiagnostic[]
  theme: ThemeMode
  revealRequest?: { range: SourceRange; nonce: number }
  onChange(value: string): void
  onRun(): void
}

type IdleWindow = Window & typeof globalThis & {
  requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number
  cancelIdleCallback?: (handle: number) => void
}

export const DistingCodeEditor = memo(function DistingCodeEditor({
  value,
  diagnostics,
  theme,
  revealRequest,
  onChange,
  onRun,
}: DistingCodeEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const valueRef = useRef(value)
  const modelRef = useRef<import('monaco-editor/esm/vs/editor/editor.api').editor.ITextModel | undefined>(undefined)
  const editorRef = useRef<import('monaco-editor/esm/vs/editor/editor.api').editor.IStandaloneCodeEditor | undefined>(undefined)
  const monacoRef = useRef<typeof import('monaco-editor/esm/vs/editor/editor.api') | undefined>(undefined)
  const applyingExternalValueRef = useRef(false)
  const onChangeRef = useRef(onChange)
  const onRunRef = useRef(onRun)
  const diagnosticsRef = useRef(diagnostics)
  const revealRequestRef = useRef(revealRequest)
  const themeRef = useRef(theme)
  const [lineCount, setLineCount] = useState(() => value.split('\n').length)
  const [loadingState, setLoadingState] = useState<'waiting' | 'loading' | 'ready' | 'fallback'>('waiting')
  const [fallbackValue, setFallbackValue] = useState(value)
  const markerSignature = diagnosticMarkerSignature(diagnostics)

  onChangeRef.current = onChange
  onRunRef.current = onRun
  diagnosticsRef.current = diagnostics
  revealRequestRef.current = revealRequest
  themeRef.current = theme

  const applyMarkers = () => {
    const monaco = monacoRef.current
    const model = modelRef.current
    if (!monaco || !model) return
    const markers = prepareDiagnosticMarkers(diagnosticsRef.current, model.getValue())
    for (const owner of Object.values(DIAGNOSTIC_MARKER_OWNERS)) {
      monaco.editor.setModelMarkers(model, owner, markers
        .filter((marker) => marker.owner === owner)
        .map((marker) => {
          const item = marker.diagnostic
          const severity = item.severity === 'error'
            ? monaco.MarkerSeverity.Error
            : item.severity === 'warning'
              ? monaco.MarkerSeverity.Warning
              : monaco.MarkerSeverity.Info
          return {
            severity,
            source: marker.source,
            message: item.message,
            code: item.ruleId,
            startLineNumber: marker.range.startLine,
            startColumn: marker.range.startColumn,
            endLineNumber: marker.range.endLine,
            endColumn: marker.range.endColumn,
          }
        }))
    }
  }

  const revealLocation = () => {
    const editor = editorRef.current
    const request = revealRequestRef.current
    if (!editor || !request) return
    editor.setPosition({
      lineNumber: request.range.startLine,
      column: request.range.startColumn,
    })
    editor.revealLineInCenter(request.range.startLine)
    editor.focus()
  }

  useEffect(() => {
    if (value === valueRef.current) return

    valueRef.current = value
    setFallbackValue(value)
    setLineCount(value.split('\n').length)

    const model = modelRef.current
    if (model && model.getValue() !== value) {
      applyingExternalValueRef.current = true
      model.setValue(value)
      applyingExternalValueRef.current = false
    }
  }, [value])

  useEffect(() => {
    applyMarkers()
  }, [markerSignature])

  useEffect(() => {
    revealLocation()
  }, [revealRequest])

  useEffect(() => {
    if (monacoRef.current) {
      monacoRef.current.editor.setTheme(monacoTheme(theme))
    }
  }, [theme])

  useEffect(() => {
    let disposed = false
    let idleHandle: number | undefined
    let editor: import('monaco-editor/esm/vs/editor/editor.api').editor.IStandaloneCodeEditor | undefined
    let model: import('monaco-editor/esm/vs/editor/editor.api').editor.ITextModel | undefined
    let changeListener: import('monaco-editor/esm/vs/editor/editor.api').IDisposable | undefined
    let codeActionRegistration: import('monaco-editor/esm/vs/editor/editor.api').IDisposable | undefined

    const mountEditor = async () => {
      setLoadingState('loading')
      try {
        const { monaco } = await import('./monaco')
        if (disposed || !containerRef.current) return

        model = monaco.editor.createModel(
          valueRef.current,
          DISTING_LUA_LANGUAGE_ID,
          monaco.Uri.parse(DISTING_LUA_MODEL_URI),
        )
        modelRef.current = model
        monacoRef.current = monaco
        editor = monaco.editor.create(containerRef.current, {
          model,
          theme: monacoTheme(themeRef.current),
          ariaLabel: 'Disting Lua source',
          automaticLayout: true,
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
          fontSize: 12.5,
          lineHeight: 21,
          fontLigatures: true,
          padding: { top: 16, bottom: 16 },
          tabSize: 2,
          insertSpaces: true,
          detectIndentation: false,
          wordWrap: 'on',
          wrappingIndent: 'same',
          lineNumbersMinChars: 3,
          glyphMargin: true,
          lightbulb: { enabled: monaco.editor.ShowLightbulbIconMode.On },
          folding: true,
          foldingHighlight: false,
          showFoldingControls: 'mouseover',
          minimap: { enabled: false },
          overviewRulerLanes: 2,
          overviewRulerBorder: false,
          hideCursorInOverviewRuler: true,
          renderLineHighlight: 'line',
          renderWhitespace: 'selection',
          scrollBeyondLastLine: false,
          smoothScrolling: false,
          stickyScroll: { enabled: false },
          links: false,
          occurrencesHighlight: 'off',
          selectionHighlight: false,
          codeLens: false,
          wordBasedSuggestions: 'off',
          wordBasedSuggestionsOnlySameLanguage: true,
          quickSuggestions: { other: true, comments: false, strings: false },
          suggestOnTriggerCharacters: true,
          hover: { enabled: true, delay: 250, sticky: true },
          parameterHints: { enabled: true, cycle: true },
          bracketPairColorization: { enabled: true, independentColorPoolPerBracketType: true },
          guides: { bracketPairs: true, indentation: true },
          suggest: {
            showWords: false,
            showSnippets: true,
            snippetsPreventQuickSuggestions: false,
            localityBonus: true,
          },
          scrollbar: {
            verticalScrollbarSize: 10,
            horizontalScrollbarSize: 10,
            alwaysConsumeMouseWheel: false,
          },
        })
        editorRef.current = editor
        codeActionRegistration = registerDiagnosticCodeActions(
          monaco,
          model,
          () => diagnosticsRef.current,
        )

        changeListener = model.onDidChangeContent(() => {
          if (!model) return
          diagnosticsRef.current = diagnosticsRef.current.filter((diagnostic) => (
            diagnostic.origin !== 'contract' && diagnostic.origin !== 'runtime'
          ))
          monaco.editor.setModelMarkers(model, DIAGNOSTIC_MARKER_OWNERS.contract, [])
          monaco.editor.setModelMarkers(model, DIAGNOSTIC_MARKER_OWNERS.runtime, [])
          if (applyingExternalValueRef.current) return
          const nextValue = model.getValue()
          valueRef.current = nextValue
          onChangeRef.current(nextValue)
          setLineCount((current) => {
            const nextCount = model?.getLineCount() ?? current
            return current === nextCount ? current : nextCount
          })
        })

        editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => onRunRef.current())
        applyMarkers()
        revealLocation()
        setLoadingState('ready')
      } catch (error) {
        if (disposed) return
        console.error('Monaco failed to load; keeping the lightweight editor.', error)
        setFallbackValue(valueRef.current)
        setLoadingState('fallback')
      }
    }

    const idleWindow = window as IdleWindow
    if (idleWindow.requestIdleCallback) {
      idleHandle = idleWindow.requestIdleCallback(() => void mountEditor(), { timeout: 1200 })
    } else {
      idleHandle = window.setTimeout(() => void mountEditor(), 200)
    }

    return () => {
      disposed = true
      if (idleHandle !== undefined) {
        if (idleWindow.cancelIdleCallback) idleWindow.cancelIdleCallback(idleHandle)
        else window.clearTimeout(idleHandle)
      }
      changeListener?.dispose()
      codeActionRegistration?.dispose()
      if (model) {
        for (const owner of Object.values(DIAGNOSTIC_MARKER_OWNERS)) {
          monacoRef.current?.editor.setModelMarkers(model, owner, [])
        }
      }
      editor?.dispose()
      model?.dispose()
      modelRef.current = undefined
      editorRef.current = undefined
      monacoRef.current = undefined
    }
  }, [])

  const useFallback = loadingState !== 'ready'

  return (
    <>
      <div className="disting-editor-shell">
        <div
          ref={containerRef}
          className={`disting-monaco${loadingState === 'ready' ? ' is-ready' : ''}`}
          aria-hidden={useFallback}
        />
        {useFallback && (
          <textarea
            className="disting-editor disting-editor--fallback"
            value={fallbackValue}
            onChange={(event) => {
              const nextValue = event.target.value
              valueRef.current = nextValue
              setFallbackValue(nextValue)
              setLineCount(nextValue.split('\n').length)
              onChangeRef.current(nextValue)
            }}
            spellCheck={false}
            aria-label="Disting Lua source"
          />
        )}
        {(loadingState === 'waiting' || loadingState === 'loading') && (
          <span className="disting-editor-loading" aria-live="polite">
            Loading IntelliSense…
          </span>
        )}
      </div>
      <div className="disting-editor-footer">
        <span>{lineCount} lines · Lua 5.4</span>
        <span>
          {loadingState === 'ready'
            ? 'Disting NT IntelliSense · ⌘/Ctrl+Enter to run'
            : loadingState === 'fallback'
              ? 'Lightweight editor fallback'
              : 'Editor loads when the browser is idle'}
        </span>
      </div>
    </>
  )
})
