import { useLayoutEffect, useState } from 'react'
import { useMetroStore } from '../store/metroStore'
import { lockedNodeIds } from '../utils/planning'
import { stationLineCounts } from '../utils/geojson'

export function StationPanel() {
  const project = useMetroStore((state) => state.project)
  const selectedStationId = useMetroStore((state) => state.selectedStationId)
  const selectStation = useMetroStore((state) => state.selectStation)
  const updateStation = useMetroStore((state) => state.updateStation)
  const deleteStation = useMetroStore((state) => state.deleteStation)
  const selectedStationIds = useMetroStore((state) => state.selectedStationIds)
  const selectStations = useMetroStore((state) => state.selectStations)
  const deleteStations = useMetroStore((state) => state.deleteStations)
  const editorMode = useMetroStore((state) => state.editorMode)
  const setEditorMode = useMetroStore((state) => state.setEditorMode)
  const multiSelect = editorMode === 'select-stations'
  const station = selectedStationId ? project.stations[selectedStationId] : undefined
  const [name, setName] = useState(station?.name ?? '')
  useLayoutEffect(() => setName(station?.name ?? ''), [station?.name, selectedStationId])
  const counts = stationLineCounts(project)
  const protectedIds = lockedNodeIds(project, 'station')
  const locked = station ? protectedIds.has(station.id) : false
  const createBranch = useMetroStore((state) => state.createBranch)

  return (
    <section className="panel-section station-panel" aria-labelledby="stations-title">
      <div className="section-header"><h2 id="stations-title">站点编辑</h2><span className="section-count">{Object.keys(project.stations).length} 个站点</span></div>
      {Object.keys(project.stations).length > 0 && !multiSelect && <button type="button" className="text-action" onClick={() => setEditorMode('select-stations')}>多选删除</button>}
      {multiSelect ? <div className="station-bulk-editor">
        <p className="quiet">点击地图站点或勾选列表；再次点击可取消选择。</p>
        {protectedIds.size > 0 && <p className="quiet">现状站点受锁定保护；请先解锁引用它的线路。</p>}
        <div className="station-bulk-actions">
          <button type="button" className="text-action" onClick={() => selectStations(Object.keys(project.stations).filter((id) => !protectedIds.has(id)))}>全选全部站点</button>
          <button type="button" className="text-action" onClick={() => selectStations([])}>清空选择</button>
          <button type="button" className="text-action" onClick={() => setEditorMode('browse')}>退出多选</button>
        </div>
        <div className="station-checklist" aria-label="批量选择站点">
          {Object.values(project.stations).map((item) => <label key={item.id}>
            <input type="checkbox" disabled={protectedIds.has(item.id)} checked={selectedStationIds.includes(item.id)} onChange={() => selectStation(item.id)} />
            <span>{item.name}{(counts[item.id] ?? 0) >= 2 ? ' · 换乘' : ''}</span>
          </label>)}
        </div>
        <button type="button" className="station-bulk-delete" disabled={!selectedStationIds.length || selectedStationIds.some((id) => protectedIds.has(id))} onClick={() => deleteStations(selectedStationIds)}>删除选中（{selectedStationIds.length}）</button>
        <p className="quiet">会从所有线路删除选中站点，误删可一次撤销。</p>
      </div> : <>
      {Object.keys(project.stations).length > 0 && <><label className="field-label" htmlFor="station-select">选择站点</label><select id="station-select" value={selectedStationId ?? ''} onChange={(event) => selectStation(event.target.value || null)}><option value="">选择一个站点</option>{Object.values(project.stations).map((item) => <option key={item.id} value={item.id}>{item.name}{(counts[item.id] ?? 0) >= 2 ? ' · 换乘' : ''}</option>)}</select></>}
      {station ? <div className="station-editor">
        {(counts[station.id] ?? 0) >= 2 && <span className="transfer-badge">换乘站 · {counts[station.id]} 条线路</span>}
        <label className="field-label" htmlFor="station-name">站点名称</label>
        <input disabled={locked} id="station-name" value={name} onChange={(event) => setName(event.target.value)} onBlur={() => { updateStation(station.id, { name }); setName(useMetroStore.getState().project.stations[station.id]?.name ?? '') }} onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur() }} />
        <div className="coordinates"><div><span>经度</span><strong>{station.lng.toFixed(6)}</strong></div><div><span>纬度</span><strong>{station.lat.toFixed(6)}</strong></div></div>
        <p className="quiet">{locked ? '站点属于已锁定线路；修改站位请移除规划线引用，再添加新站点。' : '拖动地图上的站点可调整位置。'}</p>
        <div className="station-editor-actions">
        <button type="button" className="button-primary" onClick={() => createBranch(station.id)}>从这里新建支线</button>
        <button type="button" disabled={locked} className="danger-link" onClick={() => { if (window.confirm(`删除 ${station.name}？该站会从所有线路移除。`)) deleteStation(station.id) }}>删除这个站点</button>
        </div>
      </div> : <div className="empty-state empty-state--compact">点击地图上的站点，或从上方列表选择。</div>}
      </>}
    </section>
  )
}
