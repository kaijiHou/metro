import assert from 'node:assert/strict'
import { it } from 'node:test'
import { viewportCities } from './viewportCities'
import type { TransitCity } from './transit'
import { BrowseNetworkLoader } from '../services/browseNetworkLoader'
import { browseGeojson } from './browseGeojson'
import { emptyProject } from '../models/metro'

const city=(id:string,x:number):TransitCity=>({id,name:id,aliases:[],center:[x,1],bounds:[[x-2,0],[x+2,2]],lineCount:1,stationCount:2,retrievedAt:'2026-10-15',sourceUrl:'https://example.org'})
const view=(west:number,east:number,zoom=10)=>({west,east,south:0,north:2,zoom})
it('selects by intersecting city bounds even when a city center is outside the viewport',()=>{
  assert.deepEqual(viewportCities([city('wide',10),city('outside',30)],view(11,13)).map((item)=>item.id),['wide'])
  assert.equal(viewportCities([city('date',179)],view(178,184)).length,1)
  assert.equal(viewportCities([city('wrap',-179)],view(178,184)).length,1)
  assert.equal(viewportCities([city('second-world',179)],view(538,544)).length,1)
})
it('loads without project mutation, reuses cached cities and emits only the latest viewport generation',async()=>{
  const resolve=new Map<string,(value:ReturnType<typeof emptyProject>)=>void>()
  let calls=0
  const loader=new BrowseNetworkLoader(async(entry)=>{calls++;return new Promise((done)=>resolve.set(entry.id,done))},2)
  const states:string[][]=[]
  const catalog=[city('first',10),city('last',30)]
  const first=loader.update(catalog,view(9,11),undefined,true,(state)=>states.push(Object.keys(state.projects)))
  const last=loader.update(catalog,view(29,31),undefined,true,(state)=>states.push(Object.keys(state.projects)))
  resolve.get('last')!(emptyProject('last'));await last
  resolve.get('first')!(emptyProject('first'));await first
  assert.deepEqual(states.at(-1),['last'])
  await loader.update(catalog,view(29,31),undefined,true,(state)=>states.push(Object.keys(state.projects)))
  assert.equal(calls,2)
  await loader.update(catalog,view(29,31,5),undefined,true,(state)=>states.push(Object.keys(state.projects)))
  assert.deepEqual(states.at(-1),[])
  loader.dispose()
})
it('bounds concurrency and cache, excludes the editing city, and isolates duplicate station names by city',async()=>{
  let active=0,max=0,calls=0
  const loader=new BrowseNetworkLoader(async(entry)=>{active++;calls++;max=Math.max(max,active);await new Promise((done)=>setTimeout(done,2));active--;return {...emptyProject(),cityId:entry.id}},3,2)
  const catalog=['alpha','beta','gamma'].map((id,index)=>city(id,index*10))
  await loader.update(catalog,view(-5,30),'beta',true,()=>{})
  assert.equal(calls,2);assert.ok(max<=2)
  const a=emptyProject();a.stations.s={id:'s',name:'火车站',lng:10,lat:1};a.lines.l={id:'l',name:'1号线',color:'#123456',nodes:[{type:'station',id:'s'}]}
  const source=browseGeojson({alpha:a,gamma:a},catalog)
  assert.equal(new Set(source.stations.features.map((item)=>item.properties.id)).size,2)
  assert.equal(a.stations.s.id,'s')
  loader.dispose()
})

it('loads all visible cities beyond cache capacity; eviction, failure retry and disposal are bounded',async()=>{
  const counts:Record<string,number>={}
  let fail=true
  const catalog=['a','b','c'].map((id,index)=>city(id,index*10))
  const loader=new BrowseNetworkLoader(async(entry)=>{
    counts[entry.id]=(counts[entry.id]??0)+1
    if(entry.id==='b'&&fail)throw new Error('offline')
    return emptyProject(entry.id)
  },1,1)
  let result:import('../services/browseNetworkLoader').BrowseResult|undefined
  await loader.update(catalog,view(-5,25),undefined,true,(next)=>{result=next})
  assert.equal(Object.keys(result!.projects).length,2)
  assert.match(result!.errors.b,/offline/)
  fail=false
  await loader.update(catalog,view(9,11),undefined,true,(next)=>{result=next})
  assert.deepEqual(Object.keys(result!.projects),['b'])
  assert.equal(counts.b,2)
  await loader.update(catalog,view(-1,1),undefined,true,()=>{})
  assert.equal(counts.a,2)
  loader.dispose()
  let published=false
  await loader.update(catalog,view(-5,25),undefined,true,()=>{published=true})
  assert.equal(published,false)
})
