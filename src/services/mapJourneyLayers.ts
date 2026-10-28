import type {FilterSpecification,GeoJSONSource,Map} from 'maplibre-gl'
import type {FeatureCollection,LineString,Point} from 'geojson'
import type {JourneyOverlay} from '../store/viewStore'

export function journeyGeojson(overlay:JourneyOverlay|null){
 const lines:FeatureCollection<LineString>={type:'FeatureCollection',features:[]},stations:FeatureCollection<Point>={type:'FeatureCollection',features:[]}
 if(overlay){
  const {journey,project}=overlay
  for(const leg of journey.legs)lines.features.push({type:'Feature',properties:{name:leg.name,color:leg.color},geometry:{type:'LineString',coordinates:leg.coordinates}})
  const transfers=new Set(journey.legs.slice(1).map(l=>l.stationIds[0]))
  const ids=[...new Set([journey.from,...journey.legs.flatMap(l=>l.stationIds),journey.to])]
  for(const id of ids){const s=project.stations[id];if(!s)continue;const role=id===journey.from?'起点':id===journey.to?'终点':''
   stations.features.push({type:'Feature',properties:{id,name:s.name,role,transfer:transfers.has(id),label:role?`${role} · ${s.name}`:transfers.has(id)?`换乘 · ${s.name}`:s.name,color:role==='起点'?'#138568':role==='终点'?'#c34840':'#244b62'},geometry:{type:'Point',coordinates:[s.lng,s.lat]}})
  }
 }
 return {lines,stations}
}
export function addJourneyLayers(map:Map){
 for(const id of ['journey-lines','journey-stations'])map.addSource(id,{type:'geojson',data:{type:'FeatureCollection',features:[]}})
 map.addLayer({id:'journey-line-halo',type:'line',source:'journey-lines',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'#fff','line-width':13,'line-opacity':.95}},'metro-station-labels')
 map.addLayer({id:'journey-line-highlight',type:'line',source:'journey-lines',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':['get','color'],'line-width':8}},'metro-station-labels')
 map.addLayer({id:'journey-line-names',type:'symbol',source:'journey-lines',layout:{'symbol-placement':'line','symbol-spacing':180,'text-field':['get','name'],'text-font':['Noto Sans Bold'],'text-size':14,'text-offset':[0,-1]},paint:{'text-color':['get','color'],'text-halo-color':'#fff','text-halo-width':3}})
 map.addLayer({id:'journey-endpoint-halos',type:'circle',source:'journey-stations',filter:['!=',['get','role'],''],paint:{'circle-radius':20,'circle-color':['get','color'],'circle-opacity':.18}})
 map.addLayer({id:'journey-stops',type:'circle',source:'journey-stations',paint:{'circle-radius':['case',['!=',['get','role'],''],11,['get','transfer'],6,3.5],'circle-color':'#fff','circle-stroke-color':['get','color'],'circle-stroke-width':3}})
 map.addLayer({id:'journey-station-names',type:'symbol',source:'journey-stations',filter:['==',['get','role'],''],layout:{'text-field':['get','label'],'text-font':['Noto Sans Bold'],'text-size':16,'text-anchor':'left','text-offset':[.8,0]},paint:{'text-color':'#244b62','text-halo-color':'#fff','text-halo-width':3}})
}
// Filters keep the original visibility settings intact while browsing/loading continues.
const originalFilters=new WeakMap<Map,globalThis.Map<string,FilterSpecification|undefined>>()
export function syncJourneyLayers(map:Map,overlay:JourneyOverlay|null,styleReload=false){
 if(!map.getStyle()?.layers||!map.getSource('journey-lines'))return
 if(styleReload)originalFilters.delete(map)
 if(overlay){
  let saved=originalFilters.get(map)
  if(!saved){saved=new globalThis.Map();originalFilters.set(map,saved)}
  for(const layer of map.getStyle().layers){
   if(!/^(metro-|browse-|station-exit-)/.test(layer.id)&&!/(?:^|_)transit_rail(?:_|$)/.test(layer.id))continue
   if(!saved.has(layer.id))saved.set(layer.id,map.getFilter(layer.id)||undefined)
   map.setFilter(layer.id,['==',['literal',true],false])
  }
 }else{
  for(const [id,filter] of originalFilters.get(map)??[])if(map.getLayer(id))map.setFilter(id,filter??null)
  originalFilters.delete(map)
 }
 const data=journeyGeojson(overlay)
 ;(map.getSource('journey-lines') as GeoJSONSource|undefined)?.setData(data.lines)
 ;(map.getSource('journey-stations') as GeoJSONSource|undefined)?.setData(data.stations)
}
