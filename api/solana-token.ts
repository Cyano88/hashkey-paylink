import {
  Connection,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
} from '@solana/web3.js'

export const SOLANA_TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA')
export const SOLANA_ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL')

export async function getAssociatedTokenAddress(
  mint: PublicKey,
  owner: PublicKey,
  allowOwnerOffCurve = false,
) {
  if (!allowOwnerOffCurve && !PublicKey.isOnCurve(owner.toBytes())) {
    throw new Error('Associated token account owner is off curve.')
  }
  return PublicKey.findProgramAddressSync(
    [owner.toBuffer(), SOLANA_TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    SOLANA_ASSOCIATED_TOKEN_PROGRAM_ID,
  )[0]
}

export async function readTokenAccountAmount(
  connection: Connection,
  account: PublicKey,
): Promise<bigint | null> {
  const info = await connection.getAccountInfo(account, 'confirmed')
  if (!info) return null
  if (!info.owner.equals(SOLANA_TOKEN_PROGRAM_ID)) {
    throw new Error('Solana token account is owned by an unexpected program.')
  }
  const balance = await connection.getTokenAccountBalance(account, 'confirmed')
  return BigInt(balance.value.amount)
}

export function createAssociatedTokenAccountInstruction(
  payer: PublicKey,
  associatedAccount: PublicKey,
  owner: PublicKey,
  mint: PublicKey,
) {
  return new TransactionInstruction({
    programId: SOLANA_ASSOCIATED_TOKEN_PROGRAM_ID,
    keys: [
      { pubkey: payer, isSigner: true, isWritable: true },
      { pubkey: associatedAccount, isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: false, isWritable: false },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: SOLANA_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: Buffer.alloc(0),
  })
}

export function createTransferCheckedInstruction(
  source: PublicKey,
  mint: PublicKey,
  destination: PublicKey,
  owner: PublicKey,
  amount: bigint,
  decimals: number,
) {
  if (amount < 0n || amount > 0xffff_ffff_ffff_ffffn) {
    throw new Error('Solana token transfer amount is outside uint64 range.')
  }
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 255) {
    throw new Error('Solana token decimals are invalid.')
  }
  const data = Buffer.alloc(10)
  data.writeUInt8(12, 0)
  data.writeBigUInt64LE(amount, 1)
  data.writeUInt8(decimals, 9)
  return new TransactionInstruction({
    programId: SOLANA_TOKEN_PROGRAM_ID,
    keys: [
      { pubkey: source, isSigner: false, isWritable: true },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: destination, isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: true, isWritable: false },
    ],
    data,
  })
}

export function createCloseTokenAccountInstruction(
  account: PublicKey,
  destination: PublicKey,
  owner: PublicKey,
) {
  return new TransactionInstruction({
    programId: SOLANA_TOKEN_PROGRAM_ID,
    keys: [
      { pubkey: account, isSigner: false, isWritable: true },
      { pubkey: destination, isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: true, isWritable: false },
    ],
    data: Buffer.from([9]),
  })
}
