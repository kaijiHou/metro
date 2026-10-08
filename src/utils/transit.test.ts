import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { emptyProject } from '../models/metro'
import { createMetroStore } from '../store/metroStore'
import { CITY_PROJECT_PREFIX, readCityProject } from './cityProjects'
import { lineFeatureCollection, nearestLineInsertIndex, stationLineCounts } from './geojson'
import { parseProjectJson, saveProject, STORAGE_KEY, type ProjectStorage } from './persistence'
import { findTransitCity, parseCityCatalog } from './transit'
import { validateProject } from './validation'

const readData = (name: string) => JSON.parse(readFileSync(new URL(`../../public/transit/${name}.json`, import.meta.url), 'utf8'))
const cityProject = (id: string) => validateProject(readData(id).project)

class MemoryStorage implements ProjectStorage {
  values = new Map<string, string>()
  failWrites = false
  getItem(key: string) { return this.values.get(key) ?? null }
  setItem(key: string, value: string) { if (this.failWrites) throw new Error('quota'); this.values.set(key, value) }
  removeItem(key: string) { this.values.delete(key) }
}

describe('editable real city networks', () => {
  it('validates every bundled city and its counts, bounds, provenance and interchange references', () => {
    const cities = parseCityCatalog(readData('catalog'))
    assert.ok(cities.length >= 58)
    for (const city of cities) {
      const data = readData(city.id)
      const project = validateProject(data.project)
      assert.equal(project.cityId, city.id)
      assert.equal(Object.keys(project.lines).length, city.lineCount, city.name)
      assert.equal(Object.keys(project.stations).length, city.stationCount, city.name)
      assert.match(data.city.sourceSha256, /^[a-f0-9]{64}$/)
      assert.equal(data.city.retrievedAt, city.retrievedAt)
      for (const station of Object.values(project.stations)) {
        assert.ok(station.lng >= city.bounds[0][0] && station.lng <= city.bounds[1][0], city.name)
        assert.ok(station.lat >= city.bounds[0][1] && station.lat <= city.bounds[1][1], city.name)
      }
      assert.equal(lineFeatureCollection(project, null).features.length, city.lineCount)
    }
    const wuhan = cityProject('wuhan')
    assert.ok(Object.values(wuhan.lines).some((line) => line.name === '12号线'))
    const interchange = Object.values(wuhan.stations).filter((station) => station.name === '洪山广场')
    assert.equal(interchange.length, 1)
    assert.equal(stationLineCounts(wuhan)[interchange[0].id], 2)
  })

  it('resolves city aliases and rejects corrupt catalogue entries', () => {
    const catalog = readData('catalog')
    const cities = parseCityCatalog(catalog)
    assert.equal(findTransitCity(cities, '武汉市')?.id, 'wuhan')
    assert.equal(findTransitCity(cities, '新北')?.id, 'taibei')
    assert.equal(findTransitCity(cities, '海宁')?.id, 'hangzhou')
    assert.equal(findTransitCity(cities, 'Paris'), undefined)
    assert.throws(() => parseCityCatalog({ cities: [cities[0], cities[0]] }))
    assert.throws(() => parseCityCatalog({ cities: [{ ...cities[0], center: [999, 30] }] }))
  })

  it('round-trips city and loop metadata and inserts into the closing segment', () => {
    const project = emptyProject('环线')
    project.cityId = 'test-city'
    project.stations = { a: { id: 'a', name: '甲', lng: 0, lat: 0 }, b: { id: 'b', name: '乙', lng: 2, lat: 0 }, c: { id: 'c', name: '丙', lng: 2, lat: 2 } }
    project.lines.l = { id: 'l', name: '环线', color: '#123456', closed: true, nodes: ['a', 'b', 'c'].map((id) => ({ type: 'station', id })) }
    const parsed = parseProjectJson(JSON.stringify(project))
    assert.equal(parsed.cityId, 'test-city')
    assert.deepEqual(lineFeatureCollection(parsed, null).features[0].geometry.coordinates, [[0, 0], [2, 0], [2, 2], [0, 0]])
    const index = nearestLineInsertIndex(parsed, 'l', [1, 1], (point) => point)
    assert.equal(index, 3)
    const store = createMetroStore({ initialProject: parsed, persist: () => undefined, idFactory: () => 'w' })
    store.getState().createWaypoint(1, 1, 'l', index!)
    assert.deepEqual(lineFeatureCollection(store.getState().project, null).features[0].geometry.coordinates, [[0, 0], [2, 0], [2, 2], [1, 1], [0, 0]])
    assert.throws(() => validateProject({ ...project, cityId: '../escape' }))
    assert.throws(() => validateProject({ ...project, lines: { l: { ...project.lines.l, closed: 'yes' } } }))
  })

  it('preserves a custom project and city edits through switches and refreshes without cross-city undo', () => {
    const storage = new MemoryStorage()
    const custom = emptyProject('我原来的规划')
    const store = createMetroStore({ initialProject: custom, cityStorage: storage, persist: (project) => saveProject(project, storage) })
    assert.equal(store.getState().switchCity(cityProject('wuhan')), true)
    const id = Object.keys(store.getState().project.stations)[0]
    store.getState().updateStation(id, { name: '我修改的武汉站', lng: 114.25 })
    assert.equal(store.getState().switchCity(cityProject('shanghai')), true)
    assert.equal(store.getState().canUndo, false)
    store.getState().undo()
    assert.equal(store.getState().project.cityId, 'shanghai')
    const saved = readCityProject('wuhan', storage)!
    assert.equal(store.getState().switchCity(saved), true)
    assert.equal(store.getState().project.stations[id].name, '我修改的武汉站')
    assert.equal(store.getState().project.stations[id].lng, 114.25)
    assert.equal(parseProjectJson(storage.getItem(STORAGE_KEY)!).stations[id].name, '我修改的武汉站')
    assert.deepEqual(readCityProject(null, storage), validateProject(custom))
    store.getState().loadProject(cityProject('wuhan'))
    store.getState().undo()
    assert.equal(store.getState().project.stations[id].name, '我修改的武汉站')
  })

  it('keeps the current project when saving before a city switch fails', () => {
    const storage = new MemoryStorage()
    const original = cityProject('wuhan')
    const store = createMetroStore({ initialProject: original, cityStorage: storage, persist: (project) => saveProject(project, storage) })
    store.getState().renameProject('武汉编辑中')
    const current = store.getState().project
    storage.failWrites = true
    assert.equal(store.getState().switchCity(cityProject('shanghai')), false)
    assert.equal(store.getState().project, current)
    assert.equal(store.getState().canUndo, true)
    assert.equal(store.getState().notice?.kind, 'error')
  })

  it('resets the current city in place and can restore its original network', () => {
    const storage = new MemoryStorage()
    const original = cityProject('wuhan')
    const store = createMetroStore({ initialProject: original, cityStorage: storage, persist: (project) => saveProject(project, storage) })
    store.getState().resetProject('空白武汉规划', true)
    assert.equal(store.getState().project.cityId, 'wuhan')
    assert.equal(Object.keys(store.getState().project.lines).length, 0)
    store.getState().loadProject(original)
    assert.equal(Object.keys(store.getState().project.lines).length, 13)
    store.getState().undo()
    assert.equal(store.getState().project.cityId, 'wuhan')
    assert.equal(Object.keys(store.getState().project.lines).length, 0)
  })

  it('refuses damaged or mismatched city saves instead of replacing them with defaults', () => {
    const storage = new MemoryStorage()
    storage.setItem(`${CITY_PROJECT_PREFIX}wuhan`, '{broken')
    assert.throws(() => readCityProject('wuhan', storage))
    assert.equal(storage.getItem(`${CITY_PROJECT_PREFIX}wuhan`), '{broken')
    storage.setItem(`${CITY_PROJECT_PREFIX}wuhan`, JSON.stringify(cityProject('shanghai')))
    assert.throws(() => readCityProject('wuhan', storage))
  })
})
