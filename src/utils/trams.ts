import raw from '../data/trams.json'
import {emptyProject, type MetroProject} from '../models/metro'
import {validateProject} from './validation'

const supplements:Record<string,MetroProject>=Object.fromEntries(Object.entries(raw).map(([id,data])=>[id,validateProject(data.project)]))
const marker=(id:string)=>`osm-trams-v1-${id}`

/** Read-only overlay for saved projects. Never silently edits a saved station/line. */
export function tramPreview(project:MetroProject):MetroProject {
 const supplement=project.cityId?supplements[project.cityId]:undefined
 const preview=emptyProject('有轨电车补充');preview.cityId=project.cityId
 if(!supplement||project.appliedUpdates?.includes(marker(project.cityId!)))return preview
 for(const line of Object.values(supplement.lines)){
  if(project.lines[line.parentLineId??line.id])continue
  preview.lines[line.id]=line
  for(const node of line.nodes)if(node.type==='station')preview.stations[node.id]=project.stations[node.id]??supplement.stations[node.id]
 }
 return preview
}

export function mergeTrams(project:MetroProject):MetroProject {
 const preview=tramPreview(project)
 if(!Object.keys(preview.lines).length)return project
 const stations={...project.stations,...preview.stations}
 const source=supplements[project.cityId!]
 for(const id of Object.keys(preview.stations)){
  const current=stations[id],aliases=[...new Set([...(current.aliases??[]),...(source.stations[id]?.aliases??[])])]
  if(aliases.length)stations[id]={...current,aliases}
 }
 return {...project,stations,lines:{...project.lines,...preview.lines},appliedUpdates:[...(project.appliedUpdates??[]),marker(project.cityId!)]}
}
