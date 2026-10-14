import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { it } from 'node:test'
import { createMetroStore } from '../store/metroStore'
import { validateProject } from './validation'
import { addWuhanPlanning, wuhanCorridors } from './wuhanPlanning'
import { stationLineCounts } from './geojson'

const wuhan = () => validateProject(JSON.parse(readFileSync(new URL('../../public/transit/wuhan.json', import.meta.url), 'utf8')).project)
it('imports editable corridors, shares exact station IDs, creates no invented station and preserves imported edits', () => {
  const base = wuhan()
  const result = addWuhanPlanning(base)
  assert.equal(Object.keys(result.lines).length, Object.keys(base.lines).length + wuhanCorridors.length)
  assert.deepEqual(result.stations, base.stations)
  assert.equal(new Set(Object.values(result.stations).map((station) => station.name)).size, Object.keys(result.stations).length)
  const guanggu = Object.values(base.stations).find((station) => station.name === '光谷广场')!
  assert.ok(result.lines['wuhan-plan-9'].nodes.some((node) => node.id === guanggu.id && node.type === 'station'))
  assert.ok(stationLineCounts(result)[guanggu.id] >= 3)
  for (const corridor of wuhanCorridors) {
    const line = result.lines[`wuhan-plan-${corridor.number}${corridor.part ? `-${corridor.part}` : ''}`]
    assert.ok(line.nodes.length >= 2, line.name)
    assert.equal(line.status, 'planned')
    assert.equal(line.locked, false)
    assert.match(line.planningNote!, /示意/)
  }
  result.lines['wuhan-plan-10'].name = '我的10号线'
  assert.equal(addWuhanPlanning(result), result)
  assert.deepEqual(validateProject(JSON.parse(JSON.stringify(result))), result)
})

it('replaces old nine and its branch, cleans only their orphan nodes, deduplicates names and supports one-step undo/redo/save', () => {
  const base = wuhan()
  base.stations.old = { id: 'old', name: '旧9号线专用站', lng:114.3, lat:30.5 }
  const guanggu = Object.values(base.stations).find((station) => station.name === '光谷广场')!
  base.stations.duplicate = { ...guanggu, id:'duplicate' }
  base.waypoints.oldcontrol = { id:'oldcontrol', lng:114.3, lat:30.5 }
  base.lines.oldnine = { id:'oldnine', name:'9号线', color:'#123456', nodes:[{type:'station',id:'old'},{type:'station',id:'duplicate'}] }
  base.lines.branch = { id:'branch', name:'9号线支线', parentLineId:'oldnine', color:'#123456', nodes:[{type:'station',id:'old'},{type:'waypoint',id:'oldcontrol'}] }
  let saved = base
  const store = createMetroStore({ initialProject:base, persist: (value) => { saved=value } })
  store.getState().applyWuhanPlanning()
  const result = store.getState().project
  assert.equal(result.lines.oldnine, undefined)
  assert.equal(result.lines.branch, undefined)
  assert.equal(result.stations.old, undefined)
  assert.equal(result.stations.duplicate, undefined)
  assert.equal(result.waypoints.oldcontrol, undefined)
  assert.deepEqual(result.stations[guanggu.id], guanggu)
  assert.deepEqual(validateProject(JSON.parse(JSON.stringify(saved))),result)
  store.getState().undo()
  assert.deepEqual(store.getState().project,base)
  store.getState().redo()
  assert.deepEqual(store.getState().project,result)
  store.getState().applyWuhanPlanning()
  assert.equal(store.getState().project,result)
})
