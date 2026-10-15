import { useEffect,useRef,useState } from 'react'
import type { StationExit,StationExitResult } from '../models/exits'
import type { BrowseStation } from '../utils/browseGeojson'
import { exitInfo,parseUserExits } from '../services/exitInfo'

export function StationDetailDrawer({station,onClose,onExits,onLocate}:{station:BrowseStation;onClose:()=>void;onExits:(exits:StationExit[])=>void;onLocate:(exit:StationExit)=>void}) {
  const [result,setResult]=useState<StationExitResult|null>(null)
  const [retry,setRetry]=useState(0)
  const [error,setError]=useState('')
  const generation=useRef({active:false})
  const queryController=useRef<AbortController|null>(null)
  const input=useRef<HTMLInputElement>(null)
  useEffect(()=>{
    const lifetime={active:true};generation.current=lifetime
    const controller=new AbortController();queryController.current=controller;setResult(null);setError('');onExits([])
    void exitInfo.load(station,controller.signal,retry>0).then((next)=>{if(!controller.signal.aborted){setResult(next);onExits(next.exits)}}).catch(()=>{})
    return()=>{lifetime.active=false;controller.abort();onExits([])}
  },[station,retry,onExits])
  return <aside className="station-drawer" aria-label="车站详情">
    <div className="section-header"><span className="eyebrow">{station.cityName} · 只读车站详情</span><button onClick={onClose} aria-label="关闭车站详情">×</button></div>
    <h2>{station.name}</h2><p>{station.lineNames.join(' / ')}</p><a href={station.sourceUrl||'https://www.openstreetmap.org/copyright'} target="_blank" rel="noreferrer">线网数据来源</a>
    <h3>地铁出入口</h3>
    {!result?<p role="status">正在按需查询OSM站区出口…</p>:<><p role="status">{result.message}</p>{result.exits.map((exit)=><article className="exit-card" key={exit.id}>
      <strong>{exit.ref?`${exit.ref} 出入口`:exit.name||'未编号出入口'}</strong><span>{exit.confidence==='verified'?'站区关系已关联':exit.confidence==='probable'?'候选关联，待核实':'用户补录，未核实'}</span>
      <p>{exit.exitTo?.length?`通往/邻近：${exit.exitTo.join('、')}`:'出口方向暂未收录'}</p>
      <small>{exit.lng.toFixed(6)}, {exit.lat.toFixed(6)} · 无障碍：{{yes:'有',no:'无',limited:'有限',unknown:'未知'}[exit.wheelchair]}</small>
      <small>{exit.fetchedAt?`查询于 ${new Date(exit.fetchedAt).toLocaleString()}`:''}</small>
      {exit.sourceUrl&&<a href={exit.sourceUrl} target="_blank" rel="noreferrer">{exit.source==='osm'?'OpenStreetMap对象':'补录来源'}</a>}
      <button onClick={()=>onLocate(exit)}>在地图定位此出口</button>
    </article>)}<button onClick={()=>setRetry((value)=>value+1)}>重新查询出口</button></>}
    <p className="quiet">OSM © OpenStreetMap contributors · ODbL。第三方数据可能缺失或变化；无可靠步行路网时不提供距离、耗时或导航。</p>
    <details><summary>导入出口资料（本次查看有效）</summary><p className="quiet">城市标识：{station.cityId}；车站标识：{station.id}。仅导入你有权使用的资料；所有导入标为“用户补录，未核实”，不会写入地铁规划。</p><button onClick={()=>input.current?.click()}>选择出口 JSON</button>
      <input hidden ref={input} type="file" accept="application/json,.json" aria-label="导入车站出口JSON" onChange={async(event)=>{
        const file=event.target.files?.[0];if(!file)return
        const currentGeneration=generation.current
        const element=event.currentTarget
        try{if(file.size>100000)throw new Error('出口文件不能超过100KB。');const exits=parseUserExits(JSON.parse(await file.text()),station);if(!currentGeneration.active)return;queryController.current?.abort();setResult({stationId:station.id,status:'partial',exits,message:'用户补录资料，站点关联及开放情况尚未核实。'});onExits(exits)}catch(failure){if(currentGeneration.active)setError(failure instanceof Error?failure.message:'无法导入。')}finally{element.value=''}
      }}/></details>{error&&<p role="alert">{error}</p>}
  </aside>
}
