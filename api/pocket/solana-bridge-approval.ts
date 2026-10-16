import {createHmac,timingSafeEqual} from 'node:crypto'
import {parseUnits} from 'viem'
import {Transaction} from '@solana/web3.js'
export type SolanaBridgeApproval={walletAddress:string;destination:string;destinationAddress:string;amount:string;transaction:string;lastValidBlockHeight:number;networkFeeUnits:string;providerFeeUnits:string;expiresAt:number}
function mac(payload:string){const key=process.env.POCKET_SWAP_QUOTE_SECRET||'';if(key.length<32)throw Error('Bridge quote signing is not configured.');return createHmac('sha256',key).update('pocket-solana-bridge:v1:'+payload).digest()}
export function sealSolanaBridgeApproval(quote:SolanaBridgeApproval){const payload=Buffer.from(JSON.stringify(quote)).toString('base64url');return payload+'.'+mac(payload).toString('base64url')}
export function openSolanaBridgeApproval(token:string,expected:Pick<SolanaBridgeApproval,'walletAddress'|'destination'|'destinationAddress'|'amount'>,allowExpired=false){
 if(typeof token!=='string'||token.length>20000)throw Error('Review a new bridge quote.')
 const [payload,signature,extra]=token.split('.');if(!payload||!signature||extra)throw Error('Invalid bridge quote.')
 const actual=Buffer.from(signature,'base64url'),wanted=mac(payload);if(actual.length!==wanted.length||!timingSafeEqual(actual,wanted))throw Error('Invalid bridge quote.')
 const q=JSON.parse(Buffer.from(payload,'base64url').toString()) as SolanaBridgeApproval
 if(q.walletAddress!==expected.walletAddress||q.destination!==expected.destination||q.destinationAddress.toLowerCase()!==expected.destinationAddress.toLowerCase()||(!/^\d+(?:\.\d{1,6})?$/.test(expected.amount)||parseUnits(q.amount,6)!==parseUnits(expected.amount,6)))throw Error('Bridge details changed. Review a new quote.')
 if(!Number.isSafeInteger(q.expiresAt)||(!allowExpired&&q.expiresAt<=Date.now()))throw Error('Bridge quote expired. Review a new quote.')
 return q
}
export function assertSolanaBridgeMessage(transaction:Transaction,quote:SolanaBridgeApproval,requireAllSignatures:boolean){
 const approved=Transaction.from(Buffer.from(quote.transaction,'base64'))
 if(!transaction.serializeMessage().equals(approved.serializeMessage()))throw Error('Bridge transaction changed after review.')
 // Both the sponsor and ephemeral CCTP signer must retain their approved signatures.
 for(const signature of approved.signatures){const signed=signature.signature;if(signed&&!transaction.signatures.some(s=>s.publicKey.equals(signature.publicKey)&&s.signature?.equals(signed)))throw Error('Bridge sponsor signature changed.')}
 if(!transaction.verifySignatures(requireAllSignatures))throw Error('Invalid bridge signatures.')
}
