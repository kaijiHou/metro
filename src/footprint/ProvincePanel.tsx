import {useState} from 'react'
import {provinceProgress} from './adminCatalog'
import type {Catalog,Visit} from './types'

export function ProvincePanel({catalog,visits,onSelect}:{catalog:Catalog;visits:Visit[];onSelect:(code:string)=>void}){
 const [tab,setTab]=useState<'visited'|'unvisited'>('visited')
 const provinces=provinceProgress(catalog,visits),visited=provinces.filter(p=>p.visited).length
 return <section className="footprint-provinces" aria-label="省份足迹"><h3>我的省份足迹 <small>{visited} / {provinces.length}</small></h3><div className="footprint-province-tabs" role="group" aria-label="省份到访筛选"><button aria-pressed={tab==='visited'} onClick={()=>setTab('visited')}>去过的省份 {visited}</button><button aria-pressed={tab==='unvisited'} onClick={()=>setTab('unvisited')}>未去过的省份 {provinces.length-visited}</button></div><p>省内点亮任一市或县级市，即计入去过的省份。</p><div className="footprint-province-list">{provinces.filter(p=>p.visited===(tab==='visited')).map(p=><button key={p.code} onClick={()=>onSelect(p.code)}><span>{p.name}</span><small>{p.visited?`${p.counties} 个县级市${p.cities?` · ${p.cities} 个市级记录`:''}`:p.totalCounties?'尚未点亮':['CN011','CN012','CN031','CN050','CN081','CN082'].includes(p.code)?'该地区不设县级市':'县级市资料暂缺'}</small></button>)}</div>{tab==='visited'&&!visited&&<p>点亮一个去过的县级市，从这里开始你的省份足迹。</p>}</section>
}
