import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { emptyProject, type MetroProject } from '../models/metro'
import { lineFeatureCollection, stationFeatureCollection } from './geojson'
import { validateProject } from './validation'

const sample: MetroProject = {
  version: 1,
  name: '测试项目',
  stations: {
    a: { id: 'a', name: '甲', lng: 114.4, lat: 30.5 },
    b: { id: 'b', name: '乙', lng: 114.5, lat: 30.6 },
  },
  lines: {
    red: { id: 'red', name: '红线', color: '#dd4444', stationIds: ['a', 'b'] },
    blue: { id: 'blue', name: '蓝线', color: '#4477dd', stationIds: ['a'] },
  },
}

describe('GeoJSON and import validation', () => {
  it('uses ordered [lng, lat] coordinates and derives transfers from references', () => {
    const lines = lineFeatureCollection(sample, 'red')
    assert.equal(lines.features.length, 1)
    assert.deepEqual(lines.features[0].geometry.coordinates, [[114.4, 30.5], [114.5, 30.6]])
    const stations = stationFeatureCollection(sample, null)
    assert.equal(stations.features.find((feature) => feature.properties.id === 'a')?.properties.transfer, true)
    assert.equal(stations.features.find((feature) => feature.properties.id === 'b')?.properties.transfer, false)
  })

  it('does not create a line from fewer than two valid stations', () => {
    assert.equal(lineFeatureCollection(emptyProject(), null).features.length, 0)
    assert.equal(lineFeatureCollection({ ...sample, lines: { blue: sample.lines.blue } }, null).features.length, 0)
  })

  it('rejects dangling references and invalid coordinates on import', () => {
    assert.throws(() => validateProject({ ...sample, lines: { red: { ...sample.lines.red, stationIds: ['a', 'missing'] } } }), /不存在/)
    assert.throws(() => validateProject({ ...sample, stations: { ...sample.stations, a: { ...sample.stations.a, lng: 200 } } }), /经纬度/)
  })
})
