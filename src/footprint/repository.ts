import type {FootprintDB} from './db'
import {blankVisit,cleanDates,dateValid,MAX_LIBRARY_BYTES,MAX_PHOTOS,MAX_PHOTO_BYTES,type Photo,type Visit} from './types'
export class FootprintRepository{
 constructor(readonly db:FootprintDB,readonly cityCodes:Set<string>){}
 city(code:string){if(!this.cityCodes.has(code))throw Error('未知城市代码，未写入资料。')}
 validateVisit(v:Visit){
  if(!v||typeof v.cityCode!=='string')throw Error('城市记录格式错误。')
  this.city(v.cityCode)
  if(!['visited','unvisited'].includes(v.status)||typeof v.note!=='string'||v.note.length>5000||typeof v.updatedAt!=='string'||!Number.isFinite(Date.parse(v.updatedAt))||(v.coverPhotoId!==undefined&&(typeof v.coverPhotoId!=='string'||!/^[a-zA-Z0-9-]{1,80}$/.test(v.coverPhotoId))))throw Error('城市记录格式错误。')
  return {cityCode:v.cityCode,status:v.status,note:v.note,updatedAt:v.updatedAt,coverPhotoId:v.coverPhotoId,visitedDates:cleanDates(v.visitedDates)}
 }
 validatePhoto(p:Photo){
  this.city(p.cityCode)
  if(!/^[a-zA-Z0-9-]{1,80}$/.test(p.photoId)||!(p.blob instanceof Blob)||!(p.thumbnailBlob instanceof Blob)||!['image/jpeg','image/png','image/webp'].includes(p.mimeType)||p.blob.type!==p.mimeType||!p.blob.size||p.blob.size>MAX_PHOTO_BYTES||!p.thumbnailBlob.size||p.thumbnailBlob.size>1024*1024||typeof p.caption!=='string'||p.caption.length>1000||typeof p.fileName!=='string'||p.fileName.length>240||!Number.isFinite(p.sortOrder)||p.sortOrder<0||!Number.isFinite(Date.parse(p.createdAt))||typeof p.takenAt!=='string'||(p.takenAt!==''&&!dateValid(p.takenAt)))throw Error('照片格式、日期或容量不合法。')
 }
 checkLibrary(photos:Photo[]){if(photos.length>MAX_PHOTOS||photos.reduce((n,p)=>n+p.blob.size+p.thumbnailBlob.size,0)>MAX_LIBRARY_BYTES)throw Error('相册达到300张或160MB上限，请先导出备份。')}
 async visits(){return this.db.visits.toArray()}
 async photos(code:string){this.city(code);return (await this.db.photos.where('cityCode').equals(code).toArray()).sort((a,b)=>a.sortOrder-b.sortOrder||a.photoId.localeCompare(b.photoId))}
 async saveVisit(code:string,patch:Partial<Pick<Visit,'status'|'note'|'visitedDates'>>){
  this.city(code)
  await this.db.transaction('rw',this.db.visits,async()=>{
   const current=await this.db.visits.get(code)??blankVisit(code)
   await this.db.visits.put(this.validateVisit({...current,...patch,cityCode:code,updatedAt:new Date().toISOString()}))
  })
 }
 async addPhoto(photo:Photo){
  this.validatePhoto(photo)
  await this.db.transaction('rw',this.db.photos,this.db.visits,async()=>{
   const all=await this.db.photos.toArray();this.checkLibrary([...all,photo])
   const current=await this.db.visits.get(photo.cityCode)??blankVisit(photo.cityCode)
   await this.db.photos.add({...photo,sortOrder:Math.max(-1,...all.filter((p)=>p.cityCode===photo.cityCode).map((p)=>p.sortOrder))+1})
   await this.db.visits.put({...current,coverPhotoId:current.coverPhotoId??photo.photoId,updatedAt:new Date().toISOString()})
  })
 }
 async cover(code:string,id:string){
  this.city(code)
  await this.db.transaction('rw',this.db.visits,this.db.photos,async()=>{
   if((await this.db.photos.get(id))?.cityCode!==code)throw Error('封面不属于当前城市。')
   await this.db.visits.put({...await this.db.visits.get(code)??blankVisit(code),coverPhotoId:id,updatedAt:new Date().toISOString()})
  })
 }
 async deletePhoto(code:string,id:string){
  this.city(code)
  await this.db.transaction('rw',this.db.visits,this.db.photos,async()=>{
   if((await this.db.photos.get(id))?.cityCode!==code)throw Error('照片不属于当前城市。')
   await this.db.photos.delete(id)
   const v=await this.db.visits.get(code)
   if(v?.coverPhotoId===id){const remaining=await this.photos(code);await this.db.visits.put({...v,coverPhotoId:remaining[0]?.photoId,updatedAt:new Date().toISOString()})}
  })
 }
 async updatePhoto(code:string,id:string,patch:Partial<Pick<Photo,'caption'|'takenAt'>>){
  this.city(code)
  await this.db.transaction('rw',this.db.photos,async()=>{
   const current=await this.db.photos.get(id);if(!current||current.cityCode!==code)throw Error('照片不存在或不属于当前城市。')
   const next={...current,...patch};this.validatePhoto(next);await this.db.photos.put(next)
  })
 }
 async reorder(code:string,id:string,direction:-1|1){
  await this.db.transaction('rw',this.db.photos,async()=>{
   const photos=await this.photos(code);const i=photos.findIndex((p)=>p.photoId===id),j=i+direction
   if(i<0||j<0||j>=photos.length)return
   ;[photos[i],photos[j]]=[photos[j],photos[i]]
   await this.db.photos.bulkPut(photos.map((p,index)=>({...p,sortOrder:index})))
  })
 }
 async deleteCity(code:string){this.city(code);await this.db.transaction('rw',this.db.visits,this.db.photos,async()=>{await this.db.photos.where('cityCode').equals(code).delete();await this.db.visits.delete(code)})}
 async snapshot(){return this.db.transaction('r',this.db.visits,this.db.photos,async()=>({visits:await this.visits(),photos:await this.db.photos.toArray()}))}
 async restore(visits:Visit[],photos:Photo[],mode:'merge'|'replace'){
  const clean=visits.map((v)=>this.validateVisit(v));photos.forEach((p)=>this.validatePhoto(p))
  if(new Set(clean.map((v)=>v.cityCode)).size!==clean.length||new Set(photos.map((p)=>p.photoId)).size!==photos.length)throw Error('备份包含重复ID。')
  await this.db.transaction('rw',this.db.visits,this.db.photos,async()=>{
   const old=mode==='merge'?await this.snapshot():{visits:[],photos:[]}
   const finalPhotos=new Map(old.photos.map((p)=>[p.photoId,p]))
   for(const p of photos){const existing=finalPhotos.get(p.photoId);if(existing&&existing.cityCode!==p.cityCode)throw Error('照片ID发生跨城市冲突。');finalPhotos.set(p.photoId,p)}
   const finalVisits=new Map(old.visits.map((v)=>[v.cityCode,v]))
   for(const v of clean){const existing=finalVisits.get(v.cityCode);finalVisits.set(v.cityCode,{...v,visitedDates:cleanDates([...(existing?.visitedDates??[]),...v.visitedDates])})}
   this.checkLibrary([...finalPhotos.values()])
   for(const p of finalPhotos.values())if(!finalVisits.has(p.cityCode))throw Error('照片缺少所属城市记录。')
   for(const v of finalVisits.values())if(v.coverPhotoId&&finalPhotos.get(v.coverPhotoId)?.cityCode!==v.cityCode)throw Error('备份封面关联无效。')
   if(mode==='replace'){await this.db.photos.clear();await this.db.visits.clear()}
   await this.db.photos.bulkPut([...finalPhotos.values()]);await this.db.visits.bulkPut([...finalVisits.values()])
  })
 }
}
