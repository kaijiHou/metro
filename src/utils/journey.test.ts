import assert from 'node:assert/strict'
import {it} from 'node:test'
import {readFileSync} from 'node:fs'
import {emptyProject,type MetroProject} from '../models/metro'
import {findJourney,journeyGraph} from './journey'
import {validateProject} from './validation'
import {mergeTrams,tramPreview} from './trams'
import {journeyGeojson} from '../services/mapJourneyLayers'
import {createMetroStore} from '../store/metroStore'
import {fetchCityProject,parseCityCatalog} from './transit'
function network(){
 const p=emptyProject('路径测试')
 for(const [id,lng,lat] of [['a',114,30],['b',114.005,30],['c',114.01,30],['far',114.4,30]] as const)p.stations[id]={id,name:id,lng,lat}
 const line=(id:string,stations:string[],extras={})=>{p.lines[id]={id,name:id,color:'#087b8c',status:'existing',nodes:stations.map(id=>({type:'station',id})),...extras}}
 return {p,line}
}
it('routing optimizes time, transfers and stop count separately and gives a contiguous interchange itinerary',()=>{
 const {p,line}=network();line('direct',['a','far','c']);line('first',['a','b']);line('second',['b','c'],{transport:'tram'})
 const fast=findJourney(p,'a','c')!,few=findJourney(p,'a','c','transfers')!
 assert.deepEqual(fast.legs.map(l=>l.name),['first','second']);assert.equal(fast.transfers,1);assert.equal(fast.stops,2)
 assert.equal(fast.legs[0].stationIds.at(-1),fast.legs[1].stationIds[0]);assert.ok(fast.minutes<few.minutes)
 assert.equal(few.transfers,0);assert.equal(few.legs[0].name,'direct')
 assert.equal(findJourney(p,'a','c','stops')!.stops,2)
 assert.equal(findJourney(p,'a','a')!.minutes,0);assert.equal(findJourney(p,'missing','c'),null)
})
it('same names do not create interchange edges, directed services cannot be ridden backwards and visibility is not service availability',()=>{
 const {p,line}=network();p.stations.b.name='同名站';p.stations.c.name='同名站'
 line('tram',['a','b'],{transport:'tram',direction:'forward',visible:false});line('other',['c','far'])
 assert.ok(findJourney(p,'a','b'));assert.equal(findJourney(p,'b','a'),null);assert.equal(findJourney(p,'a','far'),null)
 const parsed=validateProject(JSON.parse(JSON.stringify(p)));assert.equal(parsed.lines.tram.transport,'tram');assert.equal(parsed.lines.tram.direction,'forward')
})
it('loops include the closing arc and branch parts of one service do not create a transfer',()=>{
 const {p,line}=network();line('main',['a','b']);line('branch',['b','c'],{parentLineId:'main'})
 assert.equal(findJourney(p,'a','c')!.transfers,0)
 line('ring',['a','far','c'],{closed:true});assert.equal(findJourney(p,'c','a')!.stops,1)
})
it('construction only permits contiguous verified opened node pairs, and waypoint distances count',()=>{
 const {p,line}=network();p.waypoints.w={id:'w',lng:114.2,lat:30.2}
 line('part',['a','b','c'],{status:'construction',existingSegments:[['a','b']]})
 assert.ok(findJourney(p,'a','b'));assert.equal(findJourney(p,'a','c'),null)
 assert.equal(findJourney(p,'a','b','fastest',true)!.unbuilt,false)
 assert.equal(findJourney(p,'a','c','fastest',true)!.unbuilt,true)
 p.lines.part.nodes=[{type:'station',id:'a'},{type:'waypoint',id:'w'},{type:'station',id:'b'}]
 assert.equal(findJourney(p,'a','b'),null)
 p.lines.part.existingSegments=[['a','w'],['w','b']]
 const route=findJourney(p,'a','b')!;assert.ok(route.km>40);assert.equal(route.legs[0].coordinates.length,3)
})

it('licensed Wuhan tram services preserve directional stop counts and share only audited metro interchanges',()=>{
 const original=validateProject(JSON.parse(readFileSync(new URL('../../public/transit/wuhan.json',import.meta.url),'utf8')).project)
 const before=JSON.stringify(original),p=validateProject(mergeTrams(original)),find=(name:string)=>Object.values(p.stations).find(s=>s.name===name||s.aliases?.includes(name))!.id
 assert.equal(p.lines['osm-tram-wuhan-t1'].nodes.length,22)
 assert.equal(p.lines['osm-tram-wuhan-l1'].nodes.length,17)
 assert.equal(p.lines['osm-tram-wuhan-l1-reverse'].nodes.length,15)
 assert.equal(p.lines['osm-tram-wuhan-l3'].nodes.length,15)
 assert.equal(p.lines['osm-tram-wuhan-l3-reverse'].nodes.length,13)
 assert.equal(find('车轮广场'),find('沌阳大道'));assert.equal(find('华中大'),find('华中科技大学'))
 assert.equal(Object.values(p.stations).filter(s=>s.name==='滨湖社区').length,1)
 assert.equal(Object.values(p.stations).filter(s=>s.name==='车城大道').length,1)
 const route=findJourney(p,find('华中科技园'),find('洪山广场'))!
 assert.ok(route.legs.some(l=>l.transport==='tram'));assert.ok(route.legs.some(l=>l.transport==='metro'))
 assert.equal(route.transfers,1)
 const l3=findJourney(p,find('城铁汤逊湖'),find('华夏学院'),'transfers')!
 assert.equal(l3.transfers,0);assert.equal(l3.legs[0].lineId,'osm-tram-wuhan-l3')
 const geo=journeyGeojson({project:p,journey:route});assert.equal(geo.lines.features.length,route.legs.length)
 assert.equal(geo.stations.features.filter(f=>f.properties?.role).length,2)
 assert.equal(journeyGeojson(null).lines.features.length,0)
 assert.equal(JSON.stringify(original),before);assert.equal(mergeTrams(p),p)
 assert.deepEqual(validateProject(JSON.parse(JSON.stringify(p))).stations[find('车轮广场')].aliases,['车轮广场'])
 assert.throws(()=>validateProject({...p,lines:{...p.lines,bad:{...p.lines['osm-tram-wuhan-t1'],id:'bad',transport:['tram']}}}))
})

it('tram preview leaves saved projects untouched and explicit import is undoable without overwriting station edits',()=>{
 const p=validateProject(JSON.parse(readFileSync(new URL('../../public/transit/wuhan.json',import.meta.url),'utf8')).project)
 const target=Object.values(p.stations).find(s=>s.name==='沌阳大道')!;target.name='我的换乘站';target.lng+=.001
 const before=JSON.stringify(p),preview=tramPreview(p)
 assert.ok(Object.keys(preview.lines).length);assert.equal(JSON.stringify(p),before)
 const store=createMetroStore({initialProject:p,persist:()=>{}});store.getState().loadProject(mergeTrams(p))
 assert.equal(store.getState().project.stations[target.id].name,'我的换乘站');assert.equal(store.getState().project.stations[target.id].lng,target.lng)
 store.getState().undo();assert.deepEqual(store.getState().project,p)
 store.getState().redo();const imported=store.getState().project
 const lines={...imported.lines};delete lines['osm-tram-wuhan-t1'];delete lines['osm-tram-wuhan-t1-reverse']
 assert.equal(Object.keys(tramPreview({...imported,lines}).lines).length,0,'do not resurrect deliberately deleted trams')
})

it('city loader merges audited supplements while other city snapshots and original catalog remain unchanged',async()=>{
 const catalog=parseCityCatalog(JSON.parse(readFileSync(new URL('../../public/transit/catalog.json',import.meta.url),'utf8')))
 const originalFetch=globalThis.fetch
 globalThis.fetch=async(input)=>new Response(readFileSync(new URL(`../../public${String(input)}`,import.meta.url),'utf8'))
 try{
  for(const id of ['wuhan','nanjing','beijing']){
   const city=catalog.find(c=>c.id===id)!,p=await fetchCityProject(city,new AbortController().signal)
   const roots=Object.values(p.lines).filter(l=>!l.parentLineId)
   assert.equal(roots.length,city.lineCount+(id==='wuhan'?4:id==='nanjing'?2:0))
   if(id==='nanjing'){
    assert.equal(p.lines['osm-tram-nanjing-hexi'].nodes.length,13)
    assert.equal(p.lines['osm-tram-nanjing-qilin'].nodes.length,13)
    const find=(name:string)=>Object.values(p.stations).find(s=>s.name===name)!.id
    assert.ok(findJourney(p,find('石杨路'),find('新街口'))!.transfers>=1)
   }
  }
 }finally{globalThis.fetch=originalFetch}
})
it('actual Wuhan interchange IDs support routes without changing the original network',()=>{
 const p=validateProject(JSON.parse(readFileSync(new URL('../../public/transit/wuhan.json',import.meta.url),'utf8')).project) as MetroProject
 const before=JSON.stringify(p),find=(name:string)=>Object.values(p.stations).find(s=>s.name===name)!.id
 const route=findJourney(p,find('洪山广场'),find('武汉火车站'))!
 assert.ok(route.stops>0);assert.equal(route.from,find('洪山广场'));assert.equal(route.to,find('武汉火车站'))
 assert.equal(JSON.stringify(p),before);assert.ok(journeyGraph(p).size>200)
})
