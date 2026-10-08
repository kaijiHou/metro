import type { MetroProject } from '../models/metro'
import { validateProject } from './validation'
import type { ProjectStorage } from './persistence'

export type Scenario = { id: string; name: string; project: MetroProject }
export type ScenarioSet = { version: 1; activeId: string; scenarios: Scenario[] }
export const SCENARIO_PREFIX = 'metro-planner.scenarios.'
export const scenarioCity = (project: MetroProject) => project.cityId ?? 'custom'
export const defaultScenarioSet = (project: MetroProject): ScenarioSet => ({
  version: 1, activeId: 'default', scenarios: [{ id: 'default', name: '默认方案', project }],
})
export const activeScenario = (set: ScenarioSet) => set.scenarios.find((item) => item.id === set.activeId)!
export const withActiveProject = (set: ScenarioSet, project: MetroProject): ScenarioSet => ({
  ...set, scenarios: set.scenarios.map((item) => item.id === set.activeId ? { ...item, project } : item),
})

export function readScenarioSet(cityId: string | null, storage?: ProjectStorage): ScenarioSet | null {
  const raw = storage?.getItem(`${SCENARIO_PREFIX}${cityId ?? 'custom'}`)
  if (raw === undefined || raw === null) return null
  const value: unknown = JSON.parse(raw)
  if (!value || typeof value !== 'object') throw new Error('方案数据无效，请先导出当前项目备份。')
  const set = value as Record<string, unknown>
  if (set.version !== 1 || typeof set.activeId !== 'string' || !Array.isArray(set.scenarios) ||
      set.scenarios.length < 1 || set.scenarios.length > 5) throw new Error('方案数据无效，请先导出当前项目备份。')
  const ids = new Set<string>()
  const scenarios: Scenario[] = set.scenarios.map((item: unknown) => {
    if (!item || typeof item !== 'object') throw new Error('方案内容无效。')
    const entry = item as Record<string, unknown>
    if (typeof entry.id !== 'string' || !entry.id || ids.has(entry.id) ||
        typeof entry.name !== 'string' || !entry.name.trim()) throw new Error('方案内容无效。')
    ids.add(entry.id)
    const project = validateProject(entry.project)
    if ((project.cityId ?? null) !== cityId) throw new Error('方案与城市不匹配，当前项目已保留。')
    return { id: entry.id, name: entry.name.trim(), project }
  })
  if (!ids.has(set.activeId)) throw new Error('当前方案标识无效。')
  return { version: 1, activeId: set.activeId, scenarios }
}

export function saveScenarioSet(set: ScenarioSet, cityId: string | null, storage?: ProjectStorage): void {
  const key = `${SCENARIO_PREFIX}${cityId ?? 'custom'}`
  if (set.scenarios.length === 1 && set.activeId === 'default' && set.scenarios[0].name === '默认方案') {
    storage?.removeItem(key)
  } else {
    storage?.setItem(key, JSON.stringify(set))
  }
}
