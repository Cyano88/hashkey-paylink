// Read-only, single-flight status polling. Never invokes wallet approval.
export function startGiftAutoRefresh(refresh:()=>Promise<void>,options:{canRefresh?:()=>boolean;schedule?:(run:()=>void,delay:number)=>unknown;cancel?:(timer:unknown)=>void}={}){
 const schedule=options.schedule??((run,delay)=>setTimeout(run,delay)),cancel=options.cancel??(timer=>clearTimeout(timer as ReturnType<typeof setTimeout>))
 let active=true,running=false,timer:unknown,delay=2500
 const queue=()=>{if(active)timer=schedule(()=>{timer=undefined;void check()},delay)}
 async function check(){if(!active||running)return;if(timer!==undefined){cancel(timer);timer=undefined}running=true
  try{if(options.canRefresh?.()!==false)await refresh()}catch{/* Retain verified state; retry quietly. */}finally{running=false;delay=Math.min(15000,delay+2500);queue()}
 }
 queue()
 return {checkNow:()=>{delay=2500;void check()},dispose(){active=false;if(timer!==undefined)cancel(timer)}}
}
