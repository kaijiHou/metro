import type { Feature, FeatureCollection, LineString, Point } from 'geojson'
import type { MetroProject } from '../models/metro'
import { validCoordinates } from './validation'

type LineProperties = { id: string; name: string; color: string; selected: boolean }
type StationProperties = { id: string; name: string; transfer: boolean; selected: boolean }

// The ordered-node coordinate resolution lives here so future waypoint nodes
// can be added without changing map components.
export function lineFeatureCollection(project: MetroProject, selectedLineId: string | null): FeatureCollection<LineString, LineProperties> {
  const features: Feature<LineString, LineProperties>[] = []
  for (const line of Object.values(project.lines)) {
    const coordinates: [number, number][] = []
    for (const stationId of line.stationIds) {
      const station = project.stations[stationId]
      if (!station || !validCoordinates(station.lng, station.lat)) {
        console.warn(`线路 ${line.id} 跳过无效站点引用: ${stationId}`)
        continue
      }
      coordinates.push([station.lng, station.lat])
    }
    if (coordinates.length < 2) continue
    features.push({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates },
      properties: { id: line.id, name: line.name, color: line.color, selected: line.id === selectedLineId },
    })
  }
  return { type: 'FeatureCollection', features }
}

export function stationLineCounts(project: MetroProject): Record<string, number> {
  const counts: Record<string, number> = Object.create(null)
  for (const line of Object.values(project.lines)) {
    for (const id of new Set(line.stationIds)) counts[id] = (counts[id] ?? 0) + 1
  }
  return counts
}

export function stationFeatureCollection(project: MetroProject, selectedStationId: string | null): FeatureCollection<Point, StationProperties> {
  const counts = stationLineCounts(project)
  const features: Feature<Point, StationProperties>[] = []
  for (const station of Object.values(project.stations)) {
    if (!validCoordinates(station.lng, station.lat)) {
      console.warn(`跳过无效站点坐标: ${station.id}`)
      continue
    }
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [station.lng, station.lat] },
      properties: { id: station.id, name: station.name, transfer: (counts[station.id] ?? 0) >= 2, selected: station.id === selectedStationId },
    })
  }
  return { type: 'FeatureCollection', features }
}
