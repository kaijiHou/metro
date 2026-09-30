import { create } from 'zustand'
import { emptyProject, type EditorMode, type MetroLine, type MetroProject, type Station } from '../models/metro'
import { readStoredProject, saveProject } from '../utils/persistence'
import { validCoordinates } from '../utils/validation'

type Notice = { text: string; kind: 'info' | 'error' } | null

type MetroState = {
  project: MetroProject
  selectedLineId: string | null
  selectedStationId: string | null
  editorMode: EditorMode
  notice: Notice
  setNotice: (text: string, kind?: 'info' | 'error') => void
  clearNotice: () => void
  renameProject: (name: string) => void
  createLine: () => void
  updateLine: (id: string, patch: Pick<MetroLine, 'name'> | Pick<MetroLine, 'color'>) => void
  deleteLine: (id: string) => void
  createStation: (lng: number, lat: number) => void
  updateStation: (id: string, patch: Partial<Pick<Station, 'name' | 'lng' | 'lat'>>) => void
  deleteStation: (id: string) => void
  addStationToLine: (stationId: string, lineId: string) => void
  removeStationFromLine: (stationId: string, lineId: string) => void
  selectLine: (id: string | null) => void
  selectStation: (id: string | null) => void
  setEditorMode: (mode: EditorMode) => void
  loadProject: (project: MetroProject) => void
  resetProject: (name?: string) => void
}

const colors = ['#d94c4c', '#2878b9', '#22936f', '#9a63bb', '#db8c25', '#26a2aa']
const restored = readStoredProject()

export const useMetroStore = create<MetroState>((set, get) => ({
  project: restored.project,
  selectedLineId: Object.keys(restored.project.lines)[0] ?? null,
  selectedStationId: null,
  editorMode: 'browse',
  notice: restored.warning ? { text: restored.warning, kind: 'error' } : null,

  setNotice: (text, kind = 'info') => set({ notice: { text, kind } }),
  clearNotice: () => set({ notice: null }),
  renameProject: (name) => {
    const trimmed = name.trim()
    if (trimmed) set((state) => ({ project: { ...state.project, name: trimmed } }))
  },
  createLine: () => set((state) => {
    const id = crypto.randomUUID()
    const usedNames = new Set(Object.values(state.project.lines).map((line) => line.name))
    let index = Object.keys(state.project.lines).length + 1
    while (usedNames.has(`${index}号线`)) index += 1
    const line: MetroLine = { id, name: `${index}号线`, color: colors[(index - 1) % colors.length], stationIds: [] }
    return {
      project: { ...state.project, lines: { ...state.project.lines, [id]: line } },
      selectedLineId: id,
      selectedStationId: null,
      notice: { text: `已创建 ${line.name}，开启添加站点模式后可点击地图。`, kind: 'info' },
    }
  }),
  updateLine: (id, patch) => set((state) => {
    const line = state.project.lines[id]
    if (!line) return state
    const updated = { ...line, ...patch }
    if (!updated.name.trim() || !/^#[0-9a-fA-F]{6}$/.test(updated.color)) return state
    return { project: { ...state.project, lines: { ...state.project.lines, [id]: updated } } }
  }),
  deleteLine: (id) => set((state) => {
    if (!state.project.lines[id]) return state
    const lines = { ...state.project.lines }
    delete lines[id]
    return {
      project: { ...state.project, lines },
      selectedLineId: state.selectedLineId === id ? (Object.keys(lines)[0] ?? null) : state.selectedLineId,
      notice: { text: '线路已删除，站点仍保留。', kind: 'info' },
    }
  }),
  createStation: (lng, lat) => {
    if (!validCoordinates(lng, lat)) return
    const { selectedLineId, project } = get()
    if (!selectedLineId || !project.lines[selectedLineId]) {
      set({ notice: { text: '请先选择或创建线路，再添加站点。', kind: 'error' }, editorMode: 'browse' })
      return
    }
    set((state) => {
      const line = state.project.lines[selectedLineId]
      if (!line) return state
      const id = crypto.randomUUID()
      const usedNames = new Set(Object.values(state.project.stations).map((station) => station.name))
      let number = Object.keys(state.project.stations).length + 1
      while (usedNames.has(`站点 ${number}`)) number += 1
      const station: Station = { id, name: `站点 ${number}`, lng, lat }
      return {
        project: {
          ...state.project,
          stations: { ...state.project.stations, [id]: station },
          lines: { ...state.project.lines, [selectedLineId]: { ...line, stationIds: [...line.stationIds, id] } },
        },
        selectedStationId: id,
        notice: null,
      }
    })
  },
  updateStation: (id, patch) => set((state) => {
    const station = state.project.stations[id]
    if (!station) return state
    const updated = { ...station, ...patch }
    if (!updated.name.trim() || !validCoordinates(updated.lng, updated.lat)) return state
    return { project: { ...state.project, stations: { ...state.project.stations, [id]: updated } } }
  }),
  deleteStation: (id) => set((state) => {
    if (!state.project.stations[id]) return state
    const stations = { ...state.project.stations }
    delete stations[id]
    const lines = Object.fromEntries(Object.entries(state.project.lines).map(([lineId, line]) =>
      [lineId, { ...line, stationIds: line.stationIds.filter((stationId) => stationId !== id) }]))
    return {
      project: { ...state.project, stations, lines },
      selectedStationId: state.selectedStationId === id ? null : state.selectedStationId,
      notice: { text: '站点已从项目和所有线路中删除。', kind: 'info' },
    }
  }),
  addStationToLine: (stationId, lineId) => set((state) => {
    const line = state.project.lines[lineId]
    const station = state.project.stations[stationId]
    if (!line || !station || line.stationIds.includes(stationId)) return state
    return {
      project: { ...state.project, lines: { ...state.project.lines, [lineId]: { ...line, stationIds: [...line.stationIds, stationId] } } },
      selectedStationId: stationId,
      notice: { text: `${station.name} 已加入 ${line.name}。`, kind: 'info' },
    }
  }),
  removeStationFromLine: (stationId, lineId) => set((state) => {
    const line = state.project.lines[lineId]
    if (!line || !line.stationIds.includes(stationId)) return state
    return {
      project: { ...state.project, lines: { ...state.project.lines, [lineId]: { ...line, stationIds: line.stationIds.filter((id) => id !== stationId) } } },
      notice: { text: '站点已从当前线路移除，站点本身仍保留。', kind: 'info' },
    }
  }),
  selectLine: (id) => set((state) => ({ selectedLineId: id && state.project.lines[id] ? id : null, selectedStationId: null })),
  selectStation: (id) => set((state) => ({ selectedStationId: id && state.project.stations[id] ? id : null })),
  setEditorMode: (mode) => set({ editorMode: mode }),
  loadProject: (project) => set({ project, selectedLineId: Object.keys(project.lines)[0] ?? null, selectedStationId: null, editorMode: 'browse', notice: { text: '项目已导入。', kind: 'info' } }),
  resetProject: (name) => set({ project: emptyProject(name), selectedLineId: null, selectedStationId: null, editorMode: 'browse', notice: { text: '已创建空项目。', kind: 'info' } }),
}))

useMetroStore.subscribe((state, previous) => {
  if (state.project === previous.project) return
  try {
    saveProject(state.project)
  } catch (error) {
    console.error('项目自动保存失败', error)
    state.setNotice('本地自动保存失败，请导出 JSON 备份项目。', 'error')
  }
})
