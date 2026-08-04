import { describe, expect, it } from 'vitest'
import { readStorageDurability, requestStorageDurability } from './storage-durability'

describe('browser storage durability capability', () => {
  it('reports granted durability and finite estimates only', async () => {
    await expect(readStorageDurability({
      persisted: async () => true,
      persist: async () => true,
      estimate: async () => ({ usage: 12, quota: Number.POSITIVE_INFINITY }),
    })).resolves.toEqual({ supported: true, persisted: true, usage: 12 })
  })

  it('degrades unsupported, declined, and throwing APIs without blocking the library', async () => {
    await expect(readStorageDurability()).resolves.toEqual({ supported: false, persisted: null })
    await expect(requestStorageDurability({
      persisted: async () => false,
      persist: async () => false,
      estimate: async () => ({}),
    })).resolves.toBe(false)
    await expect(requestStorageDurability({
      persisted: async () => false,
      persist: async () => { throw new Error('denied') },
      estimate: async () => ({}),
    })).resolves.toBe(false)
  })
})
