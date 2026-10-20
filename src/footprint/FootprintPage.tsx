import './footprint.css'
import {useEffect,useMemo,useRef,useState} from 'react'
import {getCatalog,footprintStats,allRegions,provinceProgress,countyCities,litRegions} from './adminCatalog'
import {ProvincePanel} from './ProvincePanel'
import type {FootprintStore} from './repository'
import {SharedFootprintRepository} from './sharedRepository'
import {FootprintMap} from './FootprintMap'
import {CityBanner,TravelMemories} from './TravelMemories'
import {CityPhotoAlbum} from './CityPhotoAlbum'
import {blankVisit,dateValid,storageError,type Catalog,type City,type Visit} from './types'
import {exportBackup,importBackup} from './backup'
import {useViewStore} from '../store/viewStore'
let lastUi={selected:null as string|null,query:'',province:''}
function CityDetail({city,visit,inherited,repo,version,changed,message,busy,setBusy,onClose}:{city:City;visit:Visit;inherited:City[];repo:FootprintStore;version:number;changed:()=>void;message:(text:string)=>void;busy:boolean;setBusy:(busy:boolean)=>void;onClose:()=>void}){
 const [note,setNote]=useState(visit.note),[dates,setDates]=useState(visit.visitedDates),[date,setDate]=useState('')
 const dateKey=visit.visitedDates.join(',')
 const previous=useRef({note:visit.note,dateKey})
 useEffect(()=>{const old=previous.current;setNote(value=>value===old.note?visit.note:value);setDates(value=>value.join(',')===old.dateKey?(dateKey?dateKey.split(','):[]):value);previous.current={note:visit.note,dateKey}},[visit.note,dateKey])
 const save=async(status=visit.status)=>{try{await repo.saveVisit(city.cityCode,{status,note,visitedDates:dates});changed();message('城市旅行记录已保存到本机共享文件。')}catch(e){message(storageError(e))}}
 return <aside className="footprint-detail" aria-label="城市旅行详情"><div className="section-header"><span className="eyebrow">城市详情</span><button onClick={onClose} aria-label="关闭城市详情">×</button></div><CityBanner city={city} visit={inherited.length?{...visit,status:'visited'}:visit} repo={repo} version={version}/><p className="footprint-visit-state">{visit.status==='visited'||inherited.length?'● 已到过':'○ 尚未点亮'}</p>{inherited.length>0&&<p className="quiet">由{inherited.map(c=>c.name).join('、')}点亮整个{city.name}。要取消这部分点亮，请修改对应县级市。</p>}
 <button className="button-primary" disabled={busy} onClick={()=>void save(visit.status==='visited'?'unvisited':'visited')}>{visit.status==='visited'?(inherited.length?'取消单独点亮':'取消点亮'):(inherited.length?'单独标记已到过':'标记已到过')}</button><p className="quiet">取消点亮会保留照片、备注与访问日期。</p>
 <fieldset disabled={busy}><legend>到访日期（选填，可多次）</legend><div className="footprint-date-add"><input type="date" aria-label="新增到访日期" value={date} onChange={(e)=>setDate(e.target.value)}/><button onClick={()=>{if(!dateValid(date)){message('请先选择有效的到访日期。');return}setDates((v)=>[...new Set([...v,date])].sort());setDate('')}}>添加日期</button></div><div className="footprint-dates">{dates.map((d,i)=><label key={i}><input type="date" aria-label={`到访日期 ${i+1}`} value={d} onChange={(e)=>setDates((values)=>values.map((v,j)=>i===j?e.target.value:v))}/><button aria-label={`移除日期 ${d}`} onClick={()=>setDates((v)=>v.filter((_,j)=>j!==i))}>×</button></label>)}</div><label>城市备注<textarea aria-label="城市旅行备注" value={note} maxLength={5000} onChange={(e)=>setNote(e.target.value)} rows={3}/></label><button onClick={()=>void save()}>保存日期与备注</button></fieldset>
 <CityPhotoAlbum code={city.cityCode} name={city.name} visit={visit} repo={repo} version={version} onChange={changed} onMessage={message} disabled={busy} onUploadState={setBusy}/>
 <details className="footprint-city-source"><summary>边界与资料管理</summary><p>代码：{city.cityCode}（版本化内部代码，非现行GB/T代码）。{city.kind==='county'?'2017历史县级边界：OpenStreetMap contributors / Lee Beryman / geoBoundaries，ODbL 1.0；本项目核对中文名、省市归属及几何。':'市级边界：OCHA/HDX、ITOS，CC BY 3.0 IGO；2020资源，含市级筛选与莱芜合并。'}</p><a href={city.kind==='county'?'https://www.geoboundaries.org/api/current/gbOpen/CHN/ADM3/':'https://data.humdata.org/dataset/cod-ab-chn'} target="_blank" rel="noreferrer">原始来源与许可</a><button disabled={busy} onClick={async()=>{if(!confirm(`删除${city.name}的全部本地旅行记录和个人照片？不可撤销，请先导出ZIP备份。`))return;try{await repo.deleteCity(city.cityCode);changed();message('该地区旅行资料已删除，地铁项目未改动。')}catch(e){message(storageError(e))}}}>删除该地区全部旅行资料</button></details>
 </aside>
}
export default function FootprintPage(){
 const [catalog,setCatalog]=useState<Catalog|null>(null),[catalogError,setCatalogError]=useState(''),[retry,setRetry]=useState(0)
 const [visits,setVisits]=useState<Visit[]>([]),[ready,setReady]=useState(false),[connected,setConnected]=useState(false),[version,setVersion]=useState(0),[message,setMessage]=useState(''),[storage,setStorage]=useState('')
 const [selected,setSelected]=useState(lastUi.selected),[query,setQuery]=useState(lastUi.query),[province,setProvince]=useState(lastUi.province),[restoreMode,setRestoreMode]=useState<'merge'|'replace'>('merge'),[overviewToken,setOverviewToken]=useState(0)
 const input=useRef<HTMLInputElement>(null),downloads=useRef(new Set<string>())
 const busy=useViewStore((s)=>s.travelBusy),setBusy=useViewStore((s)=>s.setTravelBusy)
 useEffect(()=>{lastUi={selected,query,province}},[selected,query,province])
 useEffect(()=>{let active=true;setCatalogError('');void getCatalog().then((c)=>{if(active)setCatalog(c)}).catch((e)=>{if(active)setCatalogError(String(e))});return()=>{active=false}},[retry])
 const repo=useMemo(()=>catalog?new SharedFootprintRepository(new Set(allRegions(catalog).map((c)=>c.cityCode))):null,[catalog])
 useEffect(()=>{if(!repo)return;let active=true;setConnected(false);setReady(false);void repo.initialize().then(info=>{if(active){setConnected(true);setStorage(info.file);setMessage(repo.migrationWarning)}}).catch(e=>{if(active)setMessage(storageError(e))});return()=>{active=false}},[repo,retry])
 useEffect(()=>{if(!repo||!connected)return;let active=true;void repo.visits().then((v)=>{if(active){setVisits(v);setReady(true)}}).catch((e)=>{if(active){setReady(false);setMessage(storageError(e))}});return()=>{active=false}},[repo,connected,version])
 useEffect(()=>{const urls=downloads.current;return()=>{for(const url of urls)URL.revokeObjectURL(url);urls.clear()}},[])
 useEffect(()=>{
  if(!repo||!connected)return
  let active=true,pending=false,seen=-1
  const refresh=async()=>{if(pending)return;pending=true;try{const info=await repo.status();if(active&&info.revision!==seen){if(seen<0&&!repo.migrationWarning)setMessage('');seen=info.revision;setVersion(n=>n+1)}}catch(e){seen=-1;if(active){setReady(false);setMessage(storageError(e))}}finally{pending=false}}
  const timer=setInterval(()=>void refresh(),2000);window.addEventListener('focus',refresh);void refresh()
  return()=>{active=false;clearInterval(timer);window.removeEventListener('focus',refresh)}
 },[repo,connected])
 const changed=()=>setVersion((n)=>n+1)
 const exportZip=async()=>{if(!repo)return;setBusy(true);try{const blob=await exportBackup(repo);const url=URL.createObjectURL(blob);downloads.current.add(url);const a=document.createElement('a');a.href=url;a.download=`MetroFootprint-${new Date().toISOString().slice(0,10)}.zip`;a.click();setTimeout(()=>{URL.revokeObjectURL(url);downloads.current.delete(url)},1000);setMessage('完整ZIP备份已生成，含个人照片。请确认下载文件已保存。')}catch(e){setMessage(storageError(e))}finally{setBusy(false)}}
 if(!catalog||!repo)return <main className="footprint-start" role="status">{catalogError||'正在读取省市区县目录…'}{catalogError&&<button onClick={()=>setRetry((n)=>n+1)}>重试城市目录</button>}</main>
 const lit=litRegions(catalog,visits),stats=footprintStats(catalog,visits),visitMap=new Map(visits.map((v)=>[v.cityCode,v])),provinces=provinceProgress(catalog,visits)
 const visitedProvinces=provinces.filter(p=>p.visited).length,regions=[...catalog.cities,...countyCities(catalog)],regionLabel='城市'
 const groups=provinces.map(p=>[p.code,p.name] as const)
 const matches=(city:City)=>!query||[city.name,city.provinceName,city.parentCityName??'',...city.aliases].some((n)=>n.toLowerCase().includes(query.trim().toLowerCase()))
 const chosen=regions.find((c)=>c.cityCode===selected)
 const savedCityVisits=catalog.cities.filter(c=>visitMap.get(c.cityCode)?.status==='visited').length
 const savedCountyVisits=countyCities(catalog).filter(c=>visitMap.get(c.cityCode)?.status==='visited').length
 const choose=(code:string)=>setSelected(code)
 return <main className={`footprint-layout${chosen?' footprint-layout--detail':''}`}>
 <aside className="footprint-sidebar" aria-label="旅行城市导航"><div className="footprint-sidebar-heading"><span className="eyebrow">MY CITY ATLAS</span><h1>我的旅行足迹</h1><p>把走过的城市，留在自己的地图里。</p><div className="footprint-section-links"><button onClick={()=>{setSelected(null);setProvince('');setQuery('');setOverviewToken(n=>n+1);document.querySelector('.footprint-map-canvas')?.scrollIntoView({block:'nearest'})}}>◎ 中国足迹地图</button><button onClick={()=>document.querySelector<HTMLInputElement>('[aria-label="搜索旅行城市"]')?.focus()}>☷ 城市与省份</button><button onClick={()=>{if(!selected)setSelected(visits.find((v)=>v.status==='visited')?.cityCode??regions.find((c)=>c.provinceCode==='CN042')!.cityCode);setTimeout(()=>document.querySelector('.footprint-album')?.scrollIntoView({block:'nearest'}),100)}}>▧ 照片回忆</button><button onClick={()=>document.querySelector('.footprint-backup')?.scrollIntoView({block:'start'})}>⇩ 备份与恢复</button></div></div>
 {ready?<div className="footprint-stats" aria-label="旅行统计"><strong>{stats.visited}<small>已去{regionLabel}</small></strong><strong>{stats.remaining}<small>待探索</small></strong><strong>{visitedProvinces}<small>去过的省份</small></strong><div className="footprint-completion"><span>{(stats.visited/stats.total*100).toFixed(1)}% <small>{regionLabel}完成度</small></span><progress value={stats.visited} max={stats.total}/><span>{(visitedProvinces/groups.length*100).toFixed(1)}% <small>省级区域覆盖</small></span><progress value={visitedProvinces} max={groups.length}/></div><p>{stats.visited} / {stats.total} 个已支持{regionLabel}</p></div>:<p role="alert">共享资料尚未连接或读取成功，未将记录当作空数据。<button onClick={()=>setRetry(n=>n+1)}>重试本地资料</button></p>}
 {ready&&<section className="footprint-storage-status" aria-label="足迹保存状态"><strong>点亮状态自动保存 · 各浏览器共用</strong><p>已保存 {savedCityVisits} 个市级足迹 · {savedCountyVisits} 个县级市足迹</p><small>保存在这台电脑的同一份资料中，切换浏览器也能看到。</small>{savedCityVisits+savedCountyVisits===0&&<p>共享文件暂无点亮记录。旧浏览器记录会自动合并，也可导入 ZIP 恢复。</p>}</section>}
 {ready&&<ProvincePanel catalog={catalog} visits={visits} onSelect={code=>{setProvince(code);setSelected(null);setQuery('')}}/>}
 <p className="quiet">市级地图始终保留。点亮县级市，会同时点亮所属地级市；普通县和区不显示。</p>
 <label className="footprint-search-box">搜索省份、地级市或县级市<input aria-label="搜索旅行城市" value={query} onChange={e=>setQuery(e.target.value)} placeholder="搜索县级市或城市（如：汉川、武汉）"/></label>
 <label>省级区域<select aria-label="筛选省份" value={province} onChange={e=>{setProvince(e.target.value);setSelected(null)}}><option value="">全部省级区域</option>{groups.map(([code,name])=><option key={code} value={code}>{name}</option>)}</select></label>
 <div className="footprint-city-list">{!regions.some(c=>(!province||c.provinceCode===province)&&matches(c))&&<p className="footprint-search-empty" role="status">当前目录没有匹配的{regionLabel}，可查看缺失范围。</p>}{groups.filter(([p])=>!province||p===province).map(([code,name])=>{const local=regions.filter(c=>c.provinceCode===code&&matches(c));if(!local.length)return null;return <details key={code} open={Boolean(query)||Boolean(province)||code==='CN042'}><summary>{name} <small>{stats.byProvince[code]?.visited??0}/{stats.byProvince[code]?.total??0}</small></summary>{local.map(c=><button key={c.cityCode} aria-pressed={selected===c.cityCode} onClick={()=>choose(c.cityCode)}><span>{c.name}{c.kind==='county'&&<small className="footprint-region-parent">{c.parentCityName}</small>}</span><span>{lit.has(c.cityCode)?'已到过':'查看'}</span></button>)}</details>})}</div>
 <details className="footprint-coverage"><summary>当前覆盖与缺失范围</summary><p>当前显示{countyCities(catalog).length}个已核对县级市，采用2017历史边界，非全国最新全覆盖。现名和历史边界可能存在调整差异；未明确核对的区域不猜测、不创建记录。省份统计含34个省级地区；区县资料暂缺时会明确提示。</p><p>原市级目录{catalog.cities.length}个单元继续保留，台湾整省未作为一个城市点亮。普通县、市辖区不显示；完整数据核对项见本地 audit.json。</p></details>
 <section className="footprint-backup"><h3>本地资料与备份</h3><p>资料自动保存到本机共享文件，各浏览器共用。可导出 ZIP，换电脑时导入。</p><button disabled={!ready||busy} onClick={()=>void exportZip()}>导出我的全部旅行足迹 ZIP</button><label>恢复方式<select aria-label="备份恢复方式" value={restoreMode} disabled={busy} onChange={(e)=>setRestoreMode(e.target.value as 'merge'|'replace')}><option value="merge">合并现有资料</option><option value="replace">覆盖旅行足迹资料</option></select></label><p>合并：备份状态/备注优先，同城日期合并，同ID照片只允许属于同城。覆盖：会替换所有浏览器共用的旅行资料，请先备份。</p><button disabled={!ready||busy} onClick={()=>input.current?.click()}>导入旅行足迹 ZIP</button><input hidden type="file" ref={input} accept=".zip,application/zip" aria-label="导入旅行足迹ZIP" onChange={async(e)=>{const file=e.target.files?.[0];e.target.value='';if(!file)return;if(restoreMode==='replace'&&!confirm('覆盖本机共享文件中的全部旅行足迹与个人照片？不会修改地铁项目。请确认已备份。'))return;setBusy(true);try{const result=await importBackup(file,repo,restoreMode);changed();setMessage(`恢复成功：${result.visits}个城市记录，${result.photos}张个人照片。`)}catch(error){setMessage(`恢复未成功，原资料保留。${storageError(error)}`)}finally{setBusy(false)}}}/><small>资料文件：{storage||'正在连接…'}</small></section>
 <p className="footprint-attribution">县级：© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a> / <a href="https://www.geoboundaries.org/" target="_blank" rel="noreferrer">geoBoundaries</a> · <a href="https://opendatacommons.org/licenses/odbl/1-0/" target="_blank" rel="noreferrer">ODbL 1.0</a>；省、市级：© OCHA/HDX COD-AB · ITOS · Metro Planner（市级筛选、莱芜合并） · <a href="https://creativecommons.org/licenses/by/3.0/igo/" target="_blank" rel="noreferrer">CC BY 3.0 IGO</a></p>
 </aside>
 <FootprintMap catalog={catalog} visits={visits} selected={selected} province={province} overviewToken={overviewToken} onSelect={choose} onProvince={code=>{setProvince(code);setSelected(null);setQuery('')}}/>
 {ready&&<TravelMemories cities={regions} visits={visits.filter(v=>regions.some(r=>r.cityCode===v.cityCode))} repo={repo} version={version} onSelect={choose} onList={()=>{setQuery('');setProvince('');document.querySelector('.footprint-city-list')?.scrollIntoView({block:'nearest'})}}/>}
 {chosen&&ready&&<CityDetail key={chosen.cityCode} city={chosen} inherited={countyCities(catalog).filter(c=>c.parentCityCode===chosen.cityCode&&visitMap.get(c.cityCode)?.status==='visited')} visit={visitMap.get(chosen.cityCode)??blankVisit(chosen.cityCode)} repo={repo} version={version} changed={changed} message={setMessage} busy={busy} setBusy={setBusy} onClose={()=>setSelected(null)}/>}
 {(message||busy)&&<div className="footprint-message" role="status" aria-live="polite"><span>{busy?'正在处理本地资料，请稍候…':message}</span>{!busy&&<button aria-label="关闭旅行提示" onClick={()=>setMessage('')}>×</button>}</div>}
 </main>
}
