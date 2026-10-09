import { useMetroStore } from '../store/metroStore'

export function ModePanel() {
  const editorMode = useMetroStore((state) => state.editorMode)
  const pendingInsertIndex = useMetroStore((state) => state.pendingInsertIndex)
  const selectedLineId = useMetroStore((state) => state.selectedLineId)
  const setEditorMode = useMetroStore((state) => state.setEditorMode)
  const setNotice = useMetroStore((state) => state.setNotice)
  const startAdding = () => {
    if (!selectedLineId) { setNotice('请先选择或创建线路，再添加站点。', 'error'); return }
    setEditorMode('add-station')
  }
  const startWaypoint = () => {
    if (!selectedLineId) { setNotice('请先选择或创建线路，再添加控制点。', 'error'); return }
    setEditorMode('add-waypoint')
  }
  return <section className="mode-panel" aria-label="编辑模式">
    <div className="eyebrow">编辑模式</div>
    <div className="mode-switch">
      <button type="button" className={editorMode === 'browse' ? 'active' : ''} aria-pressed={editorMode === 'browse'} onClick={() => setEditorMode('browse')}>浏览 / 选择</button>
      <button type="button" className={editorMode === 'add-station' ? 'active' : ''} aria-pressed={editorMode === 'add-station'} onClick={startAdding}>添加站点</button>
      <button type="button" className={editorMode === 'add-waypoint' ? 'active' : ''} aria-pressed={editorMode === 'add-waypoint'} onClick={startWaypoint}>添加控制点</button>
    </div>
    <p>{editorMode === 'select-stations' ? '点击地图站点或勾选站点列表，再批量删除' : editorMode === 'add-station' ? '点空白处新建站点，点已有站直接接入当前线路' : editorMode === 'add-waypoint' ? pendingInsertIndex === null ? '点击线路插入控制点，可连续添加；拖动菱形点调整走向' : '点击地图放置控制点；取消请点“浏览 / 选择”' : '点击节点选择并编辑'}</p>
  </section>
}
