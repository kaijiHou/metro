import {useEffect,useId,useRef,useState} from 'react'
import {headwaySource,serviceCheckedAt,serviceHeadways,serviceLineId,serviceSourceOld,wuhanServiceLines,scheduleTime} from '../utils/wuhanService'

function ServiceDialog({lineName,stationName,onClose}:{lineName?:string;stationName?:string;onClose:()=>void}){
 const ref=useRef<HTMLDialogElement>(null),id=useId()
 const [selected,setSelected]=useState(lineName?serviceLineId(lineName)??'':'1'),[tableIndex,setTableIndex]=useState(0),[directionIndex,setDirectionIndex]=useState(0),[query,setQuery]=useState(stationName??'')
 const line=wuhanServiceLines.find(l=>l.id===selected),table=line?.tables[tableIndex],direction=table?.directions[directionIndex]
 const rows=direction?.rows.filter(row=>row[0].replace(/\s+/g,'').includes(query.trim().replace(/\s+/g,'')))??[]
 useEffect(()=>{const element=ref.current;element?.showModal();return()=>element?.close()},[])
 return <dialog ref={ref} className="project-dialog service-dialog" aria-labelledby={id} onCancel={e=>{e.preventDefault();onClose()}}>
  <div className="section-header"><div><span className="eyebrow">武汉 · 地铁与有轨电车</span><h2 id={id}>首末班与运营时间</h2></div><button type="button" onClick={onClose} aria-label="关闭运营时间">×</button></div>
  <p className="service-info">整理核对：{serviceCheckedAt}。这是公开首末班表，<strong>不是实时到站或每班列车时刻表</strong>。临时停运、节假日调整请核对运营公告。</p>
  <div className="service-filters"><div><label htmlFor={`${id}-line`}>线路</label><select id={`${id}-line`} value={selected} onChange={e=>{setSelected(e.target.value);setTableIndex(0);setDirectionIndex(0);setQuery('')}}>
   {!selected&&<option value="">{lineName}暂无公开运营表</option>}{wuhanServiceLines.map(l=><option value={l.id} key={l.id}>{l.name}{l.quality==='reference'?' · 参考':''}</option>)}
  </select></div>{line&&<div><label htmlFor={`${id}-day`}>适用时段／版本</label><select id={`${id}-day`} value={tableIndex} onChange={e=>{setTableIndex(Number(e.target.value));setDirectionIndex(0)}}>{line.tables.map((t,i)=><option key={i} value={i}>{t.title}</option>)}</select></div>}</div>
  {line&&table&&direction?<>
   <p className="service-source"><strong>{line.quality==='official'?'官方来源':'第三方参考 · 待复核'}</strong> · {line.provider??'武汉地铁集团官网'} · 来源发布：{line.publishedAt||'未注明可靠生效日期'} <a href={line.sourceUrl} target="_blank" rel="noreferrer">查看原文</a></p>
   {serviceSourceOld(line.publishedAt)&&<p className="journey-warning">此资料发布已超过半年，出行前请核对运营方当前公告。</p>}
   {line.id==='12'&&<p className="service-info">官网当前表涵盖墨水湖公园—钢都花园一期23站；未将它扩写成全环时刻表。</p>}
   {line.note&&<p className="service-info">{line.note}</p>}
   <div className="service-filters"><div><label htmlFor={`${id}-direction`}>乘车方向</label><select id={`${id}-direction`} value={directionIndex} onChange={e=>setDirectionIndex(Number(e.target.value))}>{table.directions.map((d,i)=><option value={i} key={i}>{d.name}</option>)}</select></div><div><label htmlFor={`${id}-station`}>搜索站名</label><input id={`${id}-station`} value={query} onChange={e=>setQuery(e.target.value)} placeholder="输入站名，留空看全部" autoComplete="off"/></div></div>
   <div className="service-table-scroll" role="region" aria-label="车站首末班时刻表" tabIndex={0}><table className="service-table"><caption>{line.name} · {table.title} · {direction.name}</caption><thead><tr>{direction.columns.map((c,i)=><th key={i} scope="col">{c}</th>)}</tr></thead><tbody>{rows.map((row,i)=><tr key={i}>{row.map((cell,j)=>j===0?<th scope="row" key={j}>{cell}</th>:<td key={j}>{scheduleTime(cell)}</td>)}</tr>)}</tbody></table>{!rows.length&&<p role="status">这版时刻表没有匹配站点。可清空搜索查看全表；电车资料目前仅有两端发车时间，规划站或改名站也可能未收录。</p>}</div>
   <p className="quiet">“次日”按上一运营日延续；“到达／到点”是终点到达时刻，不能当作本站可上车的发车时间。“—”保持原文缺项，不代表00:00。调休与节假日不能只按周末判断。</p>
   <details><summary>发车间隔与实时到站</summary>{serviceHeadways[line.id]?<p>{serviceHeadways[line.id]}<br/><a href={headwaySource.url} target="_blank" rel="noreferrer">{headwaySource.provider} · {headwaySource.publishedAt}</a>。这些是特定时段的最小间隔，不是全天固定间隔。</p>:<p>暂无已核实的现行完整间隔表；电车若有第三方参考，已在上方注明。</p>}<p>目前未接入官方实时列车位置或下一班到站数据，不能给出可靠的“还有几分钟到站”。请以站台显示屏与运营方乘车服务为准；路线中的预计抵达时间只是行程估算。</p></details>
   {!!line.references?.length&&<details><summary>其他核对来源</summary>{line.references.map((url,i)=><p key={url}><a href={url} target="_blank" rel="noreferrer">核对来源 {i+1}</a></p>)}</details>}
  </>:<p>这条线路暂未取得运营时刻表。可选择上方已整理的13条地铁线或4条电车交路；规划线路不套用已开通线路的时间。</p>}
 </dialog>
}

export function WuhanServicePanel({lineName,stationName}:{lineName?:string;stationName?:string}){
 const [open,setOpen]=useState(false)
 return <><button type="button" className="text-action service-open" onClick={()=>setOpen(true)}>{lineName?'查这条线的首末班':'武汉首末班与运营时间'}</button>{open&&<ServiceDialog lineName={lineName} stationName={stationName} onClose={()=>setOpen(false)}/>}</>
}
