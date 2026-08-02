# Luading contributor instructions

## Mission and authority

Luading is a browser workbench for writing, running, and validating Expert
Sleepers Disting NT Lua scripts. Behavioral fidelity takes priority over
simulator convenience.

When evidence conflicts, use this order:

1. Reproducible behavior observed on real Disting NT hardware.
2. `docs/Disting NT Lua Scripting 1.12.pdf`.
3. Official scripts as compatibility evidence, not automatic contract evidence.
4. The simulator implementation, tests, and `api-manifest.ts` support metadata.
5. Browser-only extensions, explicitly labelled as simulator conveniences.

Record hardware observations with the firmware version and reproduction steps.
The Markdown manual is a searchable extraction, not an independent authority.

The production application is served at `/`; `/disting` is only a compatibility
redirect. Luading is not cycle-accurate hardware emulation and must never present
browser timing as calibrated Disting NT CPU usage.

## Required reading by change type

| Change | Read first |
| --- | --- |
| Worker boundary, runtime, scheduling, state ownership, or typed protocol | `docs/ARCHITECTURE.md` and `docs/TESTING.md` |
| Public Lua API, constants, callbacks, parameters, display, preset, or buses | The official PDF, `src/disting/validation/api-manifest.ts`, `docs/CONFORMANCE_STATUS.md`, and relevant architecture/testing sections |
| Workbench, controls, responsive behavior, or other user-facing UI | `docs/WORKBENCH_GUIDE.md`; also architecture when state or worker messages are involved |
| Web MIDI or browser routing | `docs/ARCHITECTURE.md`, `docs/TESTING.md`, and `docs/MIDI_MANUAL_VALIDATION.md` |
| Documentation structure or authority | `docs/README.md` |

## Non-negotiable invariants

- The simulation worker owns the Lua VM, callbacks, clock, parameters, inputs,
  outputs, and 1 ms control loop. React components never reach into worker
  state.
- Simulation steps are 1 ms, Lua drawing targets 30 fps, and main-thread frame
  transport is 20 fps with commit acknowledgement. These cadences are distinct.
- Sample inputs, dispatch trigger/gate edges, apply sparse edge outputs, run
  `step()`, apply sparse step outputs, then advance time and trace state.
- Lua indices are 1-based; TypeScript arrays and UI protocol indices are
  0-based. Convert only at explicit boundaries.
- Missing callback results and absent output-table entries retain prior output
  voltages. Never zero-fill sparse updates.
- Validate raw program/`init()` values before normalization can hide invalid
  forms. Blocking contract errors must prevent execution.
- Validation diagnostics, source indexes, navigation, and edits are accepted
  only for the current source version.
- DOM, storage, file APIs, Web Audio, Web MIDI permissions, and physical device
  identities stay on the main thread and outside the Lua contract.
- Browser callback timing and `getCpuCycleCount()` are local approximations, not
  hardware-performance measurements.
- Simulator-only annotations, generators, routes, and control affordances must
  be labelled as extensions and must not become firmware-facing globals.

## Where changes belong

- Put structured firmware-facing API, constant, lifecycle, provenance, and
  support metadata in `src/disting/validation/api-manifest.ts`.
- Put reusable runtime, contract, parameter, signal, display, routing, and
  state-model behavior in `src/disting/emulation/` with focused tests.
- Keep scheduling and adapter registration in `disting.worker.ts`; keep worker
  lifetime and browser coordination in `DistingPlayground.tsx`.
- Put syntax/static/raw-contract rules, source indexing, diagnostic actions, and
  scoring in `src/disting/validation/`. Only `score.ts` owns score penalties.
- Keep Monaco adapters in `editor/` and their cursor/source analysis pure where
  possible.
- Keep presentation-only behavior in `workbench/`, `controls/`, `device/`,
  `io/`, and `drawer/`. Components consume typed values and callbacks.
- Browser adapters may translate between physical devices and typed
  bytes/voltages, but device identities and permissions must never enter the
  simulation worker or Lua API.
- Do not hand-edit `standard-font-atlas.generated.ts` or
  `tiny-font-atlas.generated.ts`; regenerate them with
  `tools/generate-display-font-atlas.c`.

## Required test workflow

Tests are mandatory after every implementation increment.

1. Run the most focused co-located test file or group after each coherent
   increment. Every bug fix needs a focused regression test.
2. Add a real Wasmoon/Lua-boundary test whenever data crosses JavaScript and
   Lua. Use the production runtime bridge and reusable test environment.
3. Run corpus tests for runtime, load, lifecycle, module, adapter-surface, or
   contract changes that could affect bundled scripts.
4. Run `npm run test:conformance` whenever public Lua behavior, metadata,
   provenance, or support status changes.
5. For UI work, add pure model/rendering/accessibility coverage and perform
   relevant live browser checks. Report the exact unverified matrix when a
   browser backend is unavailable.
6. For Web MIDI work, run automated routing/deployment tests and complete the
   applicable `docs/MIDI_MANUAL_VALIDATION.md` matrix when a deployment/device
   environment is available.
7. After implementation, run the complete suite:

   ```bash
   npm test
   ```

8. Before handoff, run the complete project check:

   ```bash
   npm run check
   ```

`npm run check` must pass linting, coverage thresholds, TypeScript, the full
test suite, and the production build. Do not describe work as complete while a
required check is failing. If an environment prevents a check, report the exact
command and reason.

## Corpus policy

The official and project Lua scripts are regression and compatibility evidence.
Keep every bundled script loadable and executable through the real Wasmoon
boundary. Correct confirmed invalid metadata in the bundled copy; never create
or expand an expected-error allowlist merely to silence a new failure.

Corpus tests use controlled/no-op adapters for many Disting globals. They prove
chunk/lifecycle/table-boundary compatibility, not every production worker
adapter, complete preset behavior, visual parity, or hardware conformance.

## Documentation obligations

- Update `docs/ARCHITECTURE.md` only when boundaries, ownership, flows,
  invariants, recovery, or extension rules change.
- Update `docs/CONFORMANCE_STATUS.md` whenever public support, evidence, a known
  limitation, or the hardware-confirmation backlog changes.
- Update `docs/WORKBENCH_GUIDE.md` for user-visible behavior.
- Update `docs/TESTING.md` when a test layer's guarantee or limitation changes.
- Record environment-specific MIDI evidence in the manual-validation runbook.
- Keep active plans under `docs/plans/`; archive completed plans with a dated
  historical banner instead of treating them as current specifications.

## Legacy, generated, and third-party areas

- `src/as/` and `src/lua/` are tracked experiments outside the production
  workbench. Do not extend, remove, or present them as architecture without a
  separate explicit decision.
- Generated font atlases retain their generator and license headers.
- Treat bundled official/community Lua scripts as imported compatibility
  material. Avoid unrelated rewrites and preserve applicable notices.
- Keep `THIRD_PARTY_NOTICES.md`, source license headers, and attributed font or
  script licenses intact.

## Completion checklist

A change is complete only when:

- behavior matches the strongest available evidence and simulator extensions
  are clearly separated;
- focused regression and boundary tests cover the changed behavior;
- affected corpus and conformance expectations remain valid;
- relevant current documentation is updated;
- `npm test` and `npm run check` pass; and
- any unavailable browser, deployment, device, or hardware verification is
  reported precisely rather than implied complete.
