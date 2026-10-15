import type {FeatureCollection,Polygon,MultiPolygon} from 'geojson'
import type {Catalog,Visit} from './types'
export const footprintUrl=(file:string)=>`${import.meta.env?.BASE_URL??'/'}footprint/${file}`
let catalogPromise:Promise<Catalog>|undefined
export function parseCatalog(value:unknown):Catalog{
 const c=value as Catalog
 if(!c||!Array.isArray(c.cities)||!c.cities.length||!Array.isArray(c.missing))throw Error('城市目录格式错误。')
 const ids=new Set<string>()
 for(const city of c.cities){
  if(!/^ocha2020-CN\d{6}$/.test(city.cityCode)||ids.has(city.cityCode)||!/^CN\d{3}$/.test(city.provinceCode)||!city.name||!city.provinceName||!Array.isArray(city.aliases)||city.bounds.length!==4||!city.bounds.every(Number.isFinite)||city.bounds[0]>=city.bounds[2]||city.bounds[1]>=city.bounds[3])throw Error('城市代码或行政边界映射不合法。')
  ids.add(city.cityCode)
 }
 return c
}
export function getCatalog(){
 catalogPromise??=fetch(footprintUrl('catalog.json')).then((r)=>{if(!r.ok)throw Error('城市目录加载失败，可重试。');return r.json()}).then(parseCatalog).catch((e)=>{catalogPromise=undefined;throw e})
 return catalogPromise
}
export type CityGeometry=FeatureCollection<Polygon|MultiPolygon,{cityCode:string;name:string}>
const geometryCache=new Map<string,Promise<CityGeometry>>()
export function getProvinceGeometry(province:string,catalog:Catalog){
 if(!geometryCache.has(province))geometryCache.set(province,fetch(footprintUrl(`${province}.json`)).then(async(r)=>{
  if(!r.ok)throw Error('部分市界加载失败，可重试；列表和相册仍可使用。')
  const data=await r.json() as CityGeometry
  const known=new Set(catalog.cities.filter((c)=>c.provinceCode===province).map((c)=>c.cityCode))
  if(data.type!=='FeatureCollection'||data.features.length!==known.size||new Set(data.features.map((f)=>f.properties.cityCode)).size!==known.size||data.features.some((f)=>!known.has(f.properties.cityCode)||!['Polygon','MultiPolygon'].includes(f.geometry.type)))throw Error('市界与城市目录不匹配。')
  return data
 }).catch((e)=>{geometryCache.delete(province);throw e}))
 return geometryCache.get(province)!
}
export function footprintStats(catalog:Catalog,visits:Visit[]){
 const visited=new Set(visits.filter((v)=>v.status==='visited').map((v)=>v.cityCode))
 const cities=catalog.cities.filter((c)=>visited.has(c.cityCode))
 return {visited:cities.length,remaining:catalog.cities.length-cities.length,provinces:new Set(cities.map((c)=>c.provinceCode)).size,byProvince:Object.fromEntries([...new Set(catalog.cities.map((c)=>c.provinceCode))].map((p)=>[p,{visited:cities.filter((c)=>c.provinceCode===p).length,total:catalog.cities.filter((c)=>c.provinceCode===p).length}]))}
}

export type ProvinceGeometry=FeatureCollection<Polygon|MultiPolygon,{provinceCode:string;name:string;supported:boolean;labelPoint:[number,number]}>
let outlinesPromise:Promise<ProvinceGeometry>|undefined
export function getProvinceOutlines(){
 outlinesPromise??=fetch(footprintUrl('province-outlines.json')).then(async r=>{
  if(!r.ok)throw Error('省界轮廓加载失败。')
  const data=await r.json() as ProvinceGeometry
  if(data.type!=='FeatureCollection'||data.features.length!==34||new Set(data.features.map(f=>f.properties.provinceCode)).size!==34||data.features.some(f=>!['Polygon','MultiPolygon'].includes(f.geometry.type)))throw Error('省界数据不合法。')
  return data
 }).catch(e=>{outlinesPromise=undefined;throw e})
 return outlinesPromise
}
