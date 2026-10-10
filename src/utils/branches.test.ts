import assert from 'node:assert/strict'
import { it } from 'node:test'
import { emptyProject } from '../models/metro'
import { createMetroStore } from '../store/metroStore'
import { validateProject } from './validation'
import { lineFeatureCollection, stationLineCounts } from './geojson'
import { cityStatistics, lineStatistics } from './statistics'
import { extensionNodes } from './planning'

it('merges stations into the drop destination, preserving locked destination, references, controls, persistence and undo', () => {
  const project = emptyProject()
  project.stations.east = { id: 'east', name: '武汉火车站东广场', lng: 114.42, lat: 30.6 }
  project.stations.main = { id: 'main', name: '武汉火车站', lng: 114.4, lat: 30.6 }
  project.stations.next = { id: 'next', name: '下一站', lng: 114.45, lat: 30.6 }
  project.waypoints.w = { id: 'w', lng: 114.43, lat: 30.61 }
  project.lines.nineteen = { id: 'nineteen', name: '19号线', color: '#123456', nodes: [{ type: 'station', id: 'east' }, { type: 'waypoint', id: 'w' }, { type: 'station', id: 'next' }] }
  project.lines.existing = { id: 'existing', name: '4号线', color: '#654321', status: 'existing', locked: true, nodes: [{ type: 'station', id: 'main' }] }
  let saved = project
  const store = createMetroStore({ initialProject: project, persist: (value) => { saved = value } })
  store.getState().mergeStations('east', 'main')
  assert.equal(store.getState().project.stations.east, undefined)
  assert.deepEqual(store.getState().project.stations.main, project.stations.main)
  assert.equal(store.getState().project.lines.nineteen.nodes[0].id, 'main')
  assert.equal(store.getState().project.lines.existing, project.lines.existing)
  assert.deepEqual(store.getState().project.waypoints, project.waypoints)
  assert.equal(stationLineCounts(store.getState().project).main, 2)
  assert.equal(validateProject(JSON.parse(JSON.stringify(saved))).stations.main.name, '武汉火车站')
  store.getState().undo()
  assert.deepEqual(store.getState().project, project)
  store.getState().redo()
  const before = store.getState().project
  store.getState().mergeStations('main', 'next')
  assert.equal(store.getState().project, before)
})

it('collapses adjacent merged nodes and rejects a repeated visit without altering the project', () => {
  const project = emptyProject()
  for (const id of ['a', 'b', 'c']) project.stations[id] = { id, name: id, lng: 114, lat: 30 }
  project.lines.line = { id: 'line', name: '9号线', color: '#123456', nodes: ['a', 'b', 'c'].map((id) => ({ type: 'station', id })) }
  const store = createMetroStore({ initialProject: project, persist: () => {} })
  store.getState().mergeStations('a', 'c')
  assert.equal(store.getState().project, project)
  store.getState().mergeStations('a', 'b')
  assert.deepEqual(store.getState().project.lines.line.nodes.map((node) => node.id), ['b', 'c'])
  validateProject(store.getState().project)
  store.getState().undo()
  assert.deepEqual(store.getState().project, project)
})

it('unlocks every line protecting the source station in one undoable edit', () => {
  const project = emptyProject()
  project.stations.a = { id: 'a', name: '武汉火车站东广场', lng: 114.4, lat: 30.6 }
  project.stations.b = { id: 'b', name: '武汉火车站', lng: 114.41, lat: 30.6 }
  for (const id of ['19', '20', '4']) project.lines[id] = { id, name: `${id}号线`, color: '#123456', status: 'existing', locked: true, nodes: [{ type: 'station', id: id === '4' ? 'b' : 'a' }] }
  const store = createMetroStore({ initialProject: project, persist: () => {} })
  store.getState().unlockStation('a')
  assert.equal(store.getState().project.lines['19'].locked, false)
  assert.equal(store.getState().project.lines['20'].locked, false)
  assert.equal(store.getState().project.lines['4'].locked, true)
  store.getState().undo()
  assert.deepEqual(store.getState().project, project)
})

it('keeps a branch inside its parent across save, rendering, statistics, deletion and undo', () => {
  let counter = 0
  const project = emptyProject()
  project.stations.a = { id: 'a', name: '欢乐谷', lng: 114.3, lat: 30.5 }
  project.stations.b = { id: 'b', name: '园林路', lng: 114.4, lat: 30.5 }
  project.lines.nine = { id: 'nine', name: '9号线', color: '#123456', status: 'planned', nodes: [{ type: 'station', id: 'a' }] }
  let saved = project
  const store = createMetroStore({ initialProject: project, idFactory: () => `new${++counter}`, persist: (value) => { saved = value } })
  store.getState().createBranch('a')
  const branchId = store.getState().selectedLineId!
  store.getState().addStationToLine('b', branchId)
  const state = store.getState()
  assert.equal(state.project.lines[branchId].parentLineId, 'nine')
  assert.equal(state.project.lines[branchId].color, '#123456')
  assert.equal(cityStatistics(state.project).plannedLines, 1)
  assert.equal(stationLineCounts(state.project).a, 1)
  assert.equal(lineStatistics(state.project, state.project.lines.nine).stationCount, 2)
  assert.ok(lineStatistics(state.project, state.project.lines.nine).totalLengthKm > 0)
  assert.equal(lineFeatureCollection(state.project, 'nine').features[0].properties.name, '9号线')
  store.getState().updateLine('nine', { color: '#abcdef' })
  assert.equal(lineFeatureCollection(store.getState().project, null).features[0].properties.color, '#abcdef')
  store.getState().saveCurrentProject()
  assert.match(store.getState().notice!.text, /已保存/)
  assert.equal(validateProject(JSON.parse(JSON.stringify(saved))).lines[branchId].parentLineId, 'nine')
  store.getState().deleteLine('nine')
  assert.equal(Object.keys(store.getState().project.lines).length, 0)
  store.getState().undo()
  assert.equal(store.getState().project.lines[branchId].parentLineId, 'nine')
  store.getState().deleteLine(branchId)
  assert.equal(Object.keys(store.getState().project.lines).length, 1)
  assert.equal(store.getState().selectedLineId, 'nine')
  const invalid = structuredClone(saved)
  invalid.lines[branchId] = { ...state.project.lines[branchId], parentLineId: 'missing' }
  assert.throws(() => validateProject(invalid), /所属线路/)
  store.getState().undo()
  const copiedId = store.getState().copyLineToPlanned('nine')!
  const copiedBranch = Object.values(store.getState().project.lines).find((line) => line.parentLineId === copiedId)!
  assert.ok(copiedBranch)
  assert.notEqual(copiedBranch.id, branchId)
  assert.deepEqual(copiedBranch.nodes, state.project.lines[branchId].nodes)
  assert.equal(validateProject(store.getState().project).lines[copiedBranch.id].parentLineId, copiedId)
})

it('attaches an earlier independent branch and reports explicit save failure', () => {
  const project = emptyProject()
  project.stations.a = { id: 'a', name: '欢乐谷', lng: 114.3, lat: 30.5 }
  project.lines.nine = { id: 'nine', name: '9号线', color: '#123456', nodes: [{ type: 'station', id: 'a' }] }
  project.lines.old = { id: 'old', name: '欢乐谷支线', color: '#654321', nodes: [{ type: 'station', id: 'a' }] }
  let fail = false
  const store = createMetroStore({ initialProject: project, persist: () => { if (fail) throw new Error('storage full') } })
  store.getState().attachBranch('old', 'nine')
  assert.equal(store.getState().project.lines.old.parentLineId, 'nine')
  const before = store.getState().project
  fail = true
  store.getState().saveCurrentProject()
  assert.equal(store.getState().notice?.kind, 'error')
  assert.equal(store.getState().project, before)
})

it('merges nineteen main stations and five extension stations into twenty-three stations with undo', () => {
  const project = emptyProject()
  for (let i = 1; i <= 23; i++) project.stations[`s${i}`] = { id: `s${i}`, name: `站${i}`, lng: 114 + i / 100, lat: 30.5 }
  const nodes = (start: number, end: number) => Array.from({ length: end - start + 1 }, (_, i) => ({ type: 'station' as const, id: `s${start + i}` }))
  project.lines.nine = { id: 'nine', name: '9号线', color: '#123456', nodes: nodes(1, 19) }
  project.lines.part = { id: 'part', name: '欢乐谷支线', color: '#654321', nodes: nodes(19, 23) }
  const store = createMetroStore({ initialProject: project, persist: () => {} })
  store.getState().mergeLineExtension('part', 'nine')
  assert.deepEqual(store.getState().project.lines.nine.nodes, nodes(1, 23))
  assert.equal(Object.keys(store.getState().project.lines).length, 1)
  assert.equal(store.getState().project.lines.nine.name, '9号线')
  assert.deepEqual(store.getState().project.stations, project.stations)
  store.getState().undo()
  assert.equal(store.getState().project.lines.nine.nodes.length, 19)
  assert.equal(store.getState().project.lines.part.nodes.length, 5)
  store.getState().updateLine('nine', { locked: true })
  const locked = store.getState().project
  store.getState().mergeLineExtension('part', 'nine')
  assert.equal(store.getState().project, locked)
})

it('joins either end in either order, rejecting loops, mid-line forks and duplicate nodes', () => {
  const part = (ids: string[]) => ({ id: 'line', name: '线', color: '#123456', nodes: ids.map((id) => ({ type: 'station' as const, id })) })
  const p = part(['a', 'b'])
  assert.deepEqual(extensionNodes(p, part(['b', 'c']))?.map((node) => node.id), ['a', 'b', 'c'])
  assert.deepEqual(extensionNodes(p, part(['c', 'b']))?.map((node) => node.id), ['a', 'b', 'c'])
  assert.deepEqual(extensionNodes(p, part(['c', 'a']))?.map((node) => node.id), ['c', 'a', 'b'])
  assert.deepEqual(extensionNodes(p, part(['a', 'c']))?.map((node) => node.id), ['c', 'a', 'b'])
  assert.equal(extensionNodes(part(['a', 'b', 'c']), part(['b', 'd'])), null)
  assert.equal(extensionNodes(p, part(['b', 'a'])), null)
  assert.equal(extensionNodes({ ...p, closed: true }, part(['b', 'c'])), null)
})
