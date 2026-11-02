import {Buffer} from 'buffer'
import {Transaction} from '@solana/web3.js'
import bs58 from 'bs58'

/** The relayer signs the fee-payer slot before customer approval. The final
 * transaction reference is therefore available before the network request. */
export function signedSolanaReference(encoded:string){
 const transaction=Transaction.from(Buffer.from(encoded,'base64'))
 if(!transaction.signature||!transaction.verifySignatures(true))throw Error('Signed bridge transaction could not be verified.')
 return bs58.encode(transaction.signature)
}
