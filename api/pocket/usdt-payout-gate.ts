import {isAddress} from 'viem'

export function usdtPayoutAllowed(input: {wallet:unknown;account:unknown;bankCode:unknown;amount:unknown}, env=process.env, now=Date.now()) {
  if (env.POCKET_USDT_PAYOUT_ENABLED === 'true') return true
  try {
    const config=JSON.parse(env.POCKET_USDT_PAYOUT_CANARY || 'null')
    const amount=String(input.amount??'')
    return Boolean(config && isAddress(config.wallet) && /^\d{10}$/.test(config.account)
      && typeof config.bankCode==='string' && config.bankCode.length>0
      && Number.isFinite(config.expiresAt) && config.expiresAt>now
      && config.wallet.toLowerCase()===String(input.wallet??'').toLowerCase()
      && config.account===String(input.account??'') && config.bankCode===String(input.bankCode??'')
      && /^\d+(?:\.\d{1,2})?$/.test(amount) && Number(amount)>0 && Number(amount)<=1000)
  } catch { return false }
}
