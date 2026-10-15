import {MAX_PHOTO_BYTES} from './types'
export function imageSignature(bytes:Uint8Array,mime:string){
 if(mime==='image/jpeg')return bytes[0]===255&&bytes[1]===216&&bytes[2]===255
 if(mime==='image/png')return [137,80,78,71,13,10,26,10].every((b,i)=>bytes[i]===b)
 if(mime==='image/webp')return new TextDecoder().decode(bytes.slice(0,4))==='RIFF'&&new TextDecoder().decode(bytes.slice(8,12))==='WEBP'
 return false
}
export async function processImage(blob:Blob):Promise<Blob>{
 if(blob.size>MAX_PHOTO_BYTES||!blob.size||!imageSignature(new Uint8Array(await blob.slice(0,16).arrayBuffer()),blob.type))throw Error('请选择20MB以内的JPEG/PNG/WebP真实图片；HEIC不支持。')
 let bitmap:ImageBitmap
 try{bitmap=await createImageBitmap(blob,{imageOrientation:'from-image'})}catch{throw Error('图片损坏或浏览器无法解码，未保存。')}
 try{
  if(bitmap.width*bitmap.height>40000000||!bitmap.width||!bitmap.height)throw Error('图片超过4000万像素，请缩小后再上传。')
  const scale=Math.min(1,360/Math.max(bitmap.width,bitmap.height));const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale))
  const context=canvas.getContext('2d');if(!context)throw Error('浏览器不能生成缩略图。');context.drawImage(bitmap,0,0,canvas.width,canvas.height)
  return await new Promise<Blob>((resolve,reject)=>canvas.toBlob((thumb)=>thumb?resolve(thumb):reject(Error('生成缩略图失败。')),'image/webp',0.8))
 }finally{bitmap.close()}
}
export async function digest(blob:Blob){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer()))].map((b)=>b.toString(16).padStart(2,'0')).join('')}
