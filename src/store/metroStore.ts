import { create } from 'zustand'
import { emptyProject, type EditorMode, type MetroLine, type MetroProject, type Station, type Waypoint } from '../models/metro'
import { readStoredProject, saveProject } from '../utils/persistence'
import { validCoordinates } from '../utils/validation'

export type Notice = { text: string; kind: 'info' | 'error' } | null

export type MetroState = {
  project: MetroProject
  selectedLineId: string | null
  selectedStationId: string | null
  selectedWaypointId: string | null
  editorMode: EditorMode
  pendingInsertIndex: number | null
  canUndo: boolean
  canRedo: boolean
  notice: Notice
  setNotice: (text: string, kind?: 'info' | 'error') => void
  clearNotice: () => void
  renameProject: (name: string) => void
  createLine: () => void
  updateLine: (id: string, patch: Pick<MetroLine, 'name'> | Pick<MetroLine, 'color'> | Pick<MetroLine, 'closed'>) => void
  deleteLine: (id: string) => void
  createStation: (lng: number, lat: number) => void
  updateStation: (id: string, patch: Partial<Pick<Station, 'name' | 'lng' | 'lat'>>) => void
  deleteStation: (id: string) => void
  createWaypoint: (lng: number, lat: number, lineId: string, insertIndex?: number) => void
  updateWaypoint: (id: string, patch: Partial<Pick<Waypoint, 'lng' | 'lat'>>) => void
  deleteWaypoint: (id: string) => void
  addStationToLine: (stationId: string, lineId: string, insertIndex?: number) => void
  removeNodeFromLine: (lineId: string, nodeIndex: number) => void
  moveLineNode: (lineId: string, fromIndex: number, toIndex: number) => void
  selectLine: (id: string | null) => void
  selectStation: (id: string | null) => void
  selectWaypoint: (id: string | null) => void
  setEditorMode: (mode: EditorMode) => void
  startWaypointInsert: (index: number) => void
  loadProject: (project: MetroProject) => void
  resetProject: (name?: string) => void
  undo: () => void
  redo: () => void
}

type CreateMetroStoreOptions = {
  initialProject?: MetroProject
  initialWarning?: string | null
  idFactory?: () => string
  persist?: (project: MetroProject) => void
}

const colors = ['#d94c4c', '#2878b9', '#22936f', '#9a63bb', '#db8c25', '#26a2aa']

function insertAt<T>(items: T[], item: T, index?: number): T[] {
  const next = [...items]
  next.splice(index === undefined ? next.length : index, 0, item)
  return next
}

function validInsertIndex(index: number | undefined, length: number): boolean {
  return index === undefined || (Number.isInteger(index) && index >= 0 && index <= length)
}

function removeNewlyOrphanedWaypoints(project: MetroProject, removedIds: Iterable<string>): MetroProject {
  let waypoints: MetroProject['waypoints'] | null = null
  for (const id of removedIds) {
    if (!project.waypoints[id] || Object.values(project.lines).some((line) =>
      line.nodes.some((node) => node.type === 'waypoint' && node.id === id))) continue
    waypoints ??= { ...project.waypoints }
    delete waypoints[id]
  }
  return waypoints ? { ...project, waypoints } : project
}

function cancelPendingInsert(state: MetroState) {
  return state.pendingInsertIndex === null
    ? { pendingInsertIndex: null }
    : { editorMode: 'browse' as const, pendingInsertIndex: null }
}

export function createMetroStore(options: CreateMetroStoreOptions = {}) {
  const restored = options.initialProject
    ? { project: options.initialProject, warning: options.initialWarning ?? null }
    : readStoredProject()
  const idFactory = options.idFactory ?? (() => crypto.randomUUID())
  const persist = options.persist ?? saveProject
  const past: MetroProject[] = []
  const future: MetroProject[] = []
  let applyingHistory = false

  const store = create<MetroState>((set, get) => ({
    project: restored.project,
    selectedLineId: Object.keys(restored.project.lines)[0] ?? null,
    selectedStationId: null,
    selectedWaypointId: null,
    editorMode: 'browse',
    pendingInsertIndex: null,
    canUndo: false,
    canRedo: false,
    notice: restored.warning ? { text: restored.warning, kind: 'error' } : null,

    setNotice: (text, kind = 'info') => set({ notice: { text, kind } }),
    clearNotice: () => set({ notice: null }),
    renameProject: (name) => {
      const trimmed = name.trim()
      if (trimmed) set((state) => trimmed === state.project.name ? state : { project: { ...state.project, name: trimmed } })
    },
    createLine: () => set((state) => {
      const id = idFactory()
      const usedNames = new Set(Object.values(state.project.lines).map((line) => line.name))
      let index = Object.keys(state.project.lines).length + 1
      while (usedNames.has(`${index}号线`)) index += 1
      const line: MetroLine = { id, name: `${index}号线`, color: colors[(index - 1) % colors.length], nodes: [] }
      return {
        project: { ...state.project, lines: { ...state.project.lines, [id]: line } },
        selectedLineId: id, selectedStationId: null, selectedWaypointId: null,
        editorMode: 'browse', pendingInsertIndex: null,
        notice: { text: `已创建 ${line.name}，开启添加站点模式后可点击地图。`, kind: 'info' },
      }
    }),
    updateLine: (id, patch) => set((state) => {
      const line = state.project.lines[id]
      if (!line) return state
      const updated = { ...line, ...patch }
      if (!updated.name.trim() || !/^#[0-9a-fA-F]{6}$/.test(updated.color)) return state
      if (updated.name === line.name && updated.color === line.color && updated.closed === line.closed) return state
      return { project: { ...state.project, lines: { ...state.project.lines, [id]: updated } } }
    }),
    deleteLine: (id) => set((state) => {
      const removedLine = state.project.lines[id]
      if (!removedLine) return state
      const lines = { ...state.project.lines }
      delete lines[id]
      const removedWaypointIds = removedLine.nodes.filter((node) => node.type === 'waypoint').map((node) => node.id)
      const project = removeNewlyOrphanedWaypoints({ ...state.project, lines }, removedWaypointIds)
      return {
        project,
        selectedLineId: state.selectedLineId === id ? (Object.keys(lines)[0] ?? null) : state.selectedLineId,
        selectedWaypointId: state.selectedWaypointId && !project.waypoints[state.selectedWaypointId] ? null : state.selectedWaypointId,
        editorMode: 'browse', pendingInsertIndex: null,
        notice: { text: '线路已删除，站点仍保留。', kind: 'info' },
      }
    }),
    createStation: (lng, lat) => {
      if (!validCoordinates(lng, lat)) return
      const { selectedLineId, project } = get()
      if (!selectedLineId || !project.lines[selectedLineId]) {
        set({ notice: { text: '请先选择或创建线路，再添加站点。', kind: 'error' }, editorMode: 'browse', pendingInsertIndex: null })
        return
      }
      set((state) => {
        const line = state.project.lines[selectedLineId]
        if (!line) return state
        const id = idFactory()
        const usedNames = new Set(Object.values(state.project.stations).map((station) => station.name))
        let number = Object.keys(state.project.stations).length + 1
        while (usedNames.has(`站点 ${number}`)) number += 1
        const station: Station = { id, name: `站点 ${number}`, lng, lat }
        return {
          project: {
            ...state.project,
            stations: { ...state.project.stations, [id]: station },
            lines: { ...state.project.lines, [selectedLineId]: { ...line, nodes: [...line.nodes, { type: 'station', id }] } },
          },
          selectedStationId: id, selectedWaypointId: null, notice: null,
          ...cancelPendingInsert(state),
        }
      })
    },
    updateStation: (id, patch) => set((state) => {
      const station = state.project.stations[id]
      if (!station) return state
      const updated = { ...station, ...patch }
      if (!updated.name.trim() || !validCoordinates(updated.lng, updated.lat)) return state
      if (updated.name === station.name && updated.lng === station.lng && updated.lat === station.lat) return state
      return { project: { ...state.project, stations: { ...state.project.stations, [id]: updated } } }
    }),
    deleteStation: (id) => set((state) => {
      if (!state.project.stations[id]) return state
      const stations = { ...state.project.stations }
      delete stations[id]
      const lines = Object.fromEntries(Object.entries(state.project.lines).map(([lineId, line]) =>
        [lineId, { ...line, nodes: line.nodes.filter((node) => !(node.type === 'station' && node.id === id)) }]))
      return {
        project: { ...state.project, stations, lines },
        selectedStationId: state.selectedStationId === id ? null : state.selectedStationId,
        notice: { text: '站点已从项目和所有线路中删除。', kind: 'info' },
        ...cancelPendingInsert(state),
      }
    }),
    createWaypoint: (lng, lat, lineId, insertIndex) => set((state) => {
      const line = state.project.lines[lineId]
      if (!line || !validCoordinates(lng, lat) || !validInsertIndex(insertIndex, line.nodes.length)) return state
      const id = idFactory()
      const waypoint: Waypoint = { id, lng, lat }
      return {
        project: {
          ...state.project,
          waypoints: { ...state.project.waypoints, [id]: waypoint },
          lines: { ...state.project.lines, [lineId]: { ...line, nodes: insertAt(line.nodes, { type: 'waypoint', id }, insertIndex) } },
        },
        selectedWaypointId: id, selectedStationId: null,
        editorMode: state.editorMode === 'add-waypoint' && state.pendingInsertIndex === null ? 'add-waypoint' : 'browse',
        pendingInsertIndex: null, notice: null,
      }
    }),
    updateWaypoint: (id, patch) => set((state) => {
      const waypoint = state.project.waypoints[id]
      if (!waypoint) return state
      const updated = { ...waypoint, ...patch }
      if (!validCoordinates(updated.lng, updated.lat)) return state
      if (updated.lng === waypoint.lng && updated.lat === waypoint.lat) return state
      return { project: { ...state.project, waypoints: { ...state.project.waypoints, [id]: updated } } }
    }),
    deleteWaypoint: (id) => set((state) => {
      if (!state.project.waypoints[id]) return state
      const waypoints = { ...state.project.waypoints }
      delete waypoints[id]
      const lines = Object.fromEntries(Object.entries(state.project.lines).map(([lineId, line]) =>
        [lineId, { ...line, nodes: line.nodes.filter((node) => !(node.type === 'waypoint' && node.id === id)) }]))
      return {
        project: { ...state.project, waypoints, lines },
        selectedWaypointId: state.selectedWaypointId === id ? null : state.selectedWaypointId,
        notice: { text: '控制点已从项目和所有线路中删除。', kind: 'info' },
        ...cancelPendingInsert(state),
      }
    }),
    addStationToLine: (stationId, lineId, insertIndex) => set((state) => {
      const line = state.project.lines[lineId]
      const station = state.project.stations[stationId]
      if (!line || !station || !validInsertIndex(insertIndex, line.nodes.length) ||
          line.nodes.some((node) => node.type === 'station' && node.id === stationId)) return state
      return {
        project: { ...state.project, lines: { ...state.project.lines, [lineId]: { ...line, nodes: insertAt(line.nodes, { type: 'station', id: stationId }, insertIndex) } } },
        selectedStationId: stationId, selectedWaypointId: null,
        notice: { text: `${station.name} 已加入 ${line.name}。`, kind: 'info' },
        ...cancelPendingInsert(state),
      }
    }),
    removeNodeFromLine: (lineId, nodeIndex) => set((state) => {
      const line = state.project.lines[lineId]
      if (!line || !Number.isInteger(nodeIndex) || nodeIndex < 0 || nodeIndex >= line.nodes.length) return state
      const removedNode = line.nodes[nodeIndex]
      const nodes = line.nodes.filter((_, index) => index !== nodeIndex)
      const updated = { ...state.project, lines: { ...state.project.lines, [lineId]: { ...line, nodes } } }
      const project = removedNode.type === 'waypoint' ? removeNewlyOrphanedWaypoints(updated, [removedNode.id]) : updated
      return {
        project,
        selectedWaypointId: state.selectedWaypointId && !project.waypoints[state.selectedWaypointId] ? null : state.selectedWaypointId,
        notice: { text: '节点已从当前线路移除。', kind: 'info' },
        ...cancelPendingInsert(state),
      }
    }),
    moveLineNode: (lineId, fromIndex, toIndex) => set((state) => {
      const line = state.project.lines[lineId]
      if (!line || !Number.isInteger(fromIndex) || !Number.isInteger(toIndex) || fromIndex < 0 ||
          toIndex < 0 || fromIndex >= line.nodes.length || toIndex >= line.nodes.length || fromIndex === toIndex) return state
      const nodes = [...line.nodes]
      const [node] = nodes.splice(fromIndex, 1)
      nodes.splice(toIndex, 0, node)
      return { project: { ...state.project, lines: { ...state.project.lines, [lineId]: { ...line, nodes } } }, ...cancelPendingInsert(state) }
    }),
    selectLine: (id) => set((state) => ({
      selectedLineId: id && state.project.lines[id] ? id : null,
      selectedStationId: null, selectedWaypointId: null,
      editorMode: 'browse', pendingInsertIndex: null,
    })),
    selectStation: (id) => set((state) => {
      const selectedStationId = id && state.project.stations[id] ? id : null
      const currentLine = state.selectedLineId ? state.project.lines[state.selectedLineId] : undefined
      const line = selectedStationId && !currentLine?.nodes.some((node) => node.type === 'station' && node.id === selectedStationId)
        ? Object.values(state.project.lines).find((item) => item.nodes.some((node) => node.type === 'station' && node.id === selectedStationId)) : undefined
      return { selectedStationId, selectedWaypointId: null, ...(line ? { selectedLineId: line.id, pendingInsertIndex: null } : {}) }
    }),
    selectWaypoint: (id) => set((state) => ({ selectedWaypointId: id && state.project.waypoints[id] ? id : null, selectedStationId: null })),
    setEditorMode: (mode) => set((state) => {
      if (mode === 'add-waypoint' && (!state.selectedLineId || !state.project.lines[state.selectedLineId])) {
        return { notice: { text: '请先选择或创建线路，再添加控制点。', kind: 'error' }, editorMode: 'browse', pendingInsertIndex: null }
      }
      return { editorMode: mode, pendingInsertIndex: null }
    }),
    startWaypointInsert: (index) => set((state) => {
      const line = state.selectedLineId ? state.project.lines[state.selectedLineId] : undefined
      if (!line || !Number.isInteger(index) || index < 0 || index > line.nodes.length) return state
      return { editorMode: 'add-waypoint', pendingInsertIndex: index }
    }),
    loadProject: (project) => set({ project, selectedLineId: Object.keys(project.lines)[0] ?? null, selectedStationId: null, selectedWaypointId: null, editorMode: 'browse', pendingInsertIndex: null, notice: { text: '项目已导入。', kind: 'info' } }),
    resetProject: (name) => set(() => ({
      project: emptyProject(name),
      selectedLineId: null, selectedStationId: null, selectedWaypointId: null,
      editorMode: 'browse', pendingInsertIndex: null,
      notice: { text: '已创建空项目。', kind: 'info' },
    })),
    undo: () => {
      const project = past.pop()
      if (!project) return
      future.push(get().project)
      applyingHistory = true
      try {
        set((state) => ({
          project,
          selectedLineId: state.selectedLineId && project.lines[state.selectedLineId] ? state.selectedLineId : (Object.keys(project.lines)[0] ?? null),
          selectedStationId: state.selectedStationId && project.stations[state.selectedStationId] ? state.selectedStationId : null,
          selectedWaypointId: state.selectedWaypointId && project.waypoints[state.selectedWaypointId] ? state.selectedWaypointId : null,
          editorMode: 'browse', pendingInsertIndex: null,
          canUndo: past.length > 0, canRedo: true,
          notice: { text: '已撤销上一步。', kind: 'info' },
        }))
      } finally { applyingHistory = false }
    },
    redo: () => {
      const project = future.pop()
      if (!project) return
      past.push(get().project)
      applyingHistory = true
      try {
        set((state) => ({
          project,
          selectedLineId: state.selectedLineId && project.lines[state.selectedLineId] ? state.selectedLineId : (Object.keys(project.lines)[0] ?? null),
          selectedStationId: state.selectedStationId && project.stations[state.selectedStationId] ? state.selectedStationId : null,
          selectedWaypointId: state.selectedWaypointId && project.waypoints[state.selectedWaypointId] ? state.selectedWaypointId : null,
          editorMode: 'browse', pendingInsertIndex: null,
          canUndo: true, canRedo: future.length > 0,
          notice: { text: '已重做上一步。', kind: 'info' },
        }))
      } finally { applyingHistory = false }
    },
  }))

  store.subscribe((state, previous) => {
    if (state.project === previous.project) return
    if (!applyingHistory) {
      past.push(previous.project)
      if (past.length > 50) past.shift()
      future.length = 0
      store.setState({ canUndo: true, canRedo: false })
    }
    try {
      persist(state.project)
    } catch (error) {
      console.error('项目自动保存失败', error)
      state.setNotice('本地自动保存失败，请导出 JSON 备份项目。', 'error')
    }
  })
  return store
}

export const useMetroStore = createMetroStore()
