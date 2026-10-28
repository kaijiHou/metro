import {useEffect,useId,useMemo,useState} from 'react'
import type {MetroProject,Station} from '../models/metro'
import {useMetroStore} from '../store/metroStore'
import {useViewStore} from '../store/viewStore'
import {fetchCityCatalog,fetchCityProject,type TransitCity} from '../utils/transit'
import {findJourney,journeyPreferences,type JourneyPreference} from '../utils/journey'
import {rootLine} from '../utils/planning'
import {mergeTrams,tramPreview} from '../utils/trams'

type Endpoint={id:string;text:string}
const blank=():Endpoint=>({id:'',text:''})
function StationSearch({label,value,stations,badges,onChange}:{label:string;value:Endpoint;stations:Station[];badges:Record<string,{name:string;color:string}[]>;onChange:(value:Endpoint)=>void}){
 const id=useId(),[open,setOpen]=useState(false),[active,setActive]=useState(0)
 const selected=stations.find(s=>s.id===value.id)
 const query=value.text.trim().toLocaleLowerCase()
 const matches=stations.filter(s=>!query||[s.name,...(s.aliases??[])].some(n=>n.toLocaleLowerCase().includes(query)))
 const results=matches.slice(0,30)
 const choose=(station:Station)=>{onChange({id:station.id,text:''});setOpen(false)}
 return <div className="journey-search" onBlur={event=>{if(!event.currentTarget.contains(event.relatedTarget))setOpen(false)}}>
  <label className="field-label" htmlFor={id}>{label}</label>
  <input id={id} role="combobox" aria-autocomplete="list" aria-expanded={open} aria-controls={`${id}-list`} aria-activedescendant={open&&results[active]?`${id}-${active}`:undefined} autoComplete="off" placeholder="输入站名搜索" value={selected?.name??value.text}
   onFocus={()=>{setOpen(true);setActive(0)}} onChange={e=>{onChange({id:'',text:e.target.value});setOpen(true);setActive(0)}}
   onKeyDown={e=>{if(e.key==='Escape'){setOpen(false);return}if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();setOpen(true);setActive(i=>Math.max(0,Math.min(results.length-1,i+(e.key==='ArrowDown'?1:-1))))}if(e.key==='Enter'&&open&&results[active]){e.preventDefault();choose(results[active])}}}/>
  {selected&&<small className="quiet">{selected.aliases?.length?`也叫 ${selected.aliases.join(' / ')} · `:''}{badges[selected.id]?.map(b=>b.name).join(' / ')||'未接入线路'}</small>}
  {open&&<div id={`${id}-list`} role="listbox" aria-label={`${label}搜索结果`} className="journey-search-results">
   {results.map((s,i)=><button id={`${id}-${i}`} type="button" role="option" aria-selected={active===i} key={s.id} onMouseDown={e=>e.preventDefault()} onClick={()=>choose(s)}><span>{s.name}{s.aliases?.length?<small>{s.aliases.join(' / ')}</small>:null}</span><span className="journey-badges">{badges[s.id]?.map(b=><span key={b.name} style={{borderColor:b.color,color:b.color}}>{b.name.replace(/光谷有轨电车|车都有轨电车|有轨电车|号线/g,'')}</span>)}</span></button>)}
   {!results.length&&<p>没有匹配站点，请换个名字。</p>}{matches.length>30&&<p className="quiet">还有 {matches.length-30} 个匹配，输入更多文字缩小范围。</p>}
  </div>}
 </div>
}

export function JourneyPlanner(){
 const project=useMetroStore(s=>s.project),request=useViewStore(s=>s.endpointRequest),overlay=useViewStore(s=>s.journey)
 const [cities,setCities]=useState<TransitCity[]>([]),[snapshot,setSnapshot]=useState<MetroProject|null>(null)
 const [query,setQuery]=useState({city:project.cityId??'wuhan',source:'snapshot' as 'snapshot'|'project',from:blank(),to:blank()})
 const [preference,setPreference]=useState<JourneyPreference>('fastest'),[planned,setPlanned]=useState(false)
 const [loadError,setLoadError]=useState(''),[catalogError,setCatalogError]=useState(''),[message,setMessage]=useState(''),[retry,setRetry]=useState(0)
 const network=query.source==='project'?project:snapshot?.cityId===query.city?snapshot:null
 const badges=useMemo(()=>{
  const values:Record<string,{name:string;color:string}[]>={}
  if(network)for(const line of Object.values(network.lines))for(const n of line.nodes)if(n.type==='station'){
   const root=rootLine(network,line);values[n.id]??=[]
   if(!values[n.id].some(b=>b.name===root.name))values[n.id].push({name:root.name,color:root.color})
  }
  return values
 },[network])
 const stations=useMemo(()=>network?Object.values(network.stations).sort((a,b)=>a.name.localeCompare(b.name,'zh-CN')):[],[network])
 useEffect(()=>{const c=new AbortController();setCatalogError('');void fetchCityCatalog(c.signal).then(setCities).catch(()=>{if(!c.signal.aborted)setCatalogError('城市列表加载失败，请重试。')});return()=>c.abort()},[retry])
 useEffect(()=>{
  if(query.source==='project')return
  const city=cities.find(c=>c.id===query.city);if(!city)return
  const c=new AbortController();setSnapshot(null);setLoadError('')
  void fetchCityProject(city,c.signal).then(p=>{if(!c.signal.aborted)setSnapshot(p)}).catch(e=>{if(!c.signal.aborted)setLoadError(e instanceof Error?e.message:'线网加载失败')})
  return()=>c.abort()
 },[cities,query.city,query.source,retry])
 useEffect(()=>{
  if(!request)return
  setQuery(q=>({...q,city:request.cityId,source:request.source,from:q.city===request.cityId&&q.source===request.source?q.from:blank(),to:q.city===request.cityId&&q.source===request.source?q.to:blank(),[request.end]:{id:request.id,text:''}}))
  useViewStore.getState().requestEndpoint(null)
  document.getElementById('journey-title')?.scrollIntoView({block:'nearest',behavior:'smooth'})
 },[request])
 useEffect(()=>{useViewStore.getState().setJourney(null);setMessage('')},[network,query,preference,planned])
 useEffect(()=>{
  if(query.source==='project'&&query.city!==(project.cityId??'custom'))setQuery(q=>({...q,city:project.cityId??'custom',from:blank(),to:blank()}))
 },[project.cityId,query.city,query.source])
 useEffect(()=>()=>useViewStore.getState().setJourney(null),[])
 const result=overlay?.project===network?overlay.journey:null
 const missing=Object.keys(tramPreview(project).lines).length>0
 return <section className="panel-section journey-planner" aria-labelledby="journey-title">
  <div className="section-header"><h2 id="journey-title">站到站 · 路线查询</h2><span className="section-count">地铁 + 电车</span></div>
  <label className="field-label" htmlFor="journey-source">使用线网</label>
  <select id="journey-source" value={query.source} onChange={e=>setQuery(q=>({...q,source:e.target.value as typeof q.source,city:e.target.value==='project'?project.cityId??'custom':q.city==='custom'?'wuhan':q.city,from:blank(),to:blank()}))}>
   <option value="snapshot">现状快照（不改动我的规划）</option><option value="project">我的当前规划</option>
  </select>
  {query.source==='snapshot'?<><label className="field-label" htmlFor="journey-city">查询城市</label><select id="journey-city" value={query.city} onChange={e=>setQuery(q=>({...q,city:e.target.value,from:blank(),to:blank()}))}>{cities.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></>:<label className="journey-planned"><input type="checkbox" checked={planned} onChange={e=>setPlanned(e.target.checked)}/>包含在建／规划区间（模拟）</label>}
  {query.source==='project'&&missing&&<p className="quiet">有新的电车补充。<button className="text-action" onClick={()=>useMetroStore.getState().loadProject(mergeTrams(project))}>把电车加入当前规划</button>（可撤销）</p>}
  {(catalogError||loadError)&&<p role="alert">{catalogError||loadError}<button onClick={()=>setRetry(i=>i+1)}>重试查询数据</button></p>}
  {!network&&!loadError&&<p role="status">正在载入查询线网…</p>}
  <StationSearch label="起点站" value={query.from} stations={stations} badges={badges} onChange={from=>setQuery(q=>({...q,from}))}/>
  <div className="journey-swap"><button type="button" onClick={()=>setQuery(q=>({...q,from:q.to,to:q.from}))} aria-label="交换起点和终点">⇅ 交换起终点</button></div>
  <StationSearch label="终点站" value={query.to} stations={stations} badges={badges} onChange={to=>setQuery(q=>({...q,to}))}/>
  <label className="field-label" htmlFor="journey-preference">路线偏好</label><select id="journey-preference" value={preference} onChange={e=>setPreference(e.target.value as JourneyPreference)}>{Object.entries(journeyPreferences).map(([id,name])=><option value={id} key={id}>{name}</option>)}</select>
  <div className="journey-actions"><button type="button" className="button-primary" disabled={!network} onClick={()=>{
   if(!network?.stations[query.from.id]||!network.stations[query.to.id]){setMessage('请从搜索结果中选中起点站和终点站。');return}
   const journey=findJourney(network,query.from.id,query.to.id,preference,query.source==='project'&&planned)
   useViewStore.getState().setJourney(journey?{project:network,journey}:null)
   setMessage(journey?journey.stops?'':'起点与终点相同，无需乘车。':'当前线网没有可达路线。请检查城市、线路连接和是否包含规划区间。')
  }}>规划路线</button><button type="button" onClick={()=>{useViewStore.getState().setJourney(null);setMessage('');setQuery(q=>({...q,from:blank(),to:blank()}))}}>清空路线</button></div>
  {message&&<p role="status">{message}</p>}
  {result&&result.stops>0&&network&&<div className="journey-result" aria-label="路线结果" aria-live="polite">
   <strong className="journey-duration">约 {Math.ceil(result.minutes)} 分钟</strong><p>{result.transfers} 次换乘 · 乘坐 {result.stops} 站 · 约 {result.km.toFixed(1)} 公里</p>
   {result.unbuilt&&<p className="journey-warning">包含未开通区间，仅用于规划模拟。</p>}
   <ol className="journey-itinerary">{result.legs.map((leg,i)=><li key={i} style={{borderColor:leg.color}}>
    <strong>{i?'换乘：':'上车：'}{network.stations[leg.stationIds[0]].name}</strong>
    <span className="journey-line" style={{color:leg.color}}>{leg.name}</span><small>{leg.transport==='tram'?'有轨电车':'轨道交通'} · {leg.direction} · {leg.stationIds.length-1} 站</small>
    <details><summary>沿途 {leg.stationIds.length} 个站点</summary><ol>{leg.stationIds.map(id=><li key={id}>{network.stations[id].name}{network.stations[id].aliases?.length?<small>（{network.stations[id].aliases?.join(' / ')}）</small>:null}</li>)}</ol></details>
    <strong>下车：{network.stations[leg.stationIds.at(-1)!].name}</strong>
   </li>)}</ol>
  </div>}
  <p className="quiet journey-disclaimer">按内置线网估算，含候车及换乘时间；不含实时班次、首末班车和临时停运。地铁按40、电车按22公里/小时行驶估算，每站加30秒，候车约2.5／4分钟，换乘另加5分钟。站间连线距离仅供比较。</p>
  <details className="journey-data"><summary>电车覆盖与来源</summary><p className="quiet">新增武汉车都T1、光谷L1/L2/L3，南京河西／麒麟。北京西郊、佛山南海电车沿用原快照。其他电车系统尚未补齐。快照不代表实时运营。</p><p className="quiet">电车站位：© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a> · ODbL 1.0。换乘使用核实的对应站点，异名保留为搜索别名；上下行停站可能不同。</p><a href="https://github.com/kaijiHou/metro/blob/main/src/data/README.md" target="_blank" rel="noreferrer">详细来源与数据说明</a></details>
 </section>
}
