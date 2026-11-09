import dotenv from 'dotenv'
dotenv.config({path:'.env.local',quiet:true})
dotenv.config({quiet:true})
const {createMarketplaceProvisioning}=await import('../api/marketplace/provisioning.ts')
const mode=process.argv[2]??'status'
if(!['status','provision'].includes(mode))throw Error('Use status or provision.')
const setup=createMarketplaceProvisioning(process.env)
if(mode==='status')console.log(JSON.stringify(setup.readiness(),null,2))
else {
 try {console.log(JSON.stringify(await setup.provision(),null,2))}
 catch {console.error('Marketplace provisioning did not complete. Preserve the durable setup journal and retry with the same configuration; do not generate replacement keys. No activation was performed.');process.exitCode=1}
}
