import {it} from 'node:test'
import assert from 'node:assert/strict'
import {mkdtempSync,writeFileSync,readdirSync,unlinkSync,rmdirSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join,resolve} from 'node:path'
import {openFootprintStore} from './footprint-server.mjs'
import {blankVisit} from '../src/footprint/types'
const root=resolve('.'),wuhan='ocha2020-CN042120',changsha='ocha2020-CN043010'
const image='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1EAAAAASUVORK5CYII='
const photo={photoId:'shared-photo',cityCode:wuhan,mimeType:'image/png',fileName:'synthetic.png',caption:'本机共享',takenAt:'',sortOrder:0,createdAt:'2026-10-20T00:00:00.000Z',original:image,thumbnail:image,thumbnailMime:'image/png'}
function fixture(){
 const folder=mkdtempSync(join(tmpdir(),'metro-shared-test-'))
 writeFileSync(join(folder,'README.md'),'Isolated synthetic shared storage test. No user data.\n')
 const store=openFootprintStore(root,folder)
 return {folder,store,close:()=>{store.close();for(const name of readdirSync(folder))unlinkSync(join(folder,name));rmdirSync(folder)}}
}
it('SQLite survives reopen and two independent connections share updates without overwriting other cities',()=>{
 const f=fixture(),other=openFootprintStore(root,f.folder)
 try{
  f.store.mutate('visit',{code:wuhan,patch:{status:'visited',note:'武汉'},expectedUpdatedAt:''})
  other.mutate('visit',{code:changsha,patch:{status:'visited'},expectedUpdatedAt:''})
  assert.equal(f.store.visits().length,2);assert.equal(other.visits().find(v=>v.cityCode===wuhan)!.note,'武汉')
  assert.throws(()=>other.mutate('visit',{code:wuhan,patch:{note:'stale'},expectedUpdatedAt:''}))
  assert.equal(other.visits().find(v=>v.cityCode===wuhan)!.note,'武汉')
  other.close()
  const reopened=openFootprintStore(root,f.folder)
  try{assert.equal(reopened.visits().length,2);assert.equal(reopened.revision(),2)}finally{reopened.close()}
  assert.deepEqual(readdirSync(f.folder).sort(),['README.md','travel.sqlite'])
 }finally{f.close()}
})
it('shared photo bytes, cover, metadata and ZIP-style restore are atomic and ownership validated',()=>{
 const f=fixture()
 try{
  f.store.mutate('add-photo',{code:wuhan,photo})
  assert.equal((f.store.photo(photo.photoId) as typeof photo).original,image)
  assert.equal(f.store.visits()[0].coverPhotoId,photo.photoId)
  const before=f.store.snapshot(),revision=f.store.revision()
  assert.throws(()=>f.store.mutate('restore',{mode:'replace',expectedRevision:revision,visits:[blankVisit(changsha)],photos:[photo]}))
  assert.deepEqual(f.store.snapshot(),before);assert.equal(f.store.revision(),revision)
  assert.throws(()=>f.store.mutate('add-photo',{code:wuhan,photo:{...photo,photoId:'bad',original:'AAAA'}}))
  assert.throws(()=>f.store.mutate('restore',{mode:'replace',expectedRevision:0,visits:[],photos:[]}))
  f.store.mutate('update-photo',{code:wuhan,id:photo.photoId,patch:{caption:'已修改'}})
  assert.equal((f.store.photo(photo.photoId) as typeof photo).caption,'已修改')
  f.store.mutate('delete-photo',{code:wuhan,id:photo.photoId})
  assert.equal(f.store.visits()[0].coverPhotoId,undefined)
  f.store.mutate('restore',{...before as object,mode:'merge'})
  assert.equal((f.store.photo(photo.photoId) as typeof photo).original,image)
 }finally{f.close()}
})
it('browser migration is idempotent, preserves newer shared edits and does not resurrect deleted records',()=>{
 const f=fixture()
 try{
  const visit={...blankVisit(wuhan),status:'visited',note:'旧资料',updatedAt:'2020-01-01T00:00:00.000Z'}
  f.store.mutate('migrate',{clientId:'browser-a',mode:'merge',visits:[visit],photos:[]})
  f.store.mutate('visit',{code:wuhan,patch:{note:'共享文件的新备注'}})
  f.store.mutate('migrate',{clientId:'browser-b',mode:'merge',visits:[visit],photos:[]})
  assert.equal(f.store.visits()[0].note,'共享文件的新备注')
  f.store.mutate('delete-city',{code:wuhan})
  f.store.mutate('migrate',{clientId:'browser-a',mode:'merge',visits:[visit],photos:[]})
  f.store.mutate('migrate',{clientId:'browser-c',mode:'merge',visits:[visit],photos:[]})
  assert.deepEqual(f.store.visits(),[])
  f.store.mutate('restore',{mode:'merge',visits:[{...visit,note:'UTC',updatedAt:'2050-01-01T00:00:00Z'}],photos:[]})
  f.store.mutate('migrate',{clientId:'browser-zone',mode:'merge',visits:[{...visit,note:'实际较新',updatedAt:'2049-12-31T23:00:00-03:00'}],photos:[]})
  assert.equal(f.store.visits()[0].note,'实际较新')
 }finally{f.close()}
})
