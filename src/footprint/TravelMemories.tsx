import {useEffect,useState} from 'react'
import type {City,Visit} from './types'
import type {FootprintRepository} from './repository'
import {defaultPhotos} from './defaultPhotos'
function useCityCover(repo:FootprintRepository,visit:Visit,version:number){
 const [blob,setBlob]=useState<Blob|undefined>(),[url,setUrl]=useState('')
 useEffect(()=>{let active=true;setBlob(undefined);if(visit.coverPhotoId)void repo.db.photos.get(visit.coverPhotoId).then((p)=>{if(active&&p?.cityCode===visit.cityCode)setBlob(p.thumbnailBlob)}).catch(()=>{});return()=>{active=false}},[repo,visit.cityCode,visit.coverPhotoId,version])
 useEffect(()=>{if(!blob){setUrl('');return}const next=URL.createObjectURL(blob);setUrl(next);return()=>URL.revokeObjectURL(next)},[blob])
 const system=defaultPhotos.find((p)=>p.cityCode===visit.cityCode)
 return {url:url||system?.url,isOwn:Boolean(url),system}
}
export function CityBanner({city,visit,repo,version}:{city:City;visit:Visit;repo:FootprintRepository;version:number}){
 const cover=useCityCover(repo,visit,version)
 return <div className={`footprint-city-banner${cover.url?' footprint-city-banner--photo':''}`} style={cover.url?{backgroundImage:`linear-gradient(180deg,#07152299,#07152255 45%,#071522f0),url("${cover.url}")`}:undefined}><span className="eyebrow">{[city.provinceName,city.parentCityName,city.level==='County-level city'?'县级市旅行记录':city.kind==='county'?'历史区县记录':'市级旅行记录'].filter(Boolean).join(' · ')}</span><h2>{city.name}</h2><span>{visit.status==='visited'?'已到过':'尚未点亮'} · {visit.visitedDates.length?`${visit.visitedDates.length}次到访日期`:'日期选填'}</span>{cover.url&&<small>{cover.isOwn?'个人封面 · 仅存本地':<a href={cover.system!.source} target="_blank" rel="noreferrer">GoodFreePhotos · CC0 / Public Domain</a>}</small>}</div>
}
function MemoryCard({city,visit,repo,version,onSelect}:{city:City;visit:Visit;repo:FootprintRepository;version:number;onSelect:(code:string)=>void}){
 const cover=useCityCover(repo,visit,version)
 return <button className="footprint-memory-card" onClick={()=>onSelect(city.cityCode)} aria-label={`打开旅行回忆 ${city.name}`}><div className="footprint-memory-image">{cover.url?<img src={cover.url} alt={`${city.name}${cover.isOwn?'个人封面':'默认照片'}`}/>:<span>{city.name.replace(/市$/,'')}</span>}</div><strong>{city.name}</strong><small>{visit.visitedDates.at(-1)||'已点亮 · 未填日期'}</small></button>
}
export function TravelMemories({cities,visits,repo,version,onSelect,onList}:{cities:City[];visits:Visit[];repo:FootprintRepository;version:number;onSelect:(code:string)=>void;onList:()=>void}){
 const visited=visits.filter((v)=>v.status==='visited').sort((a,b)=>(b.visitedDates.at(-1)||b.updatedAt).localeCompare(a.visitedDates.at(-1)||a.updatedAt))
 return <section className="footprint-memories" aria-label="我的城市回忆"><header><h3>我去过的城市 <span>({visited.length})</span></h3><button onClick={onList}>查看城市列表 →</button></header>{visited.length?<div className="footprint-memory-strip">{visited.slice(0,12).map((v)=>{const city=cities.find((c)=>c.cityCode===v.cityCode);return city?<MemoryCard key={v.cityCode} city={city} visit={v} repo={repo} version={version} onSelect={onSelect}/>:null})}</div>:<p className="footprint-empty-memories">点开一个城市，标记已到过。你的城市和照片会出现在这里。</p>}</section>
}
