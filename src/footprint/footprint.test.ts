import 'fake-indexeddb/auto'
import assert from 'node:assert/strict'
import {it} from 'node:test'
import {readFileSync} from 'node:fs'
import JSZip from 'jszip'
import {FootprintDB} from './db'
import {FootprintRepository} from './repository'
import {parseCatalog,footprintStats,type CityGeometry} from './adminCatalog'
import {blankVisit,cleanDates,MAX_PHOTO_BYTES,type Photo} from './types'
import {exportBackup,importBackup,inspectZip} from './backup'
import {digest,imageSignature} from './imageProcessing'
const catalog=parseCatalog(JSON.parse(readFileSync(new URL('../../public/footprint/catalog.json',import.meta.url),'utf8')))
const byName=(name:string)=>catalog.cities.find((c)=>c.name===name)!
const wuhan=byName('武汉市').cityCode,huanggang=byName('黄冈市').cityCode,changsha=byName('长沙市').cityCode
const png=new Blob([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1EAAAAASUVORK5CYII=','base64')],{type:'image/png'})
const photo=(cityCode:string,id:string):Photo=>({photoId:id,cityCode,blob:png,thumbnailBlob:png,mimeType:'image/png',fileName:`${id}.png`,caption:'江边回忆',takenAt:'2025-05-01',sortOrder:0,createdAt:'2026-10-15T00:00:00.000Z'})
function database(){const db=new FootprintDB(`MetroFootprint-test-${crypto.randomUUID()}`);return new FootprintRepository(db,new Set(catalog.cities.map((c)=>c.cityCode)))}
const processor=async(blob:Blob)=>new Blob([await blob.arrayBuffer()],{type:blob.type}) // Unit only; real decoding is exercised in Chrome.
it('339 licensed city units have stable unique codes, explicit parents, proper special levels and excluded Taiwan province',()=>{
 assert.equal(catalog.cities.length,339);assert.equal(new Set(catalog.cities.map((c)=>c.cityCode)).size,339)
 assert.equal(new Set(catalog.cities.map((c)=>c.provinceCode)).size,33)
 assert.equal(byName('北京市').level,'Municipality');assert.equal(byName('香港').level,'Special Administrative Region')
 assert.equal(byName('恩施土家族苗族自治州').level,'Autonomous prefecture')
 assert.ok(catalog.missing.some((c)=>c.name==='台湾省'));assert.ok(!catalog.cities.some((c)=>c.name==='莱芜市'))
 assert.throws(()=>parseCatalog({...catalog,cities:[catalog.cities[0],catalog.cities[0]]}))
})
it('province partitions match catalog ownership; Wuhan actual polygon contains Wuhan centre, not Huanggang or Xiangyang',()=>{
 const pointsInRing=(ring:number[][],x:number,y:number)=>{let inside=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],b=ring[j];if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])inside=!inside}return inside}
 const contains=(geometry:CityGeometry['features'][number]['geometry'],x:number,y:number)=>{const polys=geometry.type==='Polygon'?[geometry.coordinates]:geometry.coordinates;return polys.some((p)=>pointsInRing(p[0],x,y)&&!p.slice(1).some((r)=>pointsInRing(r,x,y)))}
 for(const prov of new Set(catalog.cities.map((c)=>c.provinceCode))){const data=JSON.parse(readFileSync(new URL(`../../public/footprint/${prov}.json`,import.meta.url),'utf8')) as CityGeometry;assert.equal(data.features.length,catalog.cities.filter((c)=>c.provinceCode===prov).length);for(const f of data.features){assert.equal(catalog.cities.find((c)=>c.cityCode===f.properties.cityCode)?.provinceCode,prov);assert.ok(['Polygon','MultiPolygon'].includes(f.geometry.type))}}
 const hubei=JSON.parse(readFileSync(new URL('../../public/footprint/CN042.json',import.meta.url),'utf8')) as CityGeometry
 assert.ok(contains(hubei.features.find((f)=>f.properties.cityCode===wuhan)!.geometry,114.3,30.55))
 for(const city of ['黄冈市','襄阳市'])assert.equal(contains(hubei.features.find((f)=>f.properties.cityCode===byName(city).cityCode)!.geometry,114.3,30.55),false)
 const stats=footprintStats(catalog,[{...blankVisit(wuhan),status:'visited'}]);assert.equal(stats.visited,1);assert.equal(stats.remaining,338);assert.equal(stats.provinces,1);assert.equal(stats.byProvince.CN042.visited,1)
})
it('optional visit dates are validated, deduplicated and sorted; non-metro city can be visited without touching neighbors',async()=>{
 const repo=database()
 try{await repo.saveVisit(huanggang,{status:'visited',visitedDates:['2025-05-01','2024-01-01','2025-05-01'],note:'非地铁城市'});assert.deepEqual((await repo.db.visits.get(huanggang))!.visitedDates,['2024-01-01','2025-05-01']);assert.equal(await repo.db.visits.get(wuhan),undefined);await assert.rejects(repo.saveVisit(huanggang,{visitedDates:['2025-02-29']}));assert.equal((await repo.db.visits.get(huanggang))!.note,'非地铁城市');assert.deepEqual(cleanDates([]),[])}finally{await repo.db.delete()}
})
it('photos persist across reopen, remain isolated by city, unlighting preserves them, deleting cover repairs fallback and reorder persists',async()=>{
 const repo=database()
 try{await repo.addPhoto(photo(wuhan,'first'));await repo.addPhoto(photo(wuhan,'second'));await repo.addPhoto(photo(changsha,'third'));await repo.saveVisit(wuhan,{status:'visited'});await repo.saveVisit(wuhan,{status:'unvisited'});assert.equal((await repo.photos(wuhan)).length,2);assert.equal((await repo.photos(changsha)).length,1);await repo.cover(wuhan,'second');await assert.rejects(repo.cover(wuhan,'third'));await repo.reorder(wuhan,'second',-1);assert.equal((await repo.photos(wuhan))[0].photoId,'second');await repo.deletePhoto(wuhan,'second');assert.equal((await repo.db.visits.get(wuhan))!.coverPhotoId,'first');repo.db.close();await repo.db.open();assert.equal(await digest((await repo.photos(wuhan))[0].blob),await digest(png));await repo.deletePhoto(wuhan,'first');assert.equal((await repo.db.visits.get(wuhan))!.coverPhotoId,undefined)}finally{await repo.db.delete()}
})
it('photo add transaction rolls back after a later visit write fails, including quota-like failure',async()=>{
 const repo=database();const fail=()=>{throw new DOMException('test quota','QuotaExceededError')}
 try{repo.db.visits.hook('creating',fail);await assert.rejects(repo.addPhoto(photo(wuhan,'failed')));assert.equal(await repo.db.photos.count(),0);assert.equal(await repo.db.visits.count(),0);repo.db.visits.hook('creating').unsubscribe(fail);await repo.addPhoto(photo(wuhan,'works'));assert.equal(await repo.db.photos.count(),1)}finally{await repo.db.delete()}
})
it('ZIP restores actual photo bytes, metadata, dates, notes and cover into an empty database; merge and replace stay scoped',async()=>{
 const source=database(),target=database()
 try{
  await source.addPhoto(photo(wuhan,'wuhan-one'));await source.addPhoto(photo(changsha,'changsha-one'));await source.saveVisit(wuhan,{status:'visited',note:'完整记录',visitedDates:['2025-05-01','2026-01-02']});const zip=await exportBackup(source)
  await target.saveVisit(huanggang,{status:'visited'});await importBackup(zip,target,'merge',processor);assert.equal(await target.db.visits.count(),3)
  await importBackup(zip,target,'replace',processor);assert.equal(await target.db.visits.count(),2);assert.equal(await target.db.visits.get(huanggang),undefined)
  const a=await source.snapshot(),b=await target.snapshot();assert.deepEqual(a.visits,b.visits);assert.equal(b.photos.length,2)
  for(const p of a.photos){const restored=b.photos.find((x)=>x.photoId===p.photoId)!;assert.equal(await digest(restored.blob),await digest(p.blob));assert.equal(restored.caption,p.caption);assert.equal(restored.takenAt,p.takenAt)}
  await target.saveVisit(wuhan,{visitedDates:['2023-01-01']});await importBackup(zip,target,'merge',processor);assert.deepEqual((await target.db.visits.get(wuhan))!.visitedDates,['2023-01-01','2025-05-01','2026-01-02'])
 }finally{await source.db.delete();await target.db.delete()}
})
it('ZIP rejects traversal, absolute paths, unknown cities, bad schema, duplicate IDs, cross-city ownership, image corruption and leaves existing data unchanged',async()=>{
 const source=database(),target=database()
 try{
  await source.addPhoto(photo(wuhan,'one'));await target.addPhoto(photo(changsha,'private-existing'))
  const good=await exportBackup(source),baseline=await target.snapshot()
  const original=await JSZip.loadAsync(await good.arrayBuffer()),base=JSON.parse(await original.file('manifest.json')!.async('string'))
  for(const mutate of [
   (z:JSZip)=>{z.file('../evil.txt','bad',{createFolders:false})},
   (z:JSZip)=>{z.file('/absolute','bad',{createFolders:false})},
   (_:JSZip,m:typeof base)=>{m.schemaVersion=99},
   (_:JSZip,m:typeof base)=>{m.visits[0].cityCode='unknown'},
   (_:JSZip,m:typeof base)=>{m.photos.push({...m.photos[0]})},
   (_:JSZip,m:typeof base)=>{m.photos[0].cityCode=changsha},
   (z:JSZip,m:typeof base)=>{z.file(m.photos[0].path,'broken image',{createFolders:false})},
   (_:JSZip,m:typeof base)=>{m.visits[0].coverPhotoId='missing'},
  ]){
   const z=await JSZip.loadAsync(await good.arrayBuffer()),manifest=structuredClone(base);mutate(z,manifest);z.file('manifest.json',JSON.stringify(manifest));const bad=await z.generateAsync({type:'blob'});await assert.rejects(importBackup(bad,target,'replace',processor));assert.deepEqual((await target.snapshot()).visits,baseline.visits);assert.equal(await digest((await target.photos(changsha))[0].blob),await digest(png))
  }
  await assert.rejects(target.restore([{...blankVisit(changsha),coverPhotoId:'private-existing'}],[photo(wuhan,'private-existing')],'merge'))
 }finally{await source.db.delete();await target.db.delete()}
})
it('ZIP rejects duplicate central paths and oversized size claims before inflate; malformed image signature and oversized library additions fail',async()=>{
 const z=new JSZip();z.file('manifest.json','{}');z.file('manifest.jsoN','{}');let bytes=await z.generateAsync({type:'uint8array'});const text=new TextDecoder().decode(bytes);assert.ok(text.includes('manifest.jsoN'))
 // Rename both local/central second entry, creating a duplicate JSZip alone would silently overwrite.
 for(let i=0;i<bytes.length-13;i++)if(new TextDecoder().decode(bytes.slice(i,i+13))==='manifest.jsoN')bytes[i+12]=110
 assert.throws(()=>inspectZip(bytes))
 const safe=new JSZip();safe.file('manifest.json','{}');bytes=await safe.generateAsync({type:'uint8array'});const view=new DataView(bytes.buffer);for(let i=0;i<bytes.length-46;i++)if(view.getUint32(i,true)===0x02014b50){view.setUint32(i+24,MAX_PHOTO_BYTES+1,true);break}assert.throws(()=>inspectZip(bytes))
 assert.equal(imageSignature(new Uint8Array([1,2,3]),'image/png'),false)
 const repo=database();try{await assert.rejects(repo.addPhoto({...photo(wuhan,'large'),blob:new Blob([new Uint8Array(MAX_PHOTO_BYTES+1)],{type:'image/png'})}));assert.equal(await repo.db.photos.count(),0)}finally{await repo.db.delete()}
})

it('bounded inflation rejects a forged tiny size claim before accumulating a large deflate payload',async()=>{
 const source=database(),target=database()
 try{
  await source.addPhoto(photo(wuhan,'one'));await target.saveVisit(changsha,{status:'visited',note:'keep'})
  const good=await exportBackup(source),z=await JSZip.loadAsync(await good.arrayBuffer()),manifest=JSON.parse(await z.file('manifest.json')!.async('string'))
  const payload=new Uint8Array(1024*1024);payload.set(new Uint8Array(await png.slice(0,16).arrayBuffer()));z.file(manifest.photos[0].path,payload,{createFolders:false})
  const bytes=await z.generateAsync({type:'uint8array',compression:'DEFLATE'}),view=new DataView(bytes.buffer)
  for(let i=0;i<bytes.length-46;i++)if(view.getUint32(i,true)===0x02014b50){const n=view.getUint16(i+28,true),name=new TextDecoder().decode(bytes.slice(i+46,i+46+n));if(name.startsWith('photos/'))view.setUint32(i+24,32,true)}
  const before=await target.snapshot()
  await assert.rejects(importBackup(new Blob([new Uint8Array(bytes).buffer]),target,'replace',processor))
  assert.deepEqual((await target.snapshot()).visits,before.visits);assert.equal(await target.db.photos.count(),0)
 }finally{await source.db.delete();await target.db.delete()}
})

it('a valid large note collection exports to a ZIP that its own importer accepts',async()=>{
 const source=database(),target=database()
 try{
  await source.db.visits.bulkPut(catalog.cities.map(c=>({...blankVisit(c.cityCode),note:'游'.repeat(5000)})))
  const zip=await exportBackup(source);assert.ok(zip.size>1024*1024)
  await importBackup(zip,target,'replace',processor)
  assert.equal(await target.db.visits.count(),339)
  assert.equal((await target.db.visits.get(wuhan))!.note.length,5000)
 }finally{await source.db.delete();await target.db.delete()}
})
it('ZIP transaction failure after clearing/replacing rolls back every previous visit and original photo',async()=>{
 const source=database(),target=database()
 const fail=()=>{throw new DOMException('restore quota','QuotaExceededError')}
 try{
  await source.addPhoto(photo(wuhan,'incoming'))
  await target.addPhoto(photo(changsha,'retained'))
  await target.saveVisit(changsha,{status:'visited',note:'must survive failed replace'})
  const before=await target.snapshot(),zip=await exportBackup(source)
  target.db.visits.hook('creating',fail)
  await assert.rejects(importBackup(zip,target,'replace',processor))
  const after=await target.snapshot()
  assert.deepEqual(after.visits,before.visits)
  assert.deepEqual(after.photos.map(p=>p.photoId),['retained'])
  assert.equal(await digest(after.photos[0].blob),await digest(before.photos[0].blob))
  target.db.visits.hook('creating').unsubscribe(fail)
 }finally{await source.db.delete();await target.db.delete()}
})
