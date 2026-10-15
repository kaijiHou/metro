import {useEffect,useRef,useState} from 'react'
import * as maplibregl from 'maplibre-gl'
import type {GeoJSONSource} from 'maplibre-gl'
import {getProvinceGeometry,getProvinceOutlines,type ProvinceGeometry,type CityGeometry} from './adminCatalog'
import type {Catalog,Visit} from './types'
let lastView:{center:[number,number];zoom:number}={center:[105,35],zoom:3.4}
import {footprintStyle} from './basemap'
function showOverview(map:maplibregl.Map,detail:boolean,duration=0){map.fitBounds([[73,18],[135,54]],{padding:innerWidth>1000?{left:290,right:detail?390:35,top:40,bottom:220}:25,duration})}
const empty:CityGeometry={type:'FeatureCollection',features:[]}
export function FootprintMap({catalog,visits,selected,province,overviewToken,onSelect}:{catalog:Catalog;visits:Visit[];selected:string|null;province:string;overviewToken:number;onSelect:(code:string)=>void}){
 const el=useRef<HTMLDivElement>(null),mapRef=useRef<maplibregl.Map|null>(null)
 const current=useRef({visits,selected,onSelect});current.current={visits,selected,onSelect}
 const [error,setError]=useState(''),[hint,setHint]=useState(''),[loading,setLoading]=useState(false),[retry,setRetry]=useState(0)
 const panelOpen=useRef(Boolean(selected))
 const reload=useRef<()=>void>(()=>{})
 const restoreStates=useRef(()=>{const map=mapRef.current;if(!map?.getSource('footprint-cities'))return;const visited=new Set(current.current.visits.filter((v)=>v.status==='visited').map((v)=>v.cityCode));for(const c of catalog.cities)map.setFeatureState({source:'footprint-cities',id:c.cityCode},{visited:visited.has(c.cityCode),selected:c.cityCode===current.current.selected})})
 useEffect(()=>{
  if(!el.current)return
  const map=new maplibregl.Map({container:el.current,style:footprintStyle,attributionControl:false,...lastView});mapRef.current=map
  map.addControl(new maplibregl.NavigationControl({showCompass:false}),'bottom-right')
  map.addControl(new maplibregl.AttributionControl({customAttribution:'OCHA/HDX · ITOS · CC BY 3.0 IGO'}),'bottom-left')
  let alive=true,generation=0,timer:ReturnType<typeof setTimeout>|undefined,hovered:string|undefined
  let data:CityGeometry=empty,provinceData:ProvinceGeometry={type:'FeatureCollection',features:[]}
  const provinceLabels=()=>({type:'FeatureCollection' as const,features:provinceData.features.map(f=>({type:'Feature' as const,properties:{name:f.properties.name},geometry:{type:'Point' as const,coordinates:f.properties.labelPoint}}))})
  void getProvinceOutlines().then(d=>{if(!alive)return;provinceData=d;(map.getSource('footprint-provinces') as GeoJSONSource|undefined)?.setData(d);(map.getSource('footprint-province-labels') as GeoJSONSource|undefined)?.setData(provinceLabels())}).catch(()=>{if(alive)setError('省级轮廓暂未载入，城市列表仍可用。')})
  const load=()=>{clearTimeout(timer);timer=setTimeout(async()=>{
   const token=++generation,b=map.getBounds()
   const provinces=[...new Set(catalog.cities.filter((c)=>{
    const [w,s,e,n]=c.bounds;const west=b.getWest(),east=b.getEast();return s<=b.getNorth()&&n>=b.getSouth()&&Math.ceil((west-e)/360)<=Math.floor((east-w)/360)
   }).map((c)=>c.provinceCode))]
   setLoading(true);setError('')
   const results=await Promise.allSettled(provinces.map((p)=>getProvinceGeometry(p,catalog)))
   if(!alive||token!==generation)return
   data={type:'FeatureCollection',features:results.flatMap((r)=>r.status==='fulfilled'?r.value.features:[])}
   ;(map.getSource('footprint-cities') as GeoJSONSource|undefined)?.setData(data);restoreStates.current()
   if(results.some((r)=>r.status==='rejected'))setError('部分市界暂未载入，列表与相册可继续使用。')
   setLoading(false)
  },200)}
  reload.current=load
  const style=()=>{
   map.addSource('footprint-provinces',{type:'geojson',data:provinceData})
   map.addSource('footprint-province-labels',{type:'geojson',data:provinceLabels()})
   map.addLayer({id:'footprint-province-shapes',type:'fill',source:'footprint-provinces',paint:{'fill-color':['case',['get','supported'],'#6c8097','#293c51'],'fill-opacity':0.32}})
   map.addLayer({id:'footprint-province-borders',type:'line',source:'footprint-provinces',paint:{'line-color':'#afc9e6','line-opacity':0.65,'line-width':1}})
   map.addLayer({id:'footprint-province-names',type:'symbol',source:'footprint-province-labels',maxzoom:6,layout:{'text-field':['get','name'],'text-font':['Noto Sans Regular'],'text-size':13},paint:{'text-color':'#d4e4f7','text-halo-color':'#142a40','text-halo-width':1.5}})
   map.addSource('footprint-cities' ,{type:'geojson',data,promoteId:'cityCode'})
   map.addLayer({id:'footprint-fill',type:'fill',source:'footprint-cities',paint:{'fill-antialias':false,'fill-color':['case',['boolean',['feature-state','visited'],false],'#168bff','#697b90'],'fill-opacity':['interpolate',['linear'],['zoom'],3,['case',['boolean',['feature-state','visited'],false],0.88,0],7,['case',['boolean',['feature-state','visited'],false],0.4,0.03],11,['case',['boolean',['feature-state','visited'],false],0.16,0.04]]}})
   map.addLayer({id:'footprint-outline',type:'line',source:'footprint-cities',minzoom:5.5,paint:{'line-color':'#d7e7ff','line-opacity':['interpolate',['linear'],['zoom'],3,0,5,0.12,7,0.35],'line-width':['interpolate',['linear'],['zoom'],3,0.35,8,0.9]}})
   map.addLayer({id:'footprint-selected',type:'line',source:'footprint-cities',paint:{'line-color':'#64d5ff','line-width':['case',['boolean',['feature-state','selected'],false],1.5,0]}})
   map.addLayer({id:'footprint-names',type:'symbol',source:'footprint-cities',minzoom:5.5,layout:{'text-field':['get','name'],'text-font':['Noto Sans Regular'],'text-size':13},paint:{'text-color':'#e5efff','text-halo-color':'#132438','text-halo-width':2}})
   map.addLayer({id:'footprint-hover',type:'line',source:'footprint-cities',paint:{'line-color':'#b0e9ff','line-opacity':0.85,'line-width':['case',['boolean',['feature-state','hover'],false],1.4,0]}})
   map.moveLayer('footprint-province-names')
   restoreStates.current();load()
  }
  const click=(event:maplibregl.MapMouseEvent)=>{if(!map.getLayer('footprint-fill'))return;const f=map.queryRenderedFeatures(event.point,{layers:['footprint-fill']})[0];if(f){setHint('');current.current.onSelect(String(f.properties.cityCode))}else{const province=map.queryRenderedFeatures(event.point,{layers:['footprint-province-shapes']})[0];if(province)setHint(province.properties.supported?`${province.properties.name}此处未收录可点亮的市级边界；请查看左侧缺失范围。`:`${province.properties.name}的市县级边界尚未收录，未创建旅行记录。`)}}
  const move=(event:maplibregl.MapMouseEvent)=>{
   if(!map.getLayer('footprint-fill'))return
   const code=map.queryRenderedFeatures(event.point,{layers:['footprint-fill']})[0]?.properties.cityCode as string|undefined
   if(hovered===code)return
   if(hovered)map.setFeatureState({source:'footprint-cities',id:hovered},{hover:false})
   hovered=code;if(code)map.setFeatureState({source:'footprint-cities',id:code},{hover:true});map.getCanvas().style.cursor=code?'pointer':''
  }
  const ended=()=>{const c=map.getCenter();lastView={center:[c.lng,c.lat],zoom:map.getZoom()};load()}
  const failed=(event:maplibregl.ErrorEvent)=>{if(event.error)setError('轮廓或地名暂未载入，可重试；城市列表和相册仍独立可用。')}
  map.on('style.load',style);map.on('click',click);map.on('mousemove',move);map.on('moveend',ended);map.on('error',failed)
  const resize=new ResizeObserver(()=>{map.resize();if(map.getZoom()<4.8)showOverview(map,Boolean(current.current.selected));else if(innerWidth<=620)map.setPadding({top:25,right:25,bottom:25,left:25})});resize.observe(el.current)
  return()=>{alive=false;++generation;clearTimeout(timer);resize.disconnect();map.off('style.load',style);map.off('click',click);map.off('mousemove',move);map.off('moveend',ended);map.off('error',failed);map.remove();mapRef.current=null}
 },[catalog])
 useEffect(()=>{restoreStates.current()},[visits,selected])
 useEffect(()=>{if(retry){mapRef.current?.setStyle(footprintStyle,{diff:false});reload.current()}},[retry])
 useEffect(()=>{if(!province||selected)return;const cities=catalog.cities.filter((c)=>c.provinceCode===province);if(!cities.length)return;mapRef.current?.fitBounds([[Math.min(...cities.map(c=>c.bounds[0])),Math.min(...cities.map(c=>c.bounds[1]))],[Math.max(...cities.map(c=>c.bounds[2])),Math.max(...cities.map(c=>c.bounds[3]))]],{padding:innerWidth>1000?{left:300,right:40,top:80,bottom:220}:45,duration:600})},[catalog,province,selected])
 useEffect(()=>{
  const map=mapRef.current;if(!map)return
  if(Boolean(selected)!==panelOpen.current){panelOpen.current=Boolean(selected);if(map.getZoom()<4.8){showOverview(map,Boolean(selected),300);return}}
  if(selected&&map.getZoom()>=5.5){const city=catalog.cities.find(c=>c.cityCode===selected);if(city)map.panTo([(city.bounds[0]+city.bounds[2])/2,(city.bounds[1]+city.bounds[3])/2],{padding:innerWidth>1000?{left:290,right:390,top:80,bottom:230}:25,duration:300})}
 },[catalog,selected])
 useEffect(()=>{if(mapRef.current)showOverview(mapRef.current,Boolean(current.current.selected))},[overviewToken])

 return <section className="footprint-map" aria-label="市级旅行足迹地图"><div ref={el} className="footprint-map-canvas"/><div className="footprint-map-key"><span><i style={{background:'#168bff'}}/>已到过</span><span><i style={{background:'#697b90'}}/>未到过</span><span><i style={{background:'#293c51'}}/>未收录市界</span><small>点击城市仅高亮和查看，不自动放大</small></div>{hint&&<p className="footprint-map-status" role="status">{hint}</p>}{loading&&<p className="footprint-map-status" role="status">正在载入市界…</p>}{error&&<p className="footprint-map-status" role="alert">{error}<button onClick={()=>setRetry((n)=>n+1)}>重试市界</button></p>}</section>
}
