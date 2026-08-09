import { resolve } from 'node:path'
import { createServer } from 'vite'

const root = resolve(import.meta.dirname, '..')
const server = await createServer({
  root,
  configFile: false,
  appType: 'custom',
  optimizeDeps: { noDiscovery: true },
  server: { middlewareMode: true, hmr: false, ws: false },
})

try {
  const exporter = await server.ssrLoadModule('/tools/export-display-component-library-svg.ts')
  const outputPath = exporter.writeDisplayComponentLibrarySvg(process.argv[2] && resolve(process.argv[2]))
  console.log(`Exported ${outputPath}`)
} finally {
  await server.close()
}
