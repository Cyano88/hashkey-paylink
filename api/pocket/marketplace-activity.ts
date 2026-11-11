import {marketplaceReceiptNames} from '../marketplace/receipt-branding.js'
import {readDurableJson} from '../render-durable-store.js'
import {circleLinkKey,readCircleLink} from '../privy-circle-link.js'
import {marketplaceSettlementReceipts,type MarketplaceSettlementReceipt} from '../marketplace/settlement-receipts.js'
import type {MarketplaceStore} from '../marketplace/repository.js'
import type {PocketActivityRow} from '../../src/pocket/lib/pocketSchemas.js'
import type {SellerIdentityStore} from '../marketplace/seller-identity.js'
export function marketplaceReceiptActivity(rows:MarketplaceSettlementReceipt[],wallet:string):PocketActivityRow[]{
 return rows.filter(r=>r.settlement!=='bank'&&r.recipient.toLowerCase()===wallet.toLowerCase()).map(r=>({eventId:r.id,txHash:r.transactionHash,chain:'base',payer:r.sender,recipient:r.recipient,merchantName:r.marketplaceName,memo:r.marketplaceName?r.marketplaceName+' - '+(r.kind==='refund'?'Refund':'Payout'):(r.kind==='refund'?'Marketplace refund':'Marketplace payout'),contextLabel:r.marketplaceName?r.marketplaceName+' - '+(r.kind==='refund'?'Refund':'Payout'):(r.kind==='refund'?'Marketplace refund':'Marketplace payout'),activityLabel:r.kind==='refund'?'Refund received':'Payout received',amount:r.amount,assetSymbol:'USDC',ts:r.settledAt,source:'marketplace-'+r.kind,settlementType:'wallet_transfer',direction:'in',paycrestStatus:'confirmed',...(r.kind==='payout'?{marketplaceDebitAmount:r.debitAmount}:{}),feeAmount:r.kind==='refund'?'0':r.networkFee,feeAsset:'USDC',destination:r.recipient}))
}
export async function readPocketMarketplaceActivity(owner:string){
 const link=await readCircleLink(circleLinkKey(owner,'base','payment'))
 const store=await readDurableJson<MarketplaceStore>('hashpaylink:marketplace-accounting-foundation:v1')
 const names=await marketplaceReceiptNames()
 const receipts=marketplaceSettlementReceipts(store).map(r=>({...r,marketplaceName:names[r.projectId]}))
 const identities=await readDurableJson<SellerIdentityStore>('hashpaylink:marketplace-seller-identities:v1')
 return [
  ...(link&&link.privyUserId===owner&&link.chain==='base'?marketplaceReceiptActivity(receipts,link.circleWalletAddress):[]),
  ...marketplaceBankReceiptActivity(receipts,owner,identities?.links??[]),
 ]
}

/** A masked bank account is not a wallet identity. Bind bank history to the
 * current, unambiguous server-verified seller link within the same project. */
export function marketplaceBankReceiptActivity(receipts:MarketplaceSettlementReceipt[],owner:string,links:SellerIdentityStore['links']):PocketActivityRow[]{
 return receipts.filter(r=>{
  if(r.settlement!=='bank'||r.kind!=='payout'||!r.sellerId||!r.bankFees)return false
  const active=links.filter(l=>l.projectId===r.projectId&&l.sellerId===r.sellerId&&!l.revokedAt)
  return active.length===1&&active[0].owner===owner
 }).map(r=>({eventId:r.id,txHash:r.transactionHash,chain:'base',payer:r.sender,recipient:r.recipient,
  merchantName:r.marketplaceName,memo:'Bank withdrawal',contextLabel:(r.marketplaceName||'Marketplace')+' - Bank withdrawal',
  activityLabel:'Bank withdrawal',amount:r.debitAmount,assetSymbol:'USDC',amountNgn:r.amount,fiatCurrency:'NGN',ts:r.settledAt,
  source:'marketplace_bank',settlementType:'marketplace_bank',direction:'out',paycrestStatus:'confirmed',destination:r.recipient,
  marketplaceBankFees:r.bankFees,
 }))
}
