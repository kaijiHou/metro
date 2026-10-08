import { useMemo } from 'react'
import { useMetroStore } from '../store/metroStore'
import { cityStatistics, lineStatistics } from '../utils/statistics'

export function LineStatsPanel() {
  const project = useMetroStore((state) => state.project)
  const selectedLineId = useMetroStore((state) => state.selectedLineId)
  const city = useMemo(() => cityStatistics(project), [project])
  const line = selectedLineId ? project.lines[selectedLineId] : undefined
  const stats = useMemo(() => line ? lineStatistics(project, line) : null, [project, line])
  return <section className="panel-section" aria-labelledby="stats-title">
    <div className="section-header"><h2 id="stats-title">规划统计</h2></div>
    <div className="planning-stats">
      <span>现状线路</span><strong>{city.existingLines}</strong>
      <span>在建线路</span><strong>{city.constructionLines}</strong>
      <span>规划线路</span><strong>{city.plannedLines}</strong>
      <span>现状站点</span><strong>{city.existingStations}</strong>
      <span>规划新增站点</span><strong>{city.plannedNewStations}</strong>
      <span>规划新增里程</span><strong>{city.plannedNewLengthKm.toFixed(2)} km</strong>
    </div>
    <p className="quiet">新增里程按规划几何计算，排除与现状完全重合的线段；隐藏线路仍计入统计。</p>
    {line && stats && <>
      <div className="subheading">{line.name}</div>
      <div className="planning-stats" aria-label="当前线路统计">
        <span>站点 / 节点 / 控制点</span><strong>{stats.stationCount} / {stats.nodeCount} / {stats.waypointCount}</strong>
        <span>线路总长度</span><strong>{stats.totalLengthKm.toFixed(2)} km</strong>
        <span>平均站距</span><strong>{stats.averageSpacingKm.toFixed(2)} km</strong>
        <span>最短站距</span><strong>{stats.minSpacingKm.toFixed(2)} km</strong>
        <span>最长站距</span><strong>{stats.maxSpacingKm.toFixed(2)} km</strong>
      </div>
      <p className="quiet">站距沿控制点路径累计；环线包括闭合段。</p>
    </>}
  </section>
}
