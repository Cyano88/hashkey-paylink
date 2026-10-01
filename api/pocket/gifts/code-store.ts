import {mutateDurableJson,readDurableJson,withDurablePostgresTransaction} from '../../render-durable-store.js'
import {GiftError} from './types.js'
import type {GiftCodeStore,SealedGiftCode} from './codes.js'
const prefix='hashpaylink:pocket-gift-code:v1:'
export const durableGiftCodeStore:GiftCodeStore={
 read:hash=>readDurableJson<SealedGiftCode>(prefix+'lookup:'+hash),
 async allocate(giftId,candidate){
  return withDurablePostgresTransaction(async client=>{
   const ownerKey=prefix+'gift:'+giftId
   await client.query('insert into render_durable_kv(store_key,value) values($1,\'null\'::jsonb) on conflict(store_key) do nothing',[ownerKey])
   const previous=await client.query('select value from render_durable_kv where store_key=$1 for update',[ownerKey])
   if(previous.rows[0]?.value)return previous.rows[0].value as SealedGiftCode
   for(let attempt=0;attempt<8;attempt++){
    const value=candidate()
    const inserted=await client.query('insert into render_durable_kv(store_key,value) values($1,$2::jsonb) on conflict(store_key) do nothing returning store_key',[prefix+'lookup:'+value.hash,JSON.stringify(value)])
    if(!inserted.rowCount)continue
    await client.query('update render_durable_kv set value=$2::jsonb,updated_at=now() where store_key=$1',[ownerKey,JSON.stringify(value)])
    return value
   }
   throw new GiftError(503,'Gift code could not be created. Try again shortly.')
  })
 },
 async consume(key,max,windowMs,now){
  await mutateDurableJson<{count:number;resetAt:number}>(prefix+'limit:'+key,current=>{
   const bucket=current&&current.resetAt>now?current:{count:0,resetAt:now+windowMs}
   if(bucket.count>=max)throw new GiftError(429,'Too many code attempts. Please try again later.')
   return {...bucket,count:bucket.count+1}
  })
 },
}
