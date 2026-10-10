import { useEffect, useLayoutEffect, useMemo, useState } from 'react'
import { LinePlanningPanel } from './LinePlanningPanel'
import { StationAddPanel } from './StationAddPanel'
import { lineLocked, nodeLocked, lineStatus, statusNames, rootLine, extensionNodes } from '../utils/planning'
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
  const removeNodeFromLine = useMetroStore((state) => state.removeNodeFromLine)
  const moveLineNode = useMetroStore((state) => state.moveLineNode)
  const startWaypointInsert = useMetroStore((state) => state.startWaypointInsert)
  const attachBranch = useMetroStore((state) => state.attachBranch)
  const mergeLineExtension = useMetroStore((state) => state.mergeLineExtension)
  const lines = Object.values(project.lines)
  const line = selectedLineId ? project.lines[selectedLineId] : undefined
  const locked = line ? lineLocked(line) : false
  const [lineName, setLineName] = useState(line?.name ?? '')
  const selectedStation = selectedStationId ? project.stations[selectedStationId] : undefined
  const [stationName, setStationName] = useState(selectedStation?.name ?? '')
  useEffect(() => setLineName(line?.name ?? ''), [line?.name, selectedLineId])
  useLayoutEffect(() => setStationName(selectedStation?.name ?? ''), [selectedStation?.name, selectedStationId])
  const { stationLines, groupCounts } = useMemo(() => {
    const memberships = new Map<string, Set<string>>()
    const groupCounts = new Map<string, { stations: Set<string>; nodes: Set<string> }>()
    for (const item of Object.values(project.lines)) {
      const root = rootLine(project, item)
      if (!groupCounts.has(root.id)) groupCounts.set(root.id, { stations: new Set(), nodes: new Set() })
      for (const node of item.nodes) {
        groupCounts.get(root.id)!.nodes.add(`${node.type}:${node.id}`)
        if (node.type !== 'station') continue
        groupCounts.get(root.id)!.stations.add(node.id)
        if (!memberships.has(node.id)) memberships.set(node.id, new Set())
        memberships.get(node.id)!.add(rootLine(project, item).name.replace(/^(\d+)号线$/, '$1'))
      }
    }
    return { groupCounts, stationLines: new Map([...memberships].map(([id, names]) => [id, [...names].sort((a, b) => a.localeCompare(b, 'zh-CN', { numeric: true })).join(' · ')])) }
  }, [project])
  let waypointOrdinal = 0

  return <section className="panel-section" aria-labelledby="lines-title">
    <div className="section-header"><h2 id="lines-title">线路管理</h2><button type="button" className="text-action" onClick={createLine}>＋ 新建线路</button></div>
    {lines.length === 0 ? <div className="empty-state">还没有线路。先新建一条线路，再点击地图添加站点。</div> :
      <div className="line-list">{lines.filter((item) => !item.parentLineId).map((item) => <div key={item.id}><button type="button" className={`line-item${item.id === selectedLineId ? ' line-item--active' : ''}`} onClick={() => selectLine(item.id)} aria-pressed={item.id === selectedLineId}>
        <span className="line-swatch" style={{ backgroundColor: item.color }} /><span className="line-item-name">{item.name}</span><span className="line-count">{statusNames[lineStatus(item)]} · {item.visible === false ? '隐藏 · ' : ''}{groupCounts.get(item.id)?.stations.size ?? 0} 站 · {groupCounts.get(item.id)?.nodes.size ?? 0} 节点</span>
      </button>{lines.filter((branch) => branch.parentLineId === item.id).map((branch) => <button type="button" key={branch.id} className={`line-branch-item${branch.id === selectedLineId ? ' line-branch-item--active' : ''}`} onClick={() => selectLine(branch.id)} aria-pressed={branch.id === selectedLineId}>↳ {branch.name.startsWith(item.name) ? branch.name : `${item.name}支线（${branch.name.replace(/支线$/, '')}）`} <span>属于{item.name} · 本段{branch.nodes.filter((node) => node.type === 'station').length}站</span></button>)}</div>)}</div>}
    {lines.filter((part) => !part.parentLineId && /支线$/.test(part.name) && !lineLocked(part) && !lines.some((item) => item.parentLineId === part.id)).map((part) => <div key={part.id} className="quiet">{part.name}尚未设置所属线路。{lines.filter((parent) => parent.id !== part.id && !parent.parentLineId && parent.nodes.some((node) => node.type === 'station' && part.nodes.some((other) => other.type === 'station' && other.id === node.id))).map((parent) => <button key={parent.id} type="button" className="text-action" onClick={() => attachBranch(part.id, parent.id)}>将{part.name}归入{parent.name}支线</button>)}</div>)}
    <LinePlanningPanel />
    {line && <div className="line-editor">
      <div className="subheading">编辑当前线路</div>
      {!lines.some((item) => item.parentLineId === line.id) && lines.filter((item) => item.id !== line.id && !item.parentLineId && extensionNodes(item, line)).map((item) => <button key={item.id} type="button" className="station-add-primary" disabled={locked || lineLocked(item)} onClick={() => mergeLineExtension(line.id, item.id)}>并入{item.name}，作为连续延伸</button>)}
      {line.parentLineId && <p className="quiet">{rootLine(project, line).name}的支线 · {line.name}</p>}
      {!lines.some((item) => item.parentLineId === line.id) && <><label className="field-label" htmlFor="branch-parent">支线归属</label><select id="branch-parent" disabled={locked} value={line.parentLineId ?? ''} onChange={(event) => { if (event.target.value) attachBranch(line.id, event.target.value) }}><option value="">独立线路（可选择归入已有线路）</option>{lines.filter((item) => !item.parentLineId && item.id !== line.id && item.nodes.some((node) => node.type === 'station' && line.nodes.some((other) => other.type === 'station' && other.id === node.id))).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></>}
      <label className="field-label" htmlFor="line-name">线路名称</label>
      <input disabled={locked} id="line-name" value={lineName} onChange={(event) => setLineName(event.target.value)} onBlur={() => { updateLine(line.id, { name: lineName }); setLineName(useMetroStore.getState().project.lines[line.id]?.name ?? '') }} onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur() }} />
      <label className="field-label" htmlFor="line-color">线路颜色</label>
      <div className="color-row"><input disabled={locked || !!line.parentLineId} id="line-color" type="color" value={rootLine(project, line).color} onChange={(event) => updateLine(line.id, { color: event.target.value })} /><span>{rootLine(project, line).color.toUpperCase()}{line.parentLineId ? ' · 跟随所属线路' : ''}</span></div>
      <label className="loop-toggle"><input disabled={locked} type="checkbox" checked={line.closed ?? false} onChange={(event) => updateLine(line.id, { closed: event.target.checked })} /> 首尾相连（环线）</label>
      <div className="subheading station-order-heading">节点顺序 <span>{line.nodes.length}</span></div>
      <p className="quiet">点站名可改名；点 ↑ ↓ 调整顺序。</p>
      {line.nodes.length ? <ol className="node-order">{line.nodes.map((node, index) => {
        const label = node.type === 'station' ? project.stations[node.id]?.name ?? '无效站点' : `控制点 ${++waypointOrdinal}`
        const selected = node.type === 'station' ? selectedStationId === node.id : selectedWaypointId === node.id
        return <li key={`${node.type}:${node.id}`}>
          <div className={`node-row${selected ? ' node-row--selected' : ''}`}>
            <button type="button" className="node-select" onClick={() => node.type === 'station' ? selectStation(node.id) : selectWaypoint(node.id)} aria-label={`选择${node.type === 'station' ? '站点' : '控制点'} ${label}`}>
              <span className="node-name"><span className={node.type === 'station' ? 'node-symbol--station' : 'node-symbol--waypoint'} aria-hidden="true">{node.type === 'station' ? '●' : '◆'}</span> {label}</span>
              {node.type === 'station' && <span className="station-line-names" title="所属线路">{stationLines.get(node.id)}</span>}
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
      <StationAddPanel key={line.id} line={line} stationLines={stationLines} />
      <button type="button" disabled={locked} className="danger-link" onClick={() => { if (window.confirm(`删除 ${line.name}${line.parentLineId ? '这段支线' : '及其所属支线'}？站点本身会保留。`)) deleteLine(line.id) }}>{line.parentLineId ? '删除这段支线' : '删除这条线路'}</button>
    </div>}
  </section>
}
