import metro from '../data/wuhan-service.json'
import trams from '../data/wuhan-tram-service.json'

export type ServiceDirection={name:string;columns:string[];rows:string[][]}
export type ServiceTable={title:string;directions:ServiceDirection[]}
export type ServiceLine={id:string;name:string;transport:'metro'|'tram';quality:'official'|'reference';publishedAt:string;sourceUrl:string;provider?:string;note?:string;references?:string[];tables:ServiceTable[]}
export const wuhanServiceLines=[...metro.lines,...trams.lines] as ServiceLine[]
export const serviceCheckedAt=metro.checkedAt
export const serviceHeadways=trams.headways as Record<string,string>
export const headwaySource=trams.headwaySource
export const serviceSourceOld=(publishedAt:string)=>!!publishedAt&&(Date.parse(serviceCheckedAt)-Date.parse(publishedAt))/86400000>180

export function serviceLineId(name:string):string|null{
 if(/阳逻/.test(name))return '21'
 if(/车都.*T1/.test(name))return 'T1'
 const tram=name.match(/光谷.*L([123])/i);if(tram)return `L${tram[1]}`
 const metro=name.match(/^(\d+)号线/);return metro&&wuhanServiceLines.some(l=>l.id===metro[1])?metro[1]:null
}

export function scheduleTime(text:string):string{
 const match=text.match(/^(\d{1,2})[:：](\d{2})(.*)$/)
 if(!match)return text
 const hour=Number(match[1])
 return `${hour<4||hour>=24?'次日 ':''}${String(hour%24).padStart(2,'0')}:${match[2]}${match[3]}`
}
