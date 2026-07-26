export type CallbackOutputEntry = readonly [outputNumber: number, value: unknown]

/**
 * Converts a Lua callback result at the Wasmoon boundary.
 *
 * `undefined` means the callback returned no JavaScript value and `null` is
 * Wasmoon's representation of Lua `nil`; both mean "leave every output as-is".
 * A returned table produces entries, while `null` as this function's own return
 * value identifies an invalid non-table callback result.
 */
export function callbackOutputEntries(
  value: unknown,
): CallbackOutputEntry[] | null | undefined {
  if (value == null) return undefined
  if (Array.isArray(value)) {
    return Array.from(value.entries()).map(([index, entry]) => [index + 1, entry] as const)
  }
  if (typeof value !== 'object') return null
  return Object.entries(value)
    .map(([key, entry]) => [Number(key), entry] as const)
    .filter(([key]) => Number.isInteger(key) && key >= 1)
}
