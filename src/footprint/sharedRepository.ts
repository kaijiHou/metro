import {FootprintValidation} from './validation'
import {FootprintRepository,type FootprintStore} from './repository'
import {footprintDb} from './db'
import type {Photo,Visit} from './types'

type WirePhoto=Omit<Photo,'blob'|'thumbnailBlob'>&{original:string;thumbnail:string;thumbnailMime:string}
type Snapshot={visits:Visit[];photos:WirePhoto[]}
type Status={token:string;file:string;revision:number}
const api=`${import.meta.env?.BASE_URL??'/'}api/footprint/`
async function base64(blob:Blob){
 const bytes=new Uint8Array(await blob.arrayBuffer());let text=''
 for(let i=0;i<bytes.length;i+=32768)text+=String.fromCharCode(...bytes.subarray(i,i+32768))
 return btoa(text)
}
const blob=(text:string,mime:string)=>new Blob([Uint8Array.from(atob(text),c=>c.charCodeAt(0))],{type:mime})
export async function encodePhoto(p:Photo):Promise<WirePhoto>{const {blob:original,thumbnailBlob,...meta}=p;return {...meta,original:await base64(original),thumbnail:await base64(thumbnailBlob),thumbnailMime:thumbnailBlob.type}}
export function decodePhoto(p:WirePhoto):Photo{const {original,thumbnail,thumbnailMime,...meta}=p;return {...meta,blob:blob(original,p.mimeType),thumbnailBlob:blob(thumbnail,thumbnailMime)}}

export class SharedFootprintRepository extends FootprintValidation implements FootprintStore{
 migrationWarning=''
 private connection?:Status
 private timestamps=new Map<string,string>()
 private async request<T>(action:string,body?:unknown,retry=true):Promise<T>{
  if(!this.connection)await this.status()
  const res=await fetch(api+action,{method:body===undefined?'GET':'POST',headers:{'X-Metro-Token':this.connection!.token,...(body===undefined?{}:{'Content-Type':'application/json'})},body:body===undefined?undefined:JSON.stringify(body),cache:'no-store'})
  if(res.status===403&&retry){const old=this.connection!.token;await this.status();if(old!==this.connection!.token)return this.request<T>(action,body,false)}
  if(!res.ok){let message='共享资料服务无法连接，未保存。';try{message=(await res.json()).error??message}catch{/* server may be stopped */}throw Error(message)}
  return res.json() as Promise<T>
 }
 async status(){
  const res=await fetch(api+'status',{cache:'no-store'})
  if(!res.ok||!res.headers.get('content-type')?.includes('application/json'))throw Error('本机共享资料服务未启动，请通过 scripts/start-metro.cmd 打开程序。')
  const info=await res.json() as Status
  if(!info.token||!info.file||!Number.isSafeInteger(info.revision))throw Error('共享资料服务返回格式错误。')
  this.connection=info;return info
 }
 async initialize(){
  this.migrationWarning=''
  await this.status()
  const legacy=new FootprintRepository(footprintDb,this.cityCodes)
  // The browser database is retained as a backup; SQLite becomes the source of truth.
  let id:string|undefined
  try{id=(await footprintDb.settings.get('shared-migration-client'))?.value;if(!id){id=crypto.randomUUID();await footprintDb.settings.put({key:'shared-migration-client',value:id})}}
  catch{this.migrationWarning='共享文件已连接，但旧浏览器记录暂时无法读取，尚未合并。请保留原记录并稍后重试。';return this.status()}
  const migration=await this.request<{done:boolean}>('migration?client='+encodeURIComponent(id))
  if(!migration.done){
   let old:Awaited<ReturnType<FootprintRepository['snapshot']>>
   try{old=await legacy.snapshot()}catch{this.migrationWarning='共享文件已连接，但旧浏览器记录尚未读取成功，请保留原记录后重试迁移。';return this.status()}
   await this.request('migrate',{clientId:id,mode:'merge',visits:old.visits,photos:await Promise.all(old.photos.map(encodePhoto))})
  }
  return this.status()
 }
 async visits(){const visits=await this.request<Visit[]>('visits');this.timestamps=new Map(visits.map(v=>[v.cityCode,v.updatedAt]));return visits}
 async photos(code:string){this.city(code);return (await this.request<WirePhoto[]>('photos?city='+encodeURIComponent(code))).map(decodePhoto)}
 async photo(id:string){const p=await this.request<WirePhoto|null>('photo?id='+encodeURIComponent(id));return p?decodePhoto(p):undefined}
 async saveVisit(code:string,patch:Partial<Pick<Visit,'status'|'note'|'visitedDates'>>){await this.request('visit',{code,patch,expectedUpdatedAt:this.timestamps.get(code)??''})}
 async addPhoto(photo:Photo){this.validatePhoto(photo);await this.request('add-photo',{code:photo.cityCode,photo:await encodePhoto(photo)})}
 async cover(code:string,id:string){await this.request('cover',{code,id})}
 async deletePhoto(code:string,id:string){await this.request('delete-photo',{code,id})}
 async updatePhoto(code:string,id:string,patch:Partial<Pick<Photo,'caption'|'takenAt'>>){await this.request('update-photo',{code,id,patch})}
 async reorder(code:string,id:string,direction:-1|1){await this.request('reorder',{code,id,direction})}
 async deleteCity(code:string){await this.request('delete-city',{code})}
 async snapshot(){const data=await this.request<Snapshot>('snapshot');return {visits:data.visits,photos:data.photos.map(decodePhoto)}}
 async restore(visits:Visit[],photos:Photo[],mode:'merge'|'replace'){
  const expectedRevision=(await this.status()).revision
  await this.request('restore',{visits,photos:await Promise.all(photos.map(encodePhoto)),mode,expectedRevision})
 }
}
