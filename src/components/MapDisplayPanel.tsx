import { useMetroStore } from '../store/metroStore'

export function MapDisplayPanel() {
  const mode = useMetroStore((state) => state.stationLabelMode)
  const setMode = useMetroStore((state) => state.setStationLabelMode)
  return <section className="panel-section">
    <label className="field-label" htmlFor="station-label-mode">站名标签</label>
    <select id="station-label-mode" value={mode} onChange={(event) => setMode(event.target.value as typeof mode)}>
      <option value="all">全部显示</option>
      <option value="interchanges">只显示换乘站</option>
      <option value="current">只显示当前线路</option>
      <option value="none">全部隐藏</option>
    </select>
    <p className="quiet">放大地图可查看站名。展示模式会隐藏全部站点与站名。</p>
  </section>
}
