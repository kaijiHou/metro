export type Station = {
  id: string
  name: string
  lng: number
  lat: number
}

export type MetroLine = {
  id: string
  name: string
  color: string
  stationIds: string[]
}

export type MetroProject = {
  version: 1
  name: string
  stations: Record<string, Station>
  lines: Record<string, MetroLine>
}

export type EditorMode = 'browse' | 'add-station'

export const emptyProject = (name = '我的地铁规划'): MetroProject => ({
  version: 1,
  name,
  stations: {},
  lines: {},
})
