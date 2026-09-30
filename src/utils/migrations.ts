const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

export function migrateProjectToCurrent(value: unknown): unknown {
  if (!isRecord(value)) throw new Error('项目文件必须是 JSON 对象。')
  if (!Object.hasOwn(value, 'version')) throw new Error('项目缺少 version 字段。')
  if (typeof value.version !== 'number' || !Number.isInteger(value.version)) {
    throw new Error('项目 version 字段必须是整数。')
  }
  if (value.version === 1) return value
  throw new Error(`不支持的项目版本：${value.version}。当前仅支持 version: 1。`)
}
