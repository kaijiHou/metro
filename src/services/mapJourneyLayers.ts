import type {GeoJSONSource,Map} from 'maplibre-gl'
import type {FeatureCollection,LineString,Point} from 'geojson'
import type {JourneyOverlay} from '../store/viewStore'

export function journeyGeojson(overlay:JourneyOverlay|null){
 const lines:FeatureCollection<LineString>={type:'FeatureCollection',features:[]},stations:FeatureCollection<Point>={type:'FeatureCollection',features:[]}
 if(overlay){
  const {journey,project}=overlay
  for(const leg of journey.legs)lines.features.push({type:'Feature',properties:{name:leg.name,color:leg.color},geometry:{type:'LineString',coordinates:leg.coordinates}})
  const ids=[...new Set([journey.from,...journey.legs.flatMap(l=>l.stationIds),journey.to])]
  for(const id of ids){const s=project.stations[id];if(!s)continue;const role=id===journey.from?'起点':id===journey.to?'终点':''
   stations.features.push({type:'Feature',properties:{id,name:s.name,role,label:role?`${role} · ${s.name}`:'',color:role==='起点'?'#138568':role==='终点'?'#c34840':'#244b62'},geometry:{type:'Point',coordinates:[s.lng,s.lat]}})
  }
 }
 return {lines,stations}
}
export function addJourneyLayers(map:Map){
 for(const id of ['journey-lines','journey-stations'])map.addSource(id,{type:'geojson',data:{type:'FeatureCollection',features:[]}})
 map.addLayer({id:'journey-line-halo',type:'line',source:'journey-lines',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'#fff','line-width':13,'line-opacity':.95}},'metro-station-labels')
 map.addLayer({id:'journey-line-highlight',type:'line',source:'journey-lines',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':['get','color'],'line-width':8}},'metro-station-labels')
 map.addLayer({id:'journey-stops',type:'circle',source:'journey-stations',paint:{'circle-radius':['case',['!=',['get','role'],''],8,3.5],'circle-color':'#fff','circle-stroke-color':['get','color'],'circle-stroke-width':3}})
 map.addLayer({id:'journey-endpoint-labels',type:'symbol',source:'journey-stations',filter:['!=',['get','role'],''],layout:{'text-field':['get','label'],'text-font':['Noto Sans Bold'],'text-size':16,'text-anchor':'bottom','text-offset':[0,-1.2],'text-allow-overlap':true},paint:{'text-color':['get','color'],'text-halo-color':'#fff','text-halo-width':3}})
}
export function syncJourneyLayers(map:Map,overlay:JourneyOverlay|null){
 const data=journeyGeojson(overlay)
 ;(map.getSource('journey-lines') as GeoJSONSource|undefined)?.setData(data.lines)
 ;(map.getSource('journey-stations') as GeoJSONSource|undefined)?.setData(data.stations)
}
