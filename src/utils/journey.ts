import type {MetroLine,MetroProject} from '../models/metro'
import {haversineKm} from './statistics'
import {rootLine,lineStatus} from './planning'
import {resolveLineNodeCoordinate} from './geojson'

export type JourneyPreference='fastest'|'transfers'|'stops'
export const journeyPreferences={fastest:'预计用时最短',transfers:'换乘最少',stops:'乘坐站数最少'}
export const journeyEstimate={metroWait:4,tramWait:8,transferWalk:8,entryWalk:3}
const waiting=(transport:'metro'|'tram')=>transport==='tram'?journeyEstimate.tramWait:journeyEstimate.metroWait
export const lineTransport=(line:MetroLine)=>line.transport??(/有轨|电车|^蓉2|西郊线/.test(line.name)?'tram':'metro')
export type JourneyEdge={from:string;to:string;lineId:string;name:string;color:string;transport:'metro'|'tram';direction:string;km:number;minutes:number;coordinates:[number,number][];unbuilt:boolean}
export type JourneyLeg={lineId:string;name:string;color:string;transport:'metro'|'tram';direction:string;stationIds:string[];km:number;minutes:number;waitMinutes:number;walkMinutes:number;coordinates:[number,number][]}
export type Journey={from:string;to:string;minutes:number;transfers:number;stops:number;km:number;legs:JourneyLeg[];unbuilt:boolean;timing:{rideMinutes:number;waitMinutes:number;walkMinutes:number}}
type Cost={minutes:number;transfers:number;stops:number;km:number}

export function journeyGraph(project:MetroProject,includePlanned=false){
 const graph=new Map<string,JourneyEdge[]>()
 const add=(edge:JourneyEdge)=>graph.set(edge.from,[...(graph.get(edge.from)??[]),edge])
 for(const line of Object.values(project.lines)){
  const service=rootLine(project,line),transport=line.transport??lineTransport(service),status=lineStatus(line)
  const first=line.nodes.findIndex(n=>n.type==='station')
  if(first<0)continue
  const nodes=line.closed?[...line.nodes.slice(first),...line.nodes.slice(0,first),line.nodes[first]]:line.nodes
  const stationIds=nodes.filter(n=>n.type==='station').map(n=>n.id)
  const opened=new Set((line.existingSegments??[]).flatMap(([a,b])=>[JSON.stringify([a,b]),JSON.stringify([b,a])]))
  let previous:string|null=null,coordinates:[number,number][]=[],eligible=true,built=true
  for(let i=0;i<nodes.length;i++){
   const node=nodes[i],coordinate=resolveLineNodeCoordinate(project,node)
   if(!coordinate){previous=null;coordinates=[];eligible=false;built=false;continue}
   if(i&&!(status==='existing'||(status==='construction'&&opened.has(JSON.stringify([nodes[i-1].id,node.id])))))built=false
   if(!includePlanned&&!built)eligible=false
   coordinates.push(coordinate)
   if(node.type!=='station')continue
   if(previous&&previous!==node.id&&eligible){
    const km=coordinates.slice(1).reduce((sum,p,index)=>sum+haversineKm(coordinates[index],p),0)
    const edge={from:previous,to:node.id,lineId:service.id,name:service.name,color:service.color,transport,km,minutes:km/(transport==='tram'?22:40)*60+.5,coordinates:[...coordinates],unbuilt:!built}
    add({...edge,direction:line.closed?`经${project.stations[node.id].name}`:`往${project.stations[stationIds[stationIds.length-1]]?.name??''}`})
    if(line.direction!=='forward')add({...edge,from:node.id,to:previous,coordinates:[...coordinates].reverse(),direction:line.closed?`经${project.stations[previous].name}`:`往${project.stations[stationIds[0]]?.name??''}`})
   }
   previous=node.id;coordinates=[coordinate];eligible=true;built=true
  }
 }
 return graph
}
function compare(a:Cost,b:Cost,preference:JourneyPreference){
 const fields: (keyof Cost)[]=preference==='transfers'?['transfers','minutes','stops','km']:preference==='stops'?['stops','transfers','minutes','km']:['minutes','transfers','stops','km']
 for(const key of fields){const delta=a[key]-b[key];if(Math.abs(delta)>1e-9)return delta}return 0
}
export function findJourney(project:MetroProject,from:string,to:string,preference:JourneyPreference='fastest',includePlanned=false):Journey|null{
 if(!project.stations[from]||!project.stations[to])return null
 const zero:Cost={minutes:0,transfers:0,stops:0,km:0}
 if(from===to)return {from,to,...zero,legs:[],unbuilt:false,timing:{rideMinutes:0,waitMinutes:0,walkMinutes:0}}
 const graph=journeyGraph(project,includePlanned),start=JSON.stringify([from,''])
 const costs=new Map<string,Cost>([[start,zero]]),pending=new Map([[start,{station:from,line:''}]]),done=new Set<string>(),parents=new Map<string,{key:string;edge:JourneyEdge}>()
 let end:string|undefined
 // ponytail: single-city graphs use linear priority selection; use a heap if >5k states stall the UI.
 while(pending.size){
  let key=pending.keys().next().value!
  for(const candidate of pending.keys())if(compare(costs.get(candidate)!,costs.get(key)!,preference)<0)key=candidate
  const current=pending.get(key)!,cost=costs.get(key)!;pending.delete(key);done.add(key)
  if(current.station===to){end=key;break}
  for(const edge of graph.get(current.station)??[]){
   const next=JSON.stringify([edge.to,edge.lineId]);if(done.has(next))continue
   const transfer=!!current.line&&current.line!==edge.lineId,boarding=current.line!==edge.lineId
   const value={minutes:cost.minutes+edge.minutes+(boarding?waiting(edge.transport)+(transfer?journeyEstimate.transferWalk:journeyEstimate.entryWalk):0),transfers:cost.transfers+Number(transfer),stops:cost.stops+1,km:cost.km+edge.km}
   if(!costs.has(next)||compare(value,costs.get(next)!,preference)<0){costs.set(next,value);pending.set(next,{station:edge.to,line:edge.lineId});parents.set(next,{key,edge})}
  }
 }
 if(!end)return null
 const edges:JourneyEdge[]=[];let cursor=end
 while(cursor!==start){const p=parents.get(cursor)!;edges.push(p.edge);cursor=p.key}edges.reverse()
 const legs:JourneyLeg[]=[]
 for(const edge of edges){
  const previous=legs.at(-1)
  if(previous?.lineId===edge.lineId){previous.stationIds.push(edge.to);previous.km+=edge.km;previous.minutes+=edge.minutes;previous.coordinates.push(...edge.coordinates.slice(1))}
  else legs.push({lineId:edge.lineId,name:edge.name,color:edge.color,transport:edge.transport,direction:edge.direction,stationIds:[edge.from,edge.to],km:edge.km,minutes:edge.minutes,waitMinutes:waiting(edge.transport),walkMinutes:legs.length?journeyEstimate.transferWalk:journeyEstimate.entryWalk,coordinates:[...edge.coordinates]})
 }
 const timing=legs.reduce((sum,l)=>({rideMinutes:sum.rideMinutes+l.minutes,waitMinutes:sum.waitMinutes+l.waitMinutes,walkMinutes:sum.walkMinutes+l.walkMinutes}),{rideMinutes:0,waitMinutes:0,walkMinutes:0})
 return {from,to,...costs.get(end)!,legs,unbuilt:edges.some(e=>e.unbuilt),timing}
}

/** Clock offsets describe this journey estimate, never a live train prediction. */
export function journeyArrival(departure:string,minutes:number):string|null{
 if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(departure)||!Number.isFinite(minutes)||minutes<0)return null
 const [hour,minute]=departure.split(':').map(Number),total=hour*60+minute+Math.ceil(minutes),days=Math.floor(total/1440),clock=total%1440
 return `${days===1?'次日 ':days>1?`${days}天后 `:''}${String(Math.floor(clock/60)).padStart(2,'0')}:${String(clock%60).padStart(2,'0')}`
}
