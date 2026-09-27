import {readDurableJson,mutateDurableJson} from '../render-durable-store.js'
const KEY='hashpaylink:pocket-pos-retired:v1'
type Retirements=Record<string,{owner:string;deletedAt:string}>
export async function readPosRetirements():Promise<Retirements>{return await readDurableJson<Retirements>(KEY)||{}}
export async function isPosRetired(id:string){return Boolean((await readPosRetirements())[id])}
export async function retirePosQr(owner:string,id:string){
 let deletedAt=''
 await mutateDurableJson<Retirements>(KEY,current=>{
  const rows=current||{};const previous=rows[id]
  if(previous&&previous.owner!==owner)throw Object.assign(Error('QR not found.'),{status:404})
  deletedAt=previous?.deletedAt||new Date().toISOString()
  return {...rows,[id]:{owner,deletedAt}}
 })
 return deletedAt
}
