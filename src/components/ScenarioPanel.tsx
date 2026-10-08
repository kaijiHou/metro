import { useEffect, useState } from 'react'
import { emptyProject } from '../models/metro'
import { useMetroStore } from '../store/metroStore'
import { fetchCityCatalog, fetchCityProject } from '../utils/transit'

export function ScenarioPanel() {
  const project = useMetroStore((state) => state.project)
  const scenarios = useMetroStore((state) => state.scenarios)
  const activeId = useMetroStore((state) => state.activeScenarioId)
  const create = useMetroStore((state) => state.createScenario)
  const copy = useMetroStore((state) => state.copyScenario)
  const rename = useMetroStore((state) => state.renameScenario)
  const switchTo = useMetroStore((state) => state.switchScenario)
  const remove = useMetroStore((state) => state.deleteScenario)
  const [name, setName] = useState('')
  const [activeName, setActiveName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => setActiveName(scenarios.find((item) => item.id === activeId)?.name ?? ''), [scenarios, activeId])

  const newScenario = async () => {
    if (!name.trim() || scenarios.length >= 5 || busy) return
    setBusy(true)
    setError('')
    const controller = new AbortController()
    try {
      let base = emptyProject(project.name)
      if (project.cityId) {
        const city = (await fetchCityCatalog(controller.signal)).find((item) => item.id === project.cityId)
        if (!city) throw new Error('未找到当前城市的现状线网。')
        base = await fetchCityProject(city, controller.signal)
      }
      if (!create(name, base)) throw new Error('无法创建方案，请检查名称、数量或浏览器存储空间。')
      setName('')
    } catch (failure) { setError(failure instanceof Error ? failure.message : '无法创建方案。') }
    finally { setBusy(false) }
  }

  return <section className="panel-section" aria-labelledby="scenario-title">
    <div className="section-header"><h2 id="scenario-title">规划方案</h2><span className="section-count">{scenarios.length} / 5</span></div>
    <label className="field-label" htmlFor="scenario-select">当前方案</label>
    <select id="scenario-select" value={activeId} onChange={(event) => switchTo(event.target.value)}>
      {scenarios.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
    </select>
    <label className="field-label" htmlFor="scenario-rename">方案名称</label>
    <div className="add-existing"><input id="scenario-rename" value={activeName} onChange={(event) => setActiveName(event.target.value)} />
      <button type="button" disabled={!activeName.trim()} onClick={() => rename(activeId, activeName)}>重命名</button></div>
    <label className="field-label" htmlFor="scenario-new-name">新方案名称</label>
    <input id="scenario-new-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="例如 2035 方案 A" />
    <div className="station-bulk-actions">
      <button type="button" disabled={!name.trim() || scenarios.length >= 5 || busy} onClick={() => void newScenario()}>{busy ? '载入现状中…' : '新建方案'}</button>
      <button type="button" disabled={!name.trim() || scenarios.length >= 5 || busy} onClick={() => { if (copy(name)) setName(''); else setError('复制失败，请检查浏览器存储空间。') }}>复制当前方案</button>
      <button type="button" disabled={scenarios.length <= 1 || busy} onClick={() => {
        if (window.confirm(`删除方案“${scenarios.find((item) => item.id === activeId)?.name}”？`)) remove(activeId)
      }}>删除当前方案</button>
    </div>
    {error && <p role="alert">{error}</p>}
    <p className="quiet">每个城市最多保存 5 个方案；新方案从内置现状线网开始。切换方案后撤销历史清空。</p>
  </section>
}
