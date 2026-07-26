import { defineConfig } from 'vite'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import type { Plugin } from 'vite'

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
    stubNodeBuiltins,
  ],
})
