import type {FeatureCollection,Polygon,MultiPolygon} from 'geojson'
import type {Catalog,Visit} from './types'
export const footprintUrl=(file:string)=>`${import.meta.env?.BASE_URL??'/'}footprint/${file}`
let catalogPromise:Promise<Catalog>|undefined
export function parseCatalog(value:unknown):Catalog{
 const c=value as Catalog
 if(!c||!Array.isArray(c.cities)||!c.cities.length||!Array.isArray(c.missing))throw Error('城市目录格式错误。')
 const ids=new Set<string>()
 if(c.counties!==undefined&&!Array.isArray(c.counties))throw Error('区县目录格式错误。')
 for(const city of allRegions(c)){
  if(!/^(ocha2020-CN\d{6}|gb2017-[a-f0-9]{16})$/.test(city.cityCode)||ids.has(city.cityCode)||!/^CN\d{3}$/.test(city.provinceCode)||!city.name||!city.provinceName||!Array.isArray(city.aliases)||city.bounds.length!==4||!city.bounds.every(Number.isFinite)||city.bounds[0]>=city.bounds[2]||city.bounds[1]>=city.bounds[3])throw Error('城市代码或行政边界映射不合法。')
  ids.add(city.cityCode)
  if(city.kind==='county'&&city.parentCityCode&&!c.cities.some(parent=>parent.cityCode===city.parentCityCode&&parent.provinceCode===city.provinceCode))throw Error('区县与上级市归属不一致。')
 }
 return c
}
export function getCatalog(){
 catalogPromise??=Promise.all(['catalog.json','counties/catalog.json'].map(file=>fetch(footprintUrl(file)).then(r=>{if(!r.ok)throw Error('旅行行政目录加载失败，可重试。');return r.json()}))).then(([city,county])=>parseCatalog({...city,counties:county.cities,provinces:county.provinces})).catch((e)=>{catalogPromise=undefined;throw e})
 return catalogPromise
}
export type CityGeometry=FeatureCollection<Polygon|MultiPolygon,{cityCode:string;name:string;kind?:string}>
const geometryCache=new Map<string,Promise<CityGeometry>>()
export function getProvinceGeometry(province:string,catalog:Catalog){
 const key=`${catalog.geometryFolder??''}${province}`
 if(!geometryCache.has(key))geometryCache.set(key,fetch(footprintUrl(`${key}.json`)).then(async(r)=>{
  if(!r.ok)throw Error('部分市界加载失败，可重试；列表和相册仍可使用。')
  const data=await r.json() as CityGeometry
  const known=new Set(catalog.cities.filter((c)=>c.provinceCode===province).map((c)=>c.cityCode))
  const features=catalog.geometryFolder?data.features.filter(f=>known.has(f.properties.cityCode)):data.features
  if(data.type!=='FeatureCollection'||features.length!==known.size||new Set(features.map((f)=>f.properties.cityCode)).size!==known.size||features.some((f)=>!known.has(f.properties.cityCode)||!['Polygon','MultiPolygon'].includes(f.geometry.type)))throw Error('边界与旅行目录不匹配。')
  return {...data,features}
 }).catch((e)=>{geometryCache.delete(key);throw e}))
 return geometryCache.get(key)!
}
export function allRegions(catalog:Catalog){return [...catalog.cities,...(catalog.counties??[])]}
export function countyCities(catalog:Catalog){return (catalog.counties??[]).filter(r=>r.level==='County-level city')}
// Derive parent lighting without creating or changing personal visit records.
export function litRegions(catalog:Catalog,visits:Visit[]){
 const lit=new Set(visits.filter(v=>v.status==='visited').map(v=>v.cityCode))
 for(const c of countyCities(catalog))if(lit.has(c.cityCode)&&c.parentCityCode)lit.add(c.parentCityCode)
 return lit
}
export function provinceProgress(catalog:Catalog,visits:Visit[]){
 const visited=litRegions(catalog,visits),regions=allRegions(catalog)
 const provinces=catalog.provinces??[...new Map(regions.map(r=>[r.provinceCode,r.provinceName])).entries()].map(([code,name])=>({code,name}))
 return provinces.map(p=>{const local=regions.filter(r=>r.provinceCode===p.code),been=local.filter(r=>visited.has(r.cityCode));return {...p,visited:been.length>0,counties:been.filter(r=>r.level==='County-level city').length,cities:been.filter(r=>r.kind!=='county').length,totalCounties:local.filter(r=>r.level==='County-level city').length}})
}
export function footprintStats(catalog:Catalog,visits:Visit[]){
 const visited=litRegions(catalog,visits)
 const regions=[...catalog.cities,...countyCities(catalog).filter(c=>!c.parentCityCode)]
 const cities=regions.filter((c)=>visited.has(c.cityCode))
 return {total:regions.length,visited:cities.length,remaining:regions.length-cities.length,provinces:new Set(cities.map((c)=>c.provinceCode)).size,byProvince:Object.fromEntries([...new Set(regions.map((c)=>c.provinceCode))].map((p)=>[p,{visited:cities.filter((c)=>c.provinceCode===p).length,total:regions.filter((c)=>c.provinceCode===p).length}]))}
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
