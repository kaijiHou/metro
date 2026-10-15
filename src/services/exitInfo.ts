import type { StationExit,StationExitResult } from '../models/exits'
import type { BrowseStation } from '../utils/browseGeojson'
import { validCoordinates } from '../utils/validation'

type OsmElement = {type:string;id:number;lat?:number;lon?:number;tags?:Record<string,string>;members?:{type:string;ref:number}[]}
const normalized = (name:string) => name.replace(/\([^)]*\)|（[^）]*）|地铁站|站$/g,'').trim().toLowerCase()
const wheelchair = (value:unknown):StationExit['wheelchair'] => value==='yes'||value==='no'||value==='limited'?value:'unknown'

export function parseOsmExits(value:unknown, station:BrowseStation, fetchedAt = new Date().toISOString()):StationExitResult {
  if (!value || typeof value!=='object' || !('elements' in value) || !Array.isArray(value.elements)) throw new Error('出口数据格式无效。')
  const elements = value.elements as OsmElement[]
  const matched = elements.filter((element)=>element.type==='relation' && element.tags?.public_transport==='stop_area' &&
    (station.relationId ? element.id===station.relationId : ['name','name:zh','name:zh-Hans','official_name','alt_name'].some((key)=>(element.tags?.[key]??'').split(';').some((name)=>normalized(name)===normalized(station.name)))))
  const members = new Set(matched.flatMap((relation)=>relation.members??[]).filter((member)=>member.type==='node').map((member)=>member.ref))
  const exits = new Map<string,StationExit>()
  for (const element of elements) {
    if (element.type!=='node' || element.tags?.railway!=='subway_entrance' || !members.has(element.id) ||
        typeof element.lon!=='number' || typeof element.lat!=='number' || !validCoordinates(element.lon,element.lat) || Math.hypot(element.lon-station.lng,element.lat-station.lat)>0.025) continue
    const id = `${station.cityId}:osm:node:${element.id}`
    exits.set(id,{id,cityId:station.cityId,stationId:station.id,lng:element.lon,lat:element.lat,ref:element.tags.ref,name:element.tags.name,
      exitTo:element.tags.exit_to?.split(/[;；]/).map((item)=>item.trim()).filter(Boolean),wheelchair:wheelchair(element.tags.wheelchair),source:'osm',
      sourceUrl:`https://www.openstreetmap.org/node/${element.id}`,fetchedAt,confidence:station.relationId?'verified':'probable'})
  }
  return {stationId:station.id,status:exits.size?(station.relationId?'available':'partial'):'unavailable',exits:[...exits.values()],
    message:exits.size?(station.relationId?'出口来自明确的OSM站区关系；仍请核对现场开放情况。':'按同名OSM站区关系匹配，站点关联尚未独立核实；仅列出该关系的出口成员。'):'暂无可靠出口数据；不代表本站没有出口。'}
}

export class ExitInfoService {
  private cache = new Map<string,{at:number;result:StationExitResult}>()
  private nextRequestAt = 0
  constructor(private fetcher:typeof fetch = (input,init)=>fetch(input,init), private now = Date.now) {}
  async load(station:BrowseStation, signal:AbortSignal, force = false):Promise<StationExitResult> {
    const key = JSON.stringify([station.cityId,station.id,station.name,station.lng,station.lat,station.relationId])
    const cached = this.cache.get(key)
    if (!force && cached && this.now()-cached.at<86400000) return cached.result
    while (this.nextRequestAt > this.now()) {
      const delay = this.nextRequestAt-this.now()
      await new Promise<void>((resolve,reject)=>{
      const aborted=()=>{clearTimeout(timer);reject(new DOMException('Aborted','AbortError'))}
      const timer=setTimeout(()=>{signal.removeEventListener('abort',aborted);resolve()},delay)
      if(signal.aborted) aborted(); else signal.addEventListener('abort',aborted,{once:true})
    })
    }
    signal.throwIfAborted()
    this.nextRequestAt = this.now()+1500
    const query = station.relationId ? `relation(${station.relationId});` : `relation(around:650,${station.lat},${station.lng})["public_transport"="stop_area"];`
    try {
      const response = await this.fetcher('https://overpass-api.de/api/interpreter', {method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({data:`[out:json][timeout:15];${query}out body;>;out body;`}),signal:AbortSignal.any([signal,AbortSignal.timeout(20000)])})
      if (!response.ok) throw new Error(`出口查询服务暂时不可用（${response.status}）。`)
      const result = parseOsmExits(await response.json(),station)
      signal.throwIfAborted()
      this.cache.delete(key);this.cache.set(key,{at:this.now(),result})
      while(this.cache.size>100)this.cache.delete(this.cache.keys().next().value!)
      return result
    } catch(error) {
      signal.throwIfAborted()
      return {stationId:station.id,status:'error',exits:[],message:error instanceof Error?`${error.message} 可稍后重试。`:'出口查询失败，可稍后重试。'}
    }
  }
}
export const exitInfo = new ExitInfoService()

export function parseUserExits(value:unknown,station:BrowseStation):StationExit[] {
  if(!Array.isArray(value)||value.length>100)throw new Error('请选择最多100条出口记录的JSON数组。')
  const ids=new Set<string>()
  return value.map((entry:unknown,index)=>{
    if(!entry||typeof entry!=='object')throw new Error('出口记录必须是对象。')
    const raw=entry as Record<string,unknown>
    if(raw.cityId!==station.cityId||raw.stationId!==station.id||typeof raw.lng!=='number'||typeof raw.lat!=='number'||!validCoordinates(raw.lng,raw.lat)||Math.hypot(raw.lng-station.lng,raw.lat-station.lat)>0.025)throw new Error('出口城市、站点或坐标不匹配。')
    const id=`${station.cityId}:user:${typeof raw.id==='string'?raw.id:index}`
    if(ids.has(id))throw new Error('出口记录ID重复。');ids.add(id)
    if(raw.exitTo!==undefined&&(!Array.isArray(raw.exitTo)||!raw.exitTo.every((name)=>typeof name==='string')))throw new Error('出口指向必须是文字数组。')
    return {id,cityId:station.cityId,stationId:station.id,lng:raw.lng,lat:raw.lat,ref:typeof raw.ref==='string'?raw.ref:undefined,name:typeof raw.name==='string'?raw.name:undefined,exitTo:raw.exitTo as string[]|undefined,wheelchair:wheelchair(raw.wheelchair),source:'user',confidence:'unverified',sourceUrl:typeof raw.sourceUrl==='string'&&/^https:\/\//.test(raw.sourceUrl)?raw.sourceUrl:undefined,fetchedAt:new Date().toISOString()}
  })
}
