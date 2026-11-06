import type {CrossBridgeJournal,CrossBridgeReservation} from './cross-bridge-reservation-guard.js'

/** Operator-only release after the owner accepts unresolved execution risk.
 * Does not change transaction state or suppress recovery. Any discovered
 * provider reference revokes the exception and restores normal accounting.
 * No public endpoint creates these records. */
export function crossBridgeReservationReleased(j:CrossBridgeJournal|undefined,r:CrossBridgeReservation,now=Date.now()):boolean{
 const g=(j?.crossBridgeReleases as Record<string,any>|undefined)?.[r.id]
 if(!g||r.source!=='bsc'||r.state!=='submitting'||r.sourceHash||r.transactionId||r.userOperationHash||r.challengeId)return false
 return g.reason==='owner_accepted_unresolved_execution_risk'&&g.operationId===r.id&&
  typeof r.fingerprint==='string'&&/^[a-f0-9]{64}$/.test(r.fingerprint)&&g.fingerprint===r.fingerprint&&
  typeof r.ownerId==='string'&&r.ownerId.length>0&&g.ownerId===r.ownerId&&g.source===r.source&&
  typeof g.walletAddress==='string'&&g.walletAddress.toLowerCase()===r.walletAddress.toLowerCase()&&
  Number.isSafeInteger(g.authorizedAt)&&g.authorizedAt<=now&&Number.isSafeInteger(r.expiresAt)&&r.expiresAt<g.authorizedAt&&
  g.revokedAt===undefined
}
