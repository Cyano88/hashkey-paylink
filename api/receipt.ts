import type { Request, Response } from 'express'
import { findRegisteredPaymentReceipt } from './event-registry.js'

function receiptType(source?: string) {
  if (source === 'ngpos') return 'hashpaylink_pos_receipt'
  if (source === 'streampay') return 'hashpaylink_streampay_receipt'
  return 'hashpaylink_payment_receipt'
}

function receiptTitle(source?: string) {
  if (source === 'ngpos') return 'Retail POS receipt'
  if (source === 'streampay') return 'StreamPay receipt'
  return 'Hash PayLink receipt'
}

export default async function handler(req: Request, res: Response) {
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'Method not allowed' })

  const id = String(req.query.id ?? req.query.receiptId ?? '').trim()
  if (!id) return res.status(400).json({ ok: false, error: 'Missing receipt id.' })

  try {
    const receipt = await findRegisteredPaymentReceipt(id)
    if (!receipt) return res.status(404).json({ ok: false, error: 'Receipt not found.' })

    return res.json({
      ok: true,
      receipt: {
        type: receiptType(receipt.source),
        receiptId: receipt.receiptId,
        receiptHash: receipt.receiptHash,
        title: receiptTitle(receipt.source),
        status: 'confirmed',
        eventId: receipt.eventId,
        txHash: receipt.txHash,
        chain: receipt.chain,
        payer: receipt.payer,
        memo: receipt.memo,
        amount: receipt.amount,
        asset: 'USDC',
        createdAt: receipt.ts,
        source: receipt.source,
        merchantId: receipt.merchantId,
        settlementType: receipt.settlementType,
        amountNgn: receipt.amountNgn,
        proof: {
          receiptHash: receipt.receiptHash,
          ogRootHash: receipt.ogRootHash,
          ogTxHash: receipt.ogTxHash,
          ogExplorer: receipt.ogTxHash ? `https://chainscan.0g.ai/tx/${receipt.ogTxHash}` : undefined,
        },
      },
    })
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Receipt lookup failed.',
    })
  }
}
