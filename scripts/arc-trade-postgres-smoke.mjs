import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {mkdtempSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {spawn,spawnSync} from 'node:child_process'
import {fileURLToPath} from 'node:url'

const file=fileURLToPath(import.meta.url)
const port=55443
const target=`postgresql://arc_trade_test@127.0.0.1:${port}/postgres`
const mode=process.argv[2]
if(!mode){
  const bin=process.env.HASHPAYSTREAM_TEST_POSTGRES_BIN||'C:/Program Files/PostgreSQL/17/bin/'
  const directory=mkdtempSync(join(tmpdir(),'hashpaylink-arc-journal-pg-'))
  const pg=(name,args)=>spawnSync(join(bin,name+'.exe'),args,{encoding:'utf8',windowsHide:true,timeout:30_000})
  try{
    const init=pg('initdb',['-D',directory,'-U','arc_trade_test','-A','trust','--encoding=UTF8','--no-locale'])
    assert.equal(init.status,0,init.stderr)
    const start=pg('pg_ctl',['-D',directory,'-l',join(directory,'server.log'),'-o',`-h 127.0.0.1 -p ${port}`,'-w','start'])
    assert.equal(start.status,0,start.stderr)
    const child=spawn(process.execPath,['--import','tsx',file,'suite'],{
      env:{...process.env,DATABASE_URL:target,ARC_TRADE_TEST_DATABASE_URL:target},stdio:'inherit',windowsHide:true,
    })
    const result=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',resolve)})
    assert.equal(result,0,'Arc journal PostgreSQL suite failed')
  }finally{
    pg('pg_ctl',['-D',directory,'-m','immediate','-w','stop'])
  }
}else{
  // Never accept a production connection, even if the invoking shell has one.
  assert.equal(process.env.ARC_TRADE_TEST_DATABASE_URL,target)
  assert.equal(process.env.DATABASE_URL,target)
  const db=await import('../api/render-durable-store.ts')
  const {createArcTradeExecutionStore}=await import('../api/trade-agreement/arc-execution-store.ts')
  const identity=(await db.queryDurablePostgres('select current_user as role, host(inet_server_addr()) as host, current_database() as db')).rows[0]
  assert.deepEqual(identity,{role:'arc_trade_test',host:'127.0.0.1',db:'postgres'})
  const store=createArcTradeExecutionStore()
  if(mode==='worker'){
    process.send({ready:true})
    process.once('message',async({method,input})=>{
      try{process.send({ok:true,value:await store[method](input)},()=>process.exit(0))}
      catch(error){process.send({ok:false,error:error.message},()=>process.exit(0))}
    })
  }else{
    assert.equal(mode,'suite')
    const a=n=>'0x'+n.repeat(40),h=n=>'0x'+n.repeat(64)
    const {encodeFunctionData,parseAbi}=await import('viem')
    const data=encodeFunctionData({abi:parseAbi(['function approve(address,uint256) returns(bool)']),functionName:'approve',args:[a('2'),1250001n]})
    const base={agreementId:'tag_'+'a'.repeat(64),projectId:'dev_pgtrade1234',participantId:'did:privy:syntheticbuyer',walletId:randomUUID(),requestId:randomUUID(),termsHash:h('c'),action:'approve',call:{chainId:5042,account:a('1'),to:a('3'),data,value:'0'},preparedAfterBlock:'99'}
    const key=id=>`hashpaylink:arc-trade-execution:v1:${id}`
    await db.readDurableJson('arc-test-schema-bootstrap')
    async function race(method,inputs){
      const workers=inputs.map(input=>{
        const child=spawn(process.execPath,['--import','tsx',file,'worker'],{env:process.env,stdio:['ignore','pipe','pipe','ipc'],windowsHide:true})
        let readyResolve,resultResolve,resultReject,output='',answer
        const ready=new Promise(resolve=>{readyResolve=resolve})
        const result=new Promise((resolve,reject)=>{resultResolve=resolve;resultReject=reject})
        const timer=setTimeout(()=>{child.kill();resultReject(Error('Journal worker timed out'));readyResolve()},30_000)
        child.stdout.on('data',b=>{output+=b});child.stderr.on('data',b=>{output+=b})
        child.on('message',message=>{if(message.ready)readyResolve();else answer=message})
        child.on('error',error=>{clearTimeout(timer);readyResolve();resultReject(error)})
        child.on('close',code=>{clearTimeout(timer);readyResolve();code===0&&answer?resultResolve(answer):resultReject(Error('Journal worker failed: '+output))})
        return {child,input,ready,result}
      })
      const results=Promise.all(workers.map(w=>w.result))
      await Promise.all(workers.map(w=>w.ready))
      for(const w of workers)if(w.child.connected)w.child.send({method,input:w.input})
      return results
    }
    const duplicates=await race('reserve',Array.from({length:4},()=>base))
    assert(duplicates.every(r=>r.ok));assert.equal(new Set(duplicates.map(r=>r.value.idempotencyKey)).size,1)
    assert.equal((await db.readDurableJson(key(base.agreementId))).entries.length,1)
    const restarted=await race('reserve',[{...base,preparedAfterBlock:'109'}])
    assert.equal(restarted[0].value.idempotencyKey,duplicates[0].value.idempotencyKey)
    assert.equal(restarted[0].value.preparedAfterBlock,'99')

    const different={...base,agreementId:'tag_'+'b'.repeat(64)}
    const contenders=await race('reserve',Array.from({length:4},()=>({...different,requestId:randomUUID()})))
    assert.equal(contenders.filter(r=>r.ok).length,1)
    assert(contenders.filter(r=>!r.ok).every(r=>/pending/.test(r.error)))
    assert.equal((await db.readDurableJson(key(different.agreementId))).entries.length,1)

    const challenges=await race('recordChallenge',Array.from({length:4},()=>({...base,challengeId:randomUUID()})))
    assert.equal(challenges.filter(r=>r.ok).length,1)
    assert(challenges.filter(r=>!r.ok).every(r=>/challenge changed/.test(r.error)))
    const challengeId=challenges.find(r=>r.ok).value.challengeId
    const submissions=await race('recordSubmission',['d','e','f','1'].map(n=>({...base,transactionId:randomUUID(),transactionHash:h(n)})))
    assert.equal(submissions.filter(r=>r.ok).length,1)
    assert(submissions.filter(r=>!r.ok).every(r=>/transaction changed/.test(r.error)))
    const submitted=submissions.find(r=>r.ok).value
    const late=await race('recordChallenge',[{...base,challengeId}])
    assert.equal(late[0].value.status,'submitted')
    assert.equal(late[0].value.transactionHash,submitted.transactionHash)

    // A database write failure must roll back the whole reservation, including
    // the placeholder row inserted before SELECT FOR UPDATE.
    const failed={...base,agreementId:'tag_'+'c'.repeat(64)}
    await db.queryDurablePostgres(`create function arc_test_reject_write() returns trigger language plpgsql as $$ begin if new.store_key='${key(failed.agreementId)}' then raise exception 'synthetic journal write failure'; end if; return new; end $$;
      create trigger arc_test_reject before update on render_durable_kv for each row execute function arc_test_reject_write()`)
    await assert.rejects(()=>store.reserve(failed),/synthetic journal write failure/)
    assert.equal((await db.queryDurablePostgres('select count(*) from render_durable_kv where store_key=$1',[key(failed.agreementId)])).rows[0].count,'0')
    await db.queryDurablePostgres('drop trigger arc_test_reject on render_durable_kv; drop function arc_test_reject_write()')
    await store.reserve(failed)
    await assert.rejects(()=>store.read(base.agreementId,'dev_otherproject',base.requestId),/not found/)
    const snapshot=await db.readDurableJson(key(base.agreementId))
    await assert.rejects(()=>store.reserve({...base,termsHash:h('b')}),/retry changed/)
    assert.deepEqual(await db.readDurableJson(key(base.agreementId)),snapshot)
    console.log('Arc Trade isolated PostgreSQL passed: multi-process duplicate and competing reservations, restart recovery, challenge/transaction races, late responses, atomic rollback and project isolation. No Circle or chain calls.')
    process.exit(0)
  }
}
