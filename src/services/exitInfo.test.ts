import assert from 'node:assert/strict'
import { it } from 'node:test'
import { ExitInfoService,parseOsmExits,parseUserExits } from './exitInfo'
import type { BrowseStation } from '../utils/browseGeojson'

const station:BrowseStation={id:'s',cityId:'wuhan',cityName:'武汉',name:'测试站',lng:114.3,lat:30.5,lineNames:['1号线'],sourceUrl:'https://example.org'}
const osm={elements:[{type:'relation',id:9,tags:{public_transport:'stop_area','name:zh':'测试站'},members:[{type:'node',ref:1}]},{type:'node',id:1,lon:114.301,lat:30.501,tags:{railway:'subway_entrance',ref:'A1',wheelchair:'yes'}},{type:'node',id:2,lon:114.301,lat:30.501,tags:{railway:'subway_entrance',ref:'B',exit_to:'某地标'}}]}
it('lists only entrance members of a matching stop area; never turns nearby points into verified exits',()=>{
  const result=parseOsmExits(osm,station)
  assert.equal(result.status,'partial');assert.equal(result.exits.length,1)
  assert.equal(result.exits[0].ref,'A1');assert.equal(result.exits[0].confidence,'probable');assert.equal(result.exits[0].exitTo,undefined)
  assert.equal(parseOsmExits(osm,{...station,name:'其他站'}).exits.length,0)
  assert.equal(parseOsmExits(osm,{...station,relationId:9}).exits[0].confidence,'verified')
  assert.match(parseOsmExits({elements:[]},station).message!,/不代表本站没有出口/)
  assert.throws(()=>parseOsmExits({},station))
})
it('isolates cache keys by city, caches successful empty results, and leaves failures retryable',async()=>{
  let calls=0
  const service=new ExitInfoService(async()=>{calls++;return new Response(JSON.stringify(osm),{status:200})})
  const signal=new AbortController().signal
  assert.equal((await service.load(station,signal)).exits.length,1)
  assert.equal((await service.load(station,signal)).exits.length,1);assert.equal(calls,1)
  const failure=new ExitInfoService(async()=>new Response('',{status:503}))
  assert.equal((await failure.load(station,signal)).status,'error')
})
it('validates imported exit ownership and stable IDs, labels it user/unverified, rejects unsafe coordinates',()=>{
  const input=[{id:'one',cityId:'wuhan',stationId:'s',lng:114.3,lat:30.5,ref:'A1',exitTo:['官方资料所述方向']}]
  const result=parseUserExits(input,station)
  assert.equal(result[0].source,'user');assert.equal(result[0].confidence,'unverified')
  assert.throws(()=>parseUserExits(input,{...station,cityId:'changsha'}))
  assert.throws(()=>parseUserExits([...input,...input],station))
  assert.throws(()=>parseUserExits([{...input[0],lng:190}],station))
})

it('explicit retry bypasses successful cache; canceled waits do not reserve future request slots',async()=>{
  let clock=0,calls=0
  const service=new ExitInfoService(async()=>{calls++;return new Response(JSON.stringify(osm))},()=>clock)
  const signal=new AbortController().signal
  await service.load(station,signal)
  for(let index=0;index<5;index++){
    const controller=new AbortController()
    const pending=service.load({...station,id:`other-${index}`},controller.signal)
    controller.abort()
    await assert.rejects(pending,{name:'AbortError'})
  }
  clock=1500
  await service.load(station,signal,true)
  assert.equal(calls,2)
})
