import { create } from 'zustand'
import { emptyProject, type EditorMode, type MetroLine, type MetroProject, type Station, type Waypoint } from '../models/metro'
import { readStoredProject, saveProject, type ProjectStorage } from '../utils/persistence'
import { readCityProject, saveCityProject } from '../utils/cityProjects'
import { activeScenario, defaultScenarioSet, readScenarioSet, saveScenarioSet, withActiveProject, type ScenarioSet } from '../utils/scenarios'
import { lineLocked, lineStatus, nodeLocked, lockedNodeIds } from '../utils/planning'
import { validCoordinates } from '../utils/validation'

export type Notice = { text: string; kind: 'info' | 'error' } | null

export type MetroState = {
  project: MetroProject
  selectedLineId: string | null
  selectedStationId: string | null
  selectedStationIds: string[]
  selectedWaypointId: string | null
  editorMode: EditorMode
  pendingInsertIndex: number | null
  extensionEnd: 'start' | 'end' | null
  canUndo: boolean
  canRedo: boolean
  stationLabelMode: 'all' | 'interchanges' | 'current' | 'none'
  setStationLabelMode: (mode: 'all' | 'interchanges' | 'current' | 'none') => void
  scenarios: { id: string; name: string }[]
  activeScenarioId: string
  createScenario: (name: string, baseProject: MetroProject) => boolean
  startNewProject: (name: string) => boolean
  copyScenario: (name: string) => boolean
  renameScenario: (id: string, name: string) => void
  switchScenario: (id: string) => boolean
  deleteScenario: (id: string) => boolean
  notice: Notice
  setNotice: (text: string, kind?: 'info' | 'error') => void
  clearNotice: () => void
  renameProject: (name: string) => void
  createLine: () => void
  updateLine: (id: string, patch: Pick<MetroLine, 'name'> | Pick<MetroLine, 'color'> | Pick<MetroLine, 'closed'> | Pick<MetroLine, 'status'> | Pick<MetroLine, 'visible'> | Pick<MetroLine, 'locked'>) => void
  deleteLine: (id: string) => void
  createStation: (lng: number, lat: number, insertIndex?: number) => void
  setAllLinesVisible: (visible: boolean, onlyId?: string) => void
  copyLineToPlanned: (id: string) => string | null
  extendLine: (id: string, end: 'start' | 'end') => void
  createBranch: (stationId: string) => void
  updateStation: (id: string, patch: Partial<Pick<Station, 'name' | 'lng' | 'lat'>>) => void
  deleteStation: (id: string) => void
  deleteStations: (ids: string[]) => void
  selectStations: (ids: string[]) => void
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
  switchCity: (project: MetroProject) => boolean
  resetProject: (name?: string, keepCity?: boolean) => void
  undo: () => void
  redo: () => void
}

type CreateMetroStoreOptions = {
  initialProject?: MetroProject
  initialWarning?: string | null
  idFactory?: () => string
  persist?: (project: MetroProject) => void
  cityStorage?: ProjectStorage
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
    : { editorMode: 'browse' as const, extensionEnd: null, pendingInsertIndex: null }
}

export function createMetroStore(options: CreateMetroStoreOptions = {}) {
  const restored = options.initialProject
    ? { project: options.initialProject, warning: options.initialWarning ?? null }
    : readStoredProject()
  const idFactory = options.idFactory ?? (() => crypto.randomUUID())
  const persist = options.persist ?? saveProject
  const cityStorage = options.cityStorage ?? (typeof localStorage === 'undefined' ? undefined : localStorage)
  const past: MetroProject[] = []
  const future: MetroProject[] = []
  let applyingHistory = false
  let switchingCity = false
  let scenarioStorageBroken = false
  let scenarios: ScenarioSet
  try {
    const saved = readScenarioSet(restored.project.cityId ?? null, cityStorage)
    scenarios = saved ? withActiveProject(saved, restored.project) : defaultScenarioSet(restored.project)
  } catch {
    scenarioStorageBroken = true
    scenarios = defaultScenarioSet(restored.project)
  }
  const scenarioSummary = (set: ScenarioSet) => set.scenarios.map(({ id, name }) => ({ id, name }))

  const store = create<MetroState>((set, get) => ({
    project: restored.project,
    stationLabelMode: 'interchanges',
    setStationLabelMode: (stationLabelMode) => set({ stationLabelMode }),
    scenarios: scenarioSummary(scenarios),
    activeScenarioId: scenarios.activeId,
    selectedLineId: Object.keys(restored.project.lines)[0] ?? null,
    selectedStationId: null,
    selectedStationIds: [],
    selectedWaypointId: null,
    editorMode: 'browse',
    pendingInsertIndex: null,
    extensionEnd: null,
    canUndo: false,
    canRedo: false,
    notice: restored.warning || scenarioStorageBroken
      ? { text: restored.warning ?? '保存的方案数据损坏；当前项目仍可导出 JSON 备份。', kind: 'error' } : null,

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
      const line: MetroLine = { id, name: `${index}号线`, color: colors[(index - 1) % colors.length], nodes: [], status: 'planned', visible: true, locked: false }
      return {
        project: { ...state.project, lines: { ...state.project.lines, [id]: line } },
        selectedLineId: id, selectedStationId: null, selectedWaypointId: null,
        selectedStationIds: [],
        editorMode: 'browse', extensionEnd: null, pendingInsertIndex: null,
        notice: { text: `已创建 ${line.name}，开启添加站点模式后可点击地图。`, kind: 'info' },
      }
    }),
    updateLine: (id, patch) => set((state) => {
      const line = state.project.lines[id]
      if (!line) return state
      if (lineLocked(line) && !('locked' in patch) && !('visible' in patch)) return { notice: { text: '真实已建成线路已锁定，请先解锁编辑。', kind: 'info' } }
      if ('status' in patch && !['existing', 'construction', 'planned'].includes(patch.status ?? '')) return state
      const updated = { ...line, ...patch, ...('status' in patch && patch.status === 'existing' ? { locked: true } : {}) }
      if (!updated.name.trim() || !/^#[0-9a-fA-F]{6}$/.test(updated.color)) return state
      if (updated.name === line.name && updated.color === line.color && updated.closed === line.closed && updated.status === line.status && updated.visible === line.visible && updated.locked === line.locked) return state
      return { project: { ...state.project, lines: { ...state.project.lines, [id]: updated } } }
    }),
    deleteLine: (id) => set((state) => {
      const removedLine = state.project.lines[id]
      if (!removedLine || lineLocked(removedLine)) return state
      const lines = { ...state.project.lines }
      delete lines[id]
      const removedWaypointIds = removedLine.nodes.filter((node) => node.type === 'waypoint').map((node) => node.id)
      const project = removeNewlyOrphanedWaypoints({ ...state.project, lines }, removedWaypointIds)
      return {
        project,
        selectedLineId: state.selectedLineId === id ? (Object.keys(lines)[0] ?? null) : state.selectedLineId,
        selectedStationIds: [],
        selectedWaypointId: state.selectedWaypointId && !project.waypoints[state.selectedWaypointId] ? null : state.selectedWaypointId,
        editorMode: 'browse', extensionEnd: null, pendingInsertIndex: null,
        notice: { text: '线路已删除，站点仍保留。', kind: 'info' },
      }
    }),
    createStation: (lng, lat, insertIndex) => {
      if (!validCoordinates(lng, lat)) return
      const { selectedLineId, project } = get()
      if (!selectedLineId || !project.lines[selectedLineId]) {
        set({ notice: { text: '请先选择或创建线路，再添加站点。', kind: 'error' }, editorMode: 'browse', extensionEnd: null, pendingInsertIndex: null })
        return
      }
      set((state) => {
        const line = state.project.lines[selectedLineId]
        if (!line || lineLocked(line)) return state
        const index = insertIndex ?? (state.extensionEnd === 'start' ? 0 : undefined)
        if (!validInsertIndex(index, line.nodes.length)) return state
        const id = idFactory()
        const usedNames = new Set(Object.values(state.project.stations).map((station) => station.name))
        let number = Object.keys(state.project.stations).length + 1
        while (usedNames.has(`站点 ${number}`)) number += 1
        const station: Station = { id, name: `站点 ${number}`, lng, lat }
        return {
          project: {
            ...state.project,
            stations: { ...state.project.stations, [id]: station },
            lines: { ...state.project.lines, [selectedLineId]: { ...line, nodes: insertAt(line.nodes, { type: 'station', id }, index) } },
          },
          selectedStationId: id, selectedWaypointId: null, notice: null,
          ...cancelPendingInsert(state),
        }
      })
    },
    updateStation: (id, patch) => set((state) => {
      const station = state.project.stations[id]
      if (!station || nodeLocked(state.project, 'station', id)) return state
      const updated = { ...station, ...patch }
      if (!updated.name.trim() || !validCoordinates(updated.lng, updated.lat)) return state
      if (updated.name === station.name && updated.lng === station.lng && updated.lat === station.lat) return state
      return { project: { ...state.project, stations: { ...state.project.stations, [id]: updated } } }
    }),
    deleteStation: (id) => get().deleteStations([id]),
    deleteStations: (ids) => set((state) => {
      const protectedIds = lockedNodeIds(state.project, 'station')
      if (ids.some((id) => protectedIds.has(id))) return { notice: { text: '选中站点属于已锁定线路，请先解锁相关线路。', kind: 'info' } }
      const removedIds = new Set(ids.filter((id) => state.project.stations[id]))
      if (!removedIds.size) return state
      const stations = Object.fromEntries(Object.entries(state.project.stations).filter(([id]) => !removedIds.has(id)))
      const lines = Object.fromEntries(Object.entries(state.project.lines).map(([lineId, line]) =>
        [lineId, { ...line, nodes: line.nodes.filter((node) => !(node.type === 'station' && removedIds.has(node.id))) }]))
      return {
        project: { ...state.project, stations, lines },
        selectedStationId: state.selectedStationId && removedIds.has(state.selectedStationId) ? null : state.selectedStationId,
        selectedStationIds: [], editorMode: 'browse', extensionEnd: null, pendingInsertIndex: null,
        notice: { text: `已删除 ${removedIds.size} 个站点，可用撤销恢复。`, kind: 'info' },
      }
    }),
    createWaypoint: (lng, lat, lineId, insertIndex) => set((state) => {
      const line = state.project.lines[lineId]
      if (!line || lineLocked(line) || !validCoordinates(lng, lat) || !validInsertIndex(insertIndex, line.nodes.length)) return state
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
      if (!waypoint || nodeLocked(state.project, 'waypoint', id)) return state
      const updated = { ...waypoint, ...patch }
      if (!validCoordinates(updated.lng, updated.lat)) return state
      if (updated.lng === waypoint.lng && updated.lat === waypoint.lat) return state
      return { project: { ...state.project, waypoints: { ...state.project.waypoints, [id]: updated } } }
    }),
    deleteWaypoint: (id) => set((state) => {
      if (!state.project.waypoints[id] || nodeLocked(state.project, 'waypoint', id)) return state
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
      if (!line || lineLocked(line) || !station || !validInsertIndex(insertIndex, line.nodes.length) ||
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
      if (!line || lineLocked(line) || !Number.isInteger(nodeIndex) || nodeIndex < 0 || nodeIndex >= line.nodes.length) return state
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
      if (!line || lineLocked(line) || !Number.isInteger(fromIndex) || !Number.isInteger(toIndex) || fromIndex < 0 ||
          toIndex < 0 || fromIndex >= line.nodes.length || toIndex >= line.nodes.length || fromIndex === toIndex) return state
      const nodes = [...line.nodes]
      const [node] = nodes.splice(fromIndex, 1)
      nodes.splice(toIndex, 0, node)
      return { project: { ...state.project, lines: { ...state.project.lines, [lineId]: { ...line, nodes } } }, ...cancelPendingInsert(state) }
    }),
    setAllLinesVisible: (visible, onlyId) => set((state) => {
      const lines = Object.fromEntries(Object.entries(state.project.lines).map(([id, line]) =>
        [id, { ...line, visible: onlyId ? id === onlyId : visible }]))
      if (Object.keys(lines).every((id) => lines[id].visible === (state.project.lines[id].visible ?? true))) return state
      return { project: { ...state.project, lines } }
    }),
    copyLineToPlanned: (sourceId) => {
      const source = get().project.lines[sourceId]
      if (!source) return null
      const id = idFactory()
      const usedNames = new Set(Object.values(get().project.lines).map((line) => line.name))
      const baseName = `${source.name}规划方案`
      let name = baseName
      let suffix = 2
      while (usedNames.has(name)) name = `${baseName}${suffix++}`
      // Shared stations keep their original position. Copy waypoints so shape edits stay independent.
      const waypoints = { ...get().project.waypoints }
      const copiedWaypointIds = new Map<string, string>()
      const nodes = source.nodes.map((node) => {
        if (node.type === 'station') return { ...node }
        let copied = copiedWaypointIds.get(node.id)
        if (!copied) { copied = idFactory(); copiedWaypointIds.set(node.id, copied); waypoints[copied] = { ...waypoints[node.id], id: copied } }
        return { type: 'waypoint' as const, id: copied }
      })
      set((state) => ({ project: { ...state.project, waypoints, lines: { ...state.project.lines,
        [id]: { ...source, id, name, nodes, status: 'planned', locked: false, visible: true, sourceLineId: sourceId } } },
        selectedLineId: id, selectedStationId: null, selectedStationIds: [], selectedWaypointId: null,
        editorMode: 'browse', extensionEnd: null, pendingInsertIndex: null,
        notice: { text: '已复制为规划线路。共享现状站点保持原位置，改变站位请移除引用并新建站点。', kind: 'info' } }))
      return id
    },
    extendLine: (id, end) => {
      const source = get().project.lines[id]
      if (!source) return
      const targetId = source.status === 'existing' || lineLocked(source) ? get().copyLineToPlanned(id) : id
      if (!targetId) return
      set({ selectedLineId: targetId, selectedStationId: null, selectedWaypointId: null, selectedStationIds: [],
        editorMode: 'add-station', extensionEnd: end, pendingInsertIndex: null,
        notice: { text: end === 'start' ? '点击地图从首端延长，连续点击会继续向前延长。' : '点击地图从末端延长。', kind: 'info' } })
    },
    createBranch: (stationId) => {
      const station = get().project.stations[stationId]
      if (!station) return
      const id = idFactory()
      const baseName = `${station.name}支线`
      const used = new Set(Object.values(get().project.lines).map((line) => line.name))
      let name = baseName
      let suffix = 2
      while (used.has(name)) name = `${baseName}${suffix++}`
      set((state) => ({ project: { ...state.project, lines: { ...state.project.lines,
        [id]: { id, name, color: colors[Object.keys(state.project.lines).length % colors.length],
          nodes: [{ type: 'station', id: stationId }], status: 'planned', locked: false, visible: true } } },
        selectedLineId: id, selectedStationId: stationId, selectedWaypointId: null, selectedStationIds: [],
        editorMode: 'add-station', extensionEnd: 'end', pendingInsertIndex: null,
        notice: { text: '已新建规划支线，点击地图继续添加站点。', kind: 'info' } }))
    },
    selectLine: (id) => set((state) => ({
      selectedLineId: id && state.project.lines[id] ? id : null,
      selectedStationIds: [],
      selectedStationId: null, selectedWaypointId: null,
      editorMode: 'browse', extensionEnd: null, pendingInsertIndex: null,
    })),
    selectStation: (id) => set((state) => {
      if (state.editorMode === 'select-stations') {
        if (!id || !state.project.stations[id]) return state
        return { selectedStationIds: state.selectedStationIds.includes(id)
          ? state.selectedStationIds.filter((selected) => selected !== id) : [...state.selectedStationIds, id] }
      }
      const selectedStationId = id && state.project.stations[id] ? id : null
      const currentLine = state.selectedLineId ? state.project.lines[state.selectedLineId] : undefined
      const line = selectedStationId && !currentLine?.nodes.some((node) => node.type === 'station' && node.id === selectedStationId)
        ? Object.values(state.project.lines).find((item) => item.nodes.some((node) => node.type === 'station' && node.id === selectedStationId)) : undefined
      return { selectedStationId, selectedWaypointId: null, ...(line ? { selectedLineId: line.id, pendingInsertIndex: null } : {}) }
    }),
    selectStations: (ids) => set((state) => ({
      selectedStationIds: [...new Set(ids)].filter((id) => state.project.stations[id]),
      selectedStationId: null, selectedWaypointId: null, editorMode: 'select-stations', pendingInsertIndex: null,
    })),
    selectWaypoint: (id) => set((state) => ({ selectedWaypointId: id && state.project.waypoints[id] ? id : null, selectedStationId: null })),
    setEditorMode: (mode) => set((state) => {
      const line = state.selectedLineId ? state.project.lines[state.selectedLineId] : undefined
      if ((mode === 'add-station' || mode === 'add-waypoint') && line && lineLocked(line)) return { editorMode: 'browse', extensionEnd: null, pendingInsertIndex: null, notice: { text: '真实线路已锁定，可复制为规划线路后添加节点。', kind: 'info' } }
      if (mode === 'add-waypoint' && (!state.selectedLineId || !state.project.lines[state.selectedLineId])) {
        return { notice: { text: '请先选择或创建线路，再添加控制点。', kind: 'error' }, editorMode: 'browse', extensionEnd: null, pendingInsertIndex: null }
      }
      return { editorMode: mode, extensionEnd: null, pendingInsertIndex: null, selectedStationIds: [], ...(mode === 'select-stations' ? { selectedStationId: null, selectedWaypointId: null } : {}) }
    }),
    startWaypointInsert: (index) => set((state) => {
      const line = state.selectedLineId ? state.project.lines[state.selectedLineId] : undefined
      if (!line || lineLocked(line) || !Number.isInteger(index) || index < 0 || index > line.nodes.length) return state
      return { editorMode: 'add-waypoint', pendingInsertIndex: index, selectedStationIds: [] }
    }),
    loadProject: (project) => set({ project, selectedLineId: Object.keys(project.lines)[0] ?? null, selectedStationId: null, selectedStationIds: [], selectedWaypointId: null, editorMode: 'browse', extensionEnd: null, pendingInsertIndex: null, notice: { text: '项目已导入。', kind: 'info' } }),
    createScenario: (name, baseProject) => {
      const trimmed = name.trim()
      if (!trimmed || scenarios.scenarios.length >= 5 || (baseProject.cityId ?? null) !== (get().project.cityId ?? null)) return false
      const id = idFactory()
      return activateScenario({ ...withActiveProject(scenarios, get().project), activeId: id,
        scenarios: [...withActiveProject(scenarios, get().project).scenarios, { id, name: trimmed, project: baseProject }] })
    },
    startNewProject: (name) => {
      const trimmed = name.trim()
      if (!trimmed || scenarioStorageBroken) return false
      const current = get().project
      const project = emptyProject(trimmed)
      let incoming: ScenarioSet
      try {
        if (current.cityId) {
          const saved = readScenarioSet(null, cityStorage)
          const oldCustom = saved ? null : readCityProject(null, cityStorage)
          incoming = saved ?? (oldCustom ? defaultScenarioSet(oldCustom) : defaultScenarioSet(project))
        } else {
          incoming = withActiveProject(scenarios, current)
        }
        if (incoming.scenarios[0].project !== project) {
          if (incoming.scenarios.length >= 5) {
            set({ notice: { text: '自主规划已有 5 个方案，请先删除一个或导出 JSON。', kind: 'error' } })
            return false
          }
          const id = idFactory()
          incoming = { ...incoming, activeId: id, scenarios: [...incoming.scenarios, { id, name: trimmed, project }] }
        }
        const outgoing = withActiveProject(scenarios, current)
        if (current.cityId) saveScenarioSet(outgoing, current.cityId, cityStorage)
        saveCityProject(current, cityStorage)
        persist(project)
        saveScenarioSet(incoming, null, cityStorage)
        saveCityProject(project, cityStorage)
      } catch {
        try { persist(current); saveCityProject(current, cityStorage) } catch { /* Memory state remains exportable. */ }
        set({ notice: { text: '新建项目前保存失败，当前项目已保留，请导出 JSON 备份。', kind: 'error' } })
        return false
      }
      scenarios = incoming
      switchingCity = true
      past.length = 0
      future.length = 0
      try {
        set({ project, scenarios: scenarioSummary(incoming), activeScenarioId: incoming.activeId,
          selectedLineId: null, selectedStationId: null, selectedStationIds: [], selectedWaypointId: null,
          editorMode: 'browse', extensionEnd: null, pendingInsertIndex: null, canUndo: false, canRedo: false,
          notice: { text: '已创建空白自主规划项目。', kind: 'info' } })
      } finally { switchingCity = false }
      return true
    },
    copyScenario: (name) => {
      const trimmed = name.trim()
      if (!trimmed || scenarios.scenarios.length >= 5) return false
      const id = idFactory()
      const current = get().project
      return activateScenario({ ...withActiveProject(scenarios, current), activeId: id,
        scenarios: [...withActiveProject(scenarios, current).scenarios, { id, name: trimmed, project: structuredClone(current) }] })
    },
    renameScenario: (id, name) => {
      const trimmed = name.trim()
      if (!trimmed || scenarioStorageBroken || !scenarios.scenarios.some((item) => item.id === id)) return
      const next = { ...scenarios, scenarios: scenarios.scenarios.map((item) => item.id === id ? { ...item, name: trimmed } : item) }
      try { saveScenarioSet(next, get().project.cityId ?? null, cityStorage); scenarios = next; set({ scenarios: scenarioSummary(next) }) }
      catch { set({ notice: { text: '方案保存失败，请导出 JSON 备份。', kind: 'error' } }) }
    },
    switchScenario: (id) => {
      if (id === scenarios.activeId) return true
      if (!scenarios.scenarios.some((item) => item.id === id)) return false
      return activateScenario({ ...withActiveProject(scenarios, get().project), activeId: id })
    },
    deleteScenario: (id) => {
      if (scenarios.scenarios.length <= 1 || !scenarios.scenarios.some((item) => item.id === id) || scenarioStorageBroken) return false
      const nextItems = scenarios.scenarios.filter((item) => item.id !== id)
      const next = { ...scenarios, activeId: id === scenarios.activeId ? nextItems[0].id : scenarios.activeId, scenarios: nextItems }
      if (id === scenarios.activeId) return activateScenario(next)
      try { saveScenarioSet(next, get().project.cityId ?? null, cityStorage); scenarios = next; set({ scenarios: scenarioSummary(next) }); return true }
      catch { set({ notice: { text: '删除方案失败，原方案已保留。', kind: 'error' } }); return false }
    },
    switchCity: (project) => {
      try {
        const outgoing = withActiveProject(scenarios, get().project)
        const incoming = readScenarioSet(project.cityId ?? null, cityStorage) ?? defaultScenarioSet(project)
        const nextProject = activeScenario(incoming).project
        if (!scenarioStorageBroken) saveScenarioSet(outgoing, get().project.cityId ?? null, cityStorage)
        saveCityProject(get().project, cityStorage)
        persist(nextProject)
        saveCityProject(nextProject, cityStorage)
        project = nextProject
        scenarios = incoming
        scenarioStorageBroken = false
      } catch {
        set({ notice: { text: '城市切换前保存失败，当前规划已保留。请先导出 JSON 备份。', kind: 'error' } })
        return false
      }
      switchingCity = true
      past.length = 0
      future.length = 0
      try {
        set({ project, scenarios: scenarioSummary(scenarios), activeScenarioId: scenarios.activeId, selectedLineId: Object.keys(project.lines)[0] ?? null, selectedStationId: null, selectedStationIds: [], selectedWaypointId: null, editorMode: 'browse', extensionEnd: null, pendingInsertIndex: null, canUndo: false, canRedo: false, notice: { text: `已打开${project.name}，现状线路默认锁定。`, kind: 'info' } })
      } finally { switchingCity = false }
      return true
    },
    resetProject: (name, keepCity = false) => set((state) => {
      const baseLines = Object.fromEntries(Object.entries(state.project.lines).filter(([, line]) => lineStatus(line) === 'existing'))
      const stationIds = new Set(Object.values(baseLines).flatMap((line) => line.nodes.filter((node) => node.type === 'station').map((node) => node.id)))
      const waypointIds = new Set(Object.values(baseLines).flatMap((line) => line.nodes.filter((node) => node.type === 'waypoint').map((node) => node.id)))
      const project = keepCity && state.project.cityId ? {
        ...emptyProject(name), cityId: state.project.cityId, lines: baseLines,
        stations: Object.fromEntries(Object.entries(state.project.stations).filter(([id]) => stationIds.has(id))),
        waypoints: Object.fromEntries(Object.entries(state.project.waypoints).filter(([id]) => waypointIds.has(id))),
      } : emptyProject(name)
      return { project, selectedLineId: Object.keys(project.lines)[0] ?? null, selectedStationId: null, selectedStationIds: [], selectedWaypointId: null,
      editorMode: 'browse', extensionEnd: null, pendingInsertIndex: null,
      notice: { text: keepCity && state.project.cityId ? '已清空规划线路，保留现状线网。' : '已创建空项目。', kind: 'info' } }
    }),
    undo: () => {
      const project = past.pop()
      if (!project) return
      future.push(get().project)
      applyingHistory = true
      try {
        set((state) => ({
          project,
          selectedStationIds: [],
          selectedLineId: state.selectedLineId && project.lines[state.selectedLineId] ? state.selectedLineId : (Object.keys(project.lines)[0] ?? null),
          selectedStationId: state.selectedStationId && project.stations[state.selectedStationId] ? state.selectedStationId : null,
          selectedWaypointId: state.selectedWaypointId && project.waypoints[state.selectedWaypointId] ? state.selectedWaypointId : null,
          editorMode: 'browse', extensionEnd: null, pendingInsertIndex: null,
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
          selectedStationIds: [],
          selectedLineId: state.selectedLineId && project.lines[state.selectedLineId] ? state.selectedLineId : (Object.keys(project.lines)[0] ?? null),
          selectedStationId: state.selectedStationId && project.stations[state.selectedStationId] ? state.selectedStationId : null,
          selectedWaypointId: state.selectedWaypointId && project.waypoints[state.selectedWaypointId] ? state.selectedWaypointId : null,
          editorMode: 'browse', extensionEnd: null, pendingInsertIndex: null,
          canUndo: true, canRedo: future.length > 0,
          notice: { text: '已重做上一步。', kind: 'info' },
        }))
      } finally { applyingHistory = false }
    },
  }))

  function activateScenario(next: ScenarioSet): boolean {
    if (scenarioStorageBroken) {
      store.setState({ notice: { text: '方案数据损坏，请先导出当前项目备份。', kind: 'error' } })
      return false
    }
    const current = store.getState().project
    const project = activeScenario(next).project
    try {
      persist(project)
      saveScenarioSet(next, current.cityId ?? null, cityStorage)
      saveCityProject(project, cityStorage)
    } catch {
      try { persist(current); saveCityProject(current, cityStorage) } catch { /* Keep the in-memory project for JSON export. */ }
      store.setState({ notice: { text: '方案切换前保存失败，当前方案已保留，请导出 JSON 备份。', kind: 'error' } })
      return false
    }
    scenarios = next
    switchingCity = true
    past.length = 0
    future.length = 0
    try {
      store.setState({ project, scenarios: scenarioSummary(next), activeScenarioId: next.activeId,
        selectedLineId: Object.keys(project.lines)[0] ?? null, selectedStationId: null, selectedStationIds: [], selectedWaypointId: null,
        editorMode: 'browse', extensionEnd: null, pendingInsertIndex: null, canUndo: false, canRedo: false,
        notice: { text: `已切换到方案：${activeScenario(next).name}。`, kind: 'info' } })
    } finally { switchingCity = false }
    return true
  }

  store.subscribe((state, previous) => {
    if (state.project === previous.project || switchingCity) return
    if (!applyingHistory) {
      past.push(previous.project)
      if (past.length > 50) past.shift()
      future.length = 0
      store.setState({ canUndo: true, canRedo: false })
    }
    try {
      if (previous.project.cityId !== state.project.cityId) saveCityProject(previous.project, cityStorage)
      saveCityProject(state.project, cityStorage)
      persist(state.project)
      if (!scenarioStorageBroken) {
        if (previous.project.cityId !== state.project.cityId) {
          saveScenarioSet(withActiveProject(scenarios, previous.project), previous.project.cityId ?? null, cityStorage)
          scenarios = readScenarioSet(state.project.cityId ?? null, cityStorage) ?? defaultScenarioSet(state.project)
          store.setState({ scenarios: scenarioSummary(scenarios), activeScenarioId: scenarios.activeId })
        }
        const next = withActiveProject(scenarios, state.project)
        saveScenarioSet(next, state.project.cityId ?? null, cityStorage)
        scenarios = next
      }
    } catch (error) {
      console.error('项目自动保存失败', error)
      state.setNotice('本地自动保存失败，请导出 JSON 备份项目。', 'error')
    }
  })
  return store
}

export const useMetroStore = createMetroStore()
