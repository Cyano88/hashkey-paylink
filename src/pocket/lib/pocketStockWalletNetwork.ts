type StockWalletProvider = { request(args: {method:string;params?:unknown[]}):Promise<unknown> }
type StockWalletConnection = {address:string;switchChain(chain:number):Promise<void>;getEthereumProvider():Promise<StockWalletProvider>}
export function stockWalletChainId(value: unknown){if(typeof value==='string'&&value.startsWith('eip155:'))return Number(value.slice(7));return typeof value==='string'||typeof value==='number'?Number(value):NaN}
export async function ensurePocketXLayerWallet(getWallet:()=>StockWalletConnection|undefined,owner:string,stillCurrent:()=>void=()=>{},wait:(ms:number)=>Promise<void>=ms=>new Promise(resolve=>setTimeout(resolve,ms))){
 const current=()=>{stillCurrent();const wallet=getWallet();if(!wallet||wallet.address.toLowerCase()!==owner.toLowerCase())throw Error('Your XStocks wallet changed. Try again.');return wallet}
 await current().switchChain(196)
 for(let attempt=0;attempt<8;attempt++){
  const provider=await current().getEthereumProvider();stillCurrent()
  if(stockWalletChainId(await provider.request({method:'eth_chainId'}))===196)return provider
  if(attempt===0)await provider.request({method:'wallet_switchEthereumChain',params:[{chainId:'0xc4'}]})
  await wait(200)
 }
 throw Error('X Layer is not ready. Please try the trade again.')
}
