import { useEffect, useRef, useState } from 'react'
import { useMetroStore } from '../store/metroStore'
import { downloadProject, parseProjectJson } from '../utils/persistence'
import type { MapTarget } from '../config/map'

export function ProjectPanel({ onProjectLoaded }: { onProjectLoaded: (target: MapTarget) => void }) {
  const project = useMetroStore((state) => state.project)
  const loadProject = useMetroStore((state) => state.loadProject)
  const resetProject = useMetroStore((state) => state.resetProject)
  const setNotice = useMetroStore((state) => state.setNotice)
  const canUndo = useMetroStore((state) => state.canUndo)
  const canRedo = useMetroStore((state) => state.canRedo)
  const undo = useMetroStore((state) => state.undo)
  const redo = useMetroStore((state) => state.redo)
  const fileRef = useRef<HTMLInputElement>(null)

  const newProject = () => {
    if ((Object.keys(project.lines).length || Object.keys(project.stations).length) &&
        !window.confirm('创建新项目？当前项目已自动保存在此浏览器中，但会被新项目替换。建议先导出 JSON。')) return
    const nextName = window.prompt('新项目名称', '我的地铁规划')
    if (nextName === null) return
    if (!nextName.trim()) { setNotice('项目名称不能为空。', 'error'); return }
    resetProject(nextName.trim())
  }

  const importProject = async (file: File | undefined) => {
    if (!file) return
    try {
      if (file.size > 5 * 1024 * 1024) throw new Error('文件超过 5 MB，请选择较小的项目 JSON。')
      const parsed = parseProjectJson(await file.text())
      loadProject(parsed)
      const station = Object.values(parsed.stations)[0]
      if (station) onProjectLoaded({ center: [station.lng, station.lat], zoom: 10, label: station.name })
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '无法导入项目。', 'error')
    } finally {
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
      <header className="topbar">
        <div className="brand"><span className="brand-mark" aria-hidden="true"><i /><i /><i /></span><span>Metro <strong>Planner</strong></span></div>
        <div className="topbar-actions">
          <button type="button" onClick={undo} disabled={!canUndo} title="撤销上一步（Ctrl+Z）">撤销</button>
          <button type="button" onClick={redo} disabled={!canRedo} title="重做上一步（Ctrl+Y）">重做</button>
          <button type="button" onClick={newProject}>新建项目</button>
          <button type="button" onClick={() => fileRef.current?.click()}>导入 JSON</button>
          <button type="button" className="button-primary" onClick={() => downloadProject(project)}>导出 JSON</button>
          <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={(event) => void importProject(event.target.files?.[0])} aria-label="选择项目 JSON 文件" />
        </div>
      </header>
  )
}

export function ProjectName() {
  const projectName = useMetroStore((state) => state.project.name)
  const renameProject = useMetroStore((state) => state.renameProject)
  const resetProject = useMetroStore((state) => state.resetProject)
  const [name, setName] = useState(projectName)
  useEffect(() => setName(projectName), [projectName])
  return <div className="project-heading">
    <label htmlFor="project-name" className="eyebrow">当前项目</label>
    <input id="project-name" className="project-name" value={name} onChange={(event) => setName(event.target.value)} onBlur={() => { renameProject(name); setName(useMetroStore.getState().project.name) }} onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur() }} />
    <p>更改会自动保存在此浏览器中</p>
    <button type="button" className="reset-link" onClick={() => { if (window.confirm('清空当前项目的全部线路和站点？建议先导出 JSON。')) resetProject(projectName) }}>重置项目</button>
  </div>
}
