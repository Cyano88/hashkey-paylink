import {assertSolanaSponsorshipRunning} from '../emergency-pause.js'
import {validateBscRelayQuote,bscBridgeTokenAddress,type BscRelayInput} from './bsc-bridge-provider.js'
import {validateRelayStablecoinQuote} from './xlayer-bridge-provider.js'
import {Connection,Keypair,PublicKey,Transaction} from '@solana/web3.js'
import {getAssociatedTokenAddress,readTokenAccountAmount,createTransferCheckedInstruction} from '../solana-token.js'
import {readNativeUsdcRate} from '../payment-network-fees.js'
import {POCKET_USDT_ASSETS} from '../../src/pocket/lib/pocketUsdtAssets.js'
import {validateRelayUsdtQuote,type RelayUsdtInput} from './usdt-relay-provider.js'
import {checkSolanaRelayerBalance,solanaReimbursementUnits} from './solana-relayer-fees.js'

/** Preparation only. No route, wallet signing permission or broadcast is enabled here. */
export async function prepareSolanaUsdtRelayTransaction(input:{
 quote:unknown;route:RelayUsdtInput|BscRelayInput;connection:Connection;relayer:Keypair;treasury:PublicKey;
 now?:number;readRate?:()=>Promise<bigint>;
}){
 const now=input.now??Date.now(),q=input.route.destination==='bsc'?validateBscRelayQuote(input.quote,input.route as BscRelayInput,now):input.route.destination==='xlayer'?validateRelayStablecoinQuote(input.quote,input.route as any,now,{allowXLayerUsdcRefund:true}):validateRelayUsdtQuote(input.quote,input.route as RelayUsdtInput,now)
 if(q.execution.kind!=='solana')throw Error('This route does not start on Solana.')
 const {connection,relayer,treasury}=input,owner=new PublicKey(input.route.sender)
 if(owner.equals(relayer.publicKey)||owner.equals(treasury)||treasury.equals(PublicKey.default))throw Error('Invalid bridge fee accounts.')
 const asset:'USDC'|'USDT'='asset' in input.route?input.route.asset:'USDT'
 const mint=new PublicKey(bscBridgeTokenAddress('solana',asset))
 const [source,feeAccount]=await Promise.all([getAssociatedTokenAddress(mint,owner,true),getAssociatedTokenAddress(mint,treasury,true)])
 // Relay's deposit instruction uses the customer as the CPI rent payer. Require the
 // provider vault ATA to exist so no hidden SOL debit is attempted on the customer.
 const providerVault=q.execution.instruction.keys[6].pubkey
 const [balance,feeBalance,providerBalance]=await Promise.all([source,feeAccount,providerVault].map(a=>readTokenAccountAmount(connection,a)))
 if(feeBalance===null||providerBalance===null)throw Error('Bridge token accounts must be provisioned before quoting.')
 const {blockhash,lastValidBlockHeight}=await connection.getLatestBlockhash('confirmed')
 const tx=new Transaction({recentBlockhash:blockhash,feePayer:relayer.publicKey}).add(q.execution.instruction,
  createTransferCheckedInstruction(source,mint,feeAccount,owner,1n,6))
 const fee=(await connection.getFeeForMessage(tx.compileMessage(),'confirmed')).value
 if(fee===null||!Number.isSafeInteger(fee)||fee<=0)throw Error('Bridge network fee is unavailable.')
 const rate=await (input.readRate??(()=>readNativeUsdcRate('solana',fetch,Date.now,asset)))()
 const networkFeeUnits=solanaReimbursementUnits(BigInt(fee),rate)
 const totalUnits=BigInt(q.amountUnits)+networkFeeUnits
 if(totalUnits>=(1n<<64n)||balance===null||balance<totalUnits)throw Object.assign(Error('Insufficient '+asset+' to cover this bridge.'),{maximumAmountUnits:String(balance!==null&&balance>networkFeeUnits?balance-networkFeeUnits:0n)})
 await checkSolanaRelayerBalance(connection,relayer.publicKey,BigInt(fee)+100000n)
 tx.instructions[1]=createTransferCheckedInstruction(source,mint,feeAccount,owner,networkFeeUnits,6)
 await assertSolanaSponsorshipRunning()

 tx.partialSign(relayer)
 return {provider:'relay' as const,orderId:q.orderId,requestId:q.requestId,asset,source:q.source,destination:q.destination,walletAddress:input.route.sender,destinationAddress:input.route.recipient,
  amountUnits:q.amountUnits,receiveUnits:q.receiveUnits,minimumUnits:q.minimumUnits,
  refundOptions:'refundOptions' in q?q.refundOptions:undefined,
  providerFeeUnits:String(BigInt(q.amountUnits)-BigInt(q.receiveUnits)/(q.destination==='bsc'?10n**12n:1n)),networkFeeUnits:String(networkFeeUnits),
  totalUnits:String(totalUnits),appFeeUnits:'0',expiresAt:q.expiresAt,lastValidBlockHeight,
  transaction:tx.serialize({requireAllSignatures:false,verifySignatures:true}).toString('base64')}
}
