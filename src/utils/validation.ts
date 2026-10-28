import type { LineNode, MetroLine, MetroProject, Station, Waypoint } from '../models/metro'

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

export const validCoordinates = (lng: number, lat: number): boolean =>
  Number.isFinite(lng) && Number.isFinite(lat) && lng >= -180 && lng <= 180 && lat >= -90 && lat <= 90

const isColor = (value: unknown): value is string =>
  typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value)

export function validateProject(value: unknown): MetroProject {
  if (!isRecord(value)) throw new Error('项目文件必须是 JSON 对象。')
  if (value.version !== 2) throw new Error('不支持的项目版本。当前仅校验 version: 2。')
  if (value.cityId !== undefined && (typeof value.cityId !== 'string' || !/^[a-z][a-z0-9-]{0,63}$/.test(value.cityId))) throw new Error('无效的城市标识。')
  if (typeof value.name !== 'string' || !value.name.trim()) throw new Error('项目名称不能为空。')
  if (value.appliedUpdates !== undefined && (!Array.isArray(value.appliedUpdates) || !value.appliedUpdates.every((item) => typeof item === 'string' && item.length > 0))) throw new Error('项目更新标记无效。')
  if (!isRecord(value.stations)) throw new Error('缺少有效的 stations 对象。')
  if (!isRecord(value.waypoints)) throw new Error('缺少有效的 waypoints 对象。')
  if (!isRecord(value.lines)) throw new Error('缺少有效的 lines 对象。')

  const stations: Record<string, Station> = Object.create(null)
  for (const [id, raw] of Object.entries(value.stations)) {
    if (!isRecord(raw) || raw.id !== id || typeof raw.name !== 'string' || !raw.name.trim() ||
        typeof raw.lng !== 'number' || typeof raw.lat !== 'number' || !validCoordinates(raw.lng, raw.lat)) {
      throw new Error(`站点 ${id} 的 ID、名称或经纬度无效。`)
    }
    if (raw.aliases !== undefined && (!Array.isArray(raw.aliases) || !raw.aliases.every(alias => typeof alias === 'string' && alias.trim()))) throw new Error(`站点 ${id} 的别名无效。`)
    stations[id] = { id, name: raw.name.trim(), lng: raw.lng, lat: raw.lat, ...(Array.isArray(raw.aliases) ? {aliases: [...new Set(raw.aliases as string[])]} : {}) }
  }

  const waypoints: Record<string, Waypoint> = Object.create(null)
  for (const [id, raw] of Object.entries(value.waypoints)) {
    if (!isRecord(raw) || raw.id !== id || typeof raw.lng !== 'number' ||
        typeof raw.lat !== 'number' || !validCoordinates(raw.lng, raw.lat)) {
      throw new Error(`控制点 ${id} 的 ID 或经纬度无效。`)
    }
    if (raw.name !== undefined && (typeof raw.name !== 'string' || !raw.name.trim())) throw new Error(`控制点 ${id} 名称无效。`)
    waypoints[id] = { id, lng: raw.lng, lat: raw.lat, ...(typeof raw.name === 'string' ? { name: raw.name.trim() } : {}) }
  }

  const lines: Record<string, MetroLine> = Object.create(null)
  for (const [id, raw] of Object.entries(value.lines)) {
    if (!isRecord(raw) || raw.id !== id || typeof raw.name !== 'string' || !raw.name.trim() ||
        !isColor(raw.color) || !Array.isArray(raw.nodes) || Object.hasOwn(raw, 'stationIds')) {
      throw new Error(`线路 ${id} 的字段无效。`)
    }
    if (raw.status !== undefined && (typeof raw.status !== 'string' || !['existing', 'construction', 'planned'].includes(raw.status))) throw new Error(`线路 ${id} 的状态无效。`)
    if (raw.visible !== undefined && typeof raw.visible !== 'boolean') throw new Error(`线路 ${id} 的显示状态无效。`)
    if (raw.transport !== undefined && (typeof raw.transport !== 'string' || !['metro','tram'].includes(raw.transport))) throw new Error(`线路 ${id} 的交通类型无效。`)
    if (raw.direction !== undefined && (typeof raw.direction !== 'string' || !['both','forward'].includes(raw.direction))) throw new Error(`线路 ${id} 的行驶方向无效。`)
    if (raw.locked !== undefined && typeof raw.locked !== 'boolean') throw new Error(`线路 ${id} 的锁定状态无效。`)
    if (raw.sourceLineId !== undefined && (typeof raw.sourceLineId !== 'string' || !raw.sourceLineId)) throw new Error(`线路 ${id} 的来源标识无效。`)
    if (raw.parentLineId !== undefined && (typeof raw.parentLineId !== 'string' || !raw.parentLineId)) throw new Error(`线路 ${id} 的支线归属无效。`)
    if (raw.planningNote !== undefined && (typeof raw.planningNote !== 'string' || !raw.planningNote.trim())) throw new Error(`线路 ${id} 的规划说明无效。`)
    if (raw.existingSegments !== undefined && (!Array.isArray(raw.existingSegments) || !raw.existingSegments.every((pair) => Array.isArray(pair) && pair.length === 2 && pair.every((nodeId) => typeof nodeId === 'string' && nodeId.length > 0)))) throw new Error(`线路 ${id} 的已开通区间标记无效。`)
    const nodes: LineNode[] = []
    if (raw.closed !== undefined && typeof raw.closed !== 'boolean') throw new Error(`线路 ${id} 的环线标记无效。`)
    const seen = new Set<string>()
    for (const node of raw.nodes) {
      if (!isRecord(node) || (node.type !== 'station' && node.type !== 'waypoint') || typeof node.id !== 'string') {
        throw new Error(`线路 ${id} 包含无效节点。`)
      }
      const key = `${node.type}:${node.id}`
      if (seen.has(key)) throw new Error(`线路 ${id} 重复引用了节点 ${node.id}。`)
      seen.add(key)
      if (node.type === 'station' && !Object.hasOwn(stations, node.id)) throw new Error(`线路 ${id} 引用了不存在的站点 ${node.id}。`)
      if (node.type === 'waypoint' && !Object.hasOwn(waypoints, node.id)) throw new Error(`线路 ${id} 引用了不存在的控制点 ${node.id}。`)
      nodes.push({ type: node.type, id: node.id })
    }
    const legacyExisting = typeof value.cityId === 'string' && id.startsWith('amap-')
    lines[id] = { id, name: raw.name.trim(), color: raw.color, nodes, ...(raw.closed !== undefined ? { closed: raw.closed } : {}),
      status: (raw.status ?? (legacyExisting ? 'existing' : 'planned')) as MetroLine['status'],
      visible: raw.visible ?? true, locked: raw.locked ?? (raw.status === 'existing' || legacyExisting),
      ...(raw.sourceLineId !== undefined ? { sourceLineId: raw.sourceLineId as string } : {}),
      ...(raw.parentLineId !== undefined ? { parentLineId: raw.parentLineId as string } : {}),
      ...(Array.isArray(raw.existingSegments) ? { existingSegments: raw.existingSegments.map((pair) => [...pair]) as [string, string][] } : {}),
      ...(typeof raw.planningNote === 'string' ? { planningNote: raw.planningNote } : {}),
      ...(raw.transport ? {transport:raw.transport as MetroLine['transport']} : {}),
      ...(raw.direction ? {direction:raw.direction as MetroLine['direction']} : {}) }
  }
  for (const line of Object.values(lines)) {
    if (line.parentLineId && (!lines[line.parentLineId] || lines[line.parentLineId].parentLineId || line.parentLineId === line.id)) throw new Error(`支线 ${line.name} 的所属线路不存在或无效。`)
  }
  return { version: 2, name: value.name.trim(), stations, waypoints, lines, ...(typeof value.cityId === 'string' ? { cityId: value.cityId } : {}), ...(Array.isArray(value.appliedUpdates) ? { appliedUpdates: [...value.appliedUpdates] as string[] } : {}) }
}
