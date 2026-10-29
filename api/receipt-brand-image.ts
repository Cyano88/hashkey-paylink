import{request}from'node:https'
import{resolvePublicWebhookDestination,pinnedPublicWebhookLookup}from'./developer-projects.js'
/** Public HTTPS only, pinned DNS, no redirects, bounded image size and timeout. */
export async function receiptBrandImage(url?:string):Promise<Buffer|undefined>{
 if(!url)return
 try{const target=await resolvePublicWebhookDestination(url)
  return await new Promise<Buffer|undefined>((resolve)=>{
   const req=request(target.url,{method:'GET',lookup:pinnedPublicWebhookLookup(target.address,target.family),timeout:4000,headers:{Accept:'image/png,image/jpeg'}},res=>{
    if(res.statusCode!==200||!/^image\/(png|jpeg)(?:;|$)/i.test(String(res.headers['content-type']||''))){res.resume();resolve(undefined);return}
    const chunks:Buffer[]=[];let bytes=0
    res.on('data',chunk=>{bytes+=chunk.length;if(bytes>512_000){req.destroy();resolve(undefined)}else chunks.push(chunk)})
    res.on('end',()=>resolve(bytes<=512_000?Buffer.concat(chunks):undefined));res.on('error',()=>resolve(undefined))
   });req.on('timeout',()=>{req.destroy();resolve(undefined)});req.on('error',()=>resolve(undefined));req.end()
  })
 }catch{return}
}
