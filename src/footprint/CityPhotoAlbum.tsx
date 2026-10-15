import {useEffect,useRef,useState} from 'react'
import type {Photo,Visit} from './types'
import type {FootprintRepository} from './repository'
import {defaultPhotos} from './defaultPhotos'
import {processImage} from './imageProcessing'
import {storageError} from './types'
function useBlobUrl(blob:Blob|undefined){const [url,setUrl]=useState('');useEffect(()=>{if(!blob){setUrl('');return}const next=URL.createObjectURL(blob);setUrl(next);return()=>URL.revokeObjectURL(next)},[blob]);return url}
function Thumbnail({photo}:{photo:Photo}){const url=useBlobUrl(photo.thumbnailBlob);return <img src={url||undefined} alt={photo.caption||photo.fileName} loading="lazy"/>}
function PhotoEditor({photo,onSave,disabled}:{photo:Photo;disabled:boolean;onSave:(caption:string,takenAt:string)=>void}){
 const [caption,setCaption]=useState(photo.caption),[takenAt,setTakenAt]=useState(photo.takenAt)
 return <fieldset disabled={disabled} className="footprint-photo-edit"><label>照片说明<input aria-label="照片说明" maxLength={1000} value={caption} onChange={(e)=>setCaption(e.target.value)}/></label><label>照片日期<input aria-label="照片日期" type="date" value={takenAt} onChange={(e)=>setTakenAt(e.target.value)}/></label><button onClick={()=>onSave(caption,takenAt)}>保存照片说明</button></fieldset>
}
export function CityPhotoAlbum({code,name,visit,repo,version,onChange,onMessage,disabled,onUploadState}:{code:string;name:string;visit:Visit;repo:FootprintRepository;version:number;onChange:()=>void;onMessage:(message:string)=>void;disabled:boolean;onUploadState:(busy:boolean)=>void}){
 const [photos,setPhotos]=useState<Photo[]>([]),[error,setError]=useState(''),[loading,setLoading]=useState(true),[tab,setTab]=useState('all'),[activeId,setActive]=useState(''),[uploading,setUploading]=useState(false),[progress,setProgress]=useState<string[]>([])
 const input=useRef<HTMLInputElement>(null),dialog=useRef<HTMLDialogElement>(null),swipe=useRef(0),alive=useRef(true)
 useEffect(()=>{alive.current=true;const element=input.current;const cancel=()=>onMessage('未选择照片，已有相册保持。');element?.addEventListener('cancel',cancel);return()=>{alive.current=false;element?.removeEventListener('cancel',cancel)}},[onMessage])
 useEffect(()=>{let current=true;setLoading(true);void repo.photos(code).then((p)=>{if(current){setPhotos(p);setError('')}}).catch((e)=>{if(current)setError(storageError(e))}).finally(()=>{if(current)setLoading(false)});return()=>{current=false}},[repo,code,version])
 const defaults=defaultPhotos.filter((p)=>p.cityCode===code)
 const items=[...(tab==='mine'?[]:defaults.map((p)=>({id:p.id,kind:'default' as const,value:p}))),...(tab==='default'?[]:photos.map((p)=>({id:p.photoId,kind:'user' as const,value:p})))]
 const active=items.find((p)=>p.id===activeId)??items.find((p)=>p.id===visit.coverPhotoId)??items[0]
 const own=active?.kind==='user'?active.value:undefined
 const blobUrl=useBlobUrl(own?.blob)
 const url=active?.kind==='default'?active.value.url:blobUrl
 const index=items.findIndex((p)=>p.id===active?.id)
 const move=(delta:number)=>{if(items.length)setActive(items[(index+delta+items.length)%items.length].id)}
 const act=async(action:()=>Promise<void>,message:string)=>{try{await action();onChange();onMessage(message)}catch(e){onMessage(storageError(e))}}
 const upload=async(files:File[])=>{
  if(!files.length){onMessage('未选择照片，已有相册保持。');return}
  if(files.length>50){onMessage('一次最多选择50张照片。');return}
  onUploadState(true);setUploading(true);setProgress([])
  let saved=0;const failures:string[]=[]
  for(const file of files){
   let message:string
   try{const thumbnailBlob=await processImage(file);await repo.addPhoto({photoId:`p-${crypto.randomUUID()}`,cityCode:code,blob:file,thumbnailBlob,mimeType:file.type,fileName:file.name,caption:'',takenAt:'',sortOrder:0,createdAt:new Date().toISOString()});message=`${file.name}：已保存`;saved++;onChange()}
   catch(e){message=`${file.name}：${storageError(e)}`;failures.push(message)}
   if(alive.current)setProgress((p)=>[...p,message])
  }
  if(alive.current)setUploading(false)
  onUploadState(false);onMessage(`${name}：保存${saved}张。${failures.join("；")}`)
 }
 return <section className="footprint-album" aria-label="城市相册" onKeyDown={(e)=>{if((e.target as HTMLElement).matches('input,textarea'))return;if(e.key==='ArrowLeft'){e.preventDefault();move(-1)}if(e.key==='ArrowRight'){e.preventDefault();move(1)}}}>
  <div className="section-header"><h3>城市相册</h3><button disabled={disabled||uploading} onClick={()=>input.current?.click()}>上传照片</button></div>
  <p className="quiet">我的照片仅存本浏览器，不会自动上传。单张20MB，全部相册共300张/160MB。</p>
  <input hidden ref={input} type="file" multiple accept="image/jpeg,image/png,image/webp" aria-label="上传城市照片" onChange={(e)=>{const files=Array.from(e.target.files??[]);e.target.value='';void upload(files)}}/>
  <div className="footprint-photo-tabs" role="group" aria-label="照片筛选">{[['all','全部照片',defaults.length+photos.length],['default','城市默认',defaults.length],['mine','我的照片',photos.length]].map(([key,label,count])=><button key={key} aria-pressed={tab===key} onClick={()=>{setTab(String(key));setActive('')}}>{label} <span>{count}</span></button>)}</div>
  {loading&&<p role="status">读取相册…</p>}{error&&<p role="alert">{error}<button onClick={onChange}>重试相册</button></p>}
  {active?<><figure className="footprint-main-photo" onTouchStart={(e)=>{swipe.current=e.touches[0].clientX}} onTouchEnd={(e)=>{const d=e.changedTouches[0].clientX-swipe.current;if(Math.abs(d)>40)move(d>0?-1:1)}}><button className="footprint-image-button" onClick={()=>dialog.current?.showModal()} aria-label="放大当前照片"><img src={url||undefined} alt={active.kind==='user'?(active.value.caption||active.value.fileName):active.value.title}/></button><figcaption>{active.kind==='default'?<><strong>系统默认 · {active.value.title}</strong><a href={active.value.source} target="_blank" rel="noreferrer">{active.value.author}</a><a href={active.value.licenseUrl} target="_blank" rel="noreferrer">{active.value.license}</a></>:<><strong>我的照片 · {own!.caption||own!.fileName}</strong><small>{visit.coverPhotoId===own!.photoId?'城市封面 · ':''}{own!.takenAt||'未填日期'}</small></>}</figcaption></figure>
  <div className="footprint-photo-pager"><button disabled={items.length<2} onClick={()=>move(-1)} aria-label="上一张照片">←</button><span>{index+1} / {items.length}</span><button disabled={items.length<2} onClick={()=>move(1)} aria-label="下一张照片">→</button></div>
  <div className="footprint-thumbnails">{items.map((item)=><button key={item.id} aria-label={`查看照片 ${item.kind==='user'?item.value.fileName:item.value.title}`} aria-pressed={active.id===item.id} onClick={()=>setActive(item.id)}>{item.kind==='user'?<Thumbnail photo={item.value}/>:<img src={item.value.url} alt={item.value.title} loading="lazy"/>}</button>)}</div>
  {own&&<><div className="footprint-photo-actions"><button disabled={disabled||visit.coverPhotoId===own.photoId} onClick={()=>void act(()=>repo.cover(code,own.photoId),'城市封面已保存。')}>设为城市封面</button><button disabled={disabled} onClick={()=>void act(()=>repo.reorder(code,own.photoId,-1),'照片顺序已保存。')}>向前移</button><button disabled={disabled} onClick={()=>void act(()=>repo.reorder(code,own.photoId,1),'照片顺序已保存。')}>向后移</button><button disabled={disabled} onClick={()=>{if(confirm('删除这张个人照片？此操作不会删除系统默认图。'))void act(()=>repo.deletePhoto(code,own.photoId),'个人照片已删除，封面已自动回退。')}}>删除照片</button></div><PhotoEditor key={`${own.photoId}:${own.caption}:${own.takenAt}`} photo={own} disabled={disabled} onSave={(caption,takenAt)=>void act(()=>repo.updatePhoto(code,own.photoId,{caption,takenAt}),'照片说明已保存。')}/></>}
  <dialog ref={dialog} className="footprint-lightbox"><button onClick={()=>dialog.current?.close()} aria-label="关闭大图">关闭</button><img src={url||undefined} alt={`${name}相册大图`}/><div><button onClick={()=>move(-1)}>上一张</button><button onClick={()=>move(1)}>下一张</button></div></dialog></>:<div className="footprint-photo-placeholder"><span>{name.replace(/市$/,'')}</span><p>{tab==='mine'?'还没有个人照片，点击上传。':'该城市暂无默认照片；可上传自己的旅行照片。'}</p><small>城市文字占位 · 非实拍风景</small></div>}
  {uploading&&<p role="status">逐张校验并保存中…</p>}<ul className="footprint-upload-progress" aria-live="polite">{progress.map((message,i)=><li key={i}>{message}</li>)}</ul>
 </section>
}
