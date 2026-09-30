import { useMetroStore } from '../store/metroStore'

export function ModePanel() {
  const editorMode = useMetroStore((state) => state.editorMode)
  const selectedLineId = useMetroStore((state) => state.selectedLineId)
  const setEditorMode = useMetroStore((state) => state.setEditorMode)
  const setNotice = useMetroStore((state) => state.setNotice)
  const startAdding = () => {
    if (!selectedLineId) { setNotice('请先选择或创建线路，再添加站点。', 'error'); return }
    setEditorMode('add-station')
  }
  return <section className="mode-panel" aria-label="编辑模式">
    <div className="eyebrow">编辑模式</div>
    <div className="mode-switch">
      <button type="button" className={editorMode === 'browse' ? 'active' : ''} aria-pressed={editorMode === 'browse'} onClick={() => setEditorMode('browse')}>浏览 / 选择</button>
      <button type="button" className={editorMode === 'add-station' ? 'active' : ''} aria-pressed={editorMode === 'add-station'} onClick={startAdding}>添加站点</button>
    </div>
    <p>{editorMode === 'add-station' ? '添加站点模式：开启' : '添加站点模式：关闭'}</p>
  </section>
}
