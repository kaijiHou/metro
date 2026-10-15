export type StationExit = {
  id:string; cityId:string; stationId:string; ref?:string; name?:string; lng:number; lat:number; exitTo?:string[]
  wheelchair:'yes'|'no'|'limited'|'unknown'; source:'osm'|'official'|'user'; sourceUrl?:string; fetchedAt?:string
  confidence:'verified'|'probable'|'unverified'
}
export type StationExitResult = {stationId:string;status:'available'|'partial'|'unavailable'|'error';exits:StationExit[];message?:string}
