/** BSC signing wallets are EOAs, separate from Pocket's Circle SCA chains.
 * Addresses must be checked against live RPC metadata before enabling trading.
 * These stablecoins are Binance-pegged assets, not native Circle-issued USDC.
 */
export const POCKET_BSC = {
  chainId: 56,
  circleBlockchain: 'EVM',
  accountType: 'EOA',
  assets: {
    BNB: {symbol:'BNB',address:'0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',decimals:18,native:true},
    USDC: {symbol:'USDC',name:'Binance-Peg USD Coin',address:'0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d',decimals:18,native:false},
    USDT: {symbol:'USDT',name:'Binance-Peg BSC-USD',address:'0x55d398326f99059ff775485246999027b3197955',decimals:18,native:false},
  },
  // Reviewed against https://web3.okx.com/onchainos/dev-docs/trade/dex-smart-contract
  router:'0x5994814f2c4040b863a0125a45de152a8c2a4dec',
  spender:'0x2c34a2fb1d0b4f55de51e1d0bdefaddce6b7cdd6',
} as const
export type PocketBscAsset=keyof typeof POCKET_BSC.assets
export function pocketBscAsset(symbol:string){
  if(!Object.hasOwn(POCKET_BSC.assets,symbol))throw Error('Choose a supported BSC asset.')
  return POCKET_BSC.assets[symbol as PocketBscAsset]
}
