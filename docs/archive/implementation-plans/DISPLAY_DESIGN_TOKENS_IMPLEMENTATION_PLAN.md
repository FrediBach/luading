# Display designer design tokens implementation plan

> **Historical snapshot.** Archived on 2026-08-08 after implementation. This
> plan preserves the product decisions, increment evidence, and unavailable
> live-browser/hardware matrix; current behavior belongs in the architecture,
> workbench guide, and testing strategy.

## Status

Completed on 2026-08-08. The automated implementation is complete; unavailable
live-browser, native handoff, assistive-technology, and hardware observations
remain listed as evidence gaps rather than implied passing checks.

This is a follow-on to
`docs/plans/DISPLAY_UI_DESIGNER_IMPLEMENTATION_PLAN.md`. The current documented
literal/runtime-binding behavior remains authoritative until the increments
below land; this plan then extends that scalar model with a closed arithmetic
expression language, not arbitrary Lua.

| Increment | Status | Verification/evidence |
| --- | --- | --- |
| 1. Version-3 model, token expressions, validation, and migration | Complete | `npx vitest run` on the seven listed increment-1 files: 7 files, 54 tests passed. |
| 2. Resolution, compiler preview, and deterministic Lua generation | Complete | `npx vitest run` on the seven listed increment-2 files: 7 files, 47 tests passed, including production Wasmoon/display parity. |
| 3. Token management and property formula workflow | Complete | `npx vitest run` on the five listed increment-3 files: 5 files, 38 tests passed. |
| 4. Formula-preserving manipulation, responsive UI, and accessibility | Complete; live matrix unavailable | `npx vitest run src/disting/workbench/display-designer`: 15 files, 129 tests passed. In-app browser discovery returned no available browser backends, so Chromium wide, Firefox medium, Safari wide, narrow, touch/coarse pointer, keyboard-only, reduced-motion, browser-zoom, large-text, native clipboard/file-picker, and screen-reader observations remain unverified. |
| 5. Documentation, full regression, and manual acceptance | Complete; external acceptance unavailable | `npm test`: 136 files, 809 tests passed. `npm run check`: lint passed; coverage passed at 96.82% statements, 91.18% branches, 100% functions, and 98.43% lines; TypeScript and production build passed. No browser backend, native clipboard/file picker/download shelf, screen reader, deployment, Disting NT hardware, firmware capture path, coarse pointer, or touch device was available. |

The required manual matrix could not be executed in this environment. Browser
runtime discovery returned an empty backend list after the local Vite server
was started successfully. Chromium desktop/wide, Firefox desktop/medium,
Safari desktop/wide, narrow responsive layout, coarse pointer/touch,
keyboard-only, reduced motion, browser zoom, large text, native clipboard and
file round-trip, screen-reader output, and Disting NT hardware comparison are
therefore still unverified.

Update this table after every completed increment. Record the exact commands,
test counts, browser matrix, and unavailable environments rather than replacing
them with a general statement that validation passed.

## Goal

Add document-wide numeric design tokens to the Display designer. A token is a
named value such as `bar_width`, `bar_gap`, or `bars_y`. Numeric properties can
refer to one token or use several tokens in a small safe formula, so changing a
token updates every linked preview and leaves generated Lua easy to tune.

The representative workflow is:

1. Create `bar_width = 12`, `bar_gap = 3`, and `bars_y = 18`.
2. Drive box endpoints with formulas such as `bars_y + 6` and
   `start_x + 2 * (bar_width + bar_gap)`.
3. Change `bar_width` once and immediately see every bar update.
4. Copy readable Lua whose token declarations are grouped at the top of the
   generated draw definition.
5. Download and reopen the design without losing token identity or formulas.

This remains a browser-only authoring feature. It adds no Disting NT global,
callback, retained display object, parameter type, or worker message.

## Terminology and product contract

The UI and documentation must keep these concepts distinct:

| Concept | Purpose | Value lifetime | Generated source |
| --- | --- | --- | --- |
| Design token | Reusable layout/style number used to fine-tune authored geometry | Persisted in the design file; edits are undoable and make the draft changed | A named local with its authored value |
| Runtime binding | Placeholder for a value the script author later connects to `self` or a parameter | Persisted with a browser preview value; preview manipulation is not hardware state | Existing placeholder/TODO assignment inside the draw callback |
| Literal | One property-specific number | Persisted directly on the property | An inline number |

“Dynamic” in the token workflow means linked authoring values. Tokens do not
change over time in the designer and do not imply a new firmware data source.
Runtime modulation continues to use number/boolean/text/choice bindings. After
copying, an author may edit the ordinary generated Lua freely, but that edited
source is not round-tripped into the design document.

## Recommended scope

### Included in the first release

- document-wide numeric tokens with stable identity, display name, safe Lua
  name, numeric value, order, and usage count;
- safe formulas in every numeric primitive or symbol-instance property;
- token formulas in a number binding's **From** and **To** endpoints, allowing
  a runtime value to map through shared layout limits;
- arithmetic with numeric literals, token references, unary minus,
  parentheses, `+`, `-`, `*`, and `/`;
- deterministic preview resolution and Lua expression generation;
- formula-preserving move, nudge, alignment, distribution, and resize;
- a box width/height convenience that accounts for inclusive Disting box
  coordinates while retaining the endpoint-based document model;
- token creation, attachment, editing, reordering, usage discovery, safe
  deletion, undo/redo, file migration, findings, metrics, and generated-source
  navigation; and
- responsive, keyboard, and assistive-technology coverage matching the current
  Display designer.

### Deliberately excluded

- arbitrary Lua, function calls, table access, `self`, parameter reads, strings,
  booleans, colours, or choice values inside token formulas;
- token values defined by other tokens. Token values are literals in this
  release, so there is no dependency graph or cycle state;
- references to another element, a sibling property such as `x1`, or a symbol
  instance index at runtime;
- loops, repeaters, auto-layout, constraints, responsive layouts, animation,
  or a general spreadsheet/formula language;
- importing token declarations from arbitrary Lua or updating copied source
  when a design later changes; and
- any claim that generated arithmetic or browser preview timing measures
  Disting NT performance.

Derived tokens and repeaters can be considered later, after the identity,
expression, migration, and direct-manipulation semantics below have proven
stable.

## Current implementation seam

The current designer already provides most of the boundaries this feature
needs:

- `display-design-model.ts` owns the version-2 document, literal scalars, and
  normalized runtime-binding scalars.
- `display-design-validation.ts` strictly validates known keys, resource
  budgets, scalar property domains, references, and the shared Lua-name space.
- `display-design-resolution.ts` resolves browser preview values and formats
  deterministic Lua expressions.
- `display-design-compiler.ts` compiles the normalized document to ordinary
  draw commands for the existing main-thread display renderer.
- `display-design-generator.ts` emits bindings, reusable symbol helpers, and
  draw calls. Symbol helpers already use a closure so they are allocated
  outside the 30 fps callback.
- `display-design-bindings.ts` discovers binding uses and converts deleted
  bindings to their preview values.
- `display-design-geometry.ts`, `display-design-snapping.ts`, and
  `display-design-symbols.ts` contain the pure geometry transformations that
  currently discriminate literal and number-binding scalars.
- `DisplayDesignerDialog.tsx` owns document history, preview binding state,
  selection, the Properties and State panels, file handoff, and source review.

Tokens remain in this independent main-thread authoring flow. Neither the token
model nor expression AST crosses the simulation-worker protocol.

## Version-3 document model

### Token definitions

Add a top-level `tokens` array and a distinct resource budget:

```ts
interface DisplayDesignToken {
  id: string
  name: string
  luaName: string
  value: number
}

interface DisplayDesignDocumentV3 {
  kind: 'luading-display-design'
  version: 3
  name: string
  displayMode: DisplayMode
  elements: DisplayDesignElement[]
  groups: DisplayDesignGroup[]
  tokens: DisplayDesignToken[]
  bindings: DisplayDesignBinding[]
  symbols: DisplayDesignSymbol[]
  layoutGrid: DisplayDesignLayoutGrid | null
}
```

Use the following model rules:

- Token IDs are opaque and globally collision-safe with other document IDs.
- Names are user-facing and need not be unique.
- `luaName` is the formula identifier and generated local. It shares one
  collision domain with binding locals, symbol helper names, Lua keywords,
  callback parameters, draw globals, and generator-owned identifiers.
- Tokens are ordered. Source declarations, the Tokens panel, and canonical
  JSON use document order.
- `value` is a finite number in the existing scalar envelope of
  `-4096...4096`. Negative zero is normalized to zero; the resolved property
  still applies its narrower domain and rounding/clamping rules.
- Add `'token'` to `DisplayDesignIdScope` and include tokens in the
  collision-safe ID factory.
- Add `maximumTokens: 64`, `maximumExpressionNodes: 64`,
  `maximumExpressionDepth: 16`, and `maximumFormulaCodePoints: 256` to the
  centralized limits. Imported AST limits are authoritative; the source-text
  limit protects only formula editing.

### Safe token expressions

Persist a typed AST, never the text entered into a formula field:

```ts
type DisplayTokenExpression =
  | { kind: 'number'; value: number }
  | { kind: 'token'; tokenId: string }
  | { kind: 'negate'; operand: DisplayTokenExpression }
  | {
      kind: 'binary'
      operator: 'add' | 'subtract' | 'multiply' | 'divide'
      left: DisplayTokenExpression
      right: DisplayTokenExpression
    }

type DisplayStaticScalar =
  | { kind: 'literal'; value: number }
  | { kind: 'token-expression'; expression: DisplayTokenExpression }

type DisplayScalar =
  | DisplayStaticScalar
  | {
      kind: 'number-binding'
      bindingId: string
      from: DisplayStaticScalar
      to: DisplayStaticScalar
      quantize: 'none' | 'integer'
    }
```

Making `from` and `to` static scalars is intentional. It supports a dynamic
bar whose lower endpoint maps from `bars_y` and whose upper endpoint maps to
`bars_y + maximum_height`, without permitting token formulas to execute or
read runtime state themselves.

Keep plain literals in their compact existing shape. A formula containing no
token references normalizes to a literal. This avoids storing an expression
tree where the current schema already has an exact representation.

### Formula syntax

Add a pure parser, normalizer, evaluator, and printer in a focused module such
as `display-design-token-expressions.ts`.

The editable grammar is:

```text
expression     = additive
additive       = multiplicative (("+" | "-") multiplicative)*
multiplicative = unary (("*" | "/") unary)*
unary          = "-" unary | primary
primary        = finite-number | token-lua-name | "(" expression ")"
```

Rules:

- Identifiers resolve only against token `luaName` values. Display names and
  binding names are not accepted as implicit aliases.
- The AST stores `tokenId`, so token rename is reference-safe. The field is
  reprinted with the token's new `luaName` after rename.
- Whitespace is insignificant and decimal/exponent numbers are locale
  independent.
- Unknown identifiers, trailing input, unsupported operators, function calls,
  non-finite literals, depth/node overflow, and division by zero are rejected.
- Evaluation uses ordinary Lua-compatible arithmetic. Every division result
  and final result must be finite.
- The printer emits stable minimal parentheses according to precedence and
  associativity. It uses the existing finite-number formatter so preview,
  generated Lua, and canonical tests do not diverge.
- Normalization may fold literal-only subtrees and remove double negation, but
  must not reorder token terms or make readability worse merely to shorten the
  source.

The parser is a UI adapter, not the authority for imported files. Strict AST
validation and reference validation remain in `display-design-validation.ts`.

## Resolution and property semantics

Create one resolver path shared by geometry, compiler, findings, inspector
preview, deletion conversion, and generator tests:

```ts
resolveDisplayTokenExpression(expression, tokens): number
resolveDisplayStaticScalar(scalar, tokens): number
resolveDisplayScalar(scalar, bindings, tokens): number
```

For a number binding:

1. resolve its `from` and `to` static scalars with current token values;
2. interpolate with the normalized binding preview value;
3. apply the scalar's declared quantization; and
4. apply the property's final domain rule.

Final property rules remain unchanged:

- pixel lines, boxes, text anchors, and text baselines round at the final draw
  boundary;
- smooth coordinates retain finite fractional values;
- shades round and clamp to 0-15;
- radii must resolve to a non-negative value in the supported range;
- normal coordinate limits remain the current `-4096...4096`; and
- clipping and parameter-line overlap remain warnings derived from resolved
  preview geometry, not token-definition errors by themselves.

A token value edit is one semantic document transaction. Before commit, the UI
must validate every affected property and binding endpoint. A value that would
cause division by zero, a non-finite expression, or a blocking property-domain
error stays as an invalid field draft and does not enter history. Defensive
validation still rejects the equivalent malformed imported document.

## Usage, rename, reorder, and deletion

Add a pure `display-design-tokens.ts` module analogous to the binding module.
It should own:

- creation with a safe allocated Lua identifier;
- immutable update and reorder operations;
- usage discovery across scene primitives, symbol variant primitives, symbol
  instance origins, and binding `from`/`to` expressions;
- formula construction/normalization helpers used by the inspector;
- substitution of one token reference with a literal value; and
- safe deletion.

Usage entries identify the owner and property and, for a binding endpoint,
whether the reference belongs to **From** or **To**. Repeated references to one
token within one property count as one attached property in the summary while
remaining visible in the printed formula.

Rename changes `name` and reallocates `luaName` against all other token,
binding, and symbol identifiers. Expressions retain their token IDs and need
no destructive rewrite.

An unused token deletes directly. Deleting a used token requires explicit
confirmation to **Replace references with current value and delete**. This
substitutes only the deleted token's leaves with its current numeric value,
then folds the affected AST. Other token references remain linked. If an
expression becomes a number, normalize the containing static scalar to a
literal. Never collapse a multi-token formula wholesale merely because one
token was deleted.

Reordering tokens changes only document/source order. It is undoable and makes
the downloaded revision changed; it does not change preview results.

## Generated Lua

### Source shape

When at least one used token exists, emit an immediately evaluated closure even
for designs without symbols. This gives token locals one stable scope that is
visible to scene draw calls and reusable symbol helpers:

```lua
draw = (function()
  -- Design tokens: change these values to fine-tune the layout.
  local bar_width = 12
  local bar_gap = 3
  local start_x = 8
  local bars_y = 18

  return function(self)
    -- Generated by Luading Display designer; edit freely after copying.
    drawRectangle(start_x, bars_y, start_x + bar_width - 1, bars_y + 6, 15)
    drawRectangle(
      start_x + bar_width + bar_gap,
      bars_y,
      start_x + 2 * bar_width + bar_gap - 1,
      bars_y + 6,
      15
    )
  end
end)(),
```

The implementation may keep each draw call on one line to preserve the current
golden style; the example is wrapped only for explanation.

“Top of the draw definition” means the outer closure that initializes the
`draw` callback. This is intentional: token locals must be visible to symbol
helpers, while those helpers must continue to be allocated once rather than on
every 30 fps callback. Runtime bindings stay inside `function(self)` because
they may later be connected to per-frame state.

Generation rules:

- Emit only tokens reachable from generated scene elements, used symbol
  definitions, or used binding endpoints. Retain unused tokens in the design
  file and report an `unused-token` warning.
- Emit used tokens once in document order under the exact design-token header.
- Token declarations precede symbol helpers because helpers may use them.
- Existing runtime-binding placeholder assignments remain inside the returned
  `function(self)` and follow the generated comment. They do not move to token
  scope.
- If no token and no symbol is used, retain the current simple
  `draw = function(self)` output byte-for-byte.
- If symbols already require a closure, add token declarations to that existing
  closure rather than nesting another one.
- Expressions use safe token identifiers, stable numeric formatting, and only
  the grammar's arithmetic operators. Integer rounding and shade clamping stay
  at the final call boundary.
- Identical normalized version-3 documents produce byte-identical source.
- The Lua panel and clipboard continue to show/copy the exact same source.

Add token declaration locations to generated source metadata so the Tokens
panel can offer **Show in Lua** without relying on ambiguous text search. Keep
the existing symbol-helper and instance navigation behavior intact.

### Preview/compiler agreement

`compileDisplayDesign()` evaluates tokens before producing `DrawCommand`
objects. It still renders through the existing main-thread display renderer;
no token state enters the renderer or worker.

Real Wasmoon tests must load generated callbacks and compare emitted draw
commands with the pure compiler for:

- direct token references;
- precedence and parentheses;
- integer and smooth coordinates;
- shade clamping and radius validation;
- tokenized number-binding endpoints at preview values 0, 0.5, and 1;
- token use in a symbol helper shared by multiple instances;
- a token rename that changes source identifiers but not resolved commands;
- repeated callback calls; and
- both parameter-line and full-screen return behavior.

These are Lua-boundary tests because the expression crosses from TypeScript
generation into real Lua arithmetic.

## Designer workflow

### Tokens panel

Add **Tokens** as its own panel rather than mixing constants into **State**.
The responsive tab order becomes Layers, Symbols, Properties, Tokens, State,
Findings, Metrics, Lua. Wide mode places Tokens with the right-side authoring
panels while preserving the artboard size.

The panel provides:

- an **Add number token** action, disabled at the resource limit;
- cards in document/source order showing name, `luaName`, exact value, and use
  count;
- committed fields for display name and exact numeric value;
- move earlier/later actions;
- a usage disclosure with owner and property/endpoint labels;
- **Show in Lua** for used tokens;
- direct deletion for unused tokens and the explicit substitution confirmation
  for used tokens; and
- clear copy explaining that token edits are authored design changes, not
  browser preview controls or Disting state.

Token value keystrokes stay local until Enter/blur commits a valid value.
Escape restores the committed value. A valid edit creates one undo entry and
updates dirty/download state. Renaming or reordering also creates one entry.

### Numeric property editor

Refactor `DisplayScalarEditor` around the three explicit modes:

1. **Literal** — exact number, **Use token/formula**, existing **Make dynamic**,
   and attach-existing controls.
2. **Token formula** — formula text, resolved preview, referenced token chips,
   **Make literal from preview**, and **Make runtime dynamic**.
3. **Runtime binding** — binding choice, token-capable **From** and **To**
   formula editors, resolved preview, and **Make static from preview**.

Quick actions:

- **Create token from value** creates a token initialized from the resolved
  property value, gives it a property-derived name, allocates its Lua name, and
  attaches a direct token reference in one undo transaction.
- **Attach token** creates a direct reference to an existing token.
- **Use formula** opens a field initialized from the current static scalar.
- Invalid formula text displays an associated inline error and never modifies
  the normalized document.

Do not overload **Make dynamic** to mean both tokens and runtime bindings. Use
the words **token/formula** and **runtime binding** in visible controls and
accessible labels.

### Box width and height convenience

Keep the canonical box representation as inclusive `x1/y1/x2/y2`, matching the
firmware draw calls. Add actions beside the computed inclusive size:

- **Drive width with token/formula** constructs the end-coordinate expression
  from the current start-coordinate expression and `width - 1`;
- **Drive height with token/formula** does the same for the vertical axis; and
- reversed boxes preserve their current orientation by subtracting rather than
  adding the size.

This convenience is available when the relevant start coordinate is a static
literal or token expression. If the start coordinate is runtime-bound, keep
the action disabled with an explanation and let the user edit the endpoint
mapping explicitly. The generated source still contains ordinary endpoint
arguments; no width-based firmware helper is introduced.

The acceptance fixture must use this path for the shared `bar_width` example,
so “width of a bar” is a first-class workflow rather than an incidental ability
to hand-author an `x2` formula.

## Direct manipulation and formula preservation

Pointer and keyboard operations must not silently destroy token links.
Introduce pure scalar helpers such as:

```ts
offsetDisplayStaticScalar(scalar, delta): DisplayStaticScalar
setDisplayScalarPreviewValue(scalar, nextValue, context): DisplayScalar
```

Required behavior:

- Moving or nudging a literal adds the delta to its literal value.
- Moving or nudging a token expression adds the delta to the expression and
  normalizes it, preserving all token references.
- Moving a number-bound property shifts both `from` and `to` endpoints by the
  delta, including their formulas, so its runtime span remains intact.
- Alignment and distribution reuse the same offset operation.
- Resizing changes only the properties controlled by the active handle. For a
  token expression, it adds the difference between old and requested preview
  values instead of materializing the whole expression. For a number binding,
  it shifts both endpoints by that difference.
- Creation continues to produce simple literals.
- Layout-grid snapping operates on resolved preview geometry. It commits only
  the calculated offset and never rewrites formula structure merely because
  snapping is enabled.
- Symbol creation translates token formulas by adding the chosen origin delta.
  Detaching a symbol instance preserves token expressions from the selected
  state plus the instance-origin expression where both are static. If a
  runtime binding prevents a safe symbolic merge, use the resolved preview and
  make that explicit in the existing destructive confirmation.

Focused regression tests must cover formula preservation for move, five-pixel
nudge, align, distribute, every resize handle, snapping, symbol creation, and
detach. This increment should also unify the currently different translation
behavior for scene geometry and symbol-definition geometry.

## Validation, findings, and resource limits

Extend strict validation with:

- version-specific top-level key sets for versions 1, 2, and 3;
- token object key/type/value/name/ID/Lua-name validation;
- the token count budget;
- recursive AST key, operator, finite-number, node-count, and depth validation;
- dangling token reference detection with element/symbol/binding focus;
- duplicate Lua names across tokens, bindings, and symbol helpers;
- division-by-zero and non-finite resolved-result errors;
- property-domain checks after token resolution;
- token-aware shade-zero, clipping, reserved-row, and outside-artboard findings;
  and
- `unused-token` as a non-blocking warning.

Add `tokenId` to finding focus. Clicking a token finding opens/focuses the
Tokens panel; element and symbol findings retain their present behavior.

Metrics add **Tokens** and optionally **Token references** as descriptive
counts. Generated UTF-8 already captures the actual source-size effect. Do not
add a CPU estimate or imply that expression count is a hardware performance
measurement.

## File compatibility and canonical serialization

Bump the current format to version 3 while preserving strict reads of versions
1 and 2:

- Version 1 migrates with `layoutGrid: null`, `tokens: []`, and literal wrappers
  around number-binding `from`/`to` values.
- Version 2 preserves its layout grid, adds `tokens: []`, and wraps binding
  endpoints.
- Version 3 requires `tokens` and the new endpoint shapes; unknown keys remain
  blocking rather than silently discarded.
- `parseDisplayDesignText()` reports `migratedFromVersion?: 1 | 2`.
- Downloads always serialize canonical version 3 with a trailing newline.
- Canonical root key order is `kind`, `version`, `name`, `displayMode`,
  `elements`, `groups`, `tokens`, `bindings`, `symbols`, `layoutGrid`.
- Token and AST key order is pinned by golden tests.
- The existing 1 MiB UTF-8 limit remains the final file-size boundary.
- A failed migration or invalid formula leaves the current draft unchanged.
- Open/download continues to avoid the project database, active script,
  recovery journal, simulation, and worker.

Update empty-design and discard checks so an otherwise empty document with a
token is treated as authored content.

## Architecture and ownership

The ownership boundary remains:

```text
DisplayDesignerDialog (main thread)
  -> normalized document + undo/download state
  -> pure token parser/model/validation/resolution
  -> pure compiler -> existing DrawCommand[] -> existing display renderer
  -> deterministic generator -> clipboard/download handoff

simulation worker: unchanged
active Lua source/project: unchanged
Disting firmware API: unchanged
```

Do not add tokens to `api-manifest.ts`, the worker protocol, the active runtime,
or the display API. They are authoring metadata that disappears into ordinary
Lua locals and arithmetic during generation.

`docs/ARCHITECTURE.md` should be updated only to describe the expanded
main-thread design document, pure expression resolver, version-3 handoff, and
generated token scope. `docs/CONFORMANCE_STATUS.md` does not need a support
claim change unless implementation uncovers a separate firmware-facing gap.

## Implementation increments

### 1. Version-3 model, token expressions, validation, and migration

Implement:

- version-3 document and token types;
- static-scalar binding endpoints;
- token/AST limits and ID allocation;
- pure parser, printer, normalizer, evaluator, and reference collector;
- immutable token create/update/reorder/delete-substitution operations;
- strict token/AST/reference/domain validation;
- version-1/version-2 migration and canonical version-3 serialization; and
- empty-design/history defensive-copy updates.

Primary files:

- `display-design-model.ts` and its tests;
- new `display-design-token-expressions.ts` and tests;
- new `display-design-tokens.ts` and tests;
- `display-design-validation.ts` and tests;
- `display-design-file.ts` and tests;
- `display-design-lua-identifiers.ts` and tests; and
- `display-design-history.ts` tests where token transactions expose a new
  history case.

Focused command:

```bash
npx vitest run \
  src/disting/workbench/display-designer/display-design-model.test.ts \
  src/disting/workbench/display-designer/display-design-token-expressions.test.ts \
  src/disting/workbench/display-designer/display-design-tokens.test.ts \
  src/disting/workbench/display-designer/display-design-validation.test.ts \
  src/disting/workbench/display-designer/display-design-file.test.ts \
  src/disting/workbench/display-designer/display-design-history.test.ts \
  src/disting/workbench/display-designer/display-design-symbols.test.ts
```

Do not proceed while old version-1/version-2 fixtures, exact JSON round trips,
or defensive invalid-input cases fail.

### 2. Resolution, compiler preview, and deterministic Lua generation

Implement:

- token maps and the shared static/dynamic scalar resolver;
- token-aware binding mapping, compiler commands, bounds, and findings;
- usage-directed token collection;
- deterministic token declarations and expressions;
- token source-location metadata and metrics; and
- token-aware symbol helper generation.

Primary files:

- `display-design-resolution.ts` and tests;
- `display-design-compiler.ts` and tests;
- `display-design-generator.ts` and tests;
- `display-design-bindings.ts` and tests; and
- real display/Lua boundary fixtures in the generator suite using the
  production Wasmoon bridge.

Focused command:

```bash
npx vitest run \
  src/disting/workbench/display-designer/display-design-token-expressions.test.ts \
  src/disting/workbench/display-designer/display-design-bindings.test.ts \
  src/disting/workbench/display-designer/display-design-compiler.test.ts \
  src/disting/workbench/display-designer/display-design-generator.test.ts \
  src/disting/emulation/display-api.test.ts \
  src/disting/workbench/script-scaffold.test.ts \
  src/disting/workbench/LuaSourcePreview.test.tsx
```

The increment is not complete until compiler commands and real Lua-emitted
commands agree for the mandatory matrix above.

### 3. Token management and property formula workflow

Implement:

- Tokens panel and responsive-tab entry;
- add/rename/value/reorder/usage/source-navigation/delete workflows;
- formula editor with local invalid draft and accessible errors;
- literal/token formula/runtime binding modes in every scalar inspector;
- token-capable binding endpoints;
- create/attach/make-literal actions;
- box width/height convenience; and
- token focus from findings.

Keep operations semantic: quick-create-and-attach is one undo entry, token value
commit is one, delete substitution is one, and formula typing creates none
until valid commit.

Primary files:

- `DisplayDesignerDialog.tsx` and its jsdom tests;
- `display-designer-layout.ts` and tests;
- `display-designer.css` and rendering assertions;
- token/expression pure modules and tests; and
- generator source metadata tests.

Focused command:

```bash
npx vitest run \
  src/disting/workbench/display-designer/display-design-tokens.test.ts \
  src/disting/workbench/display-designer/display-design-token-expressions.test.ts \
  src/disting/workbench/display-designer/display-designer-layout.test.ts \
  src/disting/workbench/display-designer/display-designer-rendering.test.tsx \
  src/disting/workbench/display-designer/display-designer-dialog.test.tsx
```

### 4. Formula-preserving manipulation, responsive UI, and accessibility

Implement the shared scalar-offset/set-preview helpers, replace all literal vs
binding branches in geometry/symbol/snapping code, and verify that direct
manipulation preserves formulas and binding spans. Complete keyboard, focus,
overflow, reduced-motion, and coarse-pointer behavior for the added panel and
formula controls.

Primary files:

- `display-design-geometry.ts` and tests;
- `display-design-snapping.ts` and tests;
- `display-design-symbols.ts` and tests;
- `DisplayDesignerDialog.tsx` and interaction tests;
- `display-designer.css`; and
- rendering/layout tests.

Focused command:

```bash
npx vitest run src/disting/workbench/display-designer
```

Perform live browser checks at this increment. If no controllable backend is
available, record the exact unverified matrix rather than treating jsdom and
CSS assertions as visual acceptance.

### 5. Documentation, full regression, and manual acceptance

Update:

- `docs/WORKBENCH_GUIDE.md` with the token/binding distinction, formula syntax,
  width/height workflow, deletion semantics, generated source, and version-3
  file behavior;
- `docs/ARCHITECTURE.md` with the pure expression boundary and generator scope;
- `docs/TESTING.md` with the parser/model/jsdom/Wasmoon guarantees and manual
  limitations;
- this plan's progress/evidence table; and
- `docs/README.md` when this plan is eventually archived.

Then run:

```bash
npm test
npm run check
```

Because this is a browser-only authoring feature using existing documented draw
calls, `npm run test:conformance` is not a separate required gate unless public
Lua behavior, manifest metadata, provenance, or support status changes during
implementation. The full project check remains mandatory.

## Automated test matrix

### Pure expression/model tests

- precedence, associativity, parentheses, unary minus, decimals, exponents,
  whitespace, and deterministic printing;
- unknown/renamed identifiers and stable token-ID references;
- unsupported syntax, calls, fields, strings, trailing text, non-finite values,
  division by zero, and depth/node/source limits;
- safe identifier allocation across tokens, bindings, symbols, keywords, and
  generated dependencies;
- immutable add/update/reorder/delete substitution and defensive copies;
- usage discovery in scene, symbol, instance, and binding endpoints;
- substitution preserving other token references; and
- one-step history behavior.

### Validation and file tests

- strict version-3 keys and every token/AST malformed shape;
- dangling token IDs and property-focused findings;
- version 1 -> 3 and version 2 -> 3 migration;
- exact canonical key order, token order, AST bytes, Unicode names, and trailing
  newline;
- future-version, size, count, and formula-budget rejection;
- failed open preserving the current draft; and
- token-only documents participating in dirty/discard/download state.

### Compiler and generator tests

- literal/token/binding endpoint resolution at representative values;
- integer/smooth rounding and negative-zero behavior;
- radius domain, shade clamp/round, shade-zero warning, clipping, and reserved
  rows after token edits;
- direct and nested formulas in scene and symbol primitives;
- used-token stable order, unused-token omission/finding, and collisions;
- simple output unchanged when no token or symbol is used;
- one shared closure when tokens and symbols coexist;
- exact source locations and UTF-8 metrics; and
- real Wasmoon/display command parity and repeated callback behavior.

### Geometry and interaction tests

- attach existing token, quick create, formula commit/cancel/error, rename,
  reorder, source navigation, and delete confirmation;
- token value updates across several properties and symbol instances;
- tokenized binding endpoints and State preview updates;
- move, nudge, align, distribute, resize, snap, symbol creation, and detach
  preserving formulas;
- inclusive box width/height in normal and reversed directions;
- undo/redo and changed/download markers for every semantic action;
- token finding focus and live announcements;
- roving responsive tabs with the new Tokens entry; and
- keyboard-only and accessible labels/descriptions/errors.

## Manual browser acceptance

Record browser name/version, viewport, input type, and result for:

| Environment | Required observations |
| --- | --- |
| Chromium desktop, wide | Create the bar fixture, edit every token, inspect usage, use width convenience, drag/nudge, undo/redo, copy Lua, and file round-trip. |
| Firefox desktop, medium | Formula editing and error recovery, Tokens/State distinction, tab navigation, scrolling, source navigation, and Canvas updates. |
| Safari desktop, wide | Numeric field commit/cancel, clipboard/fallback, file download/open, generated highlighting, and focus return. |
| Narrow viewport (<=720 px) | Tokens tab remains reachable, artboard remains visible, formula fields and confirmations do not overflow, and Fit zoom remains locked. |
| Coarse pointer/touch | Token controls meet target sizing and artboard gestures preserve formulas without accidental panel actions. |
| Keyboard only | Reach, create, rename, value-edit, reorder, attach, formulate, navigate uses/source, delete, and undo without pointer input. |
| Reduced motion / browser zoom / large text | No required motion, no clipped critical action, visible focus, readable errors, and horizontal overflow remains operable. |

The core scenario passes only if changing `bar_width` updates all bars in the
Canvas preview, the generated source changes at the token declaration rather
than baking new numeric endpoints into every call, undo restores the prior
layout, and a download/open round trip produces identical normalized source.

When Disting NT hardware and a capture path are available, copy the same
generated callback into a minimal script, record the firmware version and
reproduction steps, and compare the token-formula layout with the compiler
preview. Hardware testing is evidence for the resulting ordinary Lua/draw
behavior; it does not turn tokens into a firmware feature. If hardware is
unavailable, report that exact gap.

## Risks and mitigations

### Tokens are confused with runtime modulation

Use a separate Tokens panel, retain State for bindings, label actions
explicitly, and document that token edits are persisted authoring changes.

### Formula text becomes an arbitrary code path

Parse the closed arithmetic grammar into a bounded typed AST, store token IDs,
validate imported trees independently, and generate Lua only from known nodes.

### Direct manipulation silently breaks relationships

Route every move/resize/alignment/symbol transform through shared symbolic
offset helpers and pin formula preservation with focused tests.

### A token edit invalidates distant artwork

Discover all uses, preflight the whole normalized document before committing,
show property-focused errors, and keep invalid field drafts outside history.

### Generated helpers cannot see token locals

Use the existing immediately evaluated closure as the common token/helper
scope. Emit one closure when either used tokens or used symbols require it.

### Version-3 migration loses old binding ranges

Wrap version-1/version-2 numeric endpoints exactly, compare pre/post compiler
commands and generated Lua for migrated fixtures, and never partially replace
the open draft after a failed migration.

### Source becomes unreadable

Preserve token and operand order, use stable precedence-aware printing, group
declarations under one comment, avoid aggressive algebraic rewrites, and pin
representative golden output for human review.

## Completion criteria

The feature is complete only when:

- numeric tokens can be created, named, ordered, edited, attached, composed in
  safe formulas, located in generated source, and deleted without dangling
  references;
- `bar_width`, `bar_gap`, and `bars_y` drive a multi-bar fixture including the
  inclusive-width convenience, and one token edit updates every previewed use;
- runtime number bindings can use token formulas for both mapping endpoints
  without changing existing normalized-input semantics;
- move, resize, snapping, alignment, grouping/symbol workflows, and undo do not
  silently materialize linked formulas;
- compiler output and generated Lua agree through the real Wasmoon/display
  boundary for scene and symbol cases;
- generated locals are readable, collision-safe, stable, scoped above helpers,
  and emitted only when used;
- version-1 and version-2 designs migrate losslessly, version-3 designs round
  trip canonically, and invalid imports never partially replace a draft;
- no token state enters the simulation worker, active script, project store,
  recovery journal, or firmware-facing API;
- current documentation describes the implemented behavior and evidence limits;
- the focused suites, `npm test`, and `npm run check` pass; and
- unavailable browser, clipboard, file-picker, deployment, or hardware checks
  are listed precisely rather than implied complete.
