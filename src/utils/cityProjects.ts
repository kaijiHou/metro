import type { MetroProject } from '../models/metro'
import { parseProjectJson, type ProjectStorage } from './persistence'

export const CITY_PROJECT_PREFIX = 'metro-planner.city.'
export const CUSTOM_PROJECT_KEY = `${CITY_PROJECT_PREFIX}custom`

export function saveCityProject(project: MetroProject, storage?: ProjectStorage): void {
  storage?.setItem(`${CITY_PROJECT_PREFIX}${project.cityId ?? 'custom'}`, JSON.stringify(project))
}

export function readCityProject(cityId: string | null, storage?: ProjectStorage): MetroProject | null {
  const raw = storage?.getItem(`${CITY_PROJECT_PREFIX}${cityId ?? 'custom'}`)
  if (raw == null) return null
  const project = parseProjectJson(raw)
  if ((project.cityId ?? null) !== cityId) throw new Error('保存的规划与城市不匹配，原数据未覆盖。')
  return project
}
