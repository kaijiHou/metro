import type { Feature, FeatureCollection, LineString, Point } from 'geojson'
import type { LineNode, MetroProject } from '../models/metro'
import { validCoordinates } from './validation'

type LineProperties = { id: string; name: string; color: string; selected: boolean }
type StationProperties = { id: string; name: string; transfer: boolean; selected: boolean }

export function resolveLineNodeCoordinate(project: MetroProject, node: LineNode): [number, number] | null {
  const point = node.type === 'station' ? project.stations[node.id] : project.waypoints[node.id]
  if (!point || !validCoordinates(point.lng, point.lat)) {
    if (import.meta.env?.DEV) console.warn(`跳过无效 ${node.type} 节点引用: ${node.id}`)
    return null
  }
  return [point.lng, point.lat]
}

export function lineFeatureCollection(project: MetroProject, selectedLineId: string | null): FeatureCollection<LineString, LineProperties> {
  const features: Feature<LineString, LineProperties>[] = []
  for (const line of Object.values(project.lines)) {
    const coordinates: [number, number][] = []
    for (const node of line.nodes) {
      const coordinate = resolveLineNodeCoordinate(project, node)
      if (coordinate) coordinates.push(coordinate)
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
    for (const id of new Set(line.nodes.filter((node) => node.type === 'station').map((node) => node.id))) {
      counts[id] = (counts[id] ?? 0) + 1
    }
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
