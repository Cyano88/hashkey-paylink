// Operator-only connection check. Never accepts customer prompts or falls back to Standard.
export function createInferenceCheck({store,apiKey,fetcher=fetch}){
 return async()=>{
  if(!/^sk-[A-Za-z0-9_-]{16,}$/.test(apiKey||''))throw Object.assign(Error('Private inference is not configured.'),{status:503})
  if(!await store.reserveInference())throw Object.assign(Error('Pilot inference allowance reached.'),{status:429})
  // Reservation is retained on timeout/failure: an ambiguous upstream request may still be billed.
  const r=await fetcher('https://router-api.0g.ai/v1/chat/completions',{
   method:'POST',redirect:'error',signal:AbortSignal.timeout(15000),
   headers:{Authorization:'Bearer '+apiKey,'Content-Type':'application/json','X-0G-Provider-Trust-Mode':'private'},
   body:JSON.stringify({model:'0gm-1.0-35b-a3b',messages:[{role:'system',content:'Synthetic connection check. Reply concisely.'},{role:'user',content:'Reply with exactly HASH_OK'}],max_tokens:64,temperature:0,chat_template_kwargs:{enable_thinking:false}})
  })
  if(!r.ok)throw Object.assign(Error('Private inference check failed.'),{status:502})
  const result=await r.json()
  if(result.model!=='0gm-1.0-35b-a3b'||result.choices?.[0]?.message?.content?.trim()!=='HASH_OK')throw Object.assign(Error('Private inference check did not return the expected result.'),{status:502})
  return {ok:true,model:result.model,trustModeRequested:'private',synthetic:true,totalTokens:Number.isSafeInteger(result.usage?.total_tokens)?result.usage.total_tokens:null}
 }
}
