// `editor.api` exposes the standalone API but intentionally omits editor UI
// contributions. Keep this list explicit so Monaco stays lazy-loaded while the
// language providers registered below have visible editor affordances.
import 'monaco-editor/esm/vs/editor/contrib/codeAction/browser/codeActionContributions.js'
import 'monaco-editor/esm/vs/editor/contrib/documentSymbols/browser/documentSymbols.js'
import 'monaco-editor/esm/vs/editor/contrib/folding/browser/folding.js'
import 'monaco-editor/esm/vs/editor/contrib/gotoSymbol/browser/goToCommands.js'
import 'monaco-editor/esm/vs/editor/contrib/gotoSymbol/browser/link/goToDefinitionAtPosition.js'
import 'monaco-editor/esm/vs/editor/contrib/hover/browser/hoverContribution.js'
import 'monaco-editor/esm/vs/editor/contrib/parameterHints/browser/parameterHints.js'
import 'monaco-editor/esm/vs/editor/contrib/rename/browser/rename.js'
import 'monaco-editor/esm/vs/editor/contrib/snippet/browser/snippetController2.js'
import 'monaco-editor/esm/vs/editor/contrib/suggest/browser/suggestController.js'
import 'monaco-editor/esm/vs/editor/standalone/browser/quickAccess/standaloneGotoSymbolQuickAccess.js'
import 'monaco-editor/esm/vs/editor/standalone/browser/referenceSearch/standaloneReferenceSearch.js'
