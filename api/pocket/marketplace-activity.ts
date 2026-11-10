import {marketplaceReceiptNames} from '../marketplace/receipt-branding.js'
import {readDurableJson} from '../render-durable-store.js'
import {circleLinkKey,readCircleLink} from '../privy-circle-link.js'
import {marketplaceSettlementReceipts,type MarketplaceSettlementReceipt} from '../marketplace/settlement-receipts.js'
import type {MarketplaceStore} from '../marketplace/repository.js'
import type {PocketActivityRow} from '../../src/pocket/lib/pocketSchemas.js'
export function marketplaceReceiptActivity(rows:MarketplaceSettlementReceipt[],wallet:string):PocketActivityRow[]{
 return rows.filter(r=>r.recipient.toLowerCase()===wallet.toLowerCase()).map(r=>({eventId:r.id,txHash:r.transactionHash,chain:'base',payer:r.sender,recipient:r.recipient,memo:r.kind==='refund'?'Marketplace refund':'Marketplace payout',contextLabel:r.marketplaceName?r.marketplaceName+' - '+(r.kind==='refund'?'Refund':'Payout'):(r.kind==='refund'?'Marketplace refund':'Marketplace payout'),activityLabel:r.kind==='refund'?'Refund received':'Payout received',amount:r.amount,assetSymbol:'USDC',ts:r.settledAt,source:'marketplace-'+r.kind,settlementType:'wallet_transfer',direction:'in',paycrestStatus:'confirmed',feeAmount:r.kind==='refund'?'0':r.networkFee,feeAsset:'USDC',destination:r.recipient}))
}
export async function readPocketMarketplaceActivity(owner:string){
 const link=await readCircleLink(circleLinkKey(owner,'base','payment'))
 if(!link||link.privyUserId!==owner||link.chain!=='base')return []
 const store=await readDurableJson<MarketplaceStore>('hashpaylink:marketplace-accounting-foundation:v1')
 const names=await marketplaceReceiptNames()
 return marketplaceReceiptActivity(marketplaceSettlementReceipts(store).map(r=>({...r,marketplaceName:names[r.projectId]})),link.circleWalletAddress)
}
