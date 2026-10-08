import { nodeLocked } from '../utils/planning'
import { useMetroStore } from '../store/metroStore'

export function WaypointPanel() {
  const project = useMetroStore((state) => state.project)
  const selectedWaypointId = useMetroStore((state) => state.selectedWaypointId)
  const deleteWaypoint = useMetroStore((state) => state.deleteWaypoint)
  const waypoint = selectedWaypointId ? project.waypoints[selectedWaypointId] : undefined
  if (!waypoint) return null
  const references = Object.values(project.lines).flatMap((line) =>
    line.nodes.flatMap((node, index) => node.type === 'waypoint' && node.id === waypoint.id
      ? [{ line, index, ordinal: line.nodes.slice(0, index + 1).filter((item) => item.type === 'waypoint').length }]
      : []))
  return <section className="panel-section waypoint-panel" aria-labelledby="waypoint-title">
    <div className="section-header"><h2 id="waypoint-title">控制点编辑</h2></div>
    <div className="subheading">◆ 控制点 {references[0]?.ordinal ?? ''}</div>
    <div className="coordinates"><div><span>经度</span><strong>{waypoint.lng.toFixed(6)}</strong></div><div><span>纬度</span><strong>{waypoint.lat.toFixed(6)}</strong></div></div>
    <p className="quiet">拖动地图上的控制点可调整线路形状。</p>
    <div className="field-label">引用线路</div>
    <ul className="waypoint-references">{references.map(({ line }) => <li key={line.id}>{line.name}</li>)}</ul>
    <button type="button" disabled={nodeLocked(project, 'waypoint', waypoint.id)} className="danger-link" onClick={() => {
      if (window.confirm('删除这个控制点？它会从所有引用线路中移除。')) deleteWaypoint(waypoint.id)
    }}>删除控制点</button>
  </section>
}
