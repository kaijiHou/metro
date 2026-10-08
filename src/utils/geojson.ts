import type { Feature, FeatureCollection, LineString, Point } from 'geojson'
import type { LineNode, MetroProject } from '../models/metro'
import { validCoordinates } from './validation'

type LineProperties = { id: string; name: string; color: string; status: string; selected: boolean }
type StationProperties = { id: string; name: string; transfer: boolean; selected: boolean }

export function resolveLineNodeCoordinate(project: MetroProject, node: LineNode): [number, number] | null {
  const point = node.type === 'station' ? project.stations[node.id] : project.waypoints[node.id]
  if (!point || !validCoordinates(point.lng, point.lat)) {
    if (import.meta.env?.DEV) console.warn(`跳过无效 ${node.type} 节点引用: ${node.id}`)
    return null
  }
  return [point.lng, point.lat]
}

export function nearestLineInsertIndex(
  project: MetroProject,
  lineId: string,
  coordinate: [number, number],
  toPixel: (coordinate: [number, number]) => [number, number],
): number | null {
  const line = project.lines[lineId]
  if (!line || line.nodes.length < 2) return null
  const [px, py] = toPixel(coordinate)
  let closestIndex: number | null = null
  let closestDistance = Infinity
  for (let index = 0; index < line.nodes.length - (line.closed ? 0 : 1); index += 1) {
    const start = resolveLineNodeCoordinate(project, line.nodes[index])
    const end = resolveLineNodeCoordinate(project, line.nodes[(index + 1) % line.nodes.length])
    if (!start || !end) continue
    const [ax, ay] = toPixel(start)
    const [bx, by] = toPixel(end)
    const dx = bx - ax
    const dy = by - ay
    const fraction = dx === 0 && dy === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
    const distance = (px - ax - fraction * dx) ** 2 + (py - ay - fraction * dy) ** 2
    if (distance < closestDistance) {
      closestDistance = distance
      closestIndex = index + 1
    }
  }
  return closestIndex
}

export function lineFeatureCollection(project: MetroProject, selectedLineId: string | null): FeatureCollection<LineString, LineProperties> {
  const features: Feature<LineString, LineProperties>[] = []
  for (const line of Object.values(project.lines)) {
    if (line.visible === false) continue
    const coordinates: [number, number][] = []
    for (const node of line.nodes) {
      const coordinate = resolveLineNodeCoordinate(project, node)
      if (coordinate) coordinates.push(coordinate)
    }
    if (coordinates.length < 2) continue
    if (line.closed) coordinates.push(coordinates[0])
    features.push({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates },
      properties: { id: line.id, name: line.name, color: line.color, status: line.status ?? 'planned', selected: line.id === selectedLineId },
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

export function stationLabelCollection(project: MetroProject, mode: 'all' | 'interchanges' | 'current' | 'none', selectedLineId: string | null) {
  const collection = stationFeatureCollection(project, null)
  const currentIds = new Set(selectedLineId ? project.lines[selectedLineId]?.nodes.filter((node) => node.type === 'station').map((node) => node.id) : [])
  collection.features = collection.features.filter((feature) => mode === 'all' ||
    (mode === 'interchanges' && feature.properties.transfer) || (mode === 'current' && currentIds.has(feature.properties.id)))
  return collection
}
