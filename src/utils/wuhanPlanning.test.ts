import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { it } from 'node:test'
import { createMetroStore } from '../store/metroStore'
import { validateProject } from './validation'
import { addWuhanPlanning, WUHAN_PLANNING_VERSION } from './wuhanPlanning'
import { stationLineCounts, lineFeatureCollection, stationLabelCollection } from './geojson'
import data from './wuhanConfirmedData.json'

const wuhan = () => validateProject(JSON.parse(readFileSync(new URL('../../public/transit/wuhan.json', import.meta.url), 'utf8')).project)
it('completes the official 37-stop loop and verified Line 10/11, reusing interchange records', () => {
  const base = wuhan(), result = addWuhanPlanning(base)
  const ring = result.lines['amap-4201-900000078508-0']
  assert.equal(ring.closed, true)
  assert.equal(ring.nodes.length, 37)
  assert.deepEqual(new Set(ring.nodes.map((node) => result.stations[node.id].name)), new Set(data.ring))
  assert.equal(new Set(Object.values(result.stations).map((station) => station.name)).size, Object.keys(result.stations).length)
  assert.equal(result.lines['wuhan-confirmed-10'].nodes.length, 13)
  assert.equal(result.lines['wuhan-confirmed-10'].status, 'construction')
  assert.deepEqual(result.lines['wuhan-confirmed-10'].nodes.map((node) => result.stations[node.id].name), data.ten)
  const extension = result.lines['wuhan-confirmed-11-west']
  assert.equal(extension.parentLineId, 'amap-4201-900000073743-0')
  assert.equal(extension.status, 'construction')
  assert.deepEqual(extension.nodes.map((node) => result.stations[node.id].name), data.eleven)
  assert.equal(result.lines[extension.parentLineId!].status, 'existing')
  for (const name of ['芳草路', '四新大道', '国博中心北', '钢都花园', '武汉火车站']) {
    const station = Object.values(base.stations).find((station) => station.name === name)!
    assert.deepEqual(result.stations[station.id], station)
    assert.ok(stationLineCounts(result)[station.id] >= 2, name)
  }
  const hanyang = Object.values(result.stations).find((station) => station.name === '汉阳站')!
  assert.ok(hanyang.lng > 114.14 && hanyang.lng < 114.16)
  assert.notEqual(hanyang.id, Object.values(base.stations).find((station) => station.name === '汉阳火车站')?.id)
  const features = lineFeatureCollection(result, null).features.filter((feature) => feature.properties.id === ring.id)
  assert.equal(features.length, 2)
  assert.equal(features[0].properties.status, 'existing')
  assert.equal(features[1].properties.status, 'construction')
  assert.equal(features[0].geometry.coordinates.length, 23)
  assert.equal(features[1].geometry.coordinates.length, 16)
  assert.deepEqual(features[0].geometry.coordinates[0], features.at(-1)!.geometry.coordinates.at(-1))
  assert.equal(stationLabelCollection(result, 'all', null).features.length, Object.keys(result.stations).length)
  assert.deepEqual(validateProject(JSON.parse(JSON.stringify(result))), result)
  assert.equal(addWuhanPlanning(result), result)
})

it('withdraws only generated corridors and orphan controls, preserves user records, and supports undo/redo/save', () => {
  const base = wuhan()
  base.lines.usernine = { id: 'usernine', name: '9号线', color: '#123456', nodes: [] }
  base.waypoints.generated = { id: 'generated', lng: 114.3, lat: 30.5 }
  base.waypoints.shared = { id: 'shared', lng: 114.4, lat: 30.5 }
  base.lines['wuhan-plan-9'] = { id:'wuhan-plan-9', name:'改名后的旧示意', color:'#123456', sourceLineId:'wuhan-corridors-2026-10-14-v1', nodes:[{type:'waypoint',id:'generated'},{type:'waypoint',id:'shared'}] }
  base.lines.userbranch = { id:'userbranch', name:'旧示意的支线', color:'#123456', parentLineId:'wuhan-plan-9', nodes:[] }
  base.lines.usernine.nodes.push({ type:'waypoint', id:'shared' })
  const existing = Object.values(base.stations).find((station) => station.name === '芳草路')!
  existing.name = '我改的芳草路'; existing.lng = 114.198
  let saved = base
  const store = createMetroStore({ initialProject:base, persist:(value) => { saved=value } })
  store.getState().applyWuhanPlanning()
  const result = store.getState().project
  assert.equal(result.lines['wuhan-plan-9'], undefined)
  assert.equal(result.lines.userbranch, undefined)
  assert.equal(result.waypoints.generated, undefined)
  assert.deepEqual(result.waypoints.shared, base.waypoints.shared)
  assert.deepEqual(result.lines.usernine, validateProject(base).lines.usernine)
  assert.deepEqual(result.stations[existing.id], existing)
  assert.ok(result.lines['wuhan-confirmed-11-west'].nodes.some((node) => node.id === existing.id))
  assert.deepEqual(saved, result)
  store.getState().undo(); assert.deepEqual(store.getState().project, base)
  store.getState().redo(); assert.deepEqual(store.getState().project, result)
  store.getState().applyWuhanPlanning(); assert.equal(store.getState().project, result)
  const ring = result.lines['amap-4201-900000078508-0']
  store.getState().removeNodeFromLine(ring.id, 0)
  const edited = store.getState().project
  assert.equal(addWuhanPlanning(validateProject(JSON.parse(JSON.stringify(edited)))).lines[ring.id].nodes.length, 36)
  assert.ok(edited.appliedUpdates?.includes(WUHAN_PLANNING_VERSION))
})

it('preserves edits made during an earlier live reload and handles forward or absent ring records', () => {
  const base = wuhan()
  const id = 'amap-4201-900000078508-0'
  base.lines[id].nodes.reverse()
  const result = addWuhanPlanning(base)
  assert.deepEqual(result.lines[id].nodes.map((node) => result.stations[node.id].name), data.ring)
  const partial = structuredClone(result)
  partial.appliedUpdates = ['wuhan-confirmed-2026-10-14-v2']
  delete partial.lines[id].existingSegments
  partial.lines[id].nodes.pop()
  partial.lines['wuhan-confirmed-11-west'].nodes.pop()
  const repaired = addWuhanPlanning(partial)
  assert.equal(repaired.lines[id].nodes.length, 36)
  assert.equal(repaired.lines['wuhan-confirmed-11-west'].nodes.length, 7)
  assert.equal(repaired.lines[id].existingSegments?.length, 22)
  delete base.lines[id]
  base.lines.myten = {id:'myten',name:'10号线',color:'#123456',nodes:[]}
  const restored = addWuhanPlanning(base)
  assert.equal(restored.lines['wuhan-confirmed-12'].nodes.length, 37)
  assert.equal(restored.lines['wuhan-confirmed-10'].parentLineId, 'myten')
  assert.deepEqual(restored.lines.myten.nodes, [])
})
