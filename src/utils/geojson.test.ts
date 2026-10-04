import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { emptyProject, type MetroProject } from '../models/metro'
import { lineFeatureCollection, nearestLineInsertIndex, resolveLineNodeCoordinate, stationLineCounts } from './geojson'
import { validateProject } from './validation'

const sample = (): MetroProject => ({
  version: 2, name: '测试项目',
  stations: {
    a: { id: 'a', name: '甲', lng: 114.4, lat: 30.5 },
    b: { id: 'b', name: '乙', lng: 114.5, lat: 30.6 },
  },
  waypoints: { w: { id: 'w', lng: 114.45, lat: 30.55 } },
  lines: {
    red: { id: 'red', name: '红线', color: '#dd4444', nodes: [{ type: 'station', id: 'a' }, { type: 'waypoint', id: 'w' }, { type: 'station', id: 'b' }] },
    blue: { id: 'blue', name: '蓝线', color: '#4477dd', nodes: [{ type: 'station', id: 'a' }] },
  },
})

describe('v2 GeoJSON', () => {
  it('resolves station, waypoint, station in exact [lng, lat] order', () => {
    const project = sample()
    assert.deepEqual(resolveLineNodeCoordinate(project, { type: 'waypoint', id: 'w' }), [114.45, 30.55])
    const lines = lineFeatureCollection(project, 'red')
    assert.equal(lines.features.length, 1)
    assert.deepEqual(lines.features[0].geometry.coordinates, [[114.4, 30.5], [114.45, 30.55], [114.5, 30.6]])
  })

  it('does not create a line from fewer than two valid nodes', () => {
    const project = sample()
    assert.equal(lineFeatureCollection(emptyProject(), null).features.length, 0)
    assert.equal(lineFeatureCollection({ ...project, lines: { blue: project.lines.blue } }, null).features.length, 0)
  })

  it('skips dangling nodes in corrupted in-memory data', () => {
    const project = sample()
    project.lines.red.nodes[1] = { type: 'waypoint', id: 'missing' }
    assert.deepEqual(lineFeatureCollection(project, null).features[0].geometry.coordinates, [[114.4, 30.5], [114.5, 30.6]])
  })

  it('counts only shared station references as transfers', () => {
    const counts = stationLineCounts(sample())
    assert.equal(counts.a, 2)
    assert.equal(counts.b, 1)
    assert.equal(counts.w, undefined)
  })

  it('finds the segment when adding a second waypoint between two stations', () => {
    const project = sample()
    const toPixel = ([lng, lat]: [number, number]): [number, number] => [lng * 1000, lat * 1000]
    assert.equal(nearestLineInsertIndex(project, 'red', [114.425, 30.525], toPixel), 1)
    assert.equal(nearestLineInsertIndex(project, 'red', [114.475, 30.575], toPixel), 2)
    assert.equal(nearestLineInsertIndex(project, 'missing', [114.425, 30.525], toPixel), null)
  })
})

describe('v2 validation', () => {
  it('accepts a valid v2 project', () => {
    assert.equal(validateProject(sample()).version, 2)
  })

  it('rejects dangling waypoint and station references', () => {
    const project = sample()
    assert.throws(() => validateProject({ ...project, waypoints: {} }), /不存在的控制点/)
    assert.throws(() => validateProject({ ...project, stations: { b: project.stations.b } }), /不存在的站点/)
  })

  it('rejects invalid node types and duplicate nodes', () => {
    const project = sample()
    assert.throws(() => validateProject({ ...project, lines: { red: { ...project.lines.red, nodes: [{ type: 'train', id: 'a' }] } } }), /无效节点/)
    assert.throws(() => validateProject({ ...project, lines: { red: { ...project.lines.red, nodes: [{ type: 'station', id: 'a' }, { type: 'station', id: 'a' }] } } }), /重复引用/)
  })

  it('rejects invalid waypoint coordinates and key mismatch', () => {
    const project = sample()
    assert.throws(() => validateProject({ ...project, waypoints: { w: { ...project.waypoints.w, lng: 181 } } }), /经纬度/)
    assert.throws(() => validateProject({ ...project, waypoints: { w: { ...project.waypoints.w, id: 'other' } } }), /ID/)
  })

  it('rejects legacy stationIds on a v2 line', () => {
    const project = sample()
    assert.throws(() => validateProject({ ...project, lines: { red: { ...project.lines.red, stationIds: ['a'] } } }), /字段无效/)
  })
})
