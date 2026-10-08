export function fundingShortfall(error: string, asset = 'USDC'): string | null {
 if (/add OKB|insufficient OKB|not enough OKB/i.test(error)) return 'OKB'
 return /insufficient (?:funds|balance|USDC|USDT|[A-Z]+x)|amount is higher than.*balance|(?:exceeds|exceed).*balance|not enough.*(?:balance|USDC|stock)|balance.*(?:too low|insufficient)|no single.*source can cover/i.test(error) ? asset : null
}
export function amountExceedsBalance(amount: string | number, balance: string | number | null | undefined, known: boolean) {
 if(!known||balance==null)return false
 const a=typeof amount==='number'?amount.toFixed(18):amount,b=typeof balance==='number'?balance.toFixed(18):balance
 if(!/^\d+(?:\.\d+)?$/.test(a)||!/^\d+(?:\.\d+)?$/.test(b)||a.length>100||b.length>100)return false
 const decimals=Math.max(a.split('.')[1]?.length||0,b.split('.')[1]?.length||0)
 const units=(value:string)=>{const [whole,fraction='']=value.split('.');return BigInt(whole+fraction.padEnd(decimals,'0'))}
 return units(a)>0n&&units(a)>units(b)
}
