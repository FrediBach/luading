import type { DistingScriptExampleGroup } from '../script-examples'

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
