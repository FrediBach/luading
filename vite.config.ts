import { defineConfig } from 'vite'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import { spawnSync } from 'child_process'
import { existsSync } from 'fs'
import { resolve } from 'path'
import type { Plugin, ViteDevServer } from 'vite'

// ── AssemblyScript plugin ─────────────────────────────────────────────────────
// Compiles src/as/assembly/**/*.ts → src/as/build/assembly.wasm via asc.
// On file change during dev, recompiles and sends a full-page reload so the
// browser re-fetches the updated .wasm binary.
function assemblyScriptPlugin(): Plugin {
  const projectRoot = 'src/as'
  const entryFile = `${projectRoot}/assembly/index.ts`
  const ascBin = resolve('node_modules/.bin/asc')
  const configFile = `${projectRoot}/asconfig.json`

  function compile(mode: 'debug' | 'release') {
    console.log(`[asc] compiling (${mode})…`)
    const result = spawnSync(
      ascBin,
      [entryFile, '--config', configFile, '--target', mode],
      { stdio: 'inherit', cwd: process.cwd() },
    )
    if (result.status !== 0) {
      console.error('[asc] compilation failed')
    } else {
      console.log('[asc] done')
    }
  }

  return {
    name: 'assemblyscript',

    // Initial compile when the dev server starts / build begins
    buildStart() {
      if (!existsSync(ascBin)) {
        throw new Error(`[asc] compiler not found at ${ascBin}`)
      }
      compile(this.meta.watchMode ? 'debug' : 'release')
    },

    // Watch .ts files inside src/as/assembly/
    configureServer(server: ViteDevServer) {
      const watchGlob = resolve(projectRoot, 'assembly/**/*.ts')
      server.watcher.add(watchGlob)

      server.watcher.on('change', (file) => {
        if (!file.includes(`${projectRoot}/assembly`)) return

        compile('debug')

        // Full reload — the .wasm is fetched via fetch() at runtime, not
        // imported as an ES module, so a module-graph invalidation isn't enough.
        server.ws.send({ type: 'full-reload' })
      })
    },
  }
}

// ── Node built-in stubs ───────────────────────────────────────────────────────
// wasmoon imports Node built-ins (fs, path, …) inside guards that never run
// in the browser, but the bundler still resolves them statically.
const stubNodeBuiltins: Plugin = {
  name: 'stub-node-builtins',
  resolveId(id) {
    const stubs = new Set(['path', 'fs', 'child_process', 'crypto', 'url', 'module'])
    if (stubs.has(id)) return `\0stub:${id}`
  },
  load(id) {
    if (id.startsWith('\0stub:')) return 'export default {}'
  },
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    babel({ presets: [reactCompilerPreset()] }),
    assemblyScriptPlugin(),
    stubNodeBuiltins,
  ],
})
