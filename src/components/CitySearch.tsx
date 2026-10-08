import { useEffect, useRef, useState, type FormEvent } from 'react'
import { INITIAL_CENTER, type MapTarget } from '../config/map'
import { validCoordinates } from '../utils/validation'

type CityResult = { id: string; name: string; description: string; center: [number, number] }

const popularCities: { name: string; center: [number, number] }[] = [
  { name: '武汉', center: INITIAL_CENTER },
  { name: '北京', center: [116.4074, 39.9042] },
  { name: '上海', center: [121.4737, 31.2304] },
  { name: '广州', center: [113.2644, 23.1291] },
  { name: '深圳', center: [114.0579, 22.5431] },
  { name: '成都', center: [104.0665, 30.5723] },
  { name: '重庆', center: [106.5516, 29.5630] },
  { name: '西安', center: [108.9398, 34.3416] },
  { name: '杭州', center: [120.1551, 30.2741] },
]

function parseResults(value: unknown): CityResult[] {
  if (!Array.isArray(value)) throw new Error('城市搜索返回了无效数据。')
  return value.flatMap((item: unknown) => {
    if (typeof item !== 'object' || item === null) return []
    const raw = item as Record<string, unknown>
    if (typeof raw.display_name !== 'string' || typeof raw.lat !== 'string' || typeof raw.lon !== 'string' ||
        (typeof raw.place_id !== 'number' && typeof raw.place_id !== 'string')) return []
    const lng = Number(raw.lon)
    const lat = Number(raw.lat)
    if (!validCoordinates(lng, lat)) return []
    return [{
      id: String(raw.place_id),
      name: typeof raw.name === 'string' ? raw.name : raw.display_name.split(',')[0],
      description: raw.display_name,
      center: [lng, lat] as [number, number],
    }]
  })
}

export function CitySearch({ onSelectCity }: { onSelectCity: (target: MapTarget) => void }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<CityResult[]>([])
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const lastRequestAt = useRef(0)
  const requestController = useRef<AbortController | null>(null)
  useEffect(() => () => requestController.current?.abort(), [])

  const goTo = (name: string, center: [number, number]) => {
    requestController.current?.abort()
    requestController.current = null
    setLoading(false)
    const target = { center, zoom: 10, label: name }
    onSelectCity(target)
    setQuery(name)
    setResults([])
    setMessage(`已定位到${name}。当前规划仍保留。`)
  }

  const search = async (event: FormEvent) => {
    event.preventDefault()
    const city = query.trim()
    if (!city || loading) return
    if (Date.now() - lastRequestAt.current < 1100) {
      setMessage('请稍等一秒再搜索。')
      return
    }
    lastRequestAt.current = Date.now()
    const controller = new AbortController()
    requestController.current = controller
    setLoading(true)
    setResults([])
    setMessage('正在查找城市…')
    try {
      const url = new URL('https://nominatim.openstreetmap.org/search')
      url.search = new URLSearchParams({ q: city, format: 'jsonv2', limit: '8', featuretype: 'city', 'accept-language': 'zh-CN,zh,en' }).toString()
      const response = await fetch(url, { signal: controller.signal })
      if (!response.ok) throw new Error('城市搜索暂时不可用，请稍后再试。')
      const found = parseResults(await response.json())
      if (requestController.current !== controller) return
      setResults(found)
      setMessage(found.length ? '选择一个结果，地图会移动到那里。' : '没找到这个城市。试试城市名加国家或地区。')
    } catch {
      if (requestController.current === controller) setMessage('城市搜索暂时不可用，请稍后再试；常用城市仍可直接选择。')
    } finally {
      if (requestController.current === controller) {
        requestController.current = null
        setLoading(false)
      }
    }
  }

  return <section className="panel-section city-search" aria-labelledby="city-search-title">
    <div className="section-header"><h2 id="city-search-title">前往城市</h2></div>
    <p className="city-search-message">真实线路数据源暂未内置，可继续进行自主规划。</p>
    <form onSubmit={(event) => void search(event)} className="city-search-form">
      <input value={query} onChange={(event) => {
        requestController.current?.abort()
        requestController.current = null
        setLoading(false)
        setResults([])
        setMessage('')
        setQuery(event.target.value)
      }} aria-label="城市名称" placeholder="输入城市，如东京、巴黎" maxLength={80} />
      <button type="submit" disabled={!query.trim() || loading}>{loading ? '查找中' : '搜索'}</button>
    </form>
    {message && <p className="city-search-message" role="status">{message}</p>}
    {results.length > 0 && <ul className="city-results">{results.map((city) => <li key={city.id}>
      <button type="button" onClick={() => goTo(city.name, city.center)}>{city.description}</button>
    </li>)}</ul>}
    <div className="city-shortcuts" aria-label="常用城市">{popularCities.map((city) => <button type="button" key={city.name} onClick={() => goTo(city.name, city.center)}>{city.name}</button>)}</div>
    <p className="city-search-credit">城市搜索 © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a></p>
  </section>
}
