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

function partStatistics(project: MetroProject, line: MetroLine) {
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

export function lineStatistics(project: MetroProject, line: MetroLine) {
  const members = [line, ...Object.values(project.lines).filter((item) => item.parentLineId === line.id)]
  const parts = members.map((item) => partStatistics(project, item))
  if (parts.length === 1) return parts[0]
  const gaps = parts.map((part, i) => Math.max(0, part.stationCount - 1) + (members[i].closed && part.stationCount > 1 ? 1 : 0))
  const spacingParts = parts.filter((_, i) => gaps[i] > 0)
  const totalGaps = gaps.reduce((sum, count) => sum + count, 0)
  const nodes = new Set(members.flatMap((item) => item.nodes.map((node) => `${node.type}:${node.id}`)))
  const segments = new Map(members.flatMap((item) => lineSegments(project, item).map((segment) => [segment.key, segment.length] as const)))
  return {
    stationCount: new Set(members.flatMap((item) => item.nodes.filter((node) => node.type === 'station').map((node) => node.id))).size,
    nodeCount: nodes.size,
    waypointCount: new Set(members.flatMap((item) => item.nodes.filter((node) => node.type === 'waypoint').map((node) => node.id))).size,
    totalLengthKm: [...segments.values()].reduce((sum, value) => sum + value, 0),
    averageSpacingKm: totalGaps ? parts.reduce((sum, part, i) => sum + part.averageSpacingKm * gaps[i], 0) / totalGaps : 0,
    minSpacingKm: spacingParts.length ? Math.min(...spacingParts.map((part) => part.minSpacingKm)) : 0,
    maxSpacingKm: spacingParts.length ? Math.max(...spacingParts.map((part) => part.maxSpacingKm)) : 0,
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
    existingLines: existing.filter((line) => !line.parentLineId).length, constructionLines: lines.filter((line) => !line.parentLineId && lineStatus(line) === 'construction').length,
    plannedLines: planned.filter((line) => !line.parentLineId).length, existingStations: existingStations.size,
    plannedNewStations: [...stations(planned)].filter((id) => !existingStations.has(id)).length,
    plannedNewLengthKm: [...addedSegments.values()].reduce((sum, length) => sum + length, 0),
  }
}
