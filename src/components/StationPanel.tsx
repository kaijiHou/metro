import { useEffect, useState } from 'react'
import { useMetroStore } from '../store/metroStore'
import { stationLineCounts } from '../utils/geojson'

export function StationPanel() {
  const project = useMetroStore((state) => state.project)
  const selectedStationId = useMetroStore((state) => state.selectedStationId)
  const selectStation = useMetroStore((state) => state.selectStation)
  const updateStation = useMetroStore((state) => state.updateStation)
  const deleteStation = useMetroStore((state) => state.deleteStation)
  const station = selectedStationId ? project.stations[selectedStationId] : undefined
  const [name, setName] = useState(station?.name ?? '')
  useEffect(() => setName(station?.name ?? ''), [station?.name, selectedStationId])
  const counts = stationLineCounts(project)

  return (
    <section className="panel-section station-panel" aria-labelledby="stations-title">
      <div className="section-header"><h2 id="stations-title">站点编辑</h2><span className="section-count">{Object.keys(project.stations).length} 个站点</span></div>
      {Object.keys(project.stations).length > 0 && <><label className="field-label" htmlFor="station-select">选择站点</label><select id="station-select" value={selectedStationId ?? ''} onChange={(event) => selectStation(event.target.value || null)}><option value="">选择一个站点</option>{Object.values(project.stations).map((item) => <option key={item.id} value={item.id}>{item.name}{(counts[item.id] ?? 0) >= 2 ? ' · 换乘' : ''}</option>)}</select></>}
      {station ? <div className="station-editor">
        {(counts[station.id] ?? 0) >= 2 && <span className="transfer-badge">换乘站 · {counts[station.id]} 条线路</span>}
        <label className="field-label" htmlFor="station-name">站点名称</label>
        <input id="station-name" value={name} onChange={(event) => setName(event.target.value)} onBlur={() => { updateStation(station.id, { name }); setName(useMetroStore.getState().project.stations[station.id]?.name ?? '') }} onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur() }} />
        <div className="coordinates"><div><span>经度</span><strong>{station.lng.toFixed(6)}</strong></div><div><span>纬度</span><strong>{station.lat.toFixed(6)}</strong></div></div>
        <p className="quiet">拖动地图上的站点可调整位置。</p>
        <button type="button" className="danger-link" onClick={() => { if (window.confirm(`删除 ${station.name}？该站会从所有线路移除。`)) deleteStation(station.id) }}>删除这个站点</button>
      </div> : <div className="empty-state empty-state--compact">点击地图上的站点，或从上方列表选择。</div>}
    </section>
  )
}
