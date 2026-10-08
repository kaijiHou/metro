import type { MetroLine, MetroProject } from '../models/metro'
import { resolveLineNodeCoordinate } from './geojson'
import { lineStatus } from './planning'

export function haversineKm(a: [number, number], b: [number, number]): number {
  const rad = Math.PI / 180
  const h = Math.sin((b[1] - a[1]) * rad / 2) ** 2 +
    Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin((b[0] - a[0]) * rad / 2) ** 2
  return 6371.0088 * 2 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, h))))
}

function linePoints(project: MetroProject, line: MetroLine) {
  return line.nodes.flatMap((node) => {
    const coordinate = resolveLineNodeCoordinate(project, node)
    return coordinate ? [{ node, coordinate }] : []
  })
}

export function lineStatistics(project: MetroProject, line: MetroLine) {
  const points = linePoints(project, line)
  const cumulative = [0]
  for (let i = 1; i < points.length; i++) {
    cumulative.push(cumulative[i - 1] + haversineKm(points[i - 1].coordinate, points[i].coordinate))
  }
  const closing = line.closed && points.length > 1 ? haversineKm(points[points.length - 1].coordinate, points[0].coordinate) : 0
  const totalLengthKm = (cumulative[cumulative.length - 1] ?? 0) + closing
  const stationIndices = points.flatMap((point, index) => point.node.type === 'station' ? [index] : [])
  const spacing = stationIndices.slice(1).map((index, i) => cumulative[index] - cumulative[stationIndices[i]])
  if (line.closed && stationIndices.length > 1) {
    spacing.push(totalLengthKm - cumulative[stationIndices[stationIndices.length - 1]] + cumulative[stationIndices[0]])
  }
  return {
    stationCount: stationIndices.length, nodeCount: line.nodes.length,
    waypointCount: line.nodes.filter((node) => node.type === 'waypoint').length,
    totalLengthKm,
    averageSpacingKm: spacing.length ? spacing.reduce((sum, value) => sum + value, 0) / spacing.length : 0,
    minSpacingKm: spacing.length ? Math.min(...spacing) : 0,
    maxSpacingKm: spacing.length ? Math.max(...spacing) : 0,
  }
}

function lineSegments(project: MetroProject, line: MetroLine) {
  const points = linePoints(project, line).map((point) => point.coordinate)
  if (line.closed && points.length > 1) points.push(points[0])
  return points.slice(1).map((b, i) => {
    const a = points[i]
    const key = [JSON.stringify(a), JSON.stringify(b)].sort().join('|')
    return { key, length: haversineKm(a, b) }
  })
}

export function cityStatistics(project: MetroProject) {
  const lines = Object.values(project.lines)
  const existing = lines.filter((line) => lineStatus(line) === 'existing')
  const planned = lines.filter((line) => lineStatus(line) === 'planned')
  const stations = (items: MetroLine[]) => new Set(items.flatMap((line) => line.nodes.filter((node) => node.type === 'station').map((node) => node.id)))
  const existingStations = stations(existing)
  const existingSegments = new Set(existing.flatMap((line) => lineSegments(project, line).map((segment) => segment.key)))
  const addedSegments = new Map<string, number>()
  for (const segment of planned.flatMap((line) => lineSegments(project, line))) {
    if (!existingSegments.has(segment.key)) addedSegments.set(segment.key, segment.length)
  }
  return {
    existingLines: existing.length, constructionLines: lines.filter((line) => lineStatus(line) === 'construction').length,
    plannedLines: planned.length, existingStations: existingStations.size,
    plannedNewStations: [...stations(planned)].filter((id) => !existingStations.has(id)).length,
    plannedNewLengthKm: [...addedSegments.values()].reduce((sum, length) => sum + length, 0),
  }
}
