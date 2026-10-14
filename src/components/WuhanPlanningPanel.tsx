import { useEffect, useRef } from 'react'
import { useMetroStore } from '../store/metroStore'
import { WUHAN_PLANNING_VERSION } from '../utils/wuhanPlanning'

export function WuhanPlanningPanel() {
  const cityId = useMetroStore((state) => state.project.cityId)
  const scenarioId = useMetroStore((state) => state.activeScenarioId)
  const imported = useMetroStore((state) => state.project.appliedUpdates?.includes(WUHAN_PLANNING_VERSION))
  const apply = useMetroStore((state) => state.applyWuhanPlanning)
  const attempted = useRef(new Set<string>())
  useEffect(() => {
    if (cityId !== 'wuhan') return
    const key = `metro-planner.${WUHAN_PLANNING_VERSION}.${scenarioId}`
    if (attempted.current.has(key)) return
    attempted.current.add(key)
    try {
      // Undo stays undone after refresh; every saved scenario has its own marker.
      if (localStorage.getItem(key)) return
      apply()
      if (useMetroStore.getState().notice?.kind !== 'error') localStorage.setItem(key, 'applied')
    } catch { useMetroStore.getState().setNotice('确认线路载入失败，可点击下方按钮重试。', 'error') }
  }, [cityId, scenarioId, apply])
  if (cityId !== 'wuhan') return null
  return <div className="city-data-info">
    <strong>武汉已确认线路补充</strong>
    <span>已补充3号线二期、6号线三期、阳逻线延长段、11号线汉阳站段及10/11/12号线确认区段。统一实线，换乘共用站点。</span>
    <span>在建段采用官方公开工程站名，正式运营命名可能调整；每条线路附有来源说明。</span>
    <span>10号线远期段按公开走向画大致走廊，区域控制点不是站点；完整站名尚未确定。</span>
    <a href="https://jtj.wuhan.gov.cn/jtzx/tzgg/202506/t20250617_2596751.shtml" target="_blank" rel="noreferrer">12号线正式站名</a>
    {!imported && <button type="button" onClick={apply}>载入确认线路并清除旧示意</button>}
  </div>
}
