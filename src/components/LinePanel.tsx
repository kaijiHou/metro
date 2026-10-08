import { useEffect, useLayoutEffect, useState } from 'react'
import { LinePlanningPanel } from './LinePlanningPanel'
import { lineLocked, nodeLocked, lineStatus, statusNames } from '../utils/planning'
import { useMetroStore } from '../store/metroStore'

export function LinePanel() {
  const project = useMetroStore((state) => state.project)
  const selectedLineId = useMetroStore((state) => state.selectedLineId)
  const selectedStationId = useMetroStore((state) => state.selectedStationId)
  const selectedWaypointId = useMetroStore((state) => state.selectedWaypointId)
  const pendingInsertIndex = useMetroStore((state) => state.pendingInsertIndex)
  const editorMode = useMetroStore((state) => state.editorMode)
  const createLine = useMetroStore((state) => state.createLine)
  const selectLine = useMetroStore((state) => state.selectLine)
  const selectStation = useMetroStore((state) => state.selectStation)
  const selectWaypoint = useMetroStore((state) => state.selectWaypoint)
  const updateStation = useMetroStore((state) => state.updateStation)
  const updateLine = useMetroStore((state) => state.updateLine)
  const deleteLine = useMetroStore((state) => state.deleteLine)
  const addStationToLine = useMetroStore((state) => state.addStationToLine)
  const removeNodeFromLine = useMetroStore((state) => state.removeNodeFromLine)
  const moveLineNode = useMetroStore((state) => state.moveLineNode)
  const startWaypointInsert = useMetroStore((state) => state.startWaypointInsert)
  const lines = Object.values(project.lines)
  const line = selectedLineId ? project.lines[selectedLineId] : undefined
  const locked = line ? lineLocked(line) : false
  const [lineName, setLineName] = useState(line?.name ?? '')
  const selectedStation = selectedStationId ? project.stations[selectedStationId] : undefined
  const [stationName, setStationName] = useState(selectedStation?.name ?? '')
  const [existingId, setExistingId] = useState('')
  useEffect(() => setLineName(line?.name ?? ''), [line?.name, selectedLineId])
  useEffect(() => setExistingId(''), [selectedLineId])
  useLayoutEffect(() => setStationName(selectedStation?.name ?? ''), [selectedStation?.name, selectedStationId])
  const memberIds = new Set(line?.nodes.filter((node) => node.type === 'station').map((node) => node.id))
  const available = Object.values(project.stations).filter((station) => !memberIds.has(station.id))
  let waypointOrdinal = 0

  return <section className="panel-section" aria-labelledby="lines-title">
    <div className="section-header"><h2 id="lines-title">线路管理</h2><button type="button" className="text-action" onClick={createLine}>＋ 新建线路</button></div>
    {lines.length === 0 ? <div className="empty-state">还没有线路。先新建一条线路，再点击地图添加站点。</div> :
      <div className="line-list">{lines.map((item) => <button type="button" key={item.id} className={`line-item${item.id === selectedLineId ? ' line-item--active' : ''}`} onClick={() => selectLine(item.id)} aria-pressed={item.id === selectedLineId}>
        <span className="line-swatch" style={{ backgroundColor: item.color }} /><span className="line-item-name">{item.name}</span><span className="line-count">{statusNames[lineStatus(item)]} · {item.visible === false ? '隐藏 · ' : ''}{item.nodes.filter((node) => node.type === 'station').length} 站 · {item.nodes.length} 节点</span>
      </button>)}</div>}
    <LinePlanningPanel />
    {line && <div className="line-editor">
      <div className="subheading">编辑当前线路</div>
      <label className="field-label" htmlFor="line-name">线路名称</label>
      <input disabled={locked} id="line-name" value={lineName} onChange={(event) => setLineName(event.target.value)} onBlur={() => { updateLine(line.id, { name: lineName }); setLineName(useMetroStore.getState().project.lines[line.id]?.name ?? '') }} onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur() }} />
      <label className="field-label" htmlFor="line-color">线路颜色</label>
      <div className="color-row"><input disabled={locked} id="line-color" type="color" value={line.color} onChange={(event) => updateLine(line.id, { color: event.target.value })} /><span>{line.color.toUpperCase()}</span></div>
      <label className="loop-toggle"><input disabled={locked} type="checkbox" checked={line.closed ?? false} onChange={(event) => updateLine(line.id, { closed: event.target.checked })} /> 首尾相连（环线）</label>
      <div className="subheading station-order-heading">节点顺序 <span>{line.nodes.length}</span></div>
      <p className="quiet">点站名可改名；点 ↑ ↓ 调整顺序。</p>
      {line.nodes.length ? <ol className="node-order">{line.nodes.map((node, index) => {
        const label = node.type === 'station' ? project.stations[node.id]?.name ?? '无效站点' : `控制点 ${++waypointOrdinal}`
        const selected = node.type === 'station' ? selectedStationId === node.id : selectedWaypointId === node.id
        return <li key={`${node.type}:${node.id}`}>
          <div className={`node-row${selected ? ' node-row--selected' : ''}`}>
            <button type="button" className="node-select" onClick={() => node.type === 'station' ? selectStation(node.id) : selectWaypoint(node.id)} aria-label={`选择${node.type === 'station' ? '站点' : '控制点'} ${label}`}>
              <span className={node.type === 'station' ? 'node-symbol--station' : 'node-symbol--waypoint'} aria-hidden="true">{node.type === 'station' ? '●' : '◆'}</span> {label}
            </button>
            <button type="button" className="node-action" disabled={locked || index === 0} onClick={() => moveLineNode(line.id, index, index - 1)} aria-label={`上移 ${label}`}>↑</button>
            <button type="button" className="node-action" disabled={locked || index === line.nodes.length - 1} onClick={() => moveLineNode(line.id, index, index + 1)} aria-label={`下移 ${label}`}>↓</button>
            <button type="button" disabled={locked} className="node-action node-action--remove" onClick={() => removeNodeFromLine(line.id, index)} aria-label={`从当前线路移除 ${label}`}>×</button>
          </div>
          {node.type === 'station' && selected && <div className="inline-station-edit">
            <label htmlFor={`node-name-${node.id}`}>站点名称</label>
            <input disabled={nodeLocked(project, 'station', node.id)} id={`node-name-${node.id}`} value={stationName} onChange={(event) => setStationName(event.target.value)} onBlur={() => {
              updateStation(node.id, { name: stationName })
              setStationName(useMetroStore.getState().project.stations[node.id]?.name ?? '')
            }} onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur() }} />
          </div>}
          {(index < line.nodes.length - 1 || line.closed) && <button type="button" disabled={locked} className={`insert-waypoint${editorMode === 'add-waypoint' && pendingInsertIndex === index + 1 ? ' insert-waypoint--active' : ''}`} onClick={() => startWaypointInsert(index + 1)}>＋ 插入控制点{index === line.nodes.length - 1 ? '（连接首站）' : ''}</button>}
        </li>
      })}</ol> : <p className="quiet">地图上添加站点或控制点，按节点顺序连接。</p>}
      <label className="field-label" htmlFor="existing-station">加入已有站点</label>
      <div className="add-existing"><select id="existing-station" value={existingId} onChange={(event) => setExistingId(event.target.value)} disabled={locked || !available.length}><option value="">{available.length ? '选择站点' : '没有可加入的站点'}</option>{available.map((station) => <option value={station.id} key={station.id}>{station.name}</option>)}</select><button type="button" disabled={locked || !existingId} onClick={() => { addStationToLine(existingId, line.id); setExistingId('') }}>加入</button></div>
      <button type="button" disabled={locked} className="danger-link" onClick={() => { if (window.confirm(`删除 ${line.name}？站点本身会保留。`)) deleteLine(line.id) }}>删除这条线路</button>
    </div>}
  </section>
}
