import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { emptyProject } from '../models/metro'
import { migrateProjectToCurrent } from './migrations'
import { validateProject } from './validation'

const v1 = () => ({
  version: 1, name: '旧项目',
  stations: {
    a: { id: 'a', name: '甲', lng: 114.3, lat: 30.5 },
    b: { id: 'b', name: '乙', lng: 114.4, lat: 30.6 },
    c: { id: 'c', name: '丙', lng: 114.5, lat: 30.7 },
  },
  lines: {
    red: { id: 'red', name: '红线', color: '#dd4444', stationIds: ['a', 'b', 'c'] },
    blue: { id: 'blue', name: '蓝线', color: '#4477dd', stationIds: ['b', 'a'] },
  },
})

describe('project migrations', () => {
  it('converts v1 to v2 without mutating the original', () => {
    const source = v1()
    const snapshot = structuredClone(source)
    const result = validateProject(migrateProjectToCurrent(source))
    assert.equal(result.version, 2)
    assert.equal(result.name, '旧项目')
    assert.deepEqual(result.stations.a, source.stations.a)
    assert.deepEqual(result.waypoints, Object.create(null))
    assert.deepEqual(source, snapshot)
  })

  it('preserves station order across multiple lines and shared stations', () => {
    const result = validateProject(migrateProjectToCurrent(v1()))
    assert.deepEqual(result.lines.red.nodes, [{ type: 'station', id: 'a' }, { type: 'station', id: 'b' }, { type: 'station', id: 'c' }])
    assert.deepEqual(result.lines.blue.nodes, [{ type: 'station', id: 'b' }, { type: 'station', id: 'a' }])
    assert.equal(result.lines.red.name, '红线')
    assert.equal(result.lines.blue.color, '#4477dd')
  })

  it('preserves an empty v1 line', () => {
    const source = v1()
    source.lines.red.stationIds = []
    assert.deepEqual(validateProject(migrateProjectToCurrent(source)).lines.red.nodes, [])
  })

  it('passes v2 through unchanged', () => {
    const project = emptyProject('v2')
    assert.equal(migrateProjectToCurrent(project), project)
  })

  it('rejects unsupported and malformed versions', () => {
    assert.throws(() => migrateProjectToCurrent({ version: 99 }), /不支持的项目版本：99/)
    assert.throws(() => migrateProjectToCurrent({}), /缺少 version/)
    assert.throws(() => migrateProjectToCurrent({ version: '1' }), /必须是整数/)
    assert.throws(() => migrateProjectToCurrent({ version: 1.5 }), /必须是整数/)
  })
})
