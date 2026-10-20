import {cleanDates,dateValid,MAX_LIBRARY_BYTES,MAX_PHOTOS,MAX_PHOTO_BYTES,type Photo,type Visit} from './types'
export class FootprintValidation{
 constructor(readonly cityCodes:Set<string>){}
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
}
