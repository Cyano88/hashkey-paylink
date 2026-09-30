import type { PocketActivityRow } from '../models/pocketActivity'
import type { PocketRequestItem } from '../api/pocketRequestsClient'

export function requestActivityRows(rows: PocketActivityRow[], requests: PocketRequestItem[]) {
  const paidHashes = new Set(requests.filter(request => request.status === 'paid' && request.transactionHash).map(request => request.transactionHash.toLowerCase()))
  const requestIds = new Set(requests.flatMap(request => [request.id, request.eventId]))
  const activityRows = rows.filter(row => !(row.source === 'request' && requestIds.has(row.eventId)) && (!row.txHash || !paidHashes.has(row.txHash.toLowerCase())))
  const requestRows = requests.filter(request => request.status !== 'cancelled').map<PocketActivityRow>(request => {
    const funding = rows.find(row => row.source === 'request' && (row.eventId === request.id || row.eventId === request.eventId))
    return ({
    ...(funding || {}),
    eventId: request.id,
    txHash: request.transactionHash || funding?.txHash || '',
    fundingOnly: request.status === 'paid' ? false : funding?.fundingOnly,
    chain: request.network,
    payer: request.recipientName,
    memo: request.title,
    amount: request.amount,
    ts: request.status === 'paid' ? request.updatedAt || request.createdAt : request.createdAt,
    source: 'request',
    settlementType: 'pocket_request',
    activityLabel: request.title,
    contextLabel: `${request.direction === 'incoming' ? `From ${request.senderName}` : `To ${request.recipientName}`} · ${request.status === 'pending' ? 'Awaiting response' : request.status.charAt(0).toUpperCase() + request.status.slice(1)}`,
    paycrestStatus: request.status === 'paid' ? 'paid' : request.status === 'declined' ? 'declined' : funding?.paycrestStatus || (request.status === 'pending' ? 'awaiting response' : request.status),
    direction: request.direction === 'incoming' ? 'out' : 'in',
    recipient: request.direction === 'incoming' ? request.senderName : request.recipientName,
    supportReference: request.id,
  })})
  return [...activityRows, ...requestRows]
}
