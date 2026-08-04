import { normalizeEditorView, type EditorViewSnapshot } from '../workbench/projects'

export function clampEditorViewToSource(
  view: EditorViewSnapshot | undefined,
  source: string,
): EditorViewSnapshot | undefined {
  if (!view) return undefined
  const normalized = normalizeEditorView(view)
  const lines = source.split('\n')
  const line = Math.min(normalized.line, lines.length)
  const column = Math.min(normalized.column, (lines[line - 1]?.length ?? 0) + 1)
  return { ...normalized, line, column }
}

export function editorOffset(source: string, view: EditorViewSnapshot | undefined): number {
  const clamped = clampEditorViewToSource(view, source)
  if (!clamped) return 0
  const lines = source.split('\n')
  return lines.slice(0, clamped.line - 1).reduce((total, line) => total + line.length + 1, 0)
    + clamped.column - 1
}
