import test from 'node:test'
import assert from 'node:assert/strict'
import { hostingCommand, providerAdapter } from '../src/hosting.mjs'
import { run } from '../src/cli.mjs'
const key = 'hpl_app_'+'d'.repeat(64)
const keyId='key_fixture0001'
const metadata={id:keyId,expiresAt:new Date(Date.now()+86400000).toISOString(),scopes:['checkout:read']}
const projectId='dev_12345678'
function setup() {
  let value, writes=0
  let vault={keys:[{value:key,projectId,metadata}],plans:[]}
  const vaultStore={read:async()=>structuredClone(vault),write:async v=>{vault=structuredClone(v)},withLock:async operation=>operation()}
  const sessionStore={read:async()=>({token:'hpl_cli_'+'e'.repeat(64),grant:{projectId,state:'approved',scopes:['keys:manage'],expiresAt:new Date(Date.now()+3600000).toISOString()}})}
  return { deps:{env:{},vaultStore,sessionStore,fetcher:async()=>Response.json({ok:true,projectId,keys:[metadata]}),
    provider:{read:async()=>({label:'Backend fixture',value}),write:async(_target,next)=>{writes++;value=next}}},
    writes:()=>writes,value:()=>value,setValue:v=>{value=v} }
}
const options={provider:'render',service:'srv-fixture0001','key-id':keyId,backend:true}
test('plan is read-only, apply writes once, readback verifies, retry reconciles',async()=>{
  const f=setup()
  const planned=await hostingCommand('hosting plan',options,f.deps)
  assert.equal(f.writes(),0)
  assert.ok(!JSON.stringify(planned).includes(key))
  assert.equal(planned.plan.variable,'HASHPAYLINK_API_KEY')
  assert.equal(planned.plan.deploy,false)
  const applied=await hostingCommand('hosting apply',{plan:planned.plan.id},f.deps)
  assert.equal(applied.verified,true)
  assert.equal(applied.deploymentTriggered,false)
  assert.equal(f.value(),key)
  await hostingCommand('hosting apply',{plan:planned.plan.id},f.deps)
  assert.equal(f.writes(),1)
})
test('existing variable requires explicit replacement and drift blocks apply',async()=>{
  const f=setup();f.setValue('previous-private-value')
  await assert.rejects(hostingCommand('hosting plan',options,f.deps))
  const plan=await hostingCommand('hosting plan',{...options,replace:true},f.deps)
  assert.equal(plan.plan.replace,true)
  f.setValue('changed-after-plan')
  await assert.rejects(hostingCommand('hosting apply',{plan:plan.plan.id},f.deps))
  assert.equal(f.writes(),0)
})
test('backend confirmation and exact target IDs are mandatory',async()=>{
  const f=setup()
  for(const invalid of [{...options,backend:false},{...options,service:'../../other'},{...options,provider:'railway',project:'name',environment:'production'}])
    await assert.rejects(hostingCommand('hosting plan',invalid,f.deps))
  assert.equal(f.writes(),0)
})
test('revoked keys cannot be injected',async()=>{
  const f=setup()
  f.deps.fetcher=async()=>Response.json({ok:true,projectId,keys:[{...metadata,revokedAt:new Date().toISOString()}]})
  await assert.rejects(hostingCommand('hosting plan',options,f.deps))
})
test('CLI hosting output contains metadata only',async()=>{
  const f=setup();let output=''
  const exit=await run(['hosting','plan','--provider','render','--service',options.service,'--key-id',keyId,'--backend','--json'],{
    ...f.deps,stdout:{write(v){output+=v}},stderr:{write(){}}})
  assert.equal(exit,0)
  assert.equal(JSON.parse(output).ok,true)
  assert.ok(!output.includes(key))
})
test('Render adapter touches one variable, rejects static sites, keeps provider credentials in headers',async()=>{
  const calls=[];let value
  const provider=providerAdapter({env:{RENDER_API_KEY:'provider-fixture'},fetcher:async(url,init)=>{
    calls.push({url,init})
    assert.equal(init.redirect,'error')
    assert.equal(init.headers.authorization,'Bearer provider-fixture')
    if(url.endsWith('/env-vars/HASHPAYLINK_API_KEY')){
      if(init.method==='PUT')value=JSON.parse(init.body).value
      return value ? Response.json({value}) : Response.json({}, {status:404})
    }
    return Response.json({id:options.service,name:'Backend',type:'web_service'})
  }})
  const target={provider:'render',service:options.service}
  assert.equal((await provider.read(target)).value,undefined)
  await provider.write(target,key)
  assert.equal((await provider.read(target)).value,key)
  assert.equal(calls.filter(c=>c.init.method==='PUT').length,1)
  assert.ok(calls.every(c=>!c.url.includes(key)))
  const staticProvider=providerAdapter({env:{RENDER_API_KEY:'provider-fixture'},fetcher:async()=>Response.json({id:options.service,type:'static_site'})})
  await assert.rejects(staticProvider.read(target))
})
test('Railway uses exact project/environment/service, stdin and skip-deploys; raw listing never escapes',async()=>{
  const project='11111111-1111-4111-8111-111111111111',environment='22222222-2222-4222-8222-222222222222',service='33333333-3333-4333-8333-333333333333'
  const calls=[];let value
  const provider=providerAdapter({env:{},fetcher:async()=>{throw Error('unexpected HTTP')},railway:async(args,input)=>{
    calls.push({args,input})
    assert.ok(!args.includes(key))
    if(args[0]==='status')return {id:project,name:'Project',environments:{edges:[{node:{id:environment,name:'Production'}}]},services:{edges:[{node:{id:service,name:'API'}}]}}
    if(args[1]==='list')return {...(value?{HASHPAYLINK_API_KEY:value}:{}),OTHER_SECRET:'must-not-escape'}
    assert.ok(args.includes('--stdin'));assert.ok(args.includes('--skip-deploys'))
    assert.equal(args[args.indexOf('--project')+1],project)
    assert.equal(args[args.indexOf('--environment')+1],environment)
    assert.equal(args[args.indexOf('--service')+1],service)
    value=input;return {set:true,keys:['HASHPAYLINK_API_KEY']}
  }})
  const target={provider:'railway',project,environment,service}
  assert.deepEqual(await provider.read(target),{label:'Project / Production / API',value:undefined})
  await provider.write(target,key)
  assert.equal((await provider.read(target)).value,key)
  assert.equal(calls.filter(c=>c.input===key).length,1)
})

test('Agreement plan selects isolated mainnet variable and rejects checkout or mixed keys',async()=>{
  const f=setup();
  await assert.rejects(hostingCommand('hosting plan',{...options,product:'agreement'},f.deps));
  f.deps.fetcher=async()=>Response.json({ok:true,projectId,keys:[{...metadata,scopes:['project:read','agreement:read','agreement:create']}]});
  const planned=await hostingCommand('hosting plan',{...options,product:'agreement'},f.deps);
  assert.equal(planned.plan.variable,'HASHPAYSTREAM_ARC_MAINNET_API_KEY');
  assert.equal(f.writes(),0);
  const applied=await hostingCommand('hosting apply',{plan:planned.plan.id},f.deps);
  assert.equal(applied.variable,'HASHPAYSTREAM_ARC_MAINNET_API_KEY');
  assert.equal(applied.verified,true);
  f.deps.fetcher=async()=>Response.json({ok:true,projectId,keys:[{...metadata,scopes:['agreement:read','agreement:create','checkout:create']}]});
  await assert.rejects(hostingCommand('hosting apply',{plan:planned.plan.id},f.deps));
  await assert.rejects(hostingCommand('hosting plan',{...options,product:'arbitrary'},f.deps));
})

test('Render Agreement adapter updates only the isolated allowlisted variable',async()=>{
 const calls=[];let value;
 const provider=providerAdapter({env:{RENDER_API_KEY:'fixture'},fetcher:async(url,init)=>{
 calls.push(url);
 if(url.includes('/env-vars/')){
 assert.ok(url.endsWith('/HASHPAYSTREAM_ARC_MAINNET_API_KEY'));
 if(init.method==='PUT')value=JSON.parse(init.body).value;
 return value?Response.json({value}):Response.json({},{status:404});
 }
 return Response.json({id:options.service,name:'Backend',type:'web_service'});
 }});
 const target={provider:'render',service:options.service,variable:'HASHPAYSTREAM_ARC_MAINNET_API_KEY'};
 await provider.write(target,key);assert.equal((await provider.read(target)).value,key);
 await assert.rejects(provider.write({...target,variable:'VITE_SECRET'},key));
 assert.ok(calls.every(url=>!url.includes(key)));
})

test('Funding and account connection handoffs require separate exact scopes',async()=>{
 for(const [product,scopes,variable] of [
 ['agreement-funding',['agreement:recipient','agreement:fund'],'HASHPAYSTREAM_ARC_MAINNET_FUNDING_API_KEY'],
 ['wallet-connection',['wallet:connect'],'HASHPAYSTREAM_WALLET_CONNECTION_API_KEY'],
 ['arc-wallet',['wallet:arc'],'HASHPAYSTREAM_ARC_WALLET_API_KEY'],
 ['xstocks-agreement',['xstocks-agreement:read','xstocks-agreement:create'],'HASHPAYSTREAM_XSTOCKS_AGREEMENT_API_KEY']]) {
  const f=setup();
  await assert.rejects(hostingCommand('hosting plan',{...options,product},f.deps));
  f.deps.fetcher=async()=>Response.json({ok:true,projectId,keys:[{...metadata,scopes}]});
  const planned=await hostingCommand('hosting plan',{...options,product},f.deps);
  assert.equal(planned.plan.variable,variable);assert.equal(f.writes(),0);
  assert.equal((await hostingCommand('hosting apply',{plan:planned.plan.id},f.deps)).verified,true);
  f.deps.fetcher=async()=>Response.json({ok:true,projectId,keys:[{...metadata,scopes:[...scopes,'checkout:create']}]});
  await assert.rejects(hostingCommand('hosting apply',{plan:planned.plan.id},f.deps));
 }
})
