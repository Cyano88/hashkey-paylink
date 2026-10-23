type ApprovalSdk = {
 execute(id:string,callback:(error:any,result:any)=>void):void
 messageHandler:(event:any)=>void
}
// Circle owns a cross-origin page, so Pocket cannot inspect its errors. Keep a
// bounded recovery available and always dispose this attempt on failure/timeout.
export function executeRecoverableCircleApproval(sdk:ApprovalSdk,id:string,errorText:(error:any)=>string,signal?:AbortSignal,timeoutMs=120_000,checkConfirmed?:()=>Promise<boolean>):Promise<any> {
 if(signal?.aborted)return Promise.reject(new Error('Approval closed. Your saved transfer can be checked again.'))
 if(document.getElementById('sdkIframe'))return Promise.reject(new Error('Close the existing wallet approval before continuing.'))
 return new Promise((resolve,reject)=>{
  let settled=false,frame:HTMLIFrameElement|null=null,timer:ReturnType<typeof setTimeout>|undefined
  let pollTimer:ReturnType<typeof setTimeout>|undefined
  const cleanup=()=>{
   if(timer)clearTimeout(timer)
   if(pollTimer)clearTimeout(pollTimer)
   window.removeEventListener('message',close)
   window.removeEventListener('message',sdk.messageHandler)
   window.removeEventListener('offline',offline)
   signal?.removeEventListener('abort',abort)
   frame?.remove()
  }
  const finish=(error?:Error,result?:any)=>{if(settled)return;settled=true;cleanup();error?reject(error):resolve(result)}
  const abort=()=>finish(new Error('Approval closed. Pocket will check your saved transfer before you continue.'))
  const offline=()=>finish(new Error('Connection lost during approval. Reconnect and continue your saved transfer.'))
  const close=(event:MessageEvent)=>{
   if(event.origin==='https://pw-auth.circle.com'&&event.source===frame?.contentWindow&&event.data?.onClose)abort()
  }
  window.addEventListener('message',close)
  window.addEventListener('offline',offline)
  signal?.addEventListener('abort',abort,{once:true})
  timer=setTimeout(()=>finish(new Error('The approval screen stopped responding. Pocket will check your saved transfer before you continue.')),timeoutMs)
  try {
   sdk.execute(id,(error,result)=>{if(error)finish(new Error(errorText(error)));else if(!result)finish(new Error('Approval did not finish. Check your saved transfer.'));else finish(undefined,result)})
   frame=document.getElementById('sdkIframe') as HTMLIFrameElement|null
   if(settled){frame?.remove();return}
   // Check only the already-saved transfer; never submit or sign from this loop.
   const poll=async()=>{
    if(settled || !checkConfirmed)return
    try {if(await checkConfirmed()){finish(undefined,{status:'COMPLETE'});return}}catch{/* SDK callback and bounded timeout remain available. */}
    if(!settled)pollTimer=setTimeout(()=>void poll(),3000)
   }
   if(checkConfirmed)pollTimer=setTimeout(()=>void poll(),3000)
  } catch(error){frame=document.getElementById('sdkIframe') as HTMLIFrameElement|null;finish(error instanceof Error?error:new Error('Approval could not open.'))}
 })
}
