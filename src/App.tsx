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

export default function App() {
  const [mapTarget, setMapTarget] = useState<MapTarget | null>(null)
  const notice = useMetroStore((state) => state.notice)
  const clearNotice = useMetroStore((state) => state.clearNotice)
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((!event.ctrlKey && !event.metaKey) || event.altKey) return
      const target = event.target
      if (target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))) return
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
    <div className="workspace">
      <aside className="sidebar"><div className="sidebar-scroll"><ProjectName /><CitySearch onSelectCity={setMapTarget} /><ScenarioPanel /><ModePanel /><MapDisplayPanel /><LineStatsPanel /><LinePanel /><StationPanel /><WaypointPanel /></div></aside>
      <MapCanvas target={mapTarget} />
    </div>
    {notice && <div className={`notice notice--${notice.kind}`} role={notice.kind === 'error' ? 'alert' : 'status'}><span>{notice.text}</span><button type="button" onClick={clearNotice} aria-label="关闭提示">×</button></div>}
  </div>
}
