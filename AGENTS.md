# Luading contributor instructions

## Project goal

Luading - Disting NT Lua Simulator is a browser-based development workbench for
writing, running, and validating Lua scripts for the Expert Sleepers Disting NT.

The primary goal is behavioral fidelity to the Disting NT Lua contract. Prefer
documented hardware behavior over simulator convenience. The local
`docs/Disting NT Lua Scripting 1.12.pdf` manual is the current contract source,
while real Disting NT hardware remains the final authority.

The production simulator is served at `/`. The legacy `/disting` path is only a
compatibility redirect.

## Engineering priorities

1. Preserve the documented Lua lifecycle, API, constants, parameter forms,
   display behavior, MIDI filtering, preset state, and bus semantics.
2. Keep Lua execution isolated and deterministic enough for repeatable tests.
3. Clearly distinguish hardware contract findings, simulator compatibility
   findings, and browser-local performance measurements.
4. Never present browser timing as calibrated Disting NT CPU usage.
5. Keep every bundled Lua script loadable and executable through the real
   Wasmoon boundary.

## Implementation guidance

- Keep firmware-facing API metadata in
  `src/disting/validation/api-manifest.ts`.
- Put reusable emulator behavior in `src/disting/emulation/` rather than
  duplicating it in UI components, workers, or tests.
- Tests that cross the JavaScript/Lua boundary must use the production runtime
  bridge and the reusable test environment where possible.
- Add a focused regression test for every bug fix.
- Add or update manual conformance tests whenever public Disting behavior
  changes.
- Update the bundled-script corpus expectations only after confirming the
  behavior against the manual or hardware. Do not silence unexpected failures
  by blindly accepting new expected errors.
- Preserve the distinction between stepped and linear outputs, sparse output
  updates, 1-based Lua indices, 1 ms control steps, and 30 fps drawing.

Read `docs/ARCHITECTURE.md` before changing worker boundaries, Lua runtime
behavior, typed messages, or validation responsibilities. See `docs/TESTING.md`
for the detailed test matrix and coverage policy.

## Required test workflow

Tests are mandatory after every new implementation.

1. After each coherent implementation increment, run the most focused relevant
   test file or test group.
2. After the implementation is complete, run the entire test suite:

   ```bash
   npm test
   ```

3. Before handing work back, run the complete project check:

   ```bash
   npm run check
   ```

   This must pass linting, coverage thresholds, and the production build.

4. When changing the public Lua contract, also run:

   ```bash
   npm run test:conformance
   ```

Do not describe implementation work as complete while required tests are
failing. If an environment limitation prevents a command from running, report
the exact unverified command and reason.

## Completion standard

A change is complete only when:

- the implementation matches the documented Disting behavior;
- new or changed behavior has automated coverage;
- affected bundled scripts still pass the corpus tests;
- `npm run check` succeeds; and
- relevant documentation is updated.
