export function checkoutRailEnabled(network:'bsc'|'xlayer',projectId:string,env:Record<string,string|undefined>=process.env){
 const prefix=network==='bsc'?'HASHPAYLINK_BSC_CHECKOUT':'HASHPAYLINK_XSTOCKS_CHECKOUT'
 return env[prefix+'_ENABLED']==='true'&&(env[prefix+'_PROJECTS']||'').split(',').map(value=>value.trim()).includes(projectId)
}
