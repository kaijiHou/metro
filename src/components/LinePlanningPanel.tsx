import { useMetroStore } from '../store/metroStore'
import { lineLocked, lineStatus, statusNames } from '../utils/planning'
import type { LineStatus } from '../models/metro'

export function LinePlanningPanel() {
  const project = useMetroStore((state) => state.project)
  const selectedLineId = useMetroStore((state) => state.selectedLineId)
  const updateLine = useMetroStore((state) => state.updateLine)
  const copy = useMetroStore((state) => state.copyLineToPlanned)
  const extend = useMetroStore((state) => state.extendLine)
  const allVisible = useMetroStore((state) => state.setAllLinesVisible)
  const line = selectedLineId ? project.lines[selectedLineId] : undefined
  return <div className="planning-controls">
    <div className="station-bulk-actions">
      <button type="button" onClick={() => allVisible(true)}>全部显示</button>
      <button type="button" onClick={() => allVisible(false)}>全部隐藏</button>
      <button type="button" disabled={!line} onClick={() => allVisible(true, line?.id)}>只显示当前线路</button>
    </div>
    {line && <>
      <p className="quiet">{statusNames[lineStatus(line)]} · {lineLocked(line) ? '🔒 已锁定' : '已解锁'}</p>
      <div className="station-bulk-actions">
        <button type="button" onClick={() => updateLine(line.id, { locked: !lineLocked(line) })}>{lineLocked(line) ? '解锁编辑' : '锁定保护'}</button>
        <button type="button" onClick={() => updateLine(line.id, { visible: line.visible === false })}>{line.visible === false ? '显示线路' : '隐藏线路'}</button>
      </div>
      <label className="field-label" htmlFor="line-status">线路状态</label>
      <select id="line-status" value={lineStatus(line)} disabled={lineLocked(line)} onChange={(event) => updateLine(line.id, { status: event.target.value as LineStatus })}>
        {Object.entries(statusNames).map(([value, name]) => <option value={value} key={value}>{name}</option>)}
      </select>
      <div className="station-bulk-actions">
        <button type="button" onClick={() => copy(line.id)}>复制为规划线路</button>
        <button type="button" onClick={() => extend(line.id, 'start')}>从首端延长</button>
        <button type="button" onClick={() => extend(line.id, 'end')}>从末端延长</button>
      </div>
      {lineLocked(line) && <p className="quiet">真实已建成线路已锁定。延长会自动创建规划副本。</p>}
    </>}
  </div>
}
