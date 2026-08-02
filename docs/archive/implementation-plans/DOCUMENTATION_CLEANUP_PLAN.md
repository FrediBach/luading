# Documentation cleanup plan

> **Historical snapshot.** This plan was completed on 2026-08-02 and records
> the documentation restructuring and its final verification. It is not a
> current specification; use the canonical documents linked from
> `docs/README.md` for current behavior.

## Implementation status

- Phase 1 completed on 2026-08-02: documentation authority and lifecycle are
  defined, completed plans are archived, the active display plan is under
  `docs/plans/`, and the Markdown manual is labelled as an extraction.
- Phase 2 completed on 2026-08-02: `docs/ARCHITECTURE.md` is the sole canonical
  architecture document and the duplicate `src/disting/ARCHITECTURE.md` has
  been removed.
- Phase 3 completed on 2026-08-02: every F-01 through F-28 finding was
  re-audited into `docs/CONFORMANCE_STATUS.md`, and the dated audit was moved to
  `docs/archive/audits/`.
- Phase 4 completed on 2026-08-02: `AGENTS.md` now routes contributors by change
  type and records operational invariants, ownership, testing, corpus,
  documentation, generated-file, and completion rules.
- Phase 5 completed on 2026-08-02: the README, testing strategy, and workbench
  guide now use canonical references, avoid fixed corpus/test counts,
  distinguish all test layers and their limits, and keep user behavior separate
  from system architecture and implementation history.
- Phase 6 completed on 2026-08-02: repository tests now verify local links,
  document classification, canonical index coverage, removed-document
  references, active-document path portability, and command synchronization.
- Phase 7 completed on 2026-08-02: the documentation was reviewed for
  contributor routing, agent operating rules, and maintainer visibility into
  fidelity limits; the full suite, conformance suite, and complete project
  check passed. The cleanup is complete.

## Original assessment

I recommend converging on one canonical architecture document, a separate current conformance/limitations ledger, and a shorter, rule-focused `AGENTS.md`. The present docs contain strong material, but authority and lifecycle are unclear.

At the time of the assessment no files were changed, the repository was clean,
and the baseline `npm test` run passed.

## What the scan found

- [docs/ARCHITECTURE.md](../../ARCHITECTURE.md) was comprehensive, but mixed stable architecture, per-file inventory, implementation history, product behavior, and future gates.
- `src/disting/ARCHITECTURE.md` duplicated much of the canonical document and
  has now been removed.
- More than half of the roughly 6,700 documentation lines are implementation plans or a dated audit. Several completed plans remain written partly in future tense.
- [DISTING_NT_LUA_IMPLEMENTATION_AUDIT.md](../audits/DISTING_NT_LUA_IMPLEMENTATION_AUDIT.md) was valuable, but already stale: some findings described as unresolved were subsequently fixed in the manifest, lifecycle catalog, and validators.
- Historical documents contain stale test counts, absolute local paths, and even an internal citation placeholder.
- The distinction among hardware evidence, the 1.12 PDF, its Markdown extraction, official-script observations, and simulator extensions is present but scattered.
- The four execution contexts are real and correctly identified: React/main thread, simulation worker, validation worker, and Monaco worker.
- Browser APIs are correctly kept on the main thread; the simulation worker sees only typed requests, voltage/pulse updates, MIDI bytes, and configuration.
- The largest architectural pressure points are:

  - [DistingPlayground.tsx](../../../src/disting/DistingPlayground.tsx): 951-line main-thread coordinator.
  - [disting.worker.ts](../../../src/disting/disting.worker.ts): 883-line worker orchestrator plus many runtime adapters.
  - [types.ts](../../../src/disting/types.ts): domain types, browser-routing types, and worker protocol in one 355-line file.
  - `emulation/` mixes pure hardware-facing models with browser adapters such as Web Audio and Web MIDI.
  - Corpus tests cross the real Wasmoon lifecycle bridge, but many firmware globals use no-op test adapters. They do not prove production adapter behavior.
  - “Manual conformance” mostly verifies catalog metadata and constants, not every behavior through the production worker boundary.

- Tracked but unused legacy/experimental areas—`src/as/`, `src/lua/`, `src/App.css`, and old assets—are excluded or unreachable from production yet not documented as experiments or removal candidates.
- Important open fidelity gaps are buried in the dated audit rather than visible in current documentation: preset/bus modeling, `kLinear` interpolation, automatic parameter persistence, UI scripts/shared Lua state, interactive console/library paths, and several browser or display approximations.

## Target documentation structure

```text
README.md                       Product entry point
AGENTS.md                       Concise contributor/agent rules
docs/
  README.md                     Documentation map and authority labels
  ARCHITECTURE.md               Canonical current system architecture
  CONFORMANCE_STATUS.md         Current support boundaries and known gaps
  TESTING.md                    Test guarantees, matrix, and commands
  WORKBENCH_GUIDE.md            User-facing workbench behavior
  MIDI_MANUAL_VALIDATION.md     Active manual runbook
  plans/
    FREDI_BACH_DISPLAY_ANIMATION_PLAN.md
  archive/
    implementation-plans/
    audits/
  Disting NT Lua Scripting 1.12.pdf
  Disting NT Lua Scripting.md   Searchable extraction, clearly labelled
```

I would remove `src/disting/ARCHITECTURE.md` after migrating any unique details. A pointer file is possible, but a second architecture filename encourages contributors to update the wrong one.

## Detailed implementation plan

### Phase 1: Establish authority and document lifecycle

Create `docs/README.md` with four classifications:

- Canonical current documentation.
- Current runbooks.
- Active plans.
- Historical snapshots.

Define the evidence hierarchy explicitly:

1. Observed Disting NT hardware behavior.
2. Official Disting NT Lua 1.12 PDF.
3. Official scripts as compatibility evidence, not automatic contract evidence.
4. Simulator implementation and machine-readable support metadata.
5. Browser-only extensions, always labelled as such.

Label the Markdown manual as a searchable extraction of the PDF, not an independent source of truth.

Move completed plans for the compact UI, Monaco, MIDI, and Freeform CV into `docs/archive/implementation-plans/`. Preserve their historical status and dates, but add a short banner saying they are not current specifications.

Move the dated implementation audit into `docs/archive/audits/` only after extracting unresolved findings into the new conformance document. Keep the display-animation plan under `docs/plans/` because it appears active.

### Phase 2: Rewrite the canonical architecture document

Rebuild `docs/ARCHITECTURE.md` around stable boundaries rather than recent feature details.

Proposed outline:

1. **Purpose, scope, and non-goals**
   - Browser workbench, not cycle-accurate hardware emulation.
   - Static client application with no server/database.
   - Hardware fidelity versus browser convenience.

2. **Sources of truth**
   - Evidence hierarchy.
   - `api-manifest.ts` as the machine-readable catalog, not the primary hardware authority.
   - How hardware observations should be recorded.

3. **Execution topology**
   - Main thread.
   - Simulation worker.
   - Validation worker.
   - Monaco worker.
   - Which context may access DOM, Web Audio, Web MIDI, Wasmoon, and React.

4. **State ownership table**
   - Editor source and model version.
   - Lua VM and callback state.
   - Input generators and external values.
   - Output voltages and traces.
   - Browser routing and permissions.
   - Saved `self.state`.
   - Layout/theme preferences.
   - Diagnostics by origin.

5. **Dependency direction**
   - UI components consume typed values and callbacks.
   - Worker orchestration depends on reusable emulation modules.
   - Emulation and validation do not depend on React/presentation code.
   - Browser device identities never enter the Lua contract.
   - Monaco adapters depend on pure source-index/context helpers.

6. **Runtime flows**
   - Script load and failure sequence.
   - Exact 1 ms control-step ordering.
   - Draw scheduling versus 20 fps frame transport.
   - Frame acknowledgement/backpressure.
   - Pause, visibility, reload, and worker replacement.
   - MIDI input/output and Web Audio routing.
   - Serialization and restoration.

7. **Validation flows**
   - Compile-only syntax validation.
   - Static heuristics.
   - Raw contract validation before normalization.
   - Runtime observations.
   - Versioned source-index location resolution.
   - Quality-score ownership.

8. **Contract invariants**
   - Lua 1-based versus TypeScript 0-based indexing.
   - Sparse output retention.
   - Trigger/gate ordering.
   - Parameter namespaces and offsets.
   - Browser timing disclaimers.
   - Firmware versus simulator-only metadata.
   - Draw-only API context.

9. **Subsystem map**
   - Directory-level ownership for `emulation`, `validation`, `editor`, `workbench`, `controls`, `device`, `io`, `drawer`, `testing`, and the Lua corpus.
   - Avoid a paragraph for every file; those age too quickly.

10. **Failure and recovery model**
    - Initialization timeout and worker termination.
    - Callback instruction timeout.
    - Stale worker/validation response rejection.
    - Non-fatal browser-device failures.
    - Runtime diagnostic accumulation.

11. **Testing boundaries**
    - Link to `TESTING.md`.
    - Precisely state what each test layer proves and does not prove.

12. **Extension playbooks**
    - Disting global/API.
    - Lifecycle callback.
    - Worker request/response.
    - Signal source.
    - Browser I/O route.
    - Validation rule.
    - Display/font behavior.

13. **Known limitations**
    - Short summary linking to `CONFORMANCE_STATUS.md`, without duplicating its ledger.

14. **Architectural pressure points**
    - Record the coordinator, worker, type/protocol, and browser-adapter concentration as follow-up refactoring candidates.
    - Do not mix those refactors into the documentation cleanup.

### Phase 3: Create a current conformance ledger

Add `docs/CONFORMANCE_STATUS.md` so limitations are no longer hidden in a historical audit.

Organize it by capability rather than old audit number:

- Lua runtime and lifecycle.
- Parameters and preset state.
- Buses and multi-algorithm presets.
- Stepped versus linear outputs.
- Display and smooth primitives.
- UI scripts and display modes.
- MIDI and I2C.
- Libraries and interactive console.
- Timing and performance claims.
- Hardware-confirmation backlog.

Each entry should include:

- Current support: full, partial, approximation, mock, or unsupported.
- Evidence: manual, hardware, official corpus, or simulator extension.
- User-visible consequence.
- Implementation/test references.
- Whether hardware confirmation is needed.

Do not duplicate the function-by-function API manifest. Instead, treat
[api-manifest.ts](../../../src/disting/validation/api-manifest.ts) as the detailed
machine-readable support catalog.

Re-audit the old F-01 through F-28 entries before migration. Mark resolved findings based on current code and tests, not their 2026-07-31 status text.

### Phase 4: Rewrite `AGENTS.md`

Keep `AGENTS.md` concise and operational. It should tell an agent how to change the project safely, while architecture explanations remain in the canonical document.

Proposed outline:

1. **Mission and authority**
   - Fidelity-first project goal.
   - Evidence hierarchy.
   - Production route and non-goals.

2. **Required reading by change type**
   - Runtime/protocol: architecture and testing.
   - Public Lua contract: manual, manifest, conformance status.
   - Workbench/UI: workbench guide.
   - MIDI: architecture plus manual-validation runbook.

3. **Non-negotiable invariants**
   - Worker isolation.
   - 1 ms/30 fps contract cadence versus 20 fps UI transport.
   - Sparse updates and index conversion.
   - Raw validation before normalization.
   - Versioned validation responses.
   - Browser-device ownership.
   - No calibrated hardware-performance claims.
   - Simulator extensions must be labelled.

4. **Where changes belong**
   - Machine-readable API data in the manifest.
   - Reusable behavior in `emulation/`.
   - Orchestration in workers/coordinator.
   - Presentation-only behavior in UI directories.
   - Browser adapters must remain outside the Lua contract.
   - Generated font atlases are not hand-edited.

5. **Testing matrix**
   - Focused co-located tests after every increment.
   - Lua-boundary tests for JS/Lua data crossing.
   - Corpus tests for runtime/load changes.
   - Conformance tests for public Lua behavior.
   - Rendering/model tests plus live browser checks for UI work.
   - Deployment/manual runbook for Web MIDI changes.
   - Final `npm test` and `npm run check`.

6. **Corpus policy**
   - Official and project scripts are regression evidence.
   - Never create expected-error allowlists merely to silence failures.
   - Explicitly state that corpus tests do not prove every production global adapter.

7. **Documentation obligations**
   - Update architecture only when boundaries/invariants change.
   - Update conformance status when support changes.
   - Update the workbench guide for user-facing behavior.
   - Archive completed plans instead of treating them as live specifications.

8. **Legacy/generated areas**
   - Classify `src/as/` and `src/lua/` as experiments pending a separate removal decision.
   - Identify generated atlas files and their generator.
   - Avoid accidental edits to bundled third-party scripts or notices.

9. **Completion checklist**
   - Behavior/evidence, focused regression, corpus impact, conformance, documentation, full checks, and exact reporting of anything unverified.

### Phase 5: Synchronize supporting documentation

Update the README to point to only the canonical architecture document and the new documentation index.

Correct `TESTING.md` so it distinguishes:

- Catalog/manual assertions.
- Pure emulator units.
- Wasmoon lifecycle-boundary integration.
- Production API-adapter behavior.
- Corpus regression.
- React server-rendering tests.
- Browser/manual acceptance.

Remove fixed test-result counts; they become stale immediately.

Keep `WORKBENCH_GUIDE.md` user-facing. Move architectural explanations back into `ARCHITECTURE.md` and implementation history into the archive.

Remove absolute developer-machine links and internal citation syntax from
historical Monaco documentation during archival.

### Phase 6: Add documentation guardrails

Add a small repository test or script that verifies:

- Relative Markdown links resolve.
- Canonical docs do not link to removed `src/disting/ARCHITECTURE.md`.
- No active documentation contains absolute developer-machine paths.
- Archived documents are clearly labelled historical.
- Required canonical files are linked from `docs/README.md`.
- The checked-in test commands match `package.json`.

Avoid tests that hard-code test-file or test-case counts.

### Phase 7: Verification and handoff

After the documentation changes:

```bash
npm test
npm run test:conformance
npm run check
```

Also perform a manual documentation review from three perspectives:

- A new contributor locating the correct file for a change.
- An agent determining mandatory tests and invariants.
- A maintainer checking the simulator’s actual fidelity limits.

## Definition of done

- There is exactly one canonical architecture document.
- Every document has an obvious status: canonical, runbook, active plan, or historical.
- Current limitations are visible without reading a dated audit.
- `AGENTS.md` is short enough to follow but covers all high-risk boundaries.
- Test documentation does not overstate catalog or corpus coverage.
- Experimental and generated directories are explicitly classified.
- No active document contains stale test counts, absolute local links, or contradictory support claims.
- All documentation links resolve and the complete project check passes.
