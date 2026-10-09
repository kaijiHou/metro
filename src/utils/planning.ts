import type { LineNode, MetroLine, MetroProject } from '../models/metro'

export const statusNames = { existing: '已建成', construction: '在建', planned: '规划' }
export const lineStatus = (line: MetroLine) => line.status ?? 'planned'
export const lineLocked = (line: MetroLine) => line.locked ?? lineStatus(line) === 'existing'
export const rootLine = (project: MetroProject, line: MetroLine) => project.lines[line.parentLineId ?? line.id] ?? line

export function extensionNodes(parent: MetroLine, part: MetroLine): LineNode[] | null {
  if (parent.closed || part.closed || !parent.nodes.length || !part.nodes.length) return null
  const same = (a: LineNode, b: LineNode) => a.type === b.type && a.id === b.id
  const p = parent.nodes, b = part.nodes
  let nodes: LineNode[]
  if (same(p[p.length - 1], b[0])) nodes = [...p, ...b.slice(1)]
  else if (same(p[p.length - 1], b[b.length - 1])) nodes = [...p, ...b.slice(0, -1).reverse()]
  else if (same(p[0], b[b.length - 1])) nodes = [...b.slice(0, -1), ...p]
  else if (same(p[0], b[0])) nodes = [...b.slice(1).reverse(), ...p]
  else return null
  return new Set(nodes.map((node) => `${node.type}:${node.id}`)).size === nodes.length ? nodes : null
}

export function lockedNodeIds(project: MetroProject, type: LineNode['type']): Set<string> {
  return new Set(Object.values(project.lines).filter(lineLocked).flatMap((line) =>
    line.nodes.filter((node) => node.type === type).map((node) => node.id)))
}

export function nodeLocked(project: MetroProject, type: LineNode['type'], id: string): boolean {
  return Object.values(project.lines).some((line) => lineLocked(line) &&
    line.nodes.some((node) => node.type === type && node.id === id))
}
