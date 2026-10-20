import type {Plugin} from 'vite'
export function sharedFootprintPlugin():Plugin
export function openFootprintStore(root:string,folder?:string):{
 file:string;revision:()=>number;close:()=>void;
 visits:()=>import('../src/footprint/types').Visit[];
 photos:(code:string)=>unknown[];photo:(id:string)=>unknown;snapshot:()=>unknown;
 mutate:(action:string,body:unknown)=>{revision:number};
}
