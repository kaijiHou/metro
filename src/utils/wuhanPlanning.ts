import type { LineNode, LineStatus, MetroProject } from '../models/metro'
import data from './wuhanConfirmedData.json'
import { validateProject } from './validation'

export const WUHAN_PLANNING_VERSION = 'wuhan-confirmed-2026-10-14-v4'
const baseVersion = 'wuhan-confirmed-2026-10-14-v3'
const withdrawnVersion = 'wuhan-corridors-2026-10-14-v1'
const withdrawnIds = new Set([
  ...[9,10,13,14,15,17,18,20,22,23,24,25,26,27,28,29,30,31,32,34,35,37].map((number) => `wuhan-plan-${number}`),
  'wuhan-plan-3-远期延伸', 'wuhan-plan-6-远期延伸', 'wuhan-plan-8-远期北延', 'wuhan-plan-8-远期南延',
  'wuhan-plan-11-远期西延', 'wuhan-plan-16-远期北延', 'wuhan-plan-19-远期南延', 'wuhan-plan-21-远期西延',
])

function confirmedStationId(project: MetroProject, name: string): string {
  const record = (data.stations as Record<string, {id:string;lng:number;lat:number}>)[name]
  // Stable snapshot IDs retain stations the user has already renamed or moved.
  const existing = project.stations[record.id] ?? Object.values(project.stations).find((station) => station.name.trim() === name)
  if (existing) return existing.id
  project.stations[record.id] = { id: record.id, name, lng: record.lng, lat: record.lat }
  return record.id
}

/** Remove only withdrawn generated records, then add the original verified supplement once. */
function addBaseNetwork(input: MetroProject): MetroProject {
  if (input.cityId !== 'wuhan') return input
  const removed = new Set(Object.values(input.lines).filter((line) =>
    line.sourceLineId === withdrawnVersion || withdrawnIds.has(line.id)).map((line) => line.id))
  for (const line of Object.values(input.lines)) if (line.parentLineId && removed.has(line.parentLineId)) removed.add(line.id)
  const applied = input.appliedUpdates?.includes(baseVersion)
  if (applied && !removed.size) return input
  const project = structuredClone(input)
  const removedWaypoints = new Set([...removed].flatMap((id) => input.lines[id].nodes.filter((node) => node.type === 'waypoint').map((node) => node.id)))
  for (const id of removed) delete project.lines[id]
  const used = new Set(Object.values(project.lines).flatMap((line) => line.nodes.filter((node) => node.type === 'waypoint').map((node) => node.id)))
  for (const id of removedWaypoints) if (!used.has(id)) delete project.waypoints[id]
  if (applied) return validateProject(project)
  // During local live reload, v2 may already have applied the station repair. Only add its missing visual metadata.
  if (input.appliedUpdates?.includes('wuhan-confirmed-2026-10-14-v2')) {
    const ring = project.lines['amap-4201-900000078508-0'] ?? project.lines['wuhan-confirmed-12']
    if (ring && !ring.existingSegments) {
      const opened = data.ring.slice(0,23).map((name) => (data.stations as Record<string,{id:string}>)[name].id)
      ring.existingSegments = opened.slice(1).map((id,index) => [opened[index],id])
    }
    project.appliedUpdates = [...input.appliedUpdates,baseVersion]
    return validateProject(project)
  }

  const stationId = (name: string) => confirmedStationId(project,name)
  const nodes = (names: string[]): LineNode[] => names.map((name) => ({ type: 'station', id: stationId(name) }))
  const twelve = project.lines['amap-4201-900000078508-0'] ?? Object.values(project.lines).find((line) => line.name === '12号线' && !line.parentLineId)
  if (twelve) {
    // Preserve the original order and control points, appending the missing arc at its terminal.
    const completion = nodes(data.ring.slice(23))
    const stationNodes = twelve.nodes.filter((node) => node.type === 'station')
    const first = stationNodes[0]?.id, last = stationNodes.at(-1)?.id
    const steel = stationId('钢都花园'), lake = stationId('墨水湖公园')
    const present = new Set(stationNodes.map((node) => node.id))
    const missing = completion.filter((node) => !present.has(node.id))
    if (first === lake && last === steel) twelve.nodes = [...twelve.nodes, ...missing.reverse()]
    else if (first === steel && last === lake) twelve.nodes = [...twelve.nodes, ...missing]
    else twelve.nodes = nodes(data.ring)
    twelve.closed = true
    twelve.status = 'construction'
    twelve.locked = false
    twelve.planningNote = '完整环线37站；钢都花园—墨水湖公园23站已开通，其余14站为在建部分。所有线路统一实线显示，状态以文字标注为准。站名依据市交通局2025-06-17正式通告；新增站位为公开地图位置。'
  } else {
    project.lines['wuhan-confirmed-12'] = { id: 'wuhan-confirmed-12', name: '12号线', color: '#8e9b26', status: 'construction', visible: true, locked: false, closed: true, nodes: nodes(data.ring), sourceLineId: WUHAN_PLANNING_VERSION,
      planningNote: '完整环线37站；钢都花园—墨水湖公园23站已开通，其余14站在建。新增站位为公开地图位置。' }
  }
  const ring = twelve ?? project.lines['wuhan-confirmed-12']
  const opened = data.ring.slice(0,23).map(stationId)
  ring.existingSegments = opened.slice(1).map((id,index) => [opened[index],id])
  const eleven = project.lines['amap-4201-900000073743-0'] ?? Object.values(project.lines).find((line) => line.name === '11号线' && !line.parentLineId)
  stationId('汉阳站')
  if (eleven) project.lines['wuhan-confirmed-11-west'] = { id: 'wuhan-confirmed-11-west', name: `${eleven.name}四期延长段`, color: eleven.color, status: 'construction', visible: true, locked: false, parentLineId: eleven.id, nodes: nodes(data.eleven), sourceLineId: WUHAN_PLANNING_VERSION,
    planningNote: '汉阳站—江安路，六座新站已确认，在建。站名依据市政府2026-10-02公开信息；汤山、梅林、江国路为公开地图位置，共用3/6/12号线换乘站。汉阳站是新汉阳高铁枢纽，与既有汉阳火车站不同。' }
  const ten = Object.values(project.lines).find((line) => line.id !== 'wuhan-confirmed-10' && line.name === '10号线' && !line.parentLineId)
  project.lines['wuhan-confirmed-10'] = { id: 'wuhan-confirmed-10', name: ten ? `${ten.name}确认在建段` : '10号线', color: ten?.color ?? '#987149', ...(ten ? { parentLineId: ten.id } : {}), status: 'construction', visible: true, locked: false, nodes: nodes(data.ten), sourceLineId: WUHAN_PLANNING_VERSION,
    planningNote: '仅加入已确认的汉口火车站—北洋桥西延段8站及新港线一期5站，共13站，均未开通。西延段采用环评工程站名（工业路），不包含旧方案淮海路或远期未确定区段。线路连接为沙盘示意，非施工线位。' }
  project.appliedUpdates = [...(project.appliedUpdates ?? []), baseVersion]
  return validateProject(project)
}

/** Later batches are additive: never reapply 10/11/12 or overwrite edits to a previous batch. */
export function addWuhanPlanning(input: MetroProject): MetroProject {
  const base = addBaseNetwork(input)
  if (base.cityId !== 'wuhan' || base.appliedUpdates?.includes(WUHAN_PLANNING_VERSION)) return base
  const project = structuredClone(base)
  for (const extension of data.extensions) {
    if (project.lines[extension.id]) continue
    const parent = project.lines[extension.parentId] ?? Object.values(project.lines).find((line) => !line.parentLineId && line.name === extension.parentName)
    if (!parent || parent.parentLineId) continue
    const nodes: LineNode[] = extension.stations.map((name) => ({type:'station',id:confirmedStationId(project,name)}))
    project.lines[extension.id] = { id:extension.id, name:`${parent.name}${extension.part}`, color:parent.color, parentLineId:parent.id, status:extension.status as LineStatus, visible:true, locked:false, nodes, sourceLineId:WUHAN_PLANNING_VERSION, planningNote:extension.note }
  }
  project.appliedUpdates = [...(project.appliedUpdates ?? []),WUHAN_PLANNING_VERSION]
  return validateProject(project)
}
