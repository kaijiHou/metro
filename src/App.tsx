import { useMetroStore } from './store/metroStore'
import { ProjectName, ProjectPanel } from './components/ProjectPanel'
import { ModePanel } from './components/ModePanel'
import { LinePanel } from './components/LinePanel'
import { StationPanel } from './components/StationPanel'
import { MapCanvas } from './components/MapCanvas'

export default function App() {
  const notice = useMetroStore((state) => state.notice)
  const clearNotice = useMetroStore((state) => state.clearNotice)
  return <div className="app-shell">
    <ProjectPanel />
    <div className="workspace">
      <aside className="sidebar"><div className="sidebar-scroll"><ProjectName /><ModePanel /><LinePanel /><StationPanel /></div></aside>
      <MapCanvas />
    </div>
    {notice && <div className={`notice notice--${notice.kind}`} role={notice.kind === 'error' ? 'alert' : 'status'}><span>{notice.text}</span><button type="button" onClick={clearNotice} aria-label="关闭提示">×</button></div>}
  </div>
}
