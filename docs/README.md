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
