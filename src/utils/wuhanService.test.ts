import assert from 'node:assert/strict'
import {it} from 'node:test'
import metro from '../data/wuhan-service.json'
import {wuhanServiceLines,serviceLineId,scheduleTime,serviceSourceOld} from './wuhanService'
import {emptyProject} from '../models/metro'
import {findJourney,journeyArrival,journeyEstimate} from './journey'

it('Wuhan timetable facts cover 13 metro lines and four trams with explicit provenance and complete directional columns',()=>{
 assert.equal(wuhanServiceLines.filter(l=>l.transport==='metro').length,13)
 assert.equal(wuhanServiceLines.filter(l=>l.transport==='tram').length,4)
 let records=0
 for(const line of wuhanServiceLines){
  assert.match(line.sourceUrl,/^https:\/\//)
  for(const table of line.tables)for(const direction of table.directions){
   assert.ok(direction.name);assert.equal(direction.columns[0],line.transport==='metro'?'车站':'发车站')
   for(const row of direction.rows){assert.equal(row.length,direction.columns.length);assert.ok(row[0]);records++}
  }
 }
 assert.ok(records>1400)
 const second=wuhanServiceLines.find(l=>l.id==='2')!
 assert.equal(second.tables.length,4);assert.ok(second.tables.some(t=>t.title.includes('周五')))
 const eleventh=wuhanServiceLines.find(l=>l.id==='11')!.tables[0].directions[0]
 assert.ok(eleventh.columns.some(c=>c.includes('武汉东站')));assert.ok(eleventh.columns.some(c=>c.includes('江安路')))
 assert.equal(wuhanServiceLines.find(l=>l.id==='6')!.publishedAt,'2023-08-18')
 assert.ok(serviceSourceOld('2023-08-18'));assert.equal(serviceSourceOld('2026-10-23'),false)
 assert.ok(metro.sources.every(s=>/^[a-f0-9]{64}$/.test(s.sha256)))
 assert.equal(serviceLineId('10号线'),null);assert.equal(serviceLineId('阳逻线'),'21');assert.equal(serviceLineId('光谷有轨电车L2'),'L2')
 assert.equal(wuhanServiceLines.find(l=>l.id==='T1')!.quality,'reference')
})

it('timetable formatting preserves terminal arrivals, missing values and next-day times without fabricating trains',()=>{
 assert.equal(scheduleTime('00:14（到达）'),'次日 00:14（到达）')
 assert.equal(scheduleTime('23:55(到点)'),'23:55(到点)')
 assert.equal(scheduleTime('6:03'),'06:03');assert.equal(scheduleTime('——'),'——')
 assert.equal(journeyArrival('23:50',20),'次日 00:10');assert.equal(journeyArrival('',20),null)
 assert.equal(journeyArrival('25:30',20),null);assert.equal(journeyArrival('08:00',-1),null)
})

it('journey time includes a larger walking and waiting budget once per actual boarding and exposes a matching breakdown',()=>{
 const p=emptyProject();for(const [i,id] of ['a','b','c'].entries())p.stations[id]={id,name:id,lng:114+i*.005,lat:30}
 p.lines.first={id:'first',name:'first',color:'#123456',status:'existing',nodes:['a','b'].map(id=>({type:'station',id}))}
 p.lines.second={id:'second',name:'second',color:'#123456',status:'existing',transport:'tram',nodes:['b','c'].map(id=>({type:'station',id}))}
 const result=findJourney(p,'a','c')!
 assert.equal(result.transfers,1)
 assert.equal(result.timing.waitMinutes,journeyEstimate.metroWait+journeyEstimate.tramWait)
 assert.equal(result.timing.walkMinutes,journeyEstimate.entryWalk+journeyEstimate.transferWalk)
 assert.ok(Math.abs(result.minutes-Object.values(result.timing).reduce((a,b)=>a+b,0))<1e-9)
 const oldEstimate=result.timing.rideMinutes+2.5+4+5
 assert.ok(result.minutes>oldEstimate)
 assert.equal(findJourney(p,'a','a')!.timing.walkMinutes,0)
})
