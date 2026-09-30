import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createMetroStore } from '../store/metroStore'
import { readStoredProject, saveProject, STORAGE_KEY, type ProjectStorage } from './persistence'

class MemoryStorage implements ProjectStorage {
  readonly values = new Map<string, string>()
  setCalls = 0

  getItem(key: string): string | null {
    return this.values.get(key) ?? null
  }

  setItem(key: string, value: string): void {
    this.setCalls += 1
    this.values.set(key, value)
  }
}

describe('local project persistence', () => {
  it('recovers from corrupt storage without overwriting it, then saves after editing', () => {
    const storage = new MemoryStorage()
    storage.values.set(STORAGE_KEY, '{broken')
    const originalWarn = console.warn
    console.warn = () => undefined
    const restored = readStoredProject(storage)
    console.warn = originalWarn

    assert.ok(restored.warning)
    assert.equal(restored.project.version, 1)
    assert.equal(storage.getItem(STORAGE_KEY), '{broken')
    assert.equal(storage.setCalls, 0)

    const store = createMetroStore({
      initialProject: restored.project,
      initialWarning: restored.warning,
      idFactory: () => 'line-1',
      persist: (project) => saveProject(project, storage),
    })
    store.getState().createLine()

    assert.equal(storage.setCalls, 1)
    assert.equal(JSON.parse(storage.getItem(STORAGE_KEY) ?? '{}').lines['line-1'].id, 'line-1')
  })
})
