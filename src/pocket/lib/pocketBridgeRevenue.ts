import {isAddress,type Address} from 'viem'
export type PocketBridgeRevenue={recipient:Address;bps:number;amountUnits:string}
/** Verify the fee actually encoded in provider calldata, not a display label. */
export function assertPocketBridgeRevenue(principal:bigint,revenue:PocketBridgeRevenue,distributions:readonly {recipient:Address;amount:bigint}[]){
 if(!isAddress(revenue.recipient)||/^0x0{40}$/i.test(revenue.recipient)||!Number.isSafeInteger(revenue.bps)||revenue.bps<0||revenue.bps>100||revenue.amountUnits!==(principal*BigInt(revenue.bps)/10000n).toString())throw Error('Invalid bridge revenue policy.')
 const expected=BigInt(revenue.amountUnits)
 const pocket=distributions.filter(f=>f.recipient.toLowerCase()===revenue.recipient.toLowerCase())
 if(expected>0n?(pocket.length!==1||pocket[0].amount!==expected):pocket.some(f=>f.amount!==0n))throw Error('Bridge revenue recipient or amount changed.')
 const provider=distributions.filter(f=>f.recipient.toLowerCase()!==revenue.recipient.toLowerCase())
 if(distributions.length>4||provider.some(f=>!isAddress(f.recipient)||/^0x0{40}$/i.test(f.recipient)||f.amount<0n)||provider.reduce((sum,f)=>sum+f.amount,0n)>principal*25n/10000n)throw Error('Bridge provider fee exceeds the supported policy.')
}
