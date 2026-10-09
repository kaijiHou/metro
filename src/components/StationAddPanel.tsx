import { useState } from 'react'
import type { MetroLine } from '../models/metro'
import { useMetroStore } from '../store/metroStore'
import { lineLocked } from '../utils/planning'

export function StationAddPanel({ line, stationLines }: { line: MetroLine; stationLines: Map<string, string> }) {
  const stations = useMetroStore((state) => state.project.stations)
  const editorMode = useMetroStore((state) => state.editorMode)
  const extensionEnd = useMetroStore((state) => state.extensionEnd)
  const setEditorMode = useMetroStore((state) => state.setEditorMode)
  const extendLine = useMetroStore((state) => state.extendLine)
  const addStationToLine = useMetroStore((state) => state.addStationToLine)
  const [kind, setKind] = useState<'new' | 'existing'>('new')
  const [position, setPosition] = useState<'start' | 'end'>(extensionEnd === 'start' ? 'start' : 'end')
  const [search, setSearch] = useState('')
  const locked = lineLocked(line)
  const adding = editorMode === 'add-station'
  const currentPosition = adding ? extensionEnd === 'start' ? 'start' : 'end' : position
  const positionName = currentPosition === 'start' ? '开头' : '末尾'
  const memberIds = new Set(line.nodes.filter((node) => node.type === 'station').map((node) => node.id))
  const query = search.trim().toLocaleLowerCase()
  const results = Object.values(stations).filter((station) =>
    `${station.name} ${stationLines.get(station.id) ?? ''}`.toLocaleLowerCase().includes(query))
  const chooseKind = (next: 'new' | 'existing') => {
    setKind(next)
    if (adding) { setPosition(currentPosition); setEditorMode('browse') }
  }

  return <section className="station-add-panel" aria-label={`给${line.name}添加站点`}>
    <h3>给 {line.name} 添加站点</h3>
    {locked && <p className="station-add-help">线路已锁定，请先点击“解锁编辑”。</p>}
    <div className="station-add-tabs" role="group" aria-label="站点来源">
      <button type="button" aria-pressed={kind === 'new'} onClick={() => chooseKind('new')}>新建站点</button>
      <button type="button" aria-pressed={kind === 'existing'} onClick={() => chooseKind('existing')}>使用已有站点</button>
    </div>
    <div className="station-add-position" role="group" aria-label="添加位置">
      <span>放在哪里</span>
      <button type="button" disabled={locked} aria-pressed={currentPosition === 'start'} onClick={() => { setPosition('start'); if (adding) extendLine(line.id, 'start') }}>线路开头</button>
      <button type="button" disabled={locked} aria-pressed={currentPosition === 'end'} onClick={() => { setPosition('end'); if (adding) extendLine(line.id, 'end') }}>线路末尾</button>
    </div>
    {kind === 'new' ? <>
      <p className="station-add-help">{adding ? `正在往${line.name}${positionName}加站。点空白处新建，点已有站直接接入。` : `新站将放在${line.name}${positionName}，也可直接点地图上的已有站接入。`}</p>
      {adding ? <button type="button" className="station-add-primary" onClick={() => { setPosition(currentPosition); setEditorMode('browse') }}>完成添加</button> :
        <button type="button" disabled={locked} className="station-add-primary" onClick={() => position === 'start' ? extendLine(line.id, 'start') : setEditorMode('add-station')}>去地图放新站</button>}
      {adding && currentPosition === 'start' && <p className="station-add-help">每点一次，新站就排在最前面。</p>}
    </> : <>
      <label className="station-search-label" htmlFor="station-search">搜索站名或线路编号</label>
      <input id="station-search" type="search" placeholder="例如：武汉火车站 / 2" value={search} onChange={(event) => setSearch(event.target.value)} />
      <p className="station-add-help">点击下面的站点，加入{line.name}{positionName}。</p>
      <div className="station-search-results" aria-label="站点搜索结果">
        {results.slice(0, 30).map((station) => <button type="button" key={station.id} data-station-id={station.id} className="station-result" disabled={locked || memberIds.has(station.id)} aria-label={`把${station.name}加入${line.name}${positionName}`} onClick={() => addStationToLine(station.id, line.id, position === 'start' ? 0 : undefined)}>
          <span className="station-result-name">{station.name}<small>{memberIds.has(station.id) ? '已在线路中' : `加入${positionName}`}</small></span>
          <span className="station-result-lines" title="所属线路">{stationLines.get(station.id) || '未加入线路'}</span>
        </button>)}
        {!results.length && <p className="station-search-empty">没找到这个站，试试名称中的几个字。</p>}
      </div>
      {results.length > 30 && <p className="station-add-help">还有 {results.length - 30} 个结果，输入更完整的站名查找。</p>}
    </>}
  </section>
}
