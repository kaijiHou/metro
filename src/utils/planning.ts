import type { LineNode, MetroLine, MetroProject } from '../models/metro'

export const statusNames = { existing: '已建成', construction: '在建', planned: '规划' }
export const lineStatus = (line: MetroLine) => line.status ?? 'planned'
export const lineLocked = (line: MetroLine) => line.locked ?? lineStatus(line) === 'existing'
export const rootLine = (project: MetroProject, line: MetroLine) => project.lines[line.parentLineId ?? line.id] ?? line

export function lockedNodeIds(project: MetroProject, type: LineNode['type']): Set<string> {
  return new Set(Object.values(project.lines).filter(lineLocked).flatMap((line) =>
    line.nodes.filter((node) => node.type === type).map((node) => node.id)))
}

export function nodeLocked(project: MetroProject, type: LineNode['type'], id: string): boolean {
  return Object.values(project.lines).some((line) => lineLocked(line) &&
    line.nodes.some((node) => node.type === type && node.id === id))
}
