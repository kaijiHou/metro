import Dexie, {type Table} from 'dexie'
import type {Visit,Photo} from './types'
export class FootprintDB extends Dexie{
 visits!:Table<Visit,string>
 photos!:Table<Photo,string>
 settings!:Table<{key:string;value:string},string>
 constructor(name='MetroFootprintDB'){
  super(name)
  this.version(1).stores({visits:'cityCode,status',photos:'photoId,cityCode,[cityCode+sortOrder]',settings:'key'})
 }
}
export const footprintDb=new FootprintDB()
