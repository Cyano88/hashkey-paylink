import { Capacitor, registerPlugin } from '@capacitor/core'
import type { PocketActivityRow } from '../models/pocketActivity'
import { pocketActivityStatus } from './pocketReceipt'
import { isIncomingPosPayment, pocketBankRecipientLabel } from './pocketPurchaseKind'

// Quote every field and neutralize spreadsheet formulas in external descriptions.
function cell(value: unknown) {
  const text = String(value ?? '').replace(/[\r\n]+/g, ' ')
  const safe = /^[\s]*[=+@-]/.test(text) || /^[\t\r]/.test(text) ? "'" + text : text
  return '"' + safe.replace(/"/g, '""') + '"'
}
export function pocketStatementCsv(rows: PocketActivityRow[]) {
  const table = [
    ['Pocket transaction statement'],
    ['Scope', 'Currently loaded activity matching selected filters. Incoming POS excluded.'],
    ['Generated at (UTC)', new Date().toISOString()],
    [],
    ['Date (UTC)', 'Description', 'Direction', 'Status', 'USDC amount', 'NGN amount', 'Network', 'Reference', 'Transaction hash'],
    ...rows.filter(row => !isIncomingPosPayment(row)).map(row => [
      Number.isFinite(new Date(row.ts).getTime()) ? new Date(row.ts).toISOString() : '',
      pocketBankRecipientLabel(row) || row.activityLabel || row.memo || 'Transaction',
      row.direction || '', pocketActivityStatus(row), row.amount, row.amountNgn || '',
      row.chain, row.eventId, row.txHash,
    ]),
  ]
  return '\uFEFF' + table.map(row => row.map(cell).join(',')).join('\r\n') + '\r\n'
}
const nativeStatement = registerPlugin<{ saveCsv(options: { name: string; content: string }): Promise<{ cancelled?: boolean }> }>('PocketStatement')
export async function downloadPocketStatement(rows: PocketActivityRow[]) {
  const name = `pocket-statement-${new Date().toISOString().slice(0, 10)}.csv`
  const content = pocketStatementCsv(rows)
  if (Capacitor.getPlatform() === 'android') {
    const result = await nativeStatement.saveCsv({ name, content })
    if (result.cancelled) throw new DOMException('Save cancelled', 'AbortError')
    return
  }
  const file = new File([content], name, { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(file)
  const link = document.createElement('a')
  link.href = url
  link.download = name
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
