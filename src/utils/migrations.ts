const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

export function migrateV1ToV2(value: Record<string, unknown>): unknown {
  if (!isRecord(value.lines)) throw new Error('旧项目缺少有效的 lines 对象。')
  const lines: Record<string, unknown> = {}
  for (const [id, raw] of Object.entries(value.lines)) {
    if (!isRecord(raw) || !Array.isArray(raw.stationIds)) throw new Error(`旧线路 ${id} 缺少 stationIds。`)
    lines[id] = {
      id: raw.id,
      name: raw.name,
      color: raw.color,
      nodes: raw.stationIds.map((stationId: unknown) => ({ type: 'station', id: stationId })),
    }
  }
  return { version: 2, name: value.name, stations: value.stations, waypoints: {}, lines }
}

export function migrateProjectToCurrent(value: unknown): unknown {
  if (!isRecord(value)) throw new Error('项目文件必须是 JSON 对象。')
  if (!Object.hasOwn(value, 'version')) throw new Error('项目缺少 version 字段。')
  if (typeof value.version !== 'number' || !Number.isInteger(value.version)) {
    throw new Error('项目 version 字段必须是整数。')
  }
  if (value.version === 2) return value
  if (value.version === 1) return migrateV1ToV2(value)
  throw new Error(`不支持的项目版本：${value.version}。当前支持 version: 1 和 2。`)
}
