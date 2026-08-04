import type { DistingScriptExampleGroup } from '../script-examples'
import type { ScriptProject } from './projects'

export function filterScriptGroups(
  groups: DistingScriptExampleGroup[],
  query: string,
) {
  const normalizedQuery = query.trim().toLocaleLowerCase()
  if (!normalizedQuery) return groups

  return groups.flatMap((group) => {
    const groupMatches = group.name.toLocaleLowerCase().includes(normalizedQuery)
    const examples = groupMatches
      ? group.examples
      : group.examples.filter((example) => (
          example.name.toLocaleLowerCase().includes(normalizedQuery)
          || example.id.toLocaleLowerCase().includes(normalizedQuery)
        ))
    return examples.length > 0 ? [{ ...group, examples }] : []
  })
}

export function filterScriptProjects(projects: ScriptProject[], query: string): ScriptProject[] {
  const normalizedQuery = query.trim().toLocaleLowerCase()
  if (!normalizedQuery || 'my scripts'.includes(normalizedQuery)) return projects
  return projects.filter((project) => project.filename.toLocaleLowerCase().includes(normalizedQuery))
}
