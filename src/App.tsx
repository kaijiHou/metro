import { useEffect, useState } from 'react'
import { useMetroStore } from './store/metroStore'
import type { MapTarget } from './config/map'
import { ProjectName, ProjectPanel } from './components/ProjectPanel'
import { CitySearch } from './components/CitySearch'
import { ModePanel } from './components/ModePanel'
import { LineStatsPanel } from './components/LineStatsPanel'
import { MapDisplayPanel } from './components/MapDisplayPanel'
import { ScenarioPanel } from './components/ScenarioPanel'
import { LinePanel } from './components/LinePanel'
import { StationPanel } from './components/StationPanel'
import { WaypointPanel } from './components/WaypointPanel'
import { MapCanvas } from './components/MapCanvas'
import { useViewStore } from './store/viewStore'

export default function App() {
  const [mapTarget, setMapTarget] = useState<MapTarget | null>(null)
  const notice = useMetroStore((state) => state.notice)
  const clearNotice = useMetroStore((state) => state.clearNotice)
  const presentationMode=useViewStore((state)=>state.presentationMode)
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((!event.ctrlKey && !event.metaKey) || event.altKey) return
      const target = event.target
      if (event.key.toLowerCase() === 's' && !event.shiftKey) {
        event.preventDefault()
        if (target instanceof HTMLElement) target.blur()
        useMetroStore.getState().saveCurrentProject()
        return
      }
      if (target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))) return
      if (useViewStore.getState().presentationMode) return
      const state = useMetroStore.getState()
      const key = event.key.toLowerCase()
      if (key === 'z' && !event.shiftKey && state.canUndo) { event.preventDefault(); state.undo() }
      else if ((key === 'y' || (key === 'z' && event.shiftKey)) && state.canRedo) { event.preventDefault(); state.redo() }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])
  return <div className="app-shell">
    <ProjectPanel onProjectLoaded={setMapTarget} />
    <nav className="primary-navigation" aria-label="主导航"><strong>轨道交通地图</strong><button type="button" onClick={()=>useViewStore.getState().setPresentationMode(true)} aria-pressed={presentationMode}>浏览模式</button><button type="button" onClick={()=>useViewStore.getState().setPresentationMode(false)} aria-pressed={!presentationMode}>规划模式</button></nav>
    <div className="workspace">
      <aside className="sidebar"><div className="sidebar-scroll">{presentationMode ? <div className="project-heading"><span className="eyebrow">正在保留的规划</span><strong>{useMetroStore.getState().project.name}</strong></div> : <ProjectName />}<CitySearch onSelectCity={setMapTarget} />{!presentationMode&&<><ScenarioPanel /><ModePanel /><MapDisplayPanel /><LineStatsPanel /><LinePanel /><StationPanel /><WaypointPanel /></>}{presentationMode&&<section className="panel-section"><h2>全国地铁漫游</h2><p>直接拖动地图到其他城市，自动显示现状线网。点击站名或站点查看详情与出入口。</p><p className="quiet">当前规划仍保留，切回规划模式可继续编辑。原始快照日期和来源见城市资料。</p></section>}</div></aside>
      <MapCanvas target={mapTarget} />
    </div>
    {notice && <div className={`notice notice--${notice.kind}`} role={notice.kind === 'error' ? 'alert' : 'status'}><span>{notice.text}</span><button type="button" onClick={clearNotice} aria-label="关闭提示">×</button></div>}
  </div>
}
