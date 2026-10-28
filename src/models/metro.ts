export type Station = {
  id: string
  name: string
  lng: number
  lat: number
  aliases?: string[]
}

export type Waypoint = { id: string; lng: number; lat: number; name?: string }
export type LineNode = { type: 'station' | 'waypoint'; id: string }

export type LineStatus = 'existing' | 'construction' | 'planned'

export type MetroLine = {
  id: string
  name: string
  color: string
  nodes: LineNode[]
  closed?: boolean
  status?: LineStatus
  visible?: boolean
  locked?: boolean
  sourceLineId?: string
  parentLineId?: string
  planningNote?: string
  existingSegments?: [string, string][]
  transport?: 'metro' | 'tram'
  direction?: 'both' | 'forward'
}

export type MetroProject = {
  version: 2
  cityId?: string
  appliedUpdates?: string[]
  name: string
  stations: Record<string, Station>
  waypoints: Record<string, Waypoint>
  lines: Record<string, MetroLine>
}

export type EditorMode = 'browse' | 'add-station' | 'add-waypoint' | 'select-stations'

export const emptyProject = (name = '我的地铁规划'): MetroProject => ({
  version: 2,
  name,
  stations: {},
  waypoints: {},
  lines: {},
})
