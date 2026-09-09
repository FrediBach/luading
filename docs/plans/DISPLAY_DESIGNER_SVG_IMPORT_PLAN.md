# Display designer SVG import implementation plan

## Status and outcome

Proposed on 2026-09-09. Planning only; none of the increments below is implemented.

Add **Import SVG** to the Display designer. Convert a selected SVG into ordinary,
editable designer elements, automatically choosing the closest supported drawing
representation and standard/tiny native text. Preview the conversion, explain
losses and size problems, and let the user resolve them before inserting it.
Every inserted element must participate in the existing Lua generation workflow.

This extends the original [designer plan](DISPLAY_UI_DESIGNER_IMPLEMENTATION_PLAN.md),
which deferred SVG import. It supersedes that deferral for this feature only.
SVG remains an input format; the saved scene remains a Disting-oriented document.
Import is a Luading authoring extension, not a new firmware API.

## Evidence and existing integration points

- The official [Lua scripting 1.12 PDF](../Disting%20NT%20Lua%20Scripting%201.12.pdf),
  pages 21 and 23–25, defines the 256×64 display, shades 0–15, drawing functions,
  text baselines, and the tiny 3×5 font. Native text has two choices, not an
  arbitrary font-size argument.
- [API metadata](../../src/disting/validation/api-manifest.ts) and
  [conformance status](../CONFORMANCE_STATUS.md) identify approximate font faces
  and smooth rendering. The standard 8px Pixelmix and tiny 6px Tom Thumb atlas
  metrics are simulator approximations, not verified hardware font dimensions.
- The [current model](../../src/disting/workbench/display-designer/display-design-model.ts)
  is version 9. It already supports lines, boxes, outline circles, regular
  polygons, Bézier curves, text, pixel boxes, groups, screens, tokens, and bindings.
- Reuse the compiler, generator, validation, history, identifier allocation,
  geometry, pixel-box optimizer, and file serializer in
  `src/disting/workbench/display-designer/`. Reuse
  [font measurement](../../src/disting/emulation/display-font.ts) and the
  production display renderer for target previews.
- Follow the current [authoring boundary](../ARCHITECTURE.md#display-design-authoring-and-file-handoff),
  [workbench behavior](../WORKBENCH_GUIDE.md#display-designer), and
  [test workflow](../TESTING.md). Import never changes the active script or
  simulation. The user copies the generated callback through the existing action.

Use the W3C SVG specifications for the source format:
[coordinates and units](https://www.w3.org/TR/SVG2/coords.html),
[text layout](https://www.w3.org/TR/SVG2/text.html), and
[fill/stroke painting](https://www.w3.org/TR/SVG2/painting.html).
Support the explicit subset below and diagnose other semantics instead of
claiming general SVG conformance.

## User workflow

1. **Choose:** Add Import SVG beside Open design, with a separate `.svg` picker.
   Accept a local file; clipboard SVG and remote URLs are deferred. Read and
   analyze it into an import draft without mutating the current design.
2. **Fit:** Show source dimensions, artwork bounds, selected destination, and
   an editable uniform scale/offset. Default to the current screen and display
   mode; offer a new screen. A group picker lets the user import only the desired
   artboard/component from a large export while retaining ancestor styles and
   transforms. Do not infer screens or states from every SVG group.
3. **Review:** Show the sanitized source reference and the converted 256×64
   preview, including 1:1 pixel inspection and enlarged nearest-neighbour view.
   Label any unavailable source font or effect in the reference. Show counts of
   direct matches, approximations, unresolved elements, exclusions, and clipping.
4. **Resolve:** Selecting a finding highlights its source object and proposed
   target layers. Provide appropriate actions: choose a representation, change
   text size/content, adjust placement/shade, choose a group, simplify, explicitly
   exclude an object, or cancel and fix the SVG externally. A bulk action states
   exactly how many objects it affects. Recalculate the preview and findings.
5. **Insert:** Enable insertion only when all blocking findings are resolved and
   the complete candidate design validates. Insert the chosen elements/groups
   as one undoable transaction and select the inserted layers. A new screen and
   its layers are part of that same transaction. Existing layers retain order;
   imported layers append above them in SVG paint order.
6. **Use in code:** The normal inspector, bindings, tokens, Lua panel, Copy draw
   callback, and Download design immediately work for all inserted elements.
   Retain a readable conversion summary for the import session.

Cancel, parsing failure, an empty result, and resource-limit failure leave the
document, selection, undo history, and downloaded-revision marker unchanged.
Changing files/options invalidates older analysis results. Revalidate against
the current document revision before insertion; stale results cannot commit.

## Conversion contract

### Parsing and normalized source scene

Build a bounded source scene independent of React. Retain stable source IDs,
names, hierarchy, paint order, effective styles, affine transforms, source
bounds, text runs, and findings. DOM parsing is a main-thread adapter; geometry,
matching, placement, diagnostics, and materialization are pure typed functions.
Do not send SVG data into the simulation worker or execute imported code.

The initial supported subset will include:

- `svg`, `g`, `defs`, local `use` references, and referenced `symbol` content;
  normalize nested viewports and transforms in the specified order. Detect
  missing references, duplicate ambiguous IDs, and cycles.
- Root/nested `viewBox`, `preserveAspectRatio`, translation, scaling, rotation,
  skew, and matrix transforms. Resolve unitless/px and absolute CSS lengths;
  resolve percentages only when their viewport is known. Diagnose unresolved
  relative units or missing dimensions; let the user supply a source viewport.
- Presentation attributes, inline styles, and a documented small stylesheet
  subset: type/class/ID selectors, comma lists, inheritance, specificity,
  source order, and `!important`. Unsupported selectors, variables, CSS
  transforms, and external styles must produce actionable findings when they
  may affect selected artwork. Do not silently substitute defaults.
- Solid fill/stroke colours, `none`, `currentColor`, visibility, fill rules,
  and explicit paint order. Preserve SVG defaults, including filled paths;
  never reinterpret every path as an outline. Hidden/nonpainting content is
  counted separately, not reported as failed geometry.
- Lines, rectangles, circles, ellipses, polylines, polygons, and all path
  commands, including relative/repeated commands, closepath, quadratic/cubic
  curves, smooth controls, arcs, and multiple subpaths.
- Plain text and simple positioned `tspan` runs. Complex typography follows
  the text policy below.

Never attach raw SVG to the live application DOM. Reject DTD/entity declarations;
remove executable elements/events and prohibit external resource loading,
including fonts, images, CSS imports, and nonlocal references. Report removals.
Generate any source reference from an allowlisted reconstruction, with bounded
dimensions, no network access, and cleaned-up temporary URLs. Unsupported visual
effects must remain marked in that reference. Imported strings are data, never
HTML or Lua source. Test these boundaries explicitly.

### Choosing the best fitting element

Prefer semantic editability, then visual fit at target resolution, then fewer
expanded draw calls. Deterministically rank direct representations first; only
use an approximation when its measured error fits a documented tolerance.
If candidates are effectively tied, prefer fewer calls and a stable type order.
Report geometric error, lost semantics, and expanded call count rather than an
unexplained confidence percentage. Label smooth previews as approximations.

| SVG artwork after transforms | Preferred designer representation | Fallback or guidance |
| --- | --- | --- |
| Straight thin stroke | Pixel line; smooth line when fractional placement materially helps | Thick/dashed/capped strokes need explicit decomposition or review. |
| Axis-aligned rectangular fill | Filled box | Convert continuous edges to inclusive pixel corners; pin 1×1 and boundary cases. |
| Axis-aligned thin rectangular outline | Outline box | Fill plus stroke can produce two ordered layers with different shades. |
| Circle with uniform scale and thin outline | Outline circle | Nonuniform transforms produce an ellipse, not a circle. |
| Regular polygon outline matching the existing orientation | Polygon | Other orientations or irregular polygons become ordered line elements. |
| Quadratic/cubic path segment | Bézier element with 3/4 control points | Select bounded detail by measuring the existing compiler's sampled result. |
| Ellipse, arc, rounded rectangle, or transformed outline | Bounded curves or line segments | Recognize simpler geometry only within a tested target-pixel tolerance. |
| Filled circle, polygon, or compound path | Filled scanline/rectangle decomposition, grouped as one source object | Preserve holes and fill rule; offer pixel box only under the opacity policy below. |
| Text | Standard or tiny text elements | Preserve characters and use the text matching workflow. |
| Raster image, mask, filter, gradient, pattern, blend effect, marker, or animation | Unresolved in the first release | Explain how to remove the effect, replace it with supported artwork, or exclude it. |

Start with a proposed 0.5 target-pixel geometric deviation threshold for curve
approximation; measure the actual emitted segments, not just control points.
Select the lowest sufficient segment count within existing limits. If no count
meets the threshold, present the best candidate and require a user decision.
Recognizing approximate circles/boxes must not destroy intentional asymmetry.

Quantize solid RGB colours to shades 0–15 with one documented, fixture-tested
luminance rule. Provide optional global inversion and per-element shade edits;
do not invert automatically. Warn when quantization makes foreground and
background indistinguishable. Shade 0 is painted black, not transparency.

For nonopaque fills/strokes or group opacity, diagnose unsupported compositing
in the first release. Do not multiply each child's shade by group opacity or
assume the background is black. Fully transparent paint emits no commands.
Opaque fill decomposition must skip holes and unpainted pixels while preserving
overlap and paint order. An existing pixel box paints its entire rectangle,
including shade-zero cells; therefore allow it only for an explicitly opaque
rectangle or an explicitly accepted flattening against a chosen background.
Never silently erase underlying layers to reduce the element count.

### Native text and size matching

Keep source text as text. Never automatically outline, rasterize, OCR, truncate,
or replace it. Outlined letters cannot reliably be recovered as semantic text;
advise exporting with live text or manually replacing the artwork with a label.
The existing component-library SVG contains pixel-run artwork, so its glyphs
do not promise automatic native-text or component-state round trips.

For each supported horizontal text run:

1. Decode XML text, normalize whitespace according to the supported SVG rules,
   retain intentional spaces, and resolve run positions/styles. Map start,
   middle, and end anchoring to native alignment where direction permits it.
   Preserve the baseline; do not treat `y` as a text bounding-box top.
2. Apply source transforms and the chosen import scale before selecting a font.
   Measure both native candidates using `measureDistingText`, atlas advances,
   glyph ink bounds, ascent/descent, and baseline. Do not use CSS font size alone
   or confuse the tiny glyph's 3×5 description with its 6px atlas line height.
3. Compare candidate ink height/advance width to the source run's intended
   target-space footprint. Use source-font measurements only when available
   locally; otherwise use declared metrics as estimates and label uncertainty.
   Do not download fonts. Prefer candidates fitting the available target bounds,
   then lowest normalized height/width error, with standard text as a stable
   tie-break. Freeze score weights and review thresholds in fixtures before
   shipping; display both measured candidates for manual override.
4. Store `kind: 'text'`, `tiny`, baseline/anchor, alignment, literal content,
   and shade. Native text remains unscaled; no arbitrary size or font dependency
   appears in Lua. Recompute bounds and collisions after replacement.
5. If neither candidate fits, or the size change exceeds the reviewed tolerance,
   highlight the label with Standard/Tiny previews. Offer moving it, editing its
   content, or explicitly splitting it into separate native text lines. Do not
   silently shrink the whole layout again, wrap, or clip the string.

Support ordinary multiline exports through separate positioned text runs;
combine spans only when content, paint order, style, and spacing are preserved.
Diagnose unsupported glyphs before the atlas substitutes `?`; list affected
characters and offer editable replacements. Rotated/skewed/reflected text,
vertical or bidirectional shaping, text-on-path, per-character rotation,
`textLength` stretching, and unsupported baseline/spacing features require
explicit repositioning as horizontal native text or external correction.
Bold/italic/custom font styling cannot be preserved; show the replacement.

### Spatial fit and oversized designs

Distinguish three problems in the UI: source viewport size, converted artwork
overflow, and conversion/document complexity. A large viewBox containing a
small icon is not necessarily a complex or oversized target design.

- Full display targets x=0–255, y=0–63. Keeping the standard parameter line
  targets y=10–63, a 256×54 area. The display mode is document-wide; importing
  into another screen must not silently change it for all existing screens.
- Start at 1:1 when artwork fits. Otherwise recommend **Fit artwork**, preserving
  aspect ratio and centering with an optional pixel margin. Also offer **Fit
  source viewport** to preserve intended whitespace, a numeric scale/offset,
  and selecting a smaller source group. Never stretch or crop by default.
- Compute bounds after transforms, strokes, curve conversion, quantization, and
  native font substitution. Re-run text matching when scale changes. Inspect
  zero-sized bounds, negative origins, degenerate shapes, disappearing thin
  features, and labels that overlap after shrinking.
- If overflow remains, report its sides and pixel amounts. Offer another fit,
  repositioning, selecting less artwork, or **Keep clipped** with a visible
  crop overlay and explicit acceptance. Offscreen values must still pass the
  document's coordinate limits. Zero-sized/unresolvable input gets guidance,
  not divide-by-zero or an empty successful import.
- Explain complexity separately: e.g. “This conversion needs 620 primitives;
  this design has room for 480. Select fewer groups or reduce curve detail.”
  Scaling alone is not promised to solve a primitive limit. New screens share
  document limits and are not a workaround for exhausted capacity.

## Code readiness, persistence, and implementation structure

Materialize only existing designer types; initially no schema bump is needed.
Allocate collision-safe IDs and readable names from source labels/IDs, with
deterministic fallback names. Preserve a transient source-to-layer map for
review, including one-to-many conversions. Flatten nested SVG groups into the
designer's one-level groups without changing canonical element paint order.
Do not infer runtime bindings, tokens, symbols, or state variants from SVG names.

Every scalar/text/visibility property retains the existing inspector binding
capabilities. Static imports generate runnable literal values immediately.
Offer the existing Link value workflow for runtime text, coordinates, shade,
and visibility; wiring must use collision-safe Lua identifiers and the existing
binding generator. Source names and string contents pass through existing Lua
escaping; no SVG attribute is executable Lua. Generated source ranges must
select every imported element, including decomposed ones.

The persisted result must validate, download, reopen, compile, and generate Lua
without the original SVG or importer. Do not persist a parallel SVG scene or
embed raw SVG. Any later persistent provenance proposal requires its own strict
schema migration rather than permissive unvalidated fields.

Proposed modules under `src/disting/workbench/display-designer/`:

| Module | Responsibility |
| --- | --- |
| `display-design-svg-file.ts` | File metadata/byte limits, XML adapter, allowlisted reference construction. |
| `display-design-svg-model.ts` | Typed normalized scene, options, source map, findings and review decisions. |
| `display-design-svg-normalize.ts` | Styles, units, references, transforms and ordered source scene. |
| `display-design-svg-path.ts` | Bounded path parsing, curve normalization and geometry matching. |
| `display-design-svg-text.ts` | Text runs, native metrics, matching and typography findings. |
| `display-design-svg-convert.ts` | Fit, candidate selection, fill decomposition and conversion report. |
| `display-design-svg-import.ts` | ID remapping and full candidate validation/materialization. |
| `DisplaySvgImportDialog.tsx` | Choose/fit/review/resolve controls; integrates with existing designer history. |

Keep new logic out of the already large main designer dialog. Bound synchronous
parsing before processing. Chunk longer pure conversion work so cancellation
and progress remain responsive; no simulation-worker scheduling changes.

Proposed initial importer ceilings: 2 MiB input, 10,000 XML elements, 64 levels
of nesting/reference expansion, 20,000 expanded source nodes, 50,000 path
commands, and 100,000 intermediate curve segments. Enforce cumulative limits
before allocations/expansion, with deterministic early termination; tune these
as authoring limits using fixtures, not as hardware capabilities. Bound source
numbers and intermediate arithmetic independently of final document coordinates.

After conversion, enforce `DISPLAY_DESIGN_LIMITS` on the complete candidate,
including existing content: currently 512 stored primitives, 64 groups, 32
screens, 64 bindings, 512 code points per text value, and 1 MiB serialized JSON.
Check symbol-owned primitives and other current model limits too. Count actual
expanded draw commands and generated source bytes. These are descriptive costs;
do not invent a firmware CPU percentage or a safe hardware call-count threshold.

## Implementation increments and validation

Each increment requires focused co-located tests before the next increment.
Every implementation bug fix needs a regression test. No increment is complete
until its checks and any unavailable verification are recorded here.

| Increment | Deliverable and acceptance evidence | Status |
| --- | --- | --- |
| 1. Fixtures and contract | Minimal hand-authored SVGs plus representative tool exports; exact supported-subset table, fit tolerances, limits, finding actions, and expected target scenes. Include a selected group from the existing pixel UI SVG. | Planned |
| 2. Safe parsing and normalization | File/XML failures, styles, viewport/transform order, local references, bounds, paint order, blocked resources, expansion limits and cancellation tests. | Planned |
| 3. Geometry and native text | Direct matches, all path commands, filled holes, opacity refusal, pixel-box transparency guard, both font candidates, baseline/alignment, spans, unsupported characters and post-fit overflow tests. | Planned |
| 4. Materialization and generated Lua | Valid version-9 imports, group/name collisions, existing-content limits, source ranges, binding edits, JSON round trips, and deterministic compiler/generator output. | Planned |
| 5. Review workflow | Dialog rendering/accessibility/model tests; file/fit/group selection, finding resolution, failed/cancelled import, stale analysis, one-step undo/redo and successful code handoff. | Planned |
| 6. Acceptance and documentation | Complete automated checks, browser matrix, evidence limitations, updated current guides, and dated completion record. | Planned |

Required regression examples include a native-resolution UI that needs no fit,
a 1024×256 UI fitted to 256×64, a tall UI retaining the parameter line, a huge
viewport with tiny artwork, a text label where tiny fits and standard does not,
a label where neither fits, native-font ties, nested transforms, negative
coordinates, one-pixel fills, nonuniform circles, disjoint paths, even-odd and
nonzero holes, solid black knockouts, unsupported gradients, overlapping opacity,
outlined text, many tiny objects, and no convertible artwork.

For JavaScript/Lua crossings, generate callbacks from imported fixtures and run
them through the production Wasmoon bridge and reusable display test environment.
Compare captured commands and deterministic integer/font pixels with compiler
previews; test both display modes, escaping, filled decomposition, curves, and
an imported text value wired to runtime state. Do not claim exact smooth-raster
or hardware parity from browser comparisons. Run affected corpus tests when
generator/runtime/contract changes can affect bundled scripts, and
`npm run test:conformance` when public behavior, metadata, provenance, or support
status changes. Never expand expected-error allowlists to hide failures.

Live browser acceptance covers Chromium, Firefox, and Safari where available;
desktop >900px, intermediate 721–900px, narrow ≤720px; keyboard-only file and
finding navigation, focus restoration, screen-reader labels, coarse pointers,
reduced motion, source-reference isolation/no network requests, fit controls,
real text measurement, cancellation, repeated import, Undo/Redo, Download/Open,
and Copy callback. Record exact missing browser/viewport/interaction cells.
Hardware confirmation of glyph fit and smooth appearance requires firmware
version and reproduction steps; retain the existing conformance limitations
until that evidence exists.

After implementation run `npm test`, then `npm run check` (lint, coverage, full
tests, TypeScript and production build). Run the documentation guardrail test
after documentation edits. Update WORKBENCH_GUIDE for import behavior and TESTING
for new guarantees/limitations; update ARCHITECTURE for the new import data flow.
Change CONFORMANCE_STATUS only when support/evidence/limitations change. Update
the documentation map and archive this plan with a dated banner when complete.

The release acceptance condition is that every imported visible object either
becomes editable, code-generating content or receives an explicitly resolved
finding; no object is silently lost, no unresolved layout loss is hidden, and
no partial import mutates the draft after a failure.
