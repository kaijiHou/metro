export type City = {cityCode:string;name:string;aliases:string[];provinceCode:string;provinceName:string;level:string;bounds:[number,number,number,number];shapeId:string;kind?:'county';parentCityCode?:string;parentCityName?:string;labelPoint?:[number,number]}
export type Catalog = {version:string;license:string;attribution:string;cities:City[];counties?:City[];provinces?:{code:string;name:string;bounds?:[number,number,number,number]}[];geometryFolder?:string;missing:{name:string;province:string;level:string;reason:string}[];notes:string[]}
export type Visit = {cityCode:string;status:'visited'|'unvisited';visitedDates:string[];note:string;coverPhotoId?:string;updatedAt:string}
export type Photo = {photoId:string;cityCode:string;blob:Blob;thumbnailBlob:Blob;mimeType:string;fileName:string;caption:string;takenAt:string;sortOrder:number;createdAt:string}
export const MAX_PHOTOS=300
export const MAX_PHOTO_BYTES=20*1024*1024
export const MAX_LIBRARY_BYTES=160*1024*1024
export const blankVisit=(cityCode:string):Visit=>({cityCode,status:'unvisited',visitedDates:[],note:'',updatedAt:new Date().toISOString()})
export function dateValid(value:string){return /^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value}
export function cleanDates(values:unknown):string[]{
 if(!Array.isArray(values)||values.length>500||!values.every((v)=>typeof v==='string'&&dateValid(v)))throw Error('访问日期无效，请使用真实的年月日。')
 return [...new Set(values as string[])].sort()
}
export function storageError(error:unknown){const e=error as {name?:string;message?:string};return /quota/i.test(`${e?.name} ${e?.message}`)?'存储空间不足，未保存。请先备份，再释放空间。':`本地存储操作失败，未宣称保存成功：${e?.message??'请检查本机资料服务是否运行，再重试。'}`}
