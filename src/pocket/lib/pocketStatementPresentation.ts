import type { PocketActivityRow } from '../models/pocketActivity'
import { pocketActivityStatus, pocketBillTitle } from './pocketReceipt'
import { pocketBankRecipientLabel } from './pocketPurchaseKind'

export function statementDate(value: number | string): string {
 const date = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(value + 'T12:00:00') : new Date(value)
 if (!Number.isFinite(date.getTime())) return ''
 return `${String(date.getDate()).padStart(2,'0')}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getFullYear()).slice(-2)}`
}
export function isLocalStatementPayment(row: PocketActivityRow) {
 const source = (row.source || '').replace(/_/g,'-')
 return source === 'bills' || source.startsWith('bank-') || row.settlementType === 'instant_fiat' || row.settlementType?.startsWith('bill_payment') === true
}
export function statementDescription(row: PocketActivityRow, collection = false) {
 if (collection && row.payer) return row.payer
 const bank = pocketBankRecipientLabel(row)
 if (bank) return bank
 if ((row.source || '').replace(/_/g,'-').startsWith('bank-')) return row.accountName || (row.direction === 'in' ? 'Bank transfer received' : 'Bank transfer')
 if (row.source === 'bills' || row.settlementType?.startsWith('bill_payment')) return pocketBillTitle(row.billCategory)
 if (row.source === 'gift') return row.direction === 'in' ? 'Gift received' : 'Gift sent'
 if (row.source === 'wallet-bridge') return 'USDC bridge'
 if (row.source === 'wallet-swap') return 'Swap'
 if (row.source === 'wallet-deposit') return `${row.assetSymbol || 'USDC'} received`
 if (row.source === 'wallet-withdrawal') return `${row.assetSymbol || 'USDC'} sent`
 if (row.source === 'xpay') return 'XPay payment'
 return row.activityLabel || row.memo || (row.source === 'request' ? 'Request payment' : '') || row.payer || 'Transfer'
}
export function statementStatus(row: PocketActivityRow) {
 const raw = pocketActivityStatus(row).replace(/_/g,' ')
 if (['confirmed','completed','paid','successful','settled','validated'].includes(raw)) return 'Successful'
 if (['pending','submitted','reconciling','settling','paid pending','fulfilled','fulfilling','processing','bridging'].includes(raw)) return 'Processing'
 return raw.charAt(0).toUpperCase() + raw.slice(1)
}
export function statementSignedAmount(row: PocketActivityRow) {
 const value = String(row.amount || '0').trim()
 if (!/^\d+(?:\.\d+)?$/.test(value)) return ''
 const direction = row.direction || (['collection','bank-receive','wallet-deposit','pos','ngpos'].includes(row.source || '') ? 'in' : ['bills','bank-withdraw','wallet-withdrawal'].includes(row.source || '') ? 'out' : undefined)
 const sign = ['wallet-bridge','wallet-swap'].includes(row.source || '') ? '' : direction === 'in' ? '+' : direction === 'out' ? '-' : ''
 return sign + value
}
export function statementLocalAmount(row: PocketActivityRow) {
 if (!row.amountNgn || !/^\d+(?:\.\d+)?$/.test(row.amountNgn)) return ''
 return (row.fiatCurrency === 'UGX' ? 'USh ' : '\u20a6') + Number(row.amountNgn).toLocaleString('en-US',{maximumFractionDigits:2})
}

// Confirmed USDC movements only. Never sum different assets or infer ledger balances.
export function statementTotals(rows: PocketActivityRow[]) {
 let incoming=0n,outgoing=0n
 for(const row of rows) {
  if ((row.assetSymbol || 'USDC') !== 'USDC' || row.fundingOnly || !['Successful','Delivered'].includes(statementStatus(row))) continue
  const signed=statementSignedAmount(row), match=/^([+-])(\d+)(?:\.(\d{1,18}))?$/.exec(signed)
  if(!match)continue
  const units=BigInt(match[2])*10n**18n+BigInt((match[3]||'').padEnd(18,'0'))
  if(match[1]==='+')incoming+=units;else outgoing+=units
 }
 const format=(units:bigint)=>{const fraction=(units%10n**18n).toString().padStart(18,'0').replace(/0+$/,'');return String(units/10n**18n)+(fraction?'.'+fraction:'')}
 return {incoming:format(incoming),outgoing:format(outgoing)}
}
