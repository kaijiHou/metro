import JSZip, {type JSZipObject} from 'jszip'
import type {FootprintRepository} from './repository'
import type {Photo,Visit} from './types'
import {MAX_LIBRARY_BYTES,MAX_PHOTO_BYTES,MAX_PHOTOS} from './types'
import {digest,processImage,imageSignature} from './imageProcessing'
const MAX_ZIP=180*1024*1024
const MANIFEST_LIMIT=16*1024*1024
const safePath=/^(manifest\.json|photos\/ocha2020-CN\d{6}\/[a-zA-Z0-9-]{1,80}\.(jpg|png|webp))$/
type Metadata=Omit<Photo,'blob'|'thumbnailBlob'>&{path:string;sha256:string}
type Manifest={schemaVersion:1;exportedAt:string;visits:Visit[];photos:Metadata[]}
const extension=(mime:string)=>({'image/jpeg':'jpg','image/png':'png','image/webp':'webp'}[mime])

/** Validate central and local records BEFORE JSZip inflation, including duplicates and size claims. */
export function inspectZip(bytes:Uint8Array){
 if(bytes.byteLength>MAX_ZIP||bytes.byteLength<22)throw Error('ZIP为空或超过180MB。')
 const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength)
 let end=-1
 for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--)if(v.getUint32(i,true)===0x06054b50&&i+22+v.getUint16(i+20,true)===bytes.length){end=i;break}
 if(end<0||v.getUint16(end+4,true)||v.getUint16(end+6,true))throw Error('不支持多卷、ZIP64或损坏的ZIP。')
 const count=v.getUint16(end+10,true),size=v.getUint32(end+12,true),start=v.getUint32(end+16,true)
 if(count>MAX_PHOTOS+1||count!==v.getUint16(end+8,true)||start+size!==end)throw Error('ZIP文件数量或目录范围无效。')
 const entries=new Map<string,number>();let pos=start,total=0
 const ranges:{start:number;end:number}[]=[]
 for(let i=0;i<count;i++){
  if(pos+46>end||v.getUint32(pos,true)!==0x02014b50)throw Error('ZIP目录损坏。')
  const flags=v.getUint16(pos+8,true),method=v.getUint16(pos+10,true),packed=v.getUint32(pos+20,true),unpacked=v.getUint32(pos+24,true),nameLength=v.getUint16(pos+28,true),extra=v.getUint16(pos+30,true),comment=v.getUint16(pos+32,true),local=v.getUint32(pos+42,true)
  if(pos+46+nameLength+extra+comment>end||flags&1||![0,8].includes(method)||unpacked===0xffffffff||packed===0xffffffff||v.getUint16(pos+34,true))throw Error('不支持加密、ZIP64或未知压缩方式。')
  const name=new TextDecoder('utf-8',{fatal:true}).decode(bytes.slice(pos+46,pos+46+nameLength))
  if(!safePath.test(name)||entries.has(name)||unpacked>(name==='manifest.json'?MANIFEST_LIMIT:MAX_PHOTO_BYTES))throw Error('ZIP路径、重复文件或解压大小不合法。')
  total+=unpacked;if(total>MAX_ZIP)throw Error('ZIP解压总量超过180MB。')
  if(local+30>start||v.getUint32(local,true)!==0x04034b50)throw Error('ZIP本地文件头损坏。')
  const localNameLength=v.getUint16(local+26,true),localExtra=v.getUint16(local+28,true),dataStart=local+30+localNameLength+localExtra
  if(dataStart+packed>start||v.getUint16(local+6,true)!==flags||v.getUint16(local+8,true)!==method||new TextDecoder().decode(bytes.slice(local+30,local+30+localNameLength))!==name)throw Error('ZIP本地路径或文件范围不一致。')
  ranges.push({start:local,end:dataStart+packed});entries.set(name,unpacked);pos+=46+nameLength+extra+comment
 }
 ranges.sort((a,b)=>a.start-b.start)
 if(pos!==end||!entries.has('manifest.json')||ranges.some((r,i)=>i>0&&r.start<ranges[i-1].end))throw Error('ZIP目录、重叠文件或manifest缺失。')
 return entries
}
function readBounded(file:JSZipObject,limit:number,expected:number):Promise<Blob>{
 return new Promise((resolve,reject)=>{
  let size=0,failed=false;const chunks:ArrayBuffer[]=[];const stream=(file as JSZipObject & {internalStream:(type:'uint8array')=>JSZip.JSZipStreamHelper<Uint8Array>}).internalStream('uint8array')
  stream.on('data',(chunk:Uint8Array)=>{if(failed)return;size+=chunk.byteLength;if(size>limit||size>expected){failed=true;stream.pause();reject(Error('ZIP实际解压量超过声明或安全上限。'));return}chunks.push(new Uint8Array(chunk).buffer)})
  stream.on('error',reject).on('end',()=>{if(!failed){if(size!==expected)reject(Error('ZIP实际长度与目录不一致。'));else resolve(new Blob(chunks))}}).resume()
 })
}
export async function exportBackup(repo:FootprintRepository){
 const snapshot=await repo.snapshot();const zip=new JSZip();const photos:Metadata[]=[]
 for(const p of snapshot.photos){
  const {blob,thumbnailBlob,...meta}=p;void thumbnailBlob
  const path=`photos/${p.cityCode}/${p.photoId}.${extension(p.mimeType)}`
  photos.push({...meta,path,sha256:await digest(blob)})
  zip.file(path,await blob.arrayBuffer(),{createFolders:false})
 }
 const manifest:Manifest={schemaVersion:1,exportedAt:new Date().toISOString(),visits:snapshot.visits,photos}
 const manifestText=JSON.stringify(manifest)
 if(new Blob([manifestText]).size>MANIFEST_LIMIT)throw Error('备份元数据超过16MB，请先减少备注或联系维护者。')
 zip.file('manifest.json',manifestText,{createFolders:false})
 return zip.generateAsync({type:'blob',compression:'STORE'})
}
/** All paths, ownership, hashes and decoded images are validated before a single DB write. */
export async function importBackup(blob:Blob,repo:FootprintRepository,mode:'merge'|'replace',processor=processImage){
 if(blob.size>MAX_ZIP)throw Error('压缩包超过180MB。')
 const bytes=new Uint8Array(await blob.arrayBuffer()),entries=inspectZip(bytes)
 const zip=await JSZip.loadAsync(bytes)
 if(Object.values(zip.files).some((f)=>f.dir||(f.unsafeOriginalName&&f.unsafeOriginalName!==f.name)))throw Error('ZIP路径不安全。')
 const manifestBlob=await readBounded(zip.file('manifest.json')!,MANIFEST_LIMIT,entries.get('manifest.json')!)
 let m:Manifest
 try{m=JSON.parse(await manifestBlob.text()) as Manifest}catch{throw Error('备份manifest不是有效JSON。')}
 if(!m||m.schemaVersion!==1||!Array.isArray(m.visits)||!Array.isArray(m.photos)||m.visits.length>repo.cityCodes.size||m.photos.length>MAX_PHOTOS||entries.size!==m.photos.length+1)throw Error('备份版本、记录数或文件关联无效。')
 const visits=m.visits.map((v)=>repo.validateVisit(v)),cityCodes=new Set(visits.map((v)=>v.cityCode)),ids=new Set<string>(),paths=new Set<string>()
 if(cityCodes.size!==visits.length)throw Error('备份城市代码重复。')
 const photos:Photo[]=[];let total=0
 for(const meta of m.photos){
  if(!meta||typeof meta!=='object'||typeof meta.photoId!=='string'||!/^[a-zA-Z0-9-]{1,80}$/.test(meta.photoId)||ids.has(meta.photoId)||!cityCodes.has(meta.cityCode)||!extension(meta.mimeType)||meta.path!==`photos/${meta.cityCode}/${meta.photoId}.${extension(meta.mimeType)}`||!entries.has(meta.path)||paths.has(meta.path)||! /^[0-9a-f]{64}$/.test(meta.sha256))throw Error('备份照片ID、归属、类型或路径无效。')
  ids.add(meta.photoId);paths.add(meta.path)
  const raw=await readBounded(zip.file(meta.path)!,MAX_PHOTO_BYTES,entries.get(meta.path)!),photoBlob=new Blob([raw],{type:meta.mimeType})
  if(!imageSignature(new Uint8Array(await photoBlob.slice(0,16).arrayBuffer()),meta.mimeType)||await digest(photoBlob)!==meta.sha256)throw Error('备份照片签名或SHA256校验失败。')
  const thumbnailBlob=await processor(photoBlob);total+=photoBlob.size+thumbnailBlob.size;if(total>MAX_LIBRARY_BYTES)throw Error('恢复照片总容量超过160MB。')
  const photo:Photo={photoId:meta.photoId,cityCode:meta.cityCode,mimeType:meta.mimeType,fileName:meta.fileName,caption:meta.caption,takenAt:meta.takenAt,sortOrder:meta.sortOrder,createdAt:meta.createdAt,blob:photoBlob,thumbnailBlob}
  repo.validatePhoto(photo);photos.push(photo)
 }
 await repo.restore(visits,photos,mode)
 return {visits:visits.length,photos:photos.length}
}
