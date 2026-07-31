The Monaco editor should evolve into a small Disting-specific language service, rather than simply adding more editor flags. The highest-value work is live Lua syntax checking, a canonical contract catalog, context-aware completions, and actionable diagnostics.

Contract basis: :codex-file-citation{path="/Users/fredibach/Projects/luading/docs/Disting NT Lua Scripting.md" purpose="source"}

## Current implementation

The implementation has a sound architectural base:

| Area | Current behavior | Limitation |
|---|---|---|
| Editor lifecycle | Monaco is lazy-loaded, owns its model, and is disposed correctly in [DistingCodeEditor.tsx](/Users/fredibach/Projects/luading/src/disting/editor/DistingCodeEditor.tsx:103). | Language registration is global and its returned disposable is ignored. |
| Lua mode | Monaco’s generic basic Lua contribution provides tokenization, comments, brackets, and quote pairing in [monaco.ts](/Users/fredibach/Projects/luading/src/disting/editor/monaco.ts:1). | It is not a Lua language service: no syntax validation, scoped symbols, navigation, or Lua-aware indentation rules. |
| Disting IntelliSense | Custom completions, hovers, signatures, and snippets are registered in [disting-intellisense.ts](/Users/fredibach/Projects/luading/src/disting/editor/disting-intellisense.ts:351). | They use hand-maintained lists and regular expressions with little source context. |
| Static validation | A debounced worker checks API arity, draw context, hot-path allocations, read-only parameters, and headers. | It is token-based, recognises only five callbacks, and does not parse Lua syntax. |
| Contract/runtime validation | Running a script validates evaluated metadata and callback results. | Most findings have no source range, so [the marker adapter drops them](/Users/fredibach/Projects/luading/src/disting/editor/DistingCodeEditor.tsx:49). |
| Diagnostics UI | Ranged findings become Monaco markers; all findings appear in Problems. | There are no quick fixes, diagnostic gutter icons, or separate marker owners by origin. |

## Important correctness gaps

These should be addressed before adding broader convenience features:

- There is no syntax feedback until the user runs the script. A missing `end`, malformed string, or invalid expression receives no Monaco error.
- The API manifest describes colour as optional for `drawBox`, `drawCircle`, `drawLine`, `drawRectangle`, `drawSmoothCircle`, and `drawSmoothLine`, although the 1.12 manual requires it. IntelliSense therefore recommends code that the documented hardware contract does not guarantee.
- `sendMIDI(destinations, ...bytes)` and similar variadic signatures cannot express documented minimum and maximum arity.
- The editor’s constant list is separate from the runtime and manifest. It omits `kMilliseconds` and the compatibility aliases used by bundled official scripts, such as `kInt`, `kInteger`, `kEnum`, and `kBool`.
- Those aliases are not all documented by the 1.12 manual. They need provenance such as “manual”, “hardware verified”, or “observed in official scripts”, rather than being presented as equally documented.
- The complete-script snippet starts with `local out = {}` instead of the two header comments the static validator recommends, so a newly inserted scaffold diagnoses itself.
- Lifecycle metadata is duplicated. IntelliSense knows a subset of callbacks, static validation recognises only `init`, `step`, `trigger`, `gate`, and `draw`, while contract validation has a different nine-callback list. The existing audit already identifies this in [F-26](/Users/fredibach/Projects/luading/docs/DISTING_NT_LUA_IMPLEMENTATION_AUDIT.md:647).
- Completion suggestions are global rather than contextual. For example, input, output, unit, scale, MIDI message, and display-mode constants are not filtered to the field being edited.
- Signature help scans eight lines using a regular expression. Nested calls, strings containing commas, table constructors, and multiline calls can select the wrong function or argument.
- `showWords: false` means local variables and functions receive no useful completion because Monaco’s basic Lua mode has no symbol service.
- Contract findings identify concepts such as “Parameter 2” or “missing gate callback” but not the corresponding source expression. Runtime callback-output findings similarly lack a range.

## Detailed implementation plan

### Phase 1: Establish a canonical language contract

Extend [api-manifest.ts](/Users/fredibach/Projects/luading/src/disting/validation/api-manifest.ts:36) from a display-oriented API list into structured contract metadata.

Changes:

- Represent function parameters structurally: name, optionality, accepted value type, choices, defaults, and bounded variadic arity.
- Support overloads for APIs that accept either a table or separate bytes.
- Record return types and multiplicity, such as the multiple results from `findAlgorithm`.
- Separate hardware documentation from simulator support. Hovers should show both, but not conflate them.
- Add structured constant entries with category:
  - input type;
  - output mode;
  - parameter unit;
  - parameter scale;
  - compatibility alias.
- Add provenance to every constant and function: manual 1.12, hardware verified, official-corpus observation, or simulator extension.
- Create one lifecycle manifest containing all algorithm callbacks, including custom UI controls, `setupUi`, `midiMessage`, and `serialise`. Each entry should define its signature, valid script kind, return semantics, cadence, and snippet.
- Derive editor entries, validation callback sets, and conformance assertions from these catalogs.
- Correct the six documented drawing signatures and model the one-to-three MIDI-byte limit.
- Add consistency tests ensuring every runtime-exposed Disting global and constant has editor metadata, and vice versa.

Acceptance criteria:

- No Disting constant, API signature, or callback name is manually duplicated in the editor.
- Manual-backed and compatibility-only entries are visibly distinguishable.
- The conformance suite pins structured parameter and arity metadata, not merely API names.

### Phase 2: Register a dedicated `disting-lua` language

Replace the generic `lua` model ID with a dedicated language based on Lua 5.4.

Changes:

- Register `disting-lua` and create the model with a stable URI such as `inmemory://disting/main.lua`.
- Add a local language configuration with:
  - Lua comments and long comments;
  - bracket and quote pairs;
  - a Lua-appropriate word pattern;
  - indentation rules for `function`, `then`, `do`, `repeat`, `else`, `elseif`, `end`, and `until`;
  - appropriate on-enter behavior.
- Pin a local tokenizer that covers Lua 5.4 operators, long-bracket strings, long comments, numeric forms, and table fields using `=`.
- Keep Disting API styling separate from normal identifiers where useful.
- Make language-provider registration idempotent and HMR-safe; dispose registrations during hot replacement.
- As an interim local-symbol aid, enable word suggestions for the current document. Remove or de-prioritize them once proper scoped symbol completion exists.
- Enable diagnostic glyphs and code-action lightbulbs only when their providers are ready.

Acceptance criteria:

- Editing indentation behaves correctly across representative nested Lua blocks.
- Long strings/comments and Lua 5.4 operators tokenize correctly.
- Disting providers never affect unrelated Lua models.

### Phase 3: Add compile-only Lua syntax validation

Use the production Lua implementation for syntax truth instead of treating a third-party parser as authoritative.

Changes:

- Add a reusable compile-only helper beside the production runtime bridge.
- Keep one Wasmoon engine alive in the validation worker.
- Validate by calling Lua’s `load(source, "@script.lua", "t")`.
- Never execute the returned user chunk.
- Return syntax diagnostics with source version, line, and best available column.
- Continue running the lightweight static checks alongside compilation.
- Preserve stale-response rejection and clear outdated syntax markers immediately.
- Describe results as “compatible with the simulator’s Lua 5.4 runtime”; do not claim exact hardware Lua 5.4.6 parity until that version is independently pinned.

Performance gates:

- Compilation and static validation stay off the main thread.
- On the largest bundled script, validation should normally appear within 300 ms after the debounce.
- No user code, module load, or infinite loop can execute during validation.

### Phase 4: Build a compact source index

A syntax compiler reports errors but does not provide the structure needed for contextual editor features.

Changes:

- Evaluate a browser-compatible Lua concrete-syntax parser against every bundled script and Lua 5.4 fixture.
- Use it only for navigation and source mapping; Wasmoon remains the syntax authority.
- If no parser meets corpus and bundle-size requirements, extend the existing tokenizer into a balanced structural scanner.
- Produce a compact, versioned index containing:
  - callback definitions and ranges;
  - top-level returned-table fields;
  - `init()` metadata fields;
  - parameter definition ranges;
  - API call spans and argument boundaries;
  - local declarations and function names.
- Attach semantic location hints to contract diagnostics, such as `init.outputs`, `parameters[2].default`, or `callback:gate`, and resolve those hints through the source index.
- Map runtime callback findings at least to their callback definition when a more exact expression is unavailable.

Acceptance criteria:

- Syntax, static, contract, and runtime findings can all reveal a meaningful source location when the relevant construct exists.
- The source index is ignored whenever its model version is stale.
- Structural parsing failures degrade to current behavior instead of blocking editing.

### Phase 5: Replace broad suggestions with contextual IntelliSense

Refactor `disting-intellisense.ts` into pure context analysis plus thin Monaco adapters.

Contexts to support:

- Top-level program fields: `name`, `author`, and valid lifecycle callbacks, excluding fields already present.
- `init()` metadata: `inputs`, `inputNames`, `outputs`, `outputNames`, `parameters`, and `midi`.
- `inputs`: only `kCV`, `kGate`, and `kTrigger`.
- `outputs`: only `kStepped` and `kLinear`.
- Numeric parameter unit and scale positions.
- Separate snippets for numeric, scaled, and enum parameters.
- `midi.messages`: the six documented string values.
- `setDisplayMode`: the documented display-mode strings.
- `drawText` alignment arguments.
- `self`: documented runtime fields, plus parameter-specific hover information when statically resolvable.
- Lifecycle callback snippets for every supported callback and custom UI control.
- Local variables and functions from the source index.

Other improvements:

- Replace comma-splitting signature help with balanced argument scanning.
- Support overloads and highlight the correct active argument through nested calls.
- Rank context-valid, manual-documented entries before general Lua and compatibility-only entries.
- Suppress inappropriate completions in comments and ordinary strings.
- Use syntactically valid snippet defaults. Accepting a suggestion without editing placeholders must not insert identifiers such as `colour`, `alignment`, or `...bytes`.
- Add the required two header comments to the full-script scaffold.
- Complete Lua standard-library metadata only after confirming which libraries are available on the Disting; do not assume a desktop Lua installation.

### Phase 6: Make diagnostics actionable

Add a domain-level quick-fix representation rather than putting Monaco types into validation code.

Initial safe quick fixes:

- Insert missing script-name and description comments.
- Insert a missing `trigger()` or `gate()` callback.
- Add missing `name` or `author` fields.
- Replace an invalid constant with one from the field’s allowed category.
- Add a required drawing colour, offering `15` as an explicit full-bright choice.
- Insert valid MIDI metadata or `midiMessage()` scaffolding.
- Convert simple direct `self.parameters[index]` assignments into `setParameter(...)`.

Marker improvements:

- Use separate owners for syntax, static, contract, and runtime diagnostics.
- Include the contract profile and origin as marker source data.
- Clamp all ranges to the current model before applying them.
- Keep the concise message inline and the detailed explanation in Problems.
- Enable the glyph margin, overview-ruler indicators, and lightbulb only after verifying the compact layout.
- Clear load-derived contract and runtime markers as soon as the model changes.

Avoid automatic edits for unsafe transformations such as moving arbitrary drawing code into `draw()`.

### Phase 7: Navigation, formatting, and polish

After correctness features are stable:

- Add document symbols for lifecycle callbacks, local functions, and metadata sections.
- Add “go to definition” and rename for confidently resolved local symbols.
- Add folding ranges for callback bodies and large metadata tables.
- Consider parameter/input/output inlay hints only as an opt-in feature; they could become noisy in compact scripts.
- Add formatting only after selecting a Lua 5.4-compatible formatter and proving idempotence across the entire bundled corpus.
- Document editor behavior in `docs/ARCHITECTURE.md`, `docs/TESTING.md`, and the workbench guide.

A full browser-hosted Lua language server is not the recommended first step. It would add substantial bundle, worker, and configuration complexity while still requiring Disting-specific stubs and contract validation. The bounded language-service approach above reuses the existing worker and contract catalogs while keeping the actual Lua compiler authoritative.

## Test plan

Each phase should add focused tests before integration:

- Manifest tests for API overloads, arity, constants, provenance, callbacks, and runtime/editor consistency.
- Snippet tests that expand default placeholder values and compile every resulting snippet through Wasmoon.
- Provider tests for completion context, replacement ranges, hover text, nested signature help, and suppression in comments.
- Validation-worker tests for valid Lua, syntax errors, long strings/comments, Lua 5.4 constructs, non-execution, and stale versions.
- Source-index tests for callback and metadata ranges.
- Marker and code-action tests for range clamping and exact edits.
- Corpus tests requiring every bundled script to compile under the editor validation path.
- Browser checks for marker visibility, keyboard completion, signature help, quick fixes, `Cmd/Ctrl+Enter`, responsive layouts, and the textarea fallback.
- Performance measurements on the largest bundled scripts, explicitly treated as browser-local editor measurements.

Final verification must run:

```bash
npm test
npm run test:conformance
npm run check
```

No files were changed during this analysis. The current focused editor, static-validation, and conformance baseline passes: 4 test files and 18 tests.