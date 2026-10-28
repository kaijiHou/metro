import type { FeatureCollection,LineString,Point } from 'geojson'
import type { MetroProject,Station } from '../models/metro'
import type { TransitCity } from './transit'
import { lineFeatureCollection, stationLineCounts } from './geojson'
import { rootLine } from './planning'

export type BrowseStation = Station & { cityId:string; cityName:string; lineNames:string[]; sourceUrl:string; relationId?:number;querySource?:'snapshot'|'project' }
export type BrowseStationProperties = {id:string;stationId:string;cityId:string;name:string;cityName:string;lineNames:string;sourceUrl:string;transfer:boolean}

export function browseGeojson(projects: Record<string,MetroProject>, catalog: TransitCity[]) {
  const lines:FeatureCollection<LineString,{id:string;cityId:string;name:string;color:string}> = {type:'FeatureCollection',features:[]}
  const stations:FeatureCollection<Point,BrowseStationProperties> = {type:'FeatureCollection',features:[]}
  for (const [cityId,project] of Object.entries(projects)) {
    const city = catalog.find((entry) => entry.id === cityId)
    const counts = stationLineCounts(project)
    for (const feature of lineFeatureCollection(project,null).features) lines.features.push({...feature,properties:{...feature.properties,id:`${cityId}:${feature.properties.id}`,cityId}})
    for (const station of Object.values(project.stations)) {
      const lineNames = [...new Set(Object.values(project.lines).filter((line) => line.nodes.some((node) => node.type==='station' && node.id===station.id)).map((line) => rootLine(project,line).name))]
      if (!lineNames.length) continue
      stations.features.push({type:'Feature',geometry:{type:'Point',coordinates:[station.lng,station.lat]},properties:{id:`${cityId}:${station.id}`,stationId:station.id,cityId,name:station.name,cityName:city?.name??cityId,lineNames:JSON.stringify(lineNames),sourceUrl:city?.sourceUrl??'',transfer:(counts[station.id]??0)>1}})
    }
  }
  return {lines,stations}
}

export function cityOverview(catalog: TransitCity[]): FeatureCollection<Point,{id:string;name:string;lineCount:number}> {
  return {type:'FeatureCollection',features:catalog.map((city) => ({type:'Feature',geometry:{type:'Point',coordinates:city.center},properties:{id:city.id,name:city.name,lineCount:city.lineCount}}))}
}
