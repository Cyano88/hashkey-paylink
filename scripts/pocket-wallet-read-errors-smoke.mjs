import assert from 'node:assert/strict'
import {readPocketWallets} from '../src/pocket/api/pocketWalletLinkClient.ts'
for(const status of [502,503,504])await assert.rejects(()=>readPocketWallets({accessToken:'fixture',fetcher:async()=>new Response('<html>Unavailable</html>',{status})}),/Wallet details are temporarily unavailable/)
await assert.rejects(()=>readPocketWallets({accessToken:'fixture',fetcher:async()=>new Response('',{status:401})}),/Sign in again/)
await assert.rejects(()=>readPocketWallets({accessToken:'fixture',fetcher:async()=>Response.json({error:{message:'Wallet ownership verification failed'}},{status:403})}),/Wallet ownership verification failed/)
console.log('PASS read outages are not mislabeled as wallet-link mutations; sign-in and ownership errors remain distinct.')
