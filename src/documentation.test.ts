import {
  existsSync,
  readFileSync,
  readdirSync,
  type Dirent,
} from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

interface PackageJson {
  scripts?: Record<string, string>
}

interface MarkdownLink {
  destination: string
  file: string
  resolvedPath: string
}

const root = fileURLToPath(new URL('../', import.meta.url))
const docsDirectory = resolve(root, 'docs')
const archiveDirectory = resolve(docsDirectory, 'archive')

function markdownFilesIn(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(
    (entry: Dirent) => {
      const entryPath = resolve(directory, entry.name)

      if (entry.isDirectory()) {
        return markdownFilesIn(entryPath)
      }

      return entry.isFile() && entry.name.endsWith('.md') ? [entryPath] : []
    },
  )
}

const rootMarkdownFiles = readdirSync(root, { withFileTypes: true })
  .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
  .map((entry) => resolve(root, entry.name))
const documentationFiles = [...rootMarkdownFiles, ...markdownFilesIn(docsDirectory)]
const archivedFiles = documentationFiles.filter((file) =>
  file.startsWith(`${archiveDirectory}/`),
)
const activeFiles = documentationFiles.filter(
  (file) => !file.startsWith(`${archiveDirectory}/`),
)

function projectPath(path: string): string {
  return relative(root, path)
}

function localMarkdownLinks(file: string): MarkdownLink[] {
  const markdown = readFileSync(file, 'utf8')
  const linkPattern = /!?\[[^\]]*\]\((<[^>]+>|[^)\s]+)(?:\s+["'][^"']*["'])?\)/g
  const links: MarkdownLink[] = []

  for (const match of markdown.matchAll(linkPattern)) {
    const rawDestination = match[1]
    if (!rawDestination) continue

    const destination = rawDestination.startsWith('<')
      ? rawDestination.slice(1, -1)
      : rawDestination

    if (
      destination.startsWith('#') ||
      destination.startsWith('//') ||
      /^[a-z][a-z\d+.-]*:/i.test(destination)
    ) {
      continue
    }

    const pathOnly = destination.split(/[?#]/, 1)[0]
    if (!pathOnly) continue

    let decodedPath: string
    try {
      decodedPath = decodeURIComponent(pathOnly)
    } catch {
      decodedPath = pathOnly
    }

    links.push({
      destination,
      file,
      resolvedPath: resolve(dirname(file), decodedPath),
    })
  }

  return links
}

describe('documentation guardrails', () => {
  it('keeps every local Markdown link resolvable', () => {
    const brokenLinks = documentationFiles
      .flatMap(localMarkdownLinks)
      .filter((link) => !existsSync(link.resolvedPath))
      .map(
        (link) =>
          `${projectPath(link.file)} -> ${link.destination} (${projectPath(link.resolvedPath)})`,
      )

    expect(brokenLinks).toEqual([])
  })

  it('does not link active documents to the removed duplicate architecture', () => {
    const staleLinks = activeFiles
      .flatMap(localMarkdownLinks)
      .filter((link) =>
        link.destination.includes('src/disting/ARCHITECTURE.md'),
      )
      .map((link) => `${projectPath(link.file)} -> ${link.destination}`)

    expect(staleLinks).toEqual([])
  })

  it('keeps developer-machine paths out of active documentation', () => {
    const machinePathPattern = /(?:\/(?:Users|home)\/[^\s`<>)]+|[A-Za-z]:\\Users\\[^\s`<>)]+)/g
    const occurrences = activeFiles.flatMap((file) => {
      const matches = readFileSync(file, 'utf8').match(machinePathPattern) ?? []
      return matches.map((match) => `${projectPath(file)} -> ${match}`)
    })

    expect(occurrences).toEqual([])
  })

  it('labels every archived Markdown document as historical', () => {
    const unlabelledFiles = archivedFiles
      .filter((file) => {
        const openingLines = readFileSync(file, 'utf8').split('\n').slice(0, 12)
        return !openingLines.some((line) =>
          line.startsWith('> **Historical snapshot.**'),
        )
      })
      .map(projectPath)

    expect(unlabelledFiles).toEqual([])
  })

  it('links every required current reference from the documentation map', () => {
    const indexPath = resolve(docsDirectory, 'README.md')
    const linkedPaths = new Set(
      localMarkdownLinks(indexPath).map((link) => link.resolvedPath),
    )
    const requiredPaths = [
      'docs/ARCHITECTURE.md',
      'docs/CONFORMANCE_STATUS.md',
      'docs/TESTING.md',
      'docs/WORKBENCH_GUIDE.md',
      'docs/MIDI_MANUAL_VALIDATION.md',
      'docs/Disting NT Lua Scripting 1.12.pdf',
      'docs/Disting NT Lua Scripting.md',
      'src/disting/validation/api-manifest.ts',
    ].map((path) => resolve(root, path))
    const missingPaths = requiredPaths
      .filter((path) => !linkedPaths.has(path))
      .map(projectPath)

    expect(missingPaths).toEqual([])
  })

  it('keeps documented test commands synchronized with package scripts', () => {
    const packageJson = JSON.parse(
      readFileSync(resolve(root, 'package.json'), 'utf8'),
    ) as PackageJson
    const scripts = packageJson.scripts ?? {}
    const testingGuide = readFileSync(resolve(docsDirectory, 'TESTING.md'), 'utf8')
    const documentedCommands = new Set(
      [...testingGuide.matchAll(/^npm (test|run [\w:-]+)/gm)].map(
        (match) => `npm ${match[1]}`,
      ),
    )
    const expectedCommands = Object.keys(scripts)
      .filter(
        (script) =>
          script === 'test' || script.startsWith('test:') || script === 'check',
      )
      .map((script) => (script === 'test' ? 'npm test' : `npm run ${script}`))
      .sort()
    const unknownCommands = activeFiles.flatMap((file) =>
      [...readFileSync(file, 'utf8').matchAll(/\bnpm run ([\w:-]+)/g)]
        .filter((match) => !scripts[match[1]])
        .map((match) => `${projectPath(file)} -> npm run ${match[1]}`),
    )

    expect([...documentedCommands].sort()).toEqual(expectedCommands)
    expect(unknownCommands).toEqual([])
  })
})
