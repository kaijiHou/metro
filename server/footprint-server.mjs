import {DatabaseSync} from 'node:sqlite'
import {mkdirSync,readFileSync} from 'node:fs'
import {resolve} from 'node:path'
import {randomBytes} from 'node:crypto'
import {FootprintValidation} from '../src/footprint/validation.ts'
import {blankVisit,cleanDates} from '../src/footprint/types.ts'
import {imageSignature} from '../src/footprint/imageProcessing.ts'

const fail=(message,status=400)=>{throw Object.assign(Error(message),{status})}
const pick=(value,keys)=>{
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!keys.includes(k)))fail('更新字段不合法。')
 return value
}
function bytes(text,limit){
 if(typeof text!=='string'||text.length>Math.ceil(limit/3)*4||text.length%4||!/^[A-Za-z0-9+/]*={0,2}$/.test(text))fail('照片编码或容量不合法。')
 const data=Buffer.from(text,'base64');if(data.length>limit||data.toString('base64')!==text)fail('照片编码不合法。');return data
}

export function openFootprintStore(root,folder=process.env.METRO_DATA_DIR||resolve(root,'data')){
 mkdirSync(folder,{recursive:true})
 const file=resolve(folder,'travel.sqlite'),db=new DatabaseSync(file)
 db.exec(`PRAGMA busy_timeout=5000; PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL;
 CREATE TABLE IF NOT EXISTS visits(code TEXT PRIMARY KEY, value TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS photos(id TEXT PRIMARY KEY, city TEXT NOT NULL, value TEXT NOT NULL, original BLOB NOT NULL, thumbnail BLOB NOT NULL);
 CREATE INDEX IF NOT EXISTS photos_city ON photos(city);
 CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY, value INTEGER NOT NULL);
 INSERT OR IGNORE INTO meta VALUES('revision',0);
 CREATE TABLE IF NOT EXISTS migrations(id TEXT PRIMARY KEY);
 CREATE TABLE IF NOT EXISTS deleted(id TEXT PRIMARY KEY, at TEXT NOT NULL);`)
 const catalog=JSON.parse(readFileSync(resolve(root,'public/footprint/catalog.json'),'utf8'))
 const counties=JSON.parse(readFileSync(resolve(root,'public/footprint/counties/catalog.json'),'utf8'))
 const validation=new FootprintValidation(new Set([...catalog.cities,...counties.cities].map(c=>c.cityCode)))
 const revision=()=>Number(db.prepare("SELECT value FROM meta WHERE key='revision'").get().value)
 const visits=()=>db.prepare('SELECT value FROM visits ORDER BY code').all().map(r=>JSON.parse(r.value))
 const visit=code=>{const row=db.prepare('SELECT value FROM visits WHERE code=?').get(code);return row?JSON.parse(row.value):undefined}
 const photo=row=>row?{...JSON.parse(row.value),original:Buffer.from(row.original).toString('base64'),thumbnail:Buffer.from(row.thumbnail).toString('base64')}:undefined
 const getPhoto=id=>photo(db.prepare('SELECT * FROM photos WHERE id=?').get(id))
 const photos=code=>db.prepare('SELECT * FROM photos WHERE city=?').all(code).map(photo).sort((a,b)=>a.sortOrder-b.sortOrder||a.photoId.localeCompare(b.photoId))
 const snapshot=()=>{
  const read=()=>({visits:visits(),photos:db.prepare('SELECT * FROM photos ORDER BY id').all().map(photo)})
  if(db.isTransaction)return read()
  db.exec('BEGIN')
  try{const result=read();db.exec('COMMIT');return result}catch(e){db.exec('ROLLBACK');throw e}
 }
 const putVisit=v=>db.prepare('INSERT OR REPLACE INTO visits VALUES(?,?)').run(v.cityCode,JSON.stringify(validation.validateVisit(v)))
 function decode(p){
  if(!p||typeof p!=='object')fail('照片格式错误。')
  const original=bytes(p.original,20*1024*1024),thumbnail=bytes(p.thumbnail,1024*1024)
  if(!['image/jpeg','image/png','image/webp'].includes(p.thumbnailMime)||!imageSignature(original,p.mimeType)||!imageSignature(thumbnail,p.thumbnailMime))fail('照片签名与格式不匹配。')
  const {original:ignored,thumbnail:ignoredThumb,thumbnailMime,...meta}=p;void ignored;void ignoredThumb
  const validated={...meta,blob:new Blob([original],{type:p.mimeType}),thumbnailBlob:new Blob([thumbnail],{type:thumbnailMime})}
  validation.validatePhoto(validated)
  return {meta:{...meta,thumbnailMime},original,thumbnail,validated}
 }
 function putPhoto(p){const d=decode(p);db.prepare('INSERT OR REPLACE INTO photos VALUES(?,?,?,?,?)').run(p.photoId,p.cityCode,JSON.stringify(d.meta),d.original,d.thumbnail)}
 function checkCapacity(incoming,replace=false){
  const old=replace?[]:db.prepare('SELECT id,length(original)+length(thumbnail) AS size FROM photos').all()
  const sizes=new Map(old.map(p=>[p.id,Number(p.size)]))
  for(const p of incoming){const d=decode(p);sizes.set(p.photoId,d.original.length+d.thumbnail.length)}
  if(sizes.size>300||[...sizes.values()].reduce((a,b)=>a+b,0)>160*1024*1024)fail('相册达到300张或160MB上限，请先导出备份。')
 }
 const tombstone=(id,at)=>db.prepare('INSERT OR REPLACE INTO deleted VALUES(?,?)').run(id,at)
 const deletedAfter=(id,at)=>{const row=db.prepare('SELECT at FROM deleted WHERE id=?').get(id);return row&&Date.parse(row.at)>=Date.parse(at)}
 function restore(body,migration){
  const {visits:incoming,photos:images,mode}=body
  if(!Array.isArray(incoming)||incoming.length>validation.cityCodes.size||!Array.isArray(images)||images.length>300||!['merge','replace'].includes(mode))fail('恢复资料格式错误。')
  if(migration&&(!/^[a-zA-Z0-9-]{1,100}$/.test(body.clientId)||mode!=='merge'))fail('迁移身份错误。')
  if(migration&&db.prepare('SELECT id FROM migrations WHERE id=?').get(body.clientId))return
  const clean=incoming.map(v=>validation.validateVisit(v));images.forEach(decode)
  if(new Set(clean.map(v=>v.cityCode)).size!==clean.length||new Set(images.map(p=>p.photoId)).size!==images.length)fail('恢复资料含重复ID。')
  if(mode==='replace'&&body.expectedRevision!==revision())fail('另一浏览器刚更新了资料，请重新导入，避免覆盖新记录。',409)
  const old=mode==='replace'?{visits:[],photos:[]}:snapshot()
  const finalVisits=new Map(old.visits.map(v=>[v.cityCode,v])),finalPhotos=new Map(old.photos.map(p=>[p.photoId,p]))
  for(const v of clean){
   if(migration&&deletedAfter('city/'+v.cityCode,v.updatedAt))continue
   const existing=finalVisits.get(v.cityCode)
   const chosen=migration&&existing&&Date.parse(existing.updatedAt)>=Date.parse(v.updatedAt)?existing:v
   finalVisits.set(v.cityCode,{...chosen,visitedDates:cleanDates([...(existing?.visitedDates??[]),...v.visitedDates])})
  }
  for(const p of images){
   if(!clean.some(v=>v.cityCode===p.cityCode))fail('照片缺少所属城市记录。')
   const existing=finalPhotos.get(p.photoId)
   if(existing&&existing.cityCode!==p.cityCode)fail('照片ID发生跨城市冲突。')
   if(migration&&(!finalVisits.has(p.cityCode)||deletedAfter('photo/'+p.photoId,p.createdAt)))continue
   finalPhotos.set(p.photoId,migration&&existing?existing:p)
  }
  for(const p of finalPhotos.values())if(!finalVisits.has(p.cityCode))fail('照片缺少所属城市记录。')
  for(const v of finalVisits.values())if(v.coverPhotoId&&finalPhotos.get(v.coverPhotoId)?.cityCode!==v.cityCode){if(migration)v.coverPhotoId=old.visits.find(x=>x.cityCode===v.cityCode)?.coverPhotoId;else fail('备份封面关联无效。')}
  checkCapacity([...finalPhotos.values()],true)
  if(mode==='replace'){
   const at=new Date().toISOString();for(const v of visits())tombstone('city/'+v.cityCode,at)
   for(const p of db.prepare('SELECT id FROM photos').all())tombstone('photo/'+p.id,at)
   db.exec('DELETE FROM photos; DELETE FROM visits;')
  }
  for(const v of finalVisits.values())putVisit(v)
  for(const p of finalPhotos.values())putPhoto(p)
  if(migration)db.prepare('INSERT INTO migrations VALUES(?)').run(body.clientId)
 }
 function mutate(action,body){
  db.exec('BEGIN IMMEDIATE')
  try{
   if(['restore','migrate'].includes(action))restore(body,action==='migrate')
   else{
    const {code,id}=body;validation.city(code)
    const current=visit(code)??blankVisit(code),now=new Date(Math.max(Date.now(),Date.parse(current.updatedAt)+1)).toISOString()
    if(action==='visit'){
     const patch=pick(body.patch,['status','note','visitedDates'])
     if(body.expectedUpdatedAt!==undefined&&body.expectedUpdatedAt!==(visit(code)?.updatedAt??''))fail('另一浏览器刚更新了此城市，请读取最新资料后再保存。',409)
     putVisit({...current,...patch,updatedAt:now})
    }else if(action==='add-photo'){
     const p=body.photo;if(p?.cityCode!==code||getPhoto(p?.photoId))fail('照片归属错误或ID重复。')
     checkCapacity([p]);putPhoto({...p,sortOrder:Math.max(-1,...photos(code).map(x=>x.sortOrder))+1});putVisit({...current,coverPhotoId:current.coverPhotoId??p.photoId,updatedAt:now})
    }else if(action==='delete-city'){
     for(const p of photos(code))tombstone('photo/'+p.photoId,now)
     tombstone('city/'+code,now);db.prepare('DELETE FROM photos WHERE city=?').run(code);db.prepare('DELETE FROM visits WHERE code=?').run(code)
    }else{
     const p=getPhoto(id);if(!p||p.cityCode!==code)fail('照片不存在或不属于当前城市。')
     if(action==='cover')putVisit({...current,coverPhotoId:id,updatedAt:now})
     else if(action==='delete-photo'){
      db.prepare('DELETE FROM photos WHERE id=?').run(id);tombstone('photo/'+id,now)
      if(current.coverPhotoId===id)putVisit({...current,coverPhotoId:photos(code)[0]?.photoId,updatedAt:now})
     }else if(action==='update-photo')putPhoto({...p,...pick(body.patch,['caption','takenAt'])})
     else if(action==='reorder'){
      if(![-1,1].includes(body.direction))fail('照片排序方向错误。')
      const list=photos(code),i=list.findIndex(x=>x.photoId===id),j=i+body.direction
      if(j>=0&&j<list.length){[list[i],list[j]]=[list[j],list[i]];list.forEach((x,index)=>putPhoto({...x,sortOrder:index}))}
     }else fail('未知资料操作。')
    }
   }
   db.exec("UPDATE meta SET value=value+1 WHERE key='revision'; COMMIT")
   return {revision:revision()}
  }catch(e){db.exec('ROLLBACK');throw e}
 }
 return {file,revision,visits,photos,photo:getPhoto,snapshot,mutate,migrated:id=>Boolean(db.prepare('SELECT id FROM migrations WHERE id=?').get(id)),close:()=>db.close()}
}

export function sharedFootprintPlugin(){
 let store
 const token=randomBytes(32).toString('hex')
 function setup(server){
  store=openFootprintStore(server.config.root)
  const middleware=async(req,res,next)=>{
   const url=new URL(req.url||'/','http://localhost'),base=server.config.base.replace(/\/$/,'')
   let path=url.pathname
   if(base&&path.startsWith(base+'/'))path=path.slice(base.length)
   const reply=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data))}
   if(/\.sqlite(?:[-.][^/]*)?$/i.test(decodeURIComponent(path)))return reply(403,{error:'个人资料文件不能通过静态地址下载。'})
   if(!path.startsWith('/api/footprint/'))return next()
   try{
    const host=new URL('http://'+req.headers.host)
    if(!['localhost','127.0.0.1','[::1]'].includes(host.hostname)||!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress))fail('仅允许本机访问共享资料。',403)
    if(req.headers['sec-fetch-site']==='cross-site'||(req.headers.origin&&new URL(req.headers.origin).host!==host.host))fail('不允许跨站访问共享资料。',403)
    const action=path.slice('/api/footprint/'.length)
    if(action==='status'&&req.method==='GET')return reply(200,{token,file:store.file,revision:store.revision()})
    if(req.headers['x-metro-token']!==token)fail('共享资料访问凭证无效，请刷新页面。',403)
    if(req.method==='GET'){
     if(action==='visits')return reply(200,store.visits())
     if(action==='snapshot')return reply(200,store.snapshot())
     if(action==='migration')return reply(200,{done:store.migrated(url.searchParams.get('client'))})
     if(action==='photos'){const code=url.searchParams.get('city');return reply(200,store.photos(code))}
     if(action==='photo')return reply(200,store.photo(url.searchParams.get('id'))??null)
     fail('资料接口不存在。',404)
    }
    if(req.method!=='POST')fail('资料操作方法不支持。',405)
    if(!req.headers['content-type']?.startsWith('application/json'))fail('请求须为JSON资料。',415)
    const chunks=[];let size=0;const limit=action==='restore'||action==='migrate'?240*1024*1024:30*1024*1024
    for await(const chunk of req){size+=chunk.length;if(size>limit)fail('资料请求超过容量上限。',413);chunks.push(chunk)}
    let body;try{body=JSON.parse(Buffer.concat(chunks).toString('utf8'))}catch{fail('请求资料不是有效JSON。')}
    if(!body||typeof body!=='object'||Array.isArray(body))fail('请求资料格式错误。')
    reply(200,store.mutate(action,body))
   }catch(e){reply(e.status||500,{error:e.status||e.message&&!/sqlite|database|SQLITE/i.test(e.message)?e.message:'共享资料写入失败，原资料已保留。'})}
  }
  server.middlewares.use(middleware)
  server.httpServer?.once('close',()=>{store?.close();store=undefined})
 }
 return {name:'metro-shared-footprints',configureServer:setup,configurePreviewServer:setup}
}
