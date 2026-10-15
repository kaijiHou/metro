import type { GeoJSONSource,Map } from 'maplibre-gl'
import type { FeatureCollection,Point } from 'geojson'
import type { StationExit } from '../models/exits'
import type { BrowseResult } from './browseNetworkLoader'
import { browseGeojson,cityOverview } from '../utils/browseGeojson'
import type { TransitCity } from '../utils/transit'

const empty={type:'FeatureCollection' as const,features:[]}
export function addBrowseLayers(map:Map) {
  for(const id of ['browse-cities','browse-lines','browse-stations','station-exits'])map.addSource(id,{type:'geojson',data:empty})
  map.addLayer({id:'browse-city-points',type:'circle',source:'browse-cities',maxzoom:7,paint:{'circle-radius':5,'circle-color':'#087b8c','circle-stroke-color':'#fff','circle-stroke-width':2}})
  map.addLayer({id:'browse-city-names',type:'symbol',source:'browse-cities',maxzoom:7,layout:{'text-field':['get','name'],'text-font':['Noto Sans Regular'],'text-size':13,'text-offset':[0,1.1]},paint:{'text-halo-color':'#fff','text-halo-width':2}})
  map.addLayer({id:'browse-network-lines',type:'line',source:'browse-lines',minzoom:7,layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':['get','color'],'line-width':['interpolate',['linear'],['zoom'],7,1.5,12,4],'line-opacity':0.85}},'metro-line-shadow')
  map.addLayer({id:'browse-line-names',type:'symbol',source:'browse-lines',minzoom:10,layout:{'symbol-placement':'line','symbol-spacing':250,'text-field':['get','name'],'text-font':['Noto Sans Regular'],'text-size':12},paint:{'text-color':'#193b4c','text-halo-color':'#fff','text-halo-width':2}})
  map.addLayer({id:'browse-station-points',type:'circle',source:'browse-stations',minzoom:10,paint:{'circle-radius':['case',['get','transfer'],4,2.5],'circle-color':'#fff','circle-stroke-color':'#087b8c','circle-stroke-width':1.5}})
  map.addLayer({id:'browse-station-names',type:'symbol',source:'browse-stations',minzoom:12,layout:{'text-field':['get','name'],'text-font':['Noto Sans Bold'],'text-size':16,'text-anchor':'left','text-offset':[0.6,0]},paint:{'text-color':'#193b4c','text-halo-color':'#fff','text-halo-width':2}})
  map.addLayer({id:'metro-readonly-stations',type:'circle',source:'metro-station-labels',minzoom:10,layout:{visibility:'none'},paint:{'circle-radius':8,'circle-opacity':0}})
  map.addLayer({id:'station-exit-points',type:'circle',source:'station-exits',paint:{'circle-radius':7,'circle-color':'#c59436','circle-stroke-color':'#fff','circle-stroke-width':2}})
  map.addLayer({id:'station-exit-names',type:'symbol',source:'station-exits',layout:{'text-field':['get','label'],'text-font':['Noto Sans Bold'],'text-size':14,'text-offset':[0,1.3],'text-allow-overlap':true},paint:{'text-color':'#725016','text-halo-color':'#fff','text-halo-width':2}})
}
export function syncBrowseLayers(map:Map,result:BrowseResult,catalog:TransitCity[]) {
  const data=browseGeojson(result.projects,catalog)
  ;(map.getSource('browse-cities') as GeoJSONSource|undefined)?.setData(cityOverview(catalog))
  ;(map.getSource('browse-lines') as GeoJSONSource|undefined)?.setData(data.lines)
  ;(map.getSource('browse-stations') as GeoJSONSource|undefined)?.setData(data.stations)
}
export function syncExitLayers(map:Map,exits:StationExit[]) {
  const data:FeatureCollection<Point>={type:'FeatureCollection',features:exits.map((exit,index)=>({type:'Feature',geometry:{type:'Point',coordinates:[exit.lng,exit.lat]},properties:{id:exit.id,label:exit.ref||exit.name||`出口 ${index+1}`}}))}
  ;(map.getSource('station-exits') as GeoJSONSource|undefined)?.setData(data)
}
