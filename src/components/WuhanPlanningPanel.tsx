import { useEffect } from 'react'
import { useMetroStore } from '../store/metroStore'
import { WUHAN_PLANNING_VERSION } from '../utils/wuhanPlanning'

export function WuhanPlanningPanel() {
  const cityId = useMetroStore((state) => state.project.cityId)
  const scenarioId = useMetroStore((state) => state.activeScenarioId)
  const imported = useMetroStore((state) => Object.values(state.project.lines).some((line) => line.sourceLineId === WUHAN_PLANNING_VERSION))
  const apply = useMetroStore((state) => state.applyWuhanPlanning)
  useEffect(() => {
    if (cityId !== 'wuhan') return
    // Replace only the first active Wuhan scenario, not every saved alternative.
    const key = `metro-planner.${WUHAN_PLANNING_VERSION}.auto-applied`
    try {
      if (localStorage.getItem(key)) return
      apply()
      if (useMetroStore.getState().notice?.kind !== 'error') localStorage.setItem(key, 'applied')
    } catch { useMetroStore.getState().setNotice('规划示意自动载入失败，可点击下方按钮重试。', 'error') }
  }, [cityId, scenarioId, apply])
  if (cityId !== 'wuhan') return null
  return <div className="city-data-info">
    <strong>武汉远期规划 · 大致走廊示意</strong>
    <span>换乘共用已有站点。示意控制点是区域位置，不代表已确定车站；线路相交不等于换乘。</span>
    <span>新版公开图、官方回复及旧版参考综合整理，待核实部分见各线路说明。</span>
    <a href="https://www.ditiee.com/thread-1424-1-1.html" target="_blank" rel="noreferrer">2024—2035规划展示图与来源</a>
    {!imported && <button type="button" onClick={apply}>加入规划示意并替换9号线</button>}
  </div>
}
