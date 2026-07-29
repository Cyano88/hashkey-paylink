import assert from 'node:assert/strict'
import { Keypair, PublicKey } from '@solana/web3.js'
import {
  createAssociatedTokenAccountInstruction,
  createCloseTokenAccountInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddress,
} from '../api/solana-token.ts'

const mint = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v')
const owner = Keypair.fromSeed(Uint8Array.from({ length: 32 }, (_, index) => index + 1)).publicKey
const payer = Keypair.fromSeed(Uint8Array.from({ length: 32 }, (_, index) => 32 - index)).publicKey
const ata = await getAssociatedTokenAddress(mint, owner)
const destination = await getAssociatedTokenAddress(mint, payer)

assert.equal(owner.toBase58(), '9C6hybhQ6Aycep9jaUnP6uL9ZYvDjUp1aSkFWPUFJtpj')
assert.equal(ata.toBase58(), 'FjCjyojZLVYVQ2dEdDKQx76msks96TdH9xqvc8BQ9UUx')
assert.equal(destination.toBase58(), 'HZheZWimXucKQkG1NABRToRbFLbKNe8BR4KSt47xdixm')

function summary(instruction) {
  return {
    programId: instruction.programId.toBase58(),
    keys: instruction.keys.map(key => [key.pubkey.toBase58(), key.isSigner, key.isWritable]),
    data: Buffer.from(instruction.data).toString('hex'),
  }
}

assert.deepEqual(summary(createAssociatedTokenAccountInstruction(payer, ata, owner, mint)), {
  programId: 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL',
  keys: [
    [payer.toBase58(), true, true],
    [ata.toBase58(), false, true],
    [owner.toBase58(), false, false],
    [mint.toBase58(), false, false],
    ['11111111111111111111111111111111', false, false],
    ['TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA', false, false],
  ],
  data: '',
})
assert.deepEqual(summary(createTransferCheckedInstruction(
  ata,
  mint,
  destination,
  owner,
  1_234_567n,
  6,
)), {
  programId: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
  keys: [
    [ata.toBase58(), false, true],
    [mint.toBase58(), false, false],
    [destination.toBase58(), false, true],
    [owner.toBase58(), true, false],
  ],
  data: '0c87d612000000000006',
})
assert.deepEqual(summary(createCloseTokenAccountInstruction(ata, payer, owner)), {
  programId: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
  keys: [
    [ata.toBase58(), false, true],
    [payer.toBase58(), false, true],
    [owner.toBase58(), true, false],
  ],
  data: '09',
})
assert.throws(
  () => createTransferCheckedInstruction(ata, mint, destination, owner, -1n, 6),
  /uint64 range/,
)
assert.throws(
  () => createTransferCheckedInstruction(ata, mint, destination, owner, 1n, 256),
  /decimals are invalid/,
)

console.log('Solana token dependency replacement smoke checks passed.')
