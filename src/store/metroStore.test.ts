import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { emptyProject, type MetroProject } from '../models/metro'
import { createMetroStore } from './metroStore'

function testStore(project = emptyProject()) {
  let nextId = 0
  return createMetroStore({
    initialProject: project,
    idFactory: () => `id-${++nextId}`,
    persist: () => undefined,
  })
}

const sharedProject = (): MetroProject => ({
  version: 1,
  name: 'Store 测试',
  stations: {
    s1: { id: 's1', name: '共享站', lng: 114.3, lat: 30.5 },
    s2: { id: 's2', name: '普通站', lng: 114.4, lat: 30.6 },
  },
  lines: {
    l1: { id: 'l1', name: '1号线', color: '#d94c4c', stationIds: ['s1', 's2'] },
    l2: { id: 'l2', name: '2号线', color: '#2878b9', stationIds: ['s1'] },
  },
})

describe('metro store core actions', () => {
  it('creates and selects an empty line', () => {
    const store = testStore()
    store.getState().createLine()
    const state = store.getState()
    assert.equal(state.selectedLineId, 'id-1')
    assert.deepEqual(state.project.lines['id-1'].stationIds, [])
  })

  it('creates unique stations at the selected line tail', () => {
    const store = testStore()
    store.getState().createLine()
    store.getState().createStation(114.3, 30.5)
    store.getState().createStation(114.4, 30.6)
    const state = store.getState()
    assert.deepEqual(state.project.lines['id-1'].stationIds, ['id-2', 'id-3'])
    assert.equal(Object.keys(state.project.stations).length, 2)
    assert.notEqual(state.project.stations['id-2'].id, state.project.stations['id-3'].id)
  })

  it('rejects station creation without a selected line', () => {
    const store = testStore()
    store.getState().setEditorMode('add-station')
    store.getState().createStation(114.3, 30.5)
    const state = store.getState()
    assert.equal(Object.keys(state.project.stations).length, 0)
    assert.equal(state.editorMode, 'browse')
    assert.equal(state.notice?.kind, 'error')
    assert.match(state.notice?.text ?? '', /先选择或创建线路/)
  })

  it('adds an existing station to another line only once', () => {
    const store = testStore(sharedProject())
    store.getState().addStationToLine('s2', 'l2')
    store.getState().addStationToLine('s2', 'l2')
    assert.deepEqual(store.getState().project.lines.l2.stationIds, ['s1', 's2'])
  })

  it('deletes a line without deleting stations and selects the next line', () => {
    const store = testStore(sharedProject())
    store.getState().deleteLine('l1')
    const state = store.getState()
    assert.equal(state.project.lines.l1, undefined)
    assert.deepEqual(Object.keys(state.project.stations).sort(), ['s1', 's2'])
    assert.equal(state.project.lines.l2.stationIds[0], 's1')
    assert.equal(state.selectedLineId, 'l2')
  })

  it('deletes a station from the project and every line', () => {
    const store = testStore(sharedProject())
    store.getState().selectStation('s1')
    store.getState().deleteStation('s1')
    const state = store.getState()
    assert.equal(state.project.stations.s1, undefined)
    assert.equal(state.project.lines.l1.stationIds.includes('s1'), false)
    assert.equal(state.project.lines.l2.stationIds.includes('s1'), false)
    assert.equal(state.selectedStationId, null)
  })

  it('updates station details and rejects invalid coordinates', () => {
    const store = testStore(sharedProject())
    store.getState().updateStation('s1', { name: '新站名', lng: 115, lat: 31 })
    assert.deepEqual(store.getState().project.stations.s1, { id: 's1', name: '新站名', lng: 115, lat: 31 })
    store.getState().updateStation('s1', { lng: 181 })
    assert.equal(store.getState().project.stations.s1.lng, 115)
  })

  it('loads a project atomically and resets editor selection', () => {
    const store = testStore()
    store.getState().setEditorMode('add-station')
    const project = sharedProject()
    store.getState().loadProject(project)
    const state = store.getState()
    assert.equal(state.project, project)
    assert.equal(state.selectedLineId, 'l1')
    assert.equal(state.selectedStationId, null)
    assert.equal(state.editorMode, 'browse')
  })

  it('resets project data with the requested name and clears selection', () => {
    const store = testStore(sharedProject())
    store.getState().selectStation('s1')
    store.getState().resetProject('新项目')
    const state = store.getState()
    assert.equal(state.project.name, '新项目')
    assert.deepEqual(state.project.lines, {})
    assert.deepEqual(state.project.stations, {})
    assert.equal(state.selectedLineId, null)
    assert.equal(state.selectedStationId, null)
  })

  it('removes a station only from the requested line', () => {
    const store = testStore(sharedProject())
    store.getState().removeStationFromLine('s1', 'l1')
    const state = store.getState()
    assert.deepEqual(state.project.lines.l1.stationIds, ['s2'])
    assert.deepEqual(state.project.lines.l2.stationIds, ['s1'])
    assert.equal(state.project.stations.s1.name, '共享站')
  })
})
