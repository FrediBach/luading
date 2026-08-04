import { IDBFactory } from 'fake-indexeddb'
import { describe, expect, it, vi } from 'vitest'
import {
  IndexedDbProjectStore,
  PROJECT_DATABASE_NAME,
  PROJECT_DATABASE_VERSION,
} from './indexeddb-project-store'
import { createProjectBackup } from './project-backup'
import { createScriptProject } from './projects'

const makeProject = (id: string, source = '-- original') => createScriptProject({
  id, filename: `${id}.lua`, source, modules: {}, origin: { kind: 'new' }, now: 1,
})

function open(factory: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = factory.open(PROJECT_DATABASE_NAME, PROJECT_DATABASE_VERSION)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
    transaction.onabort = () => reject(transaction.error)
  })
}

describe('IndexedDB project store', () => {
  it('creates schema version one and hydrates defensively copied records', async () => {
    const factory = new IDBFactory()
    const store = new IndexedDbProjectStore(factory)
    await store.createProject(makeProject('one'))
    const database = await open(factory)
    expect(database.version).toBe(1)
    expect([...database.objectStoreNames]).toEqual(['metadata', 'projects'])
    const transaction = database.transaction('projects')
    expect([...transaction.objectStore('projects').indexNames]).toEqual([
      'deletedAt', 'lastOpenedAt', 'updatedAt',
    ])
    expect((await store.hydrate()).projects).toMatchObject([{ id: 'one', revision: 1 }])
    database.close()
    store.close()
  })

  it('quarantines malformed records without hiding valid projects', async () => {
    const factory = new IDBFactory()
    const store = new IndexedDbProjectStore(factory)
    await store.createProject(makeProject('valid'))
    const database = await open(factory)
    const transaction = database.transaction('projects', 'readwrite')
    transaction.objectStore('projects').add({ id: 'bad', filename: '../bad.lua' })
    await transactionDone(transaction)
    await expect(store.hydrate()).resolves.toMatchObject({
      projects: [{ id: 'valid' }], quarantinedCount: 1,
    })
    database.close()
    store.close()
  })

  it('atomically creates a conflict copy for a stale tab', async () => {
    const factory = new IDBFactory()
    const first = new IndexedDbProjectStore(factory)
    const second = new IndexedDbProjectStore(factory)
    await first.createProject(makeProject('shared'))
    await first.saveProject({
      projectId: 'shared', expectedRevision: 1, source: '-- first', modules: {},
      filename: 'shared.lua', now: 2, conflictId: 'unused',
    })
    const result = await second.saveProject({
      projectId: 'shared', expectedRevision: 1, source: '-- stale', modules: {},
      filename: 'shared.lua', now: 3, conflictId: 'conflict',
    })
    expect(result).toMatchObject({ kind: 'conflict', project: { id: 'conflict', source: '-- stale' } })
    const projects = (await first.hydrate()).projects
    expect(projects.find(({ id }) => id === 'shared')).toMatchObject({ source: '-- first', revision: 2 })
    expect(projects.find(({ id }) => id === 'conflict')).toMatchObject({ source: '-- stale', revision: 1 })
    first.close()
    second.close()
  })

  it('imports an already-validated backup in one transaction', async () => {
    const factory = new IDBFactory()
    const store = new IndexedDbProjectStore(factory)
    const backup = createProjectBackup([makeProject('a'), makeProject('b')], 4)
    await expect(store.importBackup(backup, vi.fn(() => 'replacement'), 5)).resolves.toMatchObject({
      created: [{ id: 'a' }, { id: 'b' }], skipped: 0, renamed: 0,
    })
    expect((await store.hydrate()).projects).toHaveLength(2)
    store.close()
  })

  it('closes a superseded connection on versionchange', async () => {
    const factory = new IDBFactory()
    const invalidated = vi.fn()
    const store = new IndexedDbProjectStore(factory, invalidated)
    await store.hydrate()
    const upgrade = factory.open(PROJECT_DATABASE_NAME, 2)
    await new Promise<void>((resolve, reject) => {
      upgrade.onupgradeneeded = () => undefined
      upgrade.onsuccess = () => {
        upgrade.result.close()
        resolve()
      }
      upgrade.onerror = () => reject(upgrade.error)
    })
    expect(invalidated).toHaveBeenCalledOnce()
    store.close()
  })
})
