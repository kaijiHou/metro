import assert from 'node:assert/strict'
import { it } from 'node:test'
import { emptyProject } from '../models/metro'
import { createMetroStore } from '../store/metroStore'
import { validateProject } from './validation'
import { lineFeatureCollection, stationLineCounts } from './geojson'
import { cityStatistics, lineStatistics } from './statistics'

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
