import { useCallback, useEffect, useRef, useState } from 'react'
import type { MapTarget } from '../config/map'
import { emptyProject } from '../models/metro'
import { useMetroStore } from '../store/metroStore'
import { readCityProject } from '../utils/cityProjects'
import { LEGACY_STORAGE_KEY, STORAGE_KEY } from '../utils/persistence'
import { cityMapTarget, fetchCityCatalog, fetchCityProject, findTransitCity, type TransitCity } from '../utils/transit'

type Props = {
  requestedTarget: MapTarget | null
  onSelectCity: (target: MapTarget) => void
  onCatalogLoaded: (cities: TransitCity[]) => void
}

export function CityNetworkPanel({ requestedTarget, onSelectCity, onCatalogLoaded }: Props) {
  const [cities, setCities] = useState<TransitCity[]>([])
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  const [opening, setOpening] = useState('')
  const [message, setMessage] = useState('')
  const controllerRef = useRef<AbortController | null>(null)
  const projectCityId = useMetroStore((state) => state.project.cityId)
  const activeCity = cities.find((city) => city.id === projectCityId)

  const openCity = useCallback(async (city: TransitCity, original = false) => {
    controllerRef.current?.abort()
    const controller = new AbortController()
    controllerRef.current = controller
    setOpening(city.name)
    setMessage('')
    try {
      const current = useMetroStore.getState().project
      if (!original && current.cityId === city.id) {
        onSelectCity(cityMapTarget(city))
        setMessage(`已定位到${city.name}，保留你的修改。`)
        return
      }
      const saved = original ? null : readCityProject(city.id, localStorage)
      let base = null
      if (saved) {
        try { base = await fetchCityProject(city, controller.signal) }
        catch (failure) { if (controller.signal.aborted) throw failure }
      }
      const project = saved ?? await fetchCityProject(city, controller.signal)
      if (controller.signal.aborted || controllerRef.current !== controller) return
      const state = useMetroStore.getState()
      if (original && state.project.cityId === city.id) state.loadProject(project)
      else if (!state.switchCity(project)) return
      if (base) {
        const actual = useMetroStore.getState().project
        const existingIds = Object.values(actual.lines).filter((line) => line.status === 'existing').map((line) => line.id).sort()
        const currentIds = Object.keys(base.lines).sort()
        if (JSON.stringify(existingIds) !== JSON.stringify(currentIds)) {
          useMetroStore.getState().setNotice('现状线路与当前内置快照不同，原方案已保留；请核对数据来源或已做的修改。', 'info')
        }
      }
      onSelectCity(cityMapTarget(city))
      setMessage(saved ? `已恢复${city.name}的修改。` : `${city.name}真实线路已载入，现状线路默认锁定，可复制为规划线路。`)
    } catch (failure) {
      if (!controller.signal.aborted) {
        const text = failure instanceof Error ? failure.message : '城市线路加载失败，请重试。'
        setMessage(text)
        useMetroStore.getState().setNotice(`${text} 当前规划未替换。`, 'error')
      }
    } finally {
      if (controllerRef.current === controller) { controllerRef.current = null; setOpening('') }
    }
  }, [onSelectCity])

  useEffect(() => {
    const controller = new AbortController()
    setError('')
    void fetchCityCatalog(controller.signal).then((found) => {
      if (controller.signal.aborted) return
      setCities(found)
      onCatalogLoaded(found)
    }).catch((failure: unknown) => {
      if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : '城市目录加载失败。')
    })
    return () => controller.abort()
  }, [onCatalogLoaded, retry])

  useEffect(() => {
    if (!cities.length) return
    controllerRef.current?.abort()
    setOpening('')
    if (requestedTarget) {
      const city = findTransitCity(cities, requestedTarget.label)
      if (city) void openCity(city)
      return
    }
    // Never replace an existing project, including an intentionally empty one or bad storage.
    try {
      const state = useMetroStore.getState()
      if (!state.notice && !Object.keys(state.project.lines).length && !Object.keys(state.project.stations).length &&
          localStorage.getItem(STORAGE_KEY) === null && localStorage.getItem(LEGACY_STORAGE_KEY) === null) {
        const wuhan = findTransitCity(cities, '武汉')
        if (wuhan) void openCity(wuhan)
      }
    } catch { /* Storage warning is shown by the project store. */ }
    return () => controllerRef.current?.abort()
  }, [cities, requestedTarget, openCity])

  useEffect(() => () => controllerRef.current?.abort(), [])

  const openCustom = () => {
    controllerRef.current?.abort()
    setOpening('')
    try {
      if (!useMetroStore.getState().project.cityId) return
      const project = readCityProject(null, localStorage) ?? emptyProject()
      if (!useMetroStore.getState().switchCity(project)) return
      const station = Object.values(project.stations)[0]
      if (station) onSelectCity({ center: [station.lng, station.lat], zoom: 10, label: project.name })
      setMessage('已返回自主规划，城市修改仍保留。')
    } catch { useMetroStore.getState().setNotice('无法读取自主规划，当前项目未替换。', 'error') }
  }

  return <div className="city-networks">
    <label className="field-label" htmlFor="transit-city">真实线路 · {cities.length || '…'} 个城市线网</label>
    <select id="transit-city" value={projectCityId ?? ''} onChange={(event) => {
      const city = cities.find((item) => item.id === event.target.value)
      if (city) void openCity(city)
      else openCustom()
    }}>
      <option value="">自主规划（保留原项目）</option>
      {projectCityId && !activeCity && <option value={projectCityId}>已保存的城市规划</option>}
      {cities.map((city) => <option key={city.id} value={city.id}>{city.name}{city.aliases.filter((name) => !/[臺園]|市$/.test(name) && name !== city.name).map((name) => ` / ${name}`).join('')}</option>)}
    </select>
    {error && <p className="city-search-message" role="alert">{error} <button type="button" className="text-action" onClick={() => setRetry((value) => value+1)}>重试</button></p>}
    {opening && <p className="city-search-message" role="status">正在载入{opening}线路…</p>}
    {message && <p className="city-search-message" role="status">{message}</p>}
    {activeCity && <div className="city-data-info">
      <strong>原始线网：{activeCity.name} · {activeCity.lineCount} 条线路 / 支线 · {activeCity.stationCount} 个站</strong>
      <span>内置数据获取：{activeCity.retrievedAt.slice(0, 10)} · <a href="https://map.amap.com/subway/index.html" target="_blank" rel="noreferrer">高德地铁图</a></span>
      <span>先复制为规划线路，或明确解锁后修改现状副本。各城市分别保存修改。</span>
      <span>按真实站点连线，非实际轨道走向；新开线路以运营方公告为准。</span>
      <button type="button" className="text-action" disabled={!!opening} onClick={() => {
        if (window.confirm(`恢复${activeCity.name}的内置原始线路？当前城市的修改将被替换，可用撤销恢复。`)) void openCity(activeCity, true)
      }}>恢复内置原始线路</button>
    </div>}
  </div>
}
