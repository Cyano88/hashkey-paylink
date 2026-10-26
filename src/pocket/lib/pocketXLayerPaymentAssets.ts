// Ethena X Layer deployment. Verified on chain 196: symbol USDe, decimals 18.
// Keep this separate from stocks, Cash funding and Earn eligibility.
export const xLayerUsde = {
  symbol: 'USDe', name: 'Ethena USDe',
  address: '0x5d3a1Ff2b6BAb83b63cd9AD0787074081a52ef34',
  decimals: 18, icon: '/brand/usde.svg',
} as const

// Paxos canonical deployment; chain 196 symbol and precision verified on-chain.
export const xLayerUsdg = {
 symbol:'USDG', name:'Global Dollar',
 address:'0x4ae46a509F6b1D9056937BA4500cb143933D2dc8',
 decimals:6, icon:'/brand/usdg.png',
} as const
