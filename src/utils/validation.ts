import type { MetroLine, MetroProject, Station } from '../models/metro'

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

export const validCoordinates = (lng: number, lat: number): boolean =>
  Number.isFinite(lng) && Number.isFinite(lat) && lng >= -180 && lng <= 180 && lat >= -90 && lat <= 90

const isColor = (value: unknown): value is string =>
  typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value)

export function validateProject(value: unknown): MetroProject {
  if (!isRecord(value)) throw new Error('项目文件必须是 JSON 对象。')
  if (value.version !== 1) throw new Error('不支持的项目版本。当前仅支持 version: 1。')
  if (typeof value.name !== 'string' || !value.name.trim()) throw new Error('项目名称不能为空。')
  if (!isRecord(value.stations)) throw new Error('缺少有效的 stations 对象。')
  if (!isRecord(value.lines)) throw new Error('缺少有效的 lines 对象。')

  const stations: Record<string, Station> = Object.create(null)
  for (const [id, raw] of Object.entries(value.stations)) {
    if (!isRecord(raw) || raw.id !== id || typeof raw.name !== 'string' || !raw.name.trim() ||
        typeof raw.lng !== 'number' || typeof raw.lat !== 'number' || !validCoordinates(raw.lng, raw.lat)) {
      throw new Error(`站点 ${id} 的 ID、名称或经纬度无效。`)
    }
    stations[id] = { id, name: raw.name.trim(), lng: raw.lng, lat: raw.lat }
  }

  const lines: Record<string, MetroLine> = Object.create(null)
  for (const [id, raw] of Object.entries(value.lines)) {
    if (!isRecord(raw) || raw.id !== id || typeof raw.name !== 'string' || !raw.name.trim() ||
        !isColor(raw.color) || !Array.isArray(raw.stationIds) ||
        !raw.stationIds.every((stationId): stationId is string => typeof stationId === 'string')) {
      throw new Error(`线路 ${id} 的字段无效。`)
    }
    if (new Set(raw.stationIds).size !== raw.stationIds.length) {
      throw new Error(`线路 ${id} 重复引用了同一站点。`)
    }
    for (const stationId of raw.stationIds) {
      if (!stations[stationId]) throw new Error(`线路 ${id} 引用了不存在的站点 ${stationId}。`)
    }
    lines[id] = { id, name: raw.name.trim(), color: raw.color, stationIds: [...raw.stationIds] }
  }
  return { version: 1, name: value.name.trim(), stations, lines }
}
