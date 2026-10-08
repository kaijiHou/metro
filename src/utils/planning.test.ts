import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { emptyProject, type MetroProject } from '../models/metro'
import { createMetroStore } from '../store/metroStore'
import { lineFeatureCollection } from './geojson'
import { lineStatistics, cityStatistics, haversineKm } from './statistics'
import { readScenarioSet, SCENARIO_PREFIX } from './scenarios'
import { parseProjectJson, saveProject, type ProjectStorage } from './persistence'
import { saveCityProject } from './cityProjects'
import { validateProject } from './validation'

function fixture(): MetroProject {
  return {
    ...emptyProject('武汉规划'), cityId: 'wuhan',
    stations: {
      a: { id: 'a', name: '甲', lng: 0, lat: 0 },
      b: { id: 'b', name: '乙', lng: 1, lat: 1 },
      c: { id: 'c', name: '丙', lng: 2, lat: 1 },
    },
    waypoints: { w: { id: 'w', lng: 0, lat: 1 }, orphan: { id: 'orphan', lng: 10, lat: 10 } },
    lines: { real: { id: 'real', name: '现状线', color: '#123456', status: 'existing', locked: true,
      visible: true, nodes: [{ type: 'station', id: 'a' }, { type: 'waypoint', id: 'w' }, { type: 'station', id: 'b' }] } },
  }
}

class MemoryStorage implements ProjectStorage {
  data = new Map<string, string>()
  fail = false
  getItem(key: string) { return this.data.get(key) ?? null }
  setItem(key: string, value: string) { if (this.fail) throw new Error('quota'); this.data.set(key, value) }
  removeItem(key: string) { this.data.delete(key) }
}

function store(project = fixture(), storage = new MemoryStorage()) {
  let count = 0
  return { storage, state: createMetroStore({ initialProject: project, cityStorage: storage,
    idFactory: () => `new-${++count}`, persist: (value) => saveProject(value, storage) }) }
}

describe('Phase 3 planning model', () => {
  it('validates statuses and preserves legacy city and self-built line meanings', () => {
    const project = fixture()
    const parsed = parseProjectJson(JSON.stringify(project))
    assert.equal(parsed.lines.real.status, 'existing')
    assert.equal(parsed.lines.real.locked, true)
    assert.equal(parsed.lines.real.visible, true)
    for (const status of ['existing', 'construction', 'planned'] as const) {
      assert.equal(validateProject({ ...project, lines: { real: { ...project.lines.real, status } } }).lines.real.status, status)
    }
    assert.equal(validateProject({ ...project, lines: { real: { ...project.lines.real, status: undefined, locked: undefined, visible: undefined } } }).lines.real.status, 'planned')
    assert.equal(validateProject({ ...project, lines: { 'amap-line': { ...project.lines.real, id: 'amap-line', status: undefined, locked: undefined } } }).lines['amap-line'].locked, true)
    assert.throws(() => validateProject({ ...project, lines: { real: { ...project.lines.real, status: 'future' } } }))
    assert.throws(() => validateProject({ ...project, lines: { real: { ...project.lines.real, visible: 'false' } } }))
  })

  it('protects locked line topology and shared station coordinates until explicit unlock', () => {
    const { state } = store()
    const before = state.getState().project
    state.getState().deleteLine('real')
    state.getState().removeNodeFromLine('real', 1)
    state.getState().moveLineNode('real', 0, 1)
    state.getState().createStation(3, 3)
    state.getState().createWaypoint(3, 3, 'real')
    state.getState().updateStation('a', { lng: 3 })
    state.getState().deleteStation('a')
    state.getState().updateWaypoint('w', { lng: 3 })
    state.getState().deleteWaypoint('w')
    assert.equal(state.getState().project, before)
    state.getState().updateLine('real', { locked: false })
    state.getState().updateStation('a', { lng: 3 })
    state.getState().removeNodeFromLine('real', 1)
    assert.equal(state.getState().project.stations.a.lng, 3)
    assert.equal(state.getState().project.waypoints.w, undefined)
    assert.ok(state.getState().project.waypoints.orphan)
  })

  it('hides line geometry without deleting it and restores all in one undo step', () => {
    const { state } = store()
    state.getState().setAllLinesVisible(false)
    assert.equal(lineFeatureCollection(state.getState().project, null).features.length, 0)
    assert.equal(state.getState().project.lines.real.nodes.length, 3)
    state.getState().undo()
    assert.equal(lineFeatureCollection(state.getState().project, null).features.length, 1)
    state.getState().setAllLinesVisible(false)
    state.getState().setAllLinesVisible(true)
    assert.equal(state.getState().project.lines.real.visible, true)
  })

  it('copies an existing line as an independently shaped planned line', () => {
    const { state } = store()
    const real = state.getState().project.lines.real
    const id = state.getState().copyLineToPlanned('real')!
    const copy = state.getState().project.lines[id]
    assert.notEqual(id, real.id)
    assert.equal(copy.status, 'planned')
    assert.equal(copy.locked, false)
    assert.equal(copy.visible, true)
    assert.equal(copy.sourceLineId, real.id)
    assert.deepEqual(copy.nodes.filter((node) => node.type === 'station'), real.nodes.filter((node) => node.type === 'station'))
    assert.notEqual(copy.nodes[1].id, real.nodes[1].id)
    assert.deepEqual(state.getState().project.lines.real, real)
    state.getState().updateStation('a', { lng: 5 })
    assert.equal(state.getState().project.stations.a.lng, 0)
    assert.equal(cityStatistics(state.getState().project).plannedNewLengthKm, 0)
  })

  it('extends from both ends, copying a locked existing line automatically', () => {
    const { state } = store()
    state.getState().extendLine('real', 'start')
    const id = state.getState().selectedLineId!
    assert.notEqual(id, 'real')
    state.getState().createStation(-1, 0)
    assert.equal(state.getState().project.lines[id].nodes[0].id, state.getState().selectedStationId)
    state.getState().extendLine(id, 'end')
    state.getState().createStation(2, 2)
    assert.equal(state.getState().project.lines[id].nodes.at(-1)?.id, state.getState().selectedStationId)
    assert.equal(state.getState().project.lines.real.nodes.length, 3)
  })

  it('creates a planned branch rooted at the chosen existing station', () => {
    const { state } = store()
    state.getState().createBranch('a')
    const branch = state.getState().project.lines[state.getState().selectedLineId!]
    assert.equal(branch.status, 'planned')
    assert.deepEqual(branch.nodes, [{ type: 'station', id: 'a' }])
    assert.equal(state.getState().editorMode, 'add-station')
    state.getState().createStation(-1, 0)
    assert.equal(branch.nodes.length, 1)
    assert.equal(state.getState().project.lines[branch.id].nodes.length, 2)
  })

  it('measures waypoint paths and the closing segment of rings', () => {
    const project = fixture()
    const open = lineStatistics(project, project.lines.real)
    const aToW = haversineKm([0, 0], [0, 1])
    const wToB = haversineKm([0, 1], [1, 1])
    assert.equal(open.totalLengthKm, aToW + wToB)
    assert.equal(open.averageSpacingKm, open.totalLengthKm)
    assert.equal(open.minSpacingKm, open.totalLengthKm)
    assert.equal(open.maxSpacingKm, open.totalLengthKm)
    const ring = { ...project.lines.real, closed: true, nodes: [...project.lines.real.nodes, { type: 'station' as const, id: 'c' }] }
    const stats = lineStatistics(project, ring)
    const bToC = haversineKm([1, 1], [2, 1])
    const cToA = haversineKm([2, 1], [0, 0])
    assert.ok(Math.abs(stats.totalLengthKm - (aToW + wToB + bToC + cToA)) < 1e-9)
    assert.equal(stats.stationCount, 3)
    assert.equal(stats.nodeCount, 4)
    assert.equal(stats.waypointCount, 1)
    assert.ok(Math.abs(stats.maxSpacingKm - cToA) < 1e-9)
    assert.ok(Math.abs(stats.minSpacingKm - bToC) < 1e-9)
  })

  it('isolates scenarios by city and clears undo when switching', () => {
    const { state, storage } = store()
    state.getState().createLine()
    assert.equal(state.getState().canUndo, true)
    assert.equal(state.getState().createScenario('2035 A', fixture()), true)
    assert.equal(state.getState().canUndo, false)
    assert.equal(Object.keys(state.getState().project.lines).length, 1)
    assert.equal(state.getState().scenarios.length, 2)
    assert.equal(readScenarioSet('wuhan', storage)?.scenarios.length, 2)
    state.getState().createLine()
    const id = state.getState().activeScenarioId
    state.getState().renameScenario(id, '2035 方案')
    assert.equal(state.getState().scenarios.find((item) => item.id === id)?.name, '2035 方案')
    assert.equal(state.getState().copyScenario('2035 B'), true)
    assert.equal(state.getState().scenarios.length, 3)
    assert.equal(state.getState().switchScenario('default'), true)
    assert.equal(state.getState().canUndo, false)
    assert.equal(state.getState().activeScenarioId, 'default')
    assert.equal(state.getState().deleteScenario(id), true)
    assert.equal(state.getState().scenarios.length, 2)
    const shanghai = { ...emptyProject('上海规划'), cityId: 'shanghai' }
    assert.equal(state.getState().switchCity(shanghai), true)
    assert.equal(state.getState().scenarios.length, 1)
    assert.equal(readScenarioSet('shanghai', storage), null)
    assert.equal(state.getState().switchCity(fixture()), true)
    assert.equal(state.getState().scenarios.length, 2)
    assert.ok(storage.getItem(`${SCENARIO_PREFIX}wuhan`))
  })

  it('keeps project and undo history when scenario storage fails', () => {
    const { state, storage } = store()
    state.getState().createLine()
    const before = state.getState().project
    storage.fail = true
    assert.equal(state.getState().copyScenario('失败副本'), false)
    assert.equal(state.getState().project, before)
    assert.equal(state.getState().canUndo, true)
  })

  it('starts a separate custom project without replacing an earlier custom scenario or city base', () => {
    const storage = new MemoryStorage()
    const earlier = emptyProject('以前的自主规划')
    earlier.lines.old = { id: 'old', name: '旧线', color: '#123456', status: 'planned', nodes: [] }
    saveCityProject(earlier, storage)
    const { state } = store(fixture(), storage)
    assert.equal(state.getState().startNewProject('新项目'), true)
    assert.equal(state.getState().project.cityId, undefined)
    assert.equal(state.getState().scenarios.length, 2)
    assert.equal(Object.keys(state.getState().project.lines).length, 0)
    assert.equal(state.getState().switchScenario('default'), true)
    assert.equal(state.getState().project.lines.old.name, '旧线')
    assert.equal(state.getState().switchCity(fixture()), true)
    assert.equal(Object.keys(state.getState().project.lines).length, 1)
    assert.equal(state.getState().project.lines.real.locked, true)
  })

  it('limits each city to five full scenarios', () => {
    const { state } = store()
    for (let i = 0; i < 4; i++) assert.equal(state.getState().copyScenario(`方案${i}`), true)
    const before = state.getState().project
    assert.equal(state.getState().copyScenario('超额方案'), false)
    assert.equal(state.getState().scenarios.length, 5)
    assert.equal(state.getState().project, before)
  })
})
