export type DistingScriptExample = {
  id: string
  name: string
  group: string
  source: string
  modules: Record<string, string>
}

export type DistingScriptExampleGroup = {
  name: string
  examples: DistingScriptExample[]
}

const scriptFiles = import.meta.glob('../../lua-scripts/*/*.lua', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

const moduleFiles = import.meta.glob('../../lua-scripts/*/lib/*.lua', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

const groupDisplayNames: Record<string, string> = {
  'fredi-bach': 'Luading',
}

function displayName(value: string) {
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/\b[a-z]/g, (letter) => letter.toUpperCase())
}

const modulesByGroup = Object.entries(moduleFiles).reduce<Record<string, Record<string, string>>>(
  (groups, [path, source]) => {
    const match = path.match(/\/lua-scripts\/([^/]+)\/lib\/([^/]+)\.lua$/)
    if (!match) return groups

    const [, group, moduleName] = match
    groups[group] ??= {}
    groups[group][moduleName] = source
    return groups
  },
  {},
)

const examplesByGroup = Object.entries(scriptFiles)
  .reduce<Record<string, DistingScriptExample[]>>((groups, [path, source]) => {
    const match = path.match(/\/lua-scripts\/([^/]+)\/([^/]+)\.lua$/)
    if (!match) return groups

    const [, group, filename] = match
    groups[group] ??= []
    groups[group].push({
      id: `${group}/${filename}`,
      name: displayName(filename),
      group,
      source,
      modules: modulesByGroup[group] ?? {},
    })
    return groups
  }, {})

export const DISTING_SCRIPT_GROUPS = Object.entries(examplesByGroup)
  .map(([group, examples]) => ({
    name: groupDisplayNames[group] ?? displayName(group),
    examples: examples.sort((left, right) => left.name.localeCompare(right.name)),
  }))
  .sort((left, right) => left.name.localeCompare(right.name))

export const DISTING_SCRIPT_EXAMPLES = new Map(
  DISTING_SCRIPT_GROUPS.flatMap(({ examples }) => examples.map((example) => [example.id, example])),
)
