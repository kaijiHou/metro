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
  if (typeof value.name !== 'string' || !value.name.trim()) throw new Error('项目名称不能为空。')
  if (!isRecord(value.stations)) throw new Error('缺少有效的 stations 对象。')
  if (!isRecord(value.waypoints)) throw new Error('缺少有效的 waypoints 对象。')
  if (!isRecord(value.lines)) throw new Error('缺少有效的 lines 对象。')

  const stations: Record<string, Station> = Object.create(null)
  for (const [id, raw] of Object.entries(value.stations)) {
    if (!isRecord(raw) || raw.id !== id || typeof raw.name !== 'string' || !raw.name.trim() ||
        typeof raw.lng !== 'number' || typeof raw.lat !== 'number' || !validCoordinates(raw.lng, raw.lat)) {
      throw new Error(`站点 ${id} 的 ID、名称或经纬度无效。`)
    }
    stations[id] = { id, name: raw.name.trim(), lng: raw.lng, lat: raw.lat }
  }

  const waypoints: Record<string, Waypoint> = Object.create(null)
  for (const [id, raw] of Object.entries(value.waypoints)) {
    if (!isRecord(raw) || raw.id !== id || typeof raw.lng !== 'number' ||
        typeof raw.lat !== 'number' || !validCoordinates(raw.lng, raw.lat)) {
      throw new Error(`控制点 ${id} 的 ID 或经纬度无效。`)
    }
    waypoints[id] = { id, lng: raw.lng, lat: raw.lat }
  }

  const lines: Record<string, MetroLine> = Object.create(null)
  for (const [id, raw] of Object.entries(value.lines)) {
    if (!isRecord(raw) || raw.id !== id || typeof raw.name !== 'string' || !raw.name.trim() ||
        !isColor(raw.color) || !Array.isArray(raw.nodes) || Object.hasOwn(raw, 'stationIds')) {
      throw new Error(`线路 ${id} 的字段无效。`)
    }
    const nodes: LineNode[] = []
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
    lines[id] = { id, name: raw.name.trim(), color: raw.color, nodes }
  }
  return { version: 2, name: value.name.trim(), stations, waypoints, lines }
}
