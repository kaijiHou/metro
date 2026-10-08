import type { MapTarget } from '../config/map'
import { validateProject, validCoordinates } from './validation'
import type { MetroProject } from '../models/metro'

export type TransitCity = {
  id: string
  name: string
  aliases: string[]
  center: [number, number]
  bounds: [[number, number], [number, number]]
  lineCount: number
  stationCount: number
  retrievedAt: string
  sourceUrl: string
}

export function parseCityCatalog(value: unknown): TransitCity[] {
  if (!value || typeof value !== 'object' || !('cities' in value) || !Array.isArray(value.cities)) throw new Error('城市目录无效。')
  const cities = value.cities as TransitCity[]
  const ids = new Set<string>()
  for (const city of cities) {
    if (!city || !/^[a-z][a-z0-9-]{0,63}$/.test(city.id) || ids.has(city.id) || typeof city.name !== 'string' ||
        !Array.isArray(city.aliases) || !city.aliases.every((alias) => typeof alias === 'string') ||
        !Array.isArray(city.center) || city.center.length !== 2 || !validCoordinates(city.center[0], city.center[1]) ||
        !Array.isArray(city.bounds) || city.bounds.length !== 2 || !city.bounds.every((p) => Array.isArray(p) && p.length === 2 && validCoordinates(p[0], p[1])) ||
        !Number.isInteger(city.lineCount) || city.lineCount < 1 || !Number.isInteger(city.stationCount) || city.stationCount < 2 ||
        typeof city.retrievedAt !== 'string' || !Number.isFinite(Date.parse(city.retrievedAt))) throw new Error('城市目录包含无效信息。')
    ids.add(city.id)
  }
  if (!cities.length) throw new Error('城市目录为空。')
  return cities
}

export function findTransitCity(cities: TransitCity[], name: string): TransitCity | undefined {
  const normalized = name.trim().replace(/市$/, '').toLowerCase()
  return cities.find((city) => [city.name, city.id, ...city.aliases].some((alias) => alias.replace(/市$/, '').toLowerCase() === normalized))
}

export function cityMapTarget(city: TransitCity): MapTarget {
  return { center: city.center, zoom: 10, label: city.name, bounds: city.bounds }
}

const dataUrl = (name: string) => `${import.meta.env?.BASE_URL ?? '/'}transit/${name}.json`

export async function fetchCityCatalog(signal: AbortSignal): Promise<TransitCity[]> {
  const response = await fetch(dataUrl('catalog'), { signal })
  if (!response.ok) throw new Error('暂时无法加载城市目录。')
  return parseCityCatalog(await response.json())
}

export async function fetchCityProject(city: TransitCity, signal: AbortSignal): Promise<MetroProject> {
  const response = await fetch(dataUrl(city.id), { signal })
  if (!response.ok) throw new Error(`${city.name}线路加载失败，请重试。`)
  const data: unknown = await response.json()
  if (!data || typeof data !== 'object' || !('project' in data)) throw new Error('城市线路数据无效。')
  const project = validateProject(data.project)
  if (project.cityId !== city.id || Object.keys(project.lines).length === 0) throw new Error('城市线路数据不匹配。')
  return { ...project, lines: Object.fromEntries(Object.entries(project.lines).map(([id, line]) =>
    [id, { ...line, status: 'existing' as const, visible: true, locked: true }])) }
}
