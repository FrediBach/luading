# Luading - Disting NT Lua Simulator

Luading is a browser-based development workbench for writing, running, and
validating Lua scripts for the Expert Sleepers Disting NT.

The simulator runs at the site root (`/`). The former `/disting` URL is retained
as a permanent redirect in the Vercel configuration.

## What it does

- Runs a persistent Lua 5.4 VM in an isolated Web Worker
- Simulates the Disting NT lifecycle callbacks, including `init`, `step`,
  `trigger`, `gate`, `draw`, MIDI, UI, and preset state
- Provides editable CV, gate, trigger, clock, parameter, and front-panel inputs
- Renders the 256×64 display and output traces in real time
- Routes simulated outputs through Web Audio
- Includes Monaco-based editing, Disting NT completions, diagnostics, and source
  navigation
- Validates script contracts and assigns a quality score for API portability,
  real-time safety, contract use, and clarity
- Reports average, p95, and maximum callback timing against the browser-local
  1 ms control-step budget
- Includes bundled example scripts and their Lua modules

The performance measurements describe the current browser only. They are not a
calibrated estimate of Disting NT hardware CPU usage.

## Requirements

- Node.js 24
- npm 10 or newer

## Local development

```bash
npm ci
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

## Quality checks

```bash
npm test
npm run lint
npm run build
```

The production build is written to `dist/`.

## Project structure

```text
src/disting/                 Simulator UI, worker, emulation, and validation
lua-scripts/expert-sleepers/ Bundled community example scripts
lua-scripts/fredi-bach/      Additional bundled example scripts
docs/                        Disting NT Lua scripting reference
```

See [`src/disting/ARCHITECTURE.md`](src/disting/ARCHITECTURE.md) for the
emulation boundaries and contribution guidance.

## Deploying to Vercel

The repository includes `vercel.json` with the Vite build settings and the
legacy `/disting` redirects. No environment variables are required.

To create or link the Vercel project and deploy a preview:

```bash
vercel
```

To deploy the current revision to production:

```bash
vercel --prod
```

Vercel can also import the repository through its dashboard. Use the repository
root as the project root; the framework, build command, and output directory are
already configured.

## Disclaimer

Luading is an independent community project. It is not affiliated with or
endorsed by Expert Sleepers. Hardware behavior remains the source of truth.

## License

This project is licensed under the terms in [`LICENSE`](LICENSE).
