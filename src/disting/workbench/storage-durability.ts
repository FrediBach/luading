export interface StorageDurability {
  supported: boolean
  persisted: boolean | null
  usage?: number
  quota?: number
  error?: string
}

type StorageManagerLike = Pick<StorageManager, 'persisted' | 'persist' | 'estimate'>

export async function readStorageDurability(storage?: StorageManagerLike): Promise<StorageDurability> {
  if (!storage?.persisted) return { supported: false, persisted: null }
  try {
    const [persisted, estimate] = await Promise.all([
      storage.persisted(),
      storage.estimate ? storage.estimate().catch(() => ({} as StorageEstimate)) : Promise.resolve({} as StorageEstimate),
    ])
    const usage = typeof estimate.usage === 'number' && Number.isFinite(estimate.usage)
      ? estimate.usage : undefined
    const quota = typeof estimate.quota === 'number' && Number.isFinite(estimate.quota)
      ? estimate.quota : undefined
    return {
      supported: true,
      persisted,
      ...(usage === undefined ? {} : { usage }),
      ...(quota === undefined ? {} : { quota }),
    }
  } catch (cause) {
    return {
      supported: true,
      persisted: null,
      error: cause instanceof Error ? cause.message : String(cause),
    }
  }
}

export async function requestStorageDurability(storage?: StorageManagerLike): Promise<boolean | null> {
  if (!storage?.persist) return null
  try {
    return await storage.persist()
  } catch {
    return false
  }
}
