import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { emptyProject } from '../models/metro'
import { createMetroStore } from '../store/metroStore'
import { LEGACY_STORAGE_KEY, parseProjectJson, readStoredProject, saveProject, STORAGE_KEY, type ProjectStorage } from './persistence'

class MemoryStorage implements ProjectStorage {
  readonly values = new Map<string, string>()
  setCalls = 0
  failWrites = false
  failRemovals = false

  getItem(key: string): string | null { return this.values.get(key) ?? null }
  setItem(key: string, value: string): void {
    this.setCalls += 1
    if (this.failWrites) throw new Error('quota exceeded')
    this.values.set(key, value)
  }
  removeItem(key: string): void {
    if (this.failRemovals) throw new Error('remove denied')
    this.values.delete(key)
  }
}

const oldProject = () => ({
  version: 1, name: '旧规划',
  stations: { s1: { id: 's1', name: '甲', lng: 114.3, lat: 30.5 }, s2: { id: 's2', name: '乙', lng: 114.4, lat: 30.6 } },
  lines: { l1: { id: 'l1', name: '老线', color: '#2878b9', stationIds: ['s1', 's2'] } },
})

describe('local project persistence', () => {
  it('recovers from corrupt storage without overwriting it, then saves after editing', () => {
    const storage = new MemoryStorage()
    storage.values.set(STORAGE_KEY, '{broken')
    const originalWarn = console.warn
    console.warn = () => undefined
    const restored = readStoredProject(storage)
    console.warn = originalWarn
    assert.ok(restored.warning)
    assert.equal(restored.project.version, 2)
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

  it('automatically upgrades old-key v1, writes v2, then deletes old key', () => {
    const storage = new MemoryStorage()
    storage.values.set(LEGACY_STORAGE_KEY, JSON.stringify(oldProject()))
    const restored = readStoredProject(storage)
    assert.equal(restored.warning, null)
    assert.equal(restored.project.version, 2)
    assert.deepEqual(restored.project.lines.l1.nodes.map((node) => node.id), ['s1', 's2'])
    assert.equal(JSON.parse(storage.getItem(STORAGE_KEY) ?? '{}').version, 2)
    assert.equal(storage.getItem(LEGACY_STORAGE_KEY), null)
    assert.equal(storage.setCalls, 1)
  })

  it('preserves old key and reports failure when new-key write fails', () => {
    const storage = new MemoryStorage()
    const raw = JSON.stringify(oldProject())
    storage.values.set(LEGACY_STORAGE_KEY, raw)
    storage.failWrites = true
    const originalWarn = console.warn
    console.warn = () => undefined
    const restored = readStoredProject(storage)
    console.warn = originalWarn
    assert.ok(restored.warning?.includes('升级或读取失败'))
    assert.equal(storage.getItem(LEGACY_STORAGE_KEY), raw)
    assert.equal(storage.getItem(STORAGE_KEY), null)
  })

  it('keeps the upgraded project available if legacy-key cleanup fails', () => {
    const storage = new MemoryStorage()
    storage.values.set(LEGACY_STORAGE_KEY, JSON.stringify(oldProject()))
    storage.failRemovals = true
    const originalWarn = console.warn
    console.warn = () => undefined
    const restored = readStoredProject(storage)
    console.warn = originalWarn
    assert.equal(restored.project.version, 2)
    assert.ok(restored.warning?.includes('清理失败'))
    assert.ok(storage.getItem(LEGACY_STORAGE_KEY))
    assert.equal(JSON.parse(storage.getItem(STORAGE_KEY) ?? '{}').version, 2)
  })

  it('does not delete corrupt old-key data', () => {
    const storage = new MemoryStorage()
    storage.values.set(LEGACY_STORAGE_KEY, '{broken')
    const originalWarn = console.warn
    console.warn = () => undefined
    const restored = readStoredProject(storage)
    console.warn = originalWarn
    assert.ok(restored.warning)
    assert.equal(storage.getItem(LEGACY_STORAGE_KEY), '{broken')
  })

  it('reads stable key first when both keys exist', () => {
    const storage = new MemoryStorage()
    storage.values.set(STORAGE_KEY, JSON.stringify(emptyProject('新项目')))
    storage.values.set(LEGACY_STORAGE_KEY, JSON.stringify(oldProject()))
    assert.equal(readStoredProject(storage).project.name, '新项目')
    assert.ok(storage.getItem(LEGACY_STORAGE_KEY))
  })

  it('upgrades v1 stored under the stable key and preserves it if rewriting fails', () => {
    const storage = new MemoryStorage()
    const raw = JSON.stringify(oldProject())
    storage.values.set(STORAGE_KEY, raw)
    assert.equal(readStoredProject(storage).project.version, 2)
    assert.equal(JSON.parse(storage.getItem(STORAGE_KEY) ?? '{}').version, 2)
    storage.values.set(STORAGE_KEY, raw)
    storage.failWrites = true
    const originalWarn = console.warn
    console.warn = () => undefined
    const restored = readStoredProject(storage)
    console.warn = originalWarn
    assert.ok(restored.warning)
    assert.equal(storage.getItem(STORAGE_KEY), raw)
  })

  it('saves new projects under the stable key as v2', () => {
    const storage = new MemoryStorage()
    saveProject(emptyProject(), storage)
    assert.equal(JSON.parse(storage.getItem(STORAGE_KEY) ?? '{}').version, 2)
    assert.equal(storage.getItem(LEGACY_STORAGE_KEY), null)
  })

  it('still reads a previously saved city project from the stable key', () => {
    const storage = new MemoryStorage()
    const project = { ...emptyProject('旧城市编辑'), cityId: 'wuhan' }
    storage.values.set(STORAGE_KEY, JSON.stringify(project))
    const restored = readStoredProject(storage)
    assert.equal(restored.warning, null)
    assert.equal(restored.project.cityId, 'wuhan')
    assert.equal(restored.project.name, '旧城市编辑')
  })

  it('imports v1 JSON and returns v2 for export', () => {
    const project = parseProjectJson(JSON.stringify(oldProject()))
    assert.equal(project.version, 2)
    assert.ok(Array.isArray(project.lines.l1.nodes))
    assert.equal(Object.hasOwn(project.lines.l1, 'stationIds'), false)
  })
})
