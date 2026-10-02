import {randomUUID} from 'node:crypto'
import {equal,sessionToken,sessionClaims} from './auth.mjs'
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status})}
const text=(value,max)=>{if(typeof value!=='string'||!value.trim()||value.length>max)fail('Invalid input.');return value.trim()}
async function body(req,max=16384){if(!String(req.headers['content-type']||'').startsWith('application/json'))fail('Use application/json.',415);let size=0,chunks=[];for await(const chunk of req){size+=chunk.length;if(size>max)fail('Request too large.',413);chunks.push(chunk)}try{const value=JSON.parse(Buffer.concat(chunks).toString());if(!value||typeof value!=='object'||Array.isArray(value))fail('Invalid JSON.');return value}catch{fail('Invalid JSON.')}}
export function createApp({store,adminSecret,sessionSecret,inferenceCheck,knowledgeMatcher,now=Date.now}){
 if(adminSecret?.length<32||sessionSecret?.length<32||!adminSecret||!sessionSecret)throw Error('Strong Hash service secrets are required.')
 const windows=new Map();const limit=(key,max)=>{const time=now();if(windows.size>2048)for(const [id,w]of windows)if(w.until<=time)windows.delete(id);let w=windows.get(key);if(!w||w.until<=time){if(windows.size>=4096&&!windows.has(key))fail('Please try again shortly.',429);w={n:0,until:time+60000};windows.set(key,w)}if(++w.n>max)fail('Please try again shortly.',429)}
 return async(req,res)=>{
  const requestId=randomUUID();res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Request-ID',requestId)
  const send=(status,value)=>{if(res.destroyed||res.writableEnded)return;res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(value))}
  try{
   const path=new URL(req.url,'http://localhost').pathname
   if(req.method==='GET'&&path==='/healthz'){await store.health();return send(200,{ok:true,service:'hash-support',version:'0.2.0',inferenceEnabled:Boolean(knowledgeMatcher)})}
   limit('ip:'+req.socket.remoteAddress,300)
   const token=String(req.headers.authorization||'').match(/^Bearer ([A-Za-z0-9_.-]+)$/)?.[1]||''
   if(path.startsWith('/internal/')){
    if(!equal(token,adminSecret))fail('Operator authentication required.',401)
    limit('operator',30)
    if(req.method==='POST'&&path==='/internal/inference-check'){if(!inferenceCheck)fail('Private inference is not configured.',503);return send(200,await inferenceCheck())}
    if(req.method==='POST'&&path==='/internal/workspaces'){const input=await body(req);return send(201,{ok:true,...await store.createWorkspace(text(input.name,100))})}
    const match=path.match(/^\/internal\/keys\/([a-f0-9-]+)$/i)
    if(req.method==='DELETE'&&match&&uuid.test(match[1])){await store.revokeKey(match[1]);return send(200,{ok:true})}
    fail('Not found.',404)
   }
   if(req.method==='POST'&&path==='/v1/knowledge-match'){
    const scope=await store.authenticate(token);if(!scope)fail('Business server authentication required.',401)
    limit('workspace:'+scope.workspaceId,120)
    if(!knowledgeMatcher)return send(200,{ok:true,selectedId:null})
    const input=await body(req)
    return send(200,{ok:true,...await knowledgeMatcher(scope,input)})
   }
   if(path==='/v1/integration-state'){
    const scope=await store.authenticate(token);if(!scope)fail('Business server authentication required.',401)
    limit('workspace:'+scope.workspaceId,120)
    if(req.method==='GET')return send(200,{ok:true,workspaceId:scope.workspaceId,...await store.integrationState(scope)})
    if(req.method==='PUT'){
     const input=await body(req,8*1024*1024)
     if(!Number.isSafeInteger(input.revision)||input.revision<0||input.revision>=2147483646||!input.value||typeof input.value!=='object'||Array.isArray(input.value))fail('Invalid integration state.')
     return send(200,{ok:true,workspaceId:scope.workspaceId,...await store.writeIntegrationState(scope,input.revision,input.value)})
    }
    fail('Method not allowed.',405)
   }
   if(req.method==='POST'&&path==='/v1/customer-sessions'){

    const scope=await store.authenticate(token);if(!scope)fail('Invalid business API key.',401)
    limit('workspace:'+scope.workspaceId,120)
    const input=await body(req),customerId=text(input.customerId,128)
    return send(201,{ok:true,token:sessionToken(sessionSecret,{...scope,customerId},now()),expiresIn:300})
   }
   if(!path.startsWith('/v1/conversations'))fail('Not found.',404)
   const scope=sessionClaims(sessionSecret,token,now());if(!uuid.test(scope.workspaceId)||!uuid.test(scope.keyId)||!await store.activeSession(scope))fail('Customer session revoked or invalid.',401)
   limit('workspace:'+scope.workspaceId,120);limit('customer:'+scope.workspaceId+':'+scope.customerId,30)
   if(req.method==='POST'&&path==='/v1/conversations')return send(201,{ok:true,conversation:await store.createConversation(scope)})
   const match=path.match(/^\/v1\/conversations\/([a-f0-9-]+)(\/messages)?$/i)
   if(!match||!uuid.test(match[1]))fail('Not found.',404)
   if(req.method==='GET'&&!match[2])return send(200,{ok:true,conversation:await store.conversation(scope,match[1])})
   if(req.method==='DELETE'&&!match[2]){await store.deleteConversation(scope,match[1]);return send(200,{ok:true})}
   if(req.method==='POST'&&match[2]){const input=await body(req),id=text(input.requestId,80);if(!/^[a-zA-Z0-9_-]{16,80}$/.test(id))fail('Invalid request ID.');return send(201,{ok:true,message:await store.message(scope,match[1],id,text(input.message,1500))})}
   fail('Method not allowed.',405)
  }catch(error){const status=Number.isInteger(error?.status)?error.status:500;if(status===429)res.setHeader('Retry-After','60');send(status,{ok:false,error:status===500?'Hash is temporarily unavailable.':error.message,requestId})}
 }
}
