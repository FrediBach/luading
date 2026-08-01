import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    testTimeout: 10_000,
    hookTimeout: 10_000,
    coverage: {
      provider: 'v8',
      reportsDirectory: 'coverage',
      reporter: ['text', 'json-summary', 'html'],
      include: [
        'src/disting/emulation/audio-routing.ts',
        'src/disting/emulation/callback-output.ts',
        'src/disting/emulation/display-api.ts',
        'src/disting/emulation/display-bounds.ts',
        'src/disting/emulation/display-font.ts',
        'src/disting/emulation/hardware-api.ts',
        'src/disting/emulation/lua-contract.ts',
        'src/disting/emulation/lua-runtime.ts',
        'src/disting/emulation/midi-routing.ts',
        'src/disting/emulation/parameter-model.ts',
        'src/disting/emulation/preset-api.ts',
        'src/disting/emulation/runtime-helpers.ts',
        'src/disting/emulation/scope-model.ts',
        'src/disting/emulation/signal-sources.ts',
        'src/disting/emulation/web-midi.ts',
        'src/disting/validation/api-manifest.ts',
        'src/disting/validation/contract-validator.ts',
        'src/disting/validation/score.ts',
        'src/disting/validation/static-validator.ts',
      ],
      thresholds: {
        lines: 95,
        functions: 100,
        branches: 88,
        statements: 94,
      },
    },
  },
})
