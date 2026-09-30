import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { emptyProject, type MetroProject } from '../models/metro'
import { createMetroStore } from './metroStore'

function testStore(project = emptyProject()) {
  let nextId = 0
  return createMetroStore({ initialProject: project, idFactory: () => `id-${++nextId}`, persist: () => undefined })
}

const sharedProject = (): MetroProject => ({
  version: 2, name: 'Store 测试',
  stations: {
    s1: { id: 's1', name: '共享站', lng: 114.3, lat: 30.5 },
    s2: { id: 's2', name: '普通站', lng: 114.4, lat: 30.6 },
  },
  waypoints: { w1: { id: 'w1', lng: 114.35, lat: 30.55 } },
  lines: {
    l1: { id: 'l1', name: '1号线', color: '#d94c4c', nodes: [{ type: 'station', id: 's1' }, { type: 'waypoint', id: 'w1' }, { type: 'station', id: 's2' }] },
    l2: { id: 'l2', name: '2号线', color: '#2878b9', nodes: [{ type: 'station', id: 's1' }] },
  },
})

describe('metro store core actions', () => {
  it('creates and selects an empty line', () => {
    const store = testStore()
    store.getState().createLine()
    assert.equal(store.getState().selectedLineId, 'id-1')
    assert.deepEqual(store.getState().project.lines['id-1'].nodes, [])
  })

  it('creates unique stations at the selected line tail', () => {
    const store = testStore()
    store.getState().createLine()
    store.getState().createStation(114.3, 30.5)
    store.getState().createStation(114.4, 30.6)
    assert.deepEqual(store.getState().project.lines['id-1'].nodes, [{ type: 'station', id: 'id-2' }, { type: 'station', id: 'id-3' }])
    assert.equal(Object.keys(store.getState().project.stations).length, 2)
  })

  it('rejects node creation without a selected line', () => {
    const store = testStore()
    store.getState().setEditorMode('add-station')
    store.getState().createStation(114.3, 30.5)
    store.getState().setEditorMode('add-waypoint')
    store.getState().createWaypoint(114.3, 30.5, 'missing')
    assert.equal(store.getState().editorMode, 'browse')
    assert.equal(store.getState().notice?.kind, 'error')
    assert.deepEqual(store.getState().project.stations, {})
    assert.deepEqual(store.getState().project.waypoints, {})
  })

  it('adds an existing station via nodes only once', () => {
    const store = testStore(sharedProject())
    store.getState().addStationToLine('s2', 'l2')
    store.getState().addStationToLine('s2', 'l2')
    assert.deepEqual(store.getState().project.lines.l2.nodes, [{ type: 'station', id: 's1' }, { type: 'station', id: 's2' }])
  })

  it('inserts an existing station at a valid index', () => {
    const store = testStore(sharedProject())
    store.getState().addStationToLine('s2', 'l2', 0)
    assert.deepEqual(store.getState().project.lines.l2.nodes.map((node) => node.id), ['s2', 's1'])
  })

  it('deletes a line without deleting stations and selects the next line', () => {
    const store = testStore(sharedProject())
    store.getState().deleteLine('l1')
    assert.equal(store.getState().project.lines.l1, undefined)
    assert.deepEqual(Object.keys(store.getState().project.stations).sort(), ['s1', 's2'])
    assert.equal(store.getState().project.waypoints.w1, undefined)
    assert.equal(store.getState().selectedLineId, 'l2')
  })

  it('deletes a station from the project and every line', () => {
    const store = testStore(sharedProject())
    store.getState().selectStation('s1')
    store.getState().deleteStation('s1')
    assert.equal(store.getState().project.stations.s1, undefined)
    assert.equal(Object.values(store.getState().project.lines).some((line) => line.nodes.some((node) => node.id === 's1')), false)
    assert.equal(store.getState().selectedStationId, null)
  })

  it('updates station details and rejects invalid coordinates', () => {
    const store = testStore(sharedProject())
    store.getState().updateStation('s1', { name: '新站名', lng: 115, lat: 31 })
    store.getState().updateStation('s1', { lng: 181 })
    assert.deepEqual(store.getState().project.stations.s1, { id: 's1', name: '新站名', lng: 115, lat: 31 })
  })

  it('creates a waypoint at the line tail and exits add mode', () => {
    const store = testStore(sharedProject())
    store.getState().setEditorMode('add-waypoint')
    store.getState().createWaypoint(114.6, 30.7, 'l1')
    assert.deepEqual(store.getState().project.lines.l1.nodes.at(-1), { type: 'waypoint', id: 'id-1' })
    assert.deepEqual(store.getState().project.waypoints['id-1'], { id: 'id-1', lng: 114.6, lat: 30.7 })
    assert.equal(store.getState().selectedWaypointId, 'id-1')
    assert.equal(store.getState().editorMode, 'browse')
  })

  it('inserts a waypoint between stations using pendingInsertIndex', () => {
    const project = sharedProject()
    project.lines.l1.nodes = [{ type: 'station', id: 's1' }, { type: 'station', id: 's2' }]
    const store = testStore(project)
    store.getState().startWaypointInsert(1)
    assert.equal(store.getState().pendingInsertIndex, 1)
    store.getState().createWaypoint(114.35, 30.55, 'l1', store.getState().pendingInsertIndex ?? undefined)
    assert.deepEqual(store.getState().project.lines.l1.nodes.map((node) => node.type), ['station', 'waypoint', 'station'])
    assert.equal(store.getState().pendingInsertIndex, null)
  })

  it('cancels pending insertion when mode changes', () => {
    const store = testStore(sharedProject())
    store.getState().startWaypointInsert(1)
    store.getState().setEditorMode('browse')
    assert.equal(store.getState().pendingInsertIndex, null)
  })

  it('updates waypoint coordinates and rejects invalid coordinates', () => {
    const store = testStore(sharedProject())
    store.getState().updateWaypoint('w1', { lng: 115, lat: 31 })
    store.getState().updateWaypoint('w1', { lat: -91 })
    assert.deepEqual(store.getState().project.waypoints.w1, { id: 'w1', lng: 115, lat: 31 })
  })

  it('deletes waypoint data and every line reference, clearing selection', () => {
    const project = sharedProject()
    project.lines.l2.nodes.push({ type: 'waypoint', id: 'w1' })
    const store = testStore(project)
    store.getState().selectWaypoint('w1')
    store.getState().deleteWaypoint('w1')
    assert.equal(store.getState().project.waypoints.w1, undefined)
    assert.equal(Object.values(store.getState().project.lines).some((line) => line.nodes.some((node) => node.id === 'w1')), false)
    assert.equal(store.getState().selectedWaypointId, null)
  })

  it('removes a station node only from its line and retains the station', () => {
    const store = testStore(sharedProject())
    store.getState().removeNodeFromLine('l1', 0)
    assert.deepEqual(store.getState().project.lines.l1.nodes.map((node) => node.id), ['w1', 's2'])
    assert.deepEqual(store.getState().project.lines.l2.nodes.map((node) => node.id), ['s1'])
    assert.equal(store.getState().project.stations.s1.name, '共享站')
  })

  it('removes an orphan waypoint when its last line reference is removed', () => {
    const store = testStore(sharedProject())
    store.getState().selectWaypoint('w1')
    store.getState().removeNodeFromLine('l1', 1)
    assert.equal(store.getState().project.waypoints.w1, undefined)
    assert.equal(store.getState().selectedWaypointId, null)
  })

  it('retains a waypoint referenced by another line', () => {
    const project = sharedProject()
    project.lines.l2.nodes.push({ type: 'waypoint', id: 'w1' })
    const store = testStore(project)
    store.getState().removeNodeFromLine('l1', 1)
    assert.ok(store.getState().project.waypoints.w1)
    assert.deepEqual(store.getState().project.lines.l2.nodes.at(-1), { type: 'waypoint', id: 'w1' })
  })

  it('moves nodes up and down without changing their identities', () => {
    const store = testStore(sharedProject())
    store.getState().moveLineNode('l1', 1, 0)
    assert.deepEqual(store.getState().project.lines.l1.nodes.map((node) => node.id), ['w1', 's1', 's2'])
    store.getState().moveLineNode('l1', 0, 2)
    assert.deepEqual(store.getState().project.lines.l1.nodes.map((node) => node.id), ['s1', 's2', 'w1'])
  })

  it('ignores invalid move and removal indices', () => {
    const store = testStore(sharedProject())
    const original = store.getState().project
    store.getState().moveLineNode('l1', 0, -1)
    store.getState().moveLineNode('l1', 2, 3)
    store.getState().removeNodeFromLine('l1', 9)
    assert.equal(store.getState().project, original)
  })

  it('keeps station and waypoint selection mutually exclusive', () => {
    const store = testStore(sharedProject())
    store.getState().selectWaypoint('w1')
    assert.equal(store.getState().selectedStationId, null)
    store.getState().selectStation('s1')
    assert.equal(store.getState().selectedWaypointId, null)
  })

  it('loads and resets a project while clearing editor state', () => {
    const store = testStore()
    const project = sharedProject()
    store.getState().loadProject(project)
    store.getState().startWaypointInsert(1)
    store.getState().selectWaypoint('w1')
    store.getState().resetProject('新项目')
    assert.equal(store.getState().project.version, 2)
    assert.equal(store.getState().project.name, '新项目')
    assert.deepEqual(store.getState().project.waypoints, {})
    assert.equal(store.getState().selectedWaypointId, null)
    assert.equal(store.getState().pendingInsertIndex, null)
    assert.equal(store.getState().editorMode, 'browse')
  })
})
