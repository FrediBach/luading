# Luading documentation

This directory separates current project guidance from runbooks, active plans,
and historical records. A document's classification determines whether it may
be used to describe current simulator behavior.

## Evidence hierarchy

When sources disagree, use this order:

1. Behavior observed on real Disting NT hardware.
2. The official [Disting NT Lua Scripting 1.12 PDF](Disting%20NT%20Lua%20Scripting%201.12.pdf).
3. Official scripts, as compatibility evidence rather than automatic contract
   evidence.
4. The simulator implementation and its machine-readable support metadata.
5. Browser-only extensions, which must always be labelled as simulator
   conveniences.

Record hardware observations with the firmware version, reproduction steps,
and expected result. The PDF is the canonical local manual. The
[Markdown manual](Disting%20NT%20Lua%20Scripting.md) is only a searchable
extraction and may contain conversion errors.

## Canonical current documentation

- [Architecture](ARCHITECTURE.md) describes current system boundaries, state
  ownership, runtime flows, and invariants.
- [Conformance status](CONFORMANCE_STATUS.md) is the current capability and
  limitations ledger, including evidence and hardware-confirmation needs.
- [Testing](TESTING.md) defines the test layers, guarantees, commands, and
  coverage policy.
- [Workbench guide](WORKBENCH_GUIDE.md) describes the current user-facing
  workspace and browser behavior.
- [`api-manifest.ts`](../src/disting/validation/api-manifest.ts) is the detailed
  machine-readable simulator support catalog. It records support and
  provenance; it is not a higher hardware authority than the manual.

## Current runbooks

- [MIDI manual validation](MIDI_MANUAL_VALIDATION.md) records the steps and
  environment-specific evidence for validating Web MIDI behavior.

Runbooks are operational instructions. Keep their steps current, and record
results separately from claims about the Disting hardware contract.

## Active plans

- [Fredi Bach display animation](plans/FREDI_BACH_DISPLAY_ANIMATION_PLAN.md)
  tracks the remaining example-script display work.
- [Script-authored automated tests](plans/SCRIPT_AUTOMATED_TESTS_IMPLEMENTATION_PLAN.md)
  plans deterministic, preset-based behavioral suites in the workbench and
  project regression tests.
- [Export customizer](plans/EXPORT_CUSTOMIZER_IMPLEMENTATION_PLAN.md) plans an
  annotation-driven, export-only workflow for safely embedding user-supplied
  values such as Strudel mini notation without changing the editor source or
  live simulation.
- [Display UI designer](plans/DISPLAY_UI_DESIGNER_IMPLEMENTATION_PLAN.md) plans
  a hardware-vocabulary visual editor for composing the 256x64 display,
  previewing static and dynamic states, reusing multi-state symbols/components,
  and generating readable ordinary Lua draw callbacks without changing the
  active source or worker contract.
- [Disting NT pixel UI library](plans/DISTING_PIXEL_UI_LIBRARY_IMPLEMENTATION_PLAN.md)
  plans a built-in catalog of editable, stateful Eurorack display components
  and screen recipes on top of the Display designer, including patching,
  controls, signal processing, sequencing, and original drum-machine graphics.

An active plan describes intended work and is not evidence that the behavior
exists. Update its status as work lands. Once it is complete, move it to the
archive and add a dated historical banner.

## Historical snapshots

Completed implementation plans live in
[`archive/implementation-plans/`](archive/implementation-plans/). They preserve
decisions and verification notes from their implementation period, but they
are not current specifications. Current behavior belongs in the architecture,
testing, workbench, and conformance documentation.

Historical audits live in [`archive/audits/`](archive/audits/). Their
still-relevant findings have been re-verified and migrated to the conformance
ledger. Do not resolve a current behavior question from an archived document
without checking the canonical documents, code, tests, and the evidence
hierarchy above.

The completed
[documentation cleanup plan](archive/implementation-plans/DOCUMENTATION_CLEANUP_PLAN.md)
records the restructuring that established this documentation lifecycle and
the final verification performed when it was archived.

The completed
[script parameter presets plan](archive/implementation-plans/SCRIPT_PARAMETER_PRESETS_IMPLEMENTATION_PLAN.md)
records the Luading-only source schema, worker flow, parameter-panel behavior,
and verification performed when named parameter snapshots were implemented.

The completed
[local script persistence plan](archive/implementation-plans/LOCAL_SCRIPT_PERSISTENCE_IMPLEMENTATION_PLAN.md)
records the account-free IndexedDB project library, autosave and recovery,
project-management workflow, portable backup/restore format, and final
verification.

The completed
[new-script scaffolder plan](archive/implementation-plans/NEW_SCRIPT_SCAFFOLDER_IMPLEMENTATION_PLAN.md)
records the quick-start and guided creation workflow, deterministic Lua
generation, hardware/simulator provenance rules, project-library integration,
and final verification.

The completed
[Display designer design-token plan](archive/implementation-plans/DISPLAY_DESIGN_TOKENS_IMPLEMENTATION_PLAN.md)
records the version-3 file model, bounded formulas, token-aware compiler and
generator, authoring workflow, symbolic manipulation rules, and final
verification with the unavailable live-browser and hardware matrix.

The completed
[Micro Tracker example plan](archive/implementation-plans/MICRO_TRACKER_EXAMPLE_IMPLEMENTATION_PLAN.md)
records the hardware-portable four-track tracker, its custom-control grammar,
deterministic scheduler and saved state, display architecture, and final
automated verification and unavailable live/hardware matrix.

## Documentation lifecycle

- Update `ARCHITECTURE.md` when ownership, boundaries, protocols, or invariants
  change.
- Update the conformance ledger when public Lua support or a known fidelity gap
  changes.
- Update `WORKBENCH_GUIDE.md` when user-visible behavior changes.
- Keep plans in future tense only while the work is active.
- Archive completed plans instead of leaving them beside current references.
- Preserve historical content after archival except for a status banner,
  broken-link repair, or an explicit correction note.
- Update this map whenever a document is created, reclassified, moved, or
  removed.
