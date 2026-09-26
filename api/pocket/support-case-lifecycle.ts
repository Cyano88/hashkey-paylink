export const SUPPORT_REMINDER_AFTER_MS = 24 * 60 * 60 * 1000
export const SUPPORT_AUTO_RESOLVE_AFTER_MS = 72 * 60 * 60 * 1000
export const SUPPORT_RESOLUTION_AFTER_MS = 24 * 60 * 60 * 1000
export type PocketSupportLifecycleMessage = {
  id: string; author: 'user' | 'agent' | 'staff';
  kind?: 'automatic_reminder' | 'automatic_resolution' | 'transaction_report' | 'handoff' | 'staff_joined' | 'resolution_prompt' | 'case_reopened';
  avatarDataUrl?: string; displayName?: string; requestId?: string; text: string; createdAt: number
}
export type PocketSupportLifecycleCase = {
  status: 'open' | 'assigned' | 'waiting_user' | 'resolved'; priority: 'normal' | 'high';
  messages: PocketSupportLifecycleMessage[]; updatedAt: number;
  waitingSince?: number; reminderSentAt?: number; resolvedAt?: number;
  resolutionRequestedAt?: number; resolutionPromptId?: string; supportEscalatedAt?: number;
  assignedTo?: string; category?: string; humanSupport?: boolean
}
export function protectSupportCase(item: PocketSupportLifecycleCase) {
  return item.priority === 'high' || item.category === 'stuck_transaction' || item.category === 'bank_payment'
}
export function supportSystemMessage(item: PocketSupportLifecycleCase, kind: PocketSupportLifecycleMessage['kind'], text: string, now: number, uuid: () => string) {
  const message: PocketSupportLifecycleMessage = {id:uuid(),author:'agent',kind,text,createdAt:now}
  item.messages.push(message);return message.id
}
export function requestSupportResolution(item: PocketSupportLifecycleCase, now:number, uuid:()=>string) {
  if(item.status==='resolved' || item.resolutionRequestedAt) return
  item.status='waiting_user';item.waitingSince=now;item.reminderSentAt=undefined;item.updatedAt=now
  item.resolutionRequestedAt=now
  item.resolutionPromptId=supportSystemMessage(item,'resolution_prompt','Is there anything else you need help with?',now,uuid)
}
export function answerSupportResolution(item:PocketSupportLifecycleCase, promptId:string, answer:'yes'|'no', now:number, uuid:()=>string) {
  if(!item.resolutionRequestedAt || item.resolutionPromptId!==promptId) throw Object.assign(new Error('This resolution question is no longer active. Refresh the conversation.'),{status:409})
  supportSystemMessage(item,answer==='no'?'automatic_resolution':'case_reopened',answer==='no'?'This conversation is closed.':'You still need help. Your representative will revisit this conversation.',now,uuid)
  item.status=answer==='no'?'resolved':item.assignedTo?'assigned':'open'
  item.resolvedAt=answer==='no'?now:undefined
  item.resolutionRequestedAt=undefined;item.resolutionPromptId=undefined;item.waitingSince=undefined;item.reminderSentAt=undefined;item.supportEscalatedAt=undefined;item.updatedAt=now
}
export function advancePocketSupportLifecycle<T extends PocketSupportLifecycleCase>(cases:Record<string,T>,now:number,uuid:()=>string) {
  let changed=false
  for(const item of Object.values(cases)) {
    if(item.status==='resolved')continue
    if(item.status!=='waiting_user') {
      if((item.humanSupport !== false || item.assignedTo || protectSupportCase(item)) && now-item.updatedAt>=SUPPORT_REMINDER_AFTER_MS && !item.supportEscalatedAt) {item.supportEscalatedAt=now;changed=true}
      continue
    }
    const waitingSince=item.resolutionRequestedAt || item.waitingSince || item.updatedAt
    if(!item.waitingSince){item.waitingSince=waitingSince;changed=true}
    const inactiveFor=now-waitingSince
    const deadline=item.resolutionRequestedAt?SUPPORT_RESOLUTION_AFTER_MS:SUPPORT_AUTO_RESOLVE_AFTER_MS
    if(!protectSupportCase(item) && inactiveFor>=deadline) {
      const hours=item.resolutionRequestedAt?24:72
      item.status='resolved';item.resolvedAt=now;item.updatedAt=now;item.resolutionRequestedAt=undefined;item.resolutionPromptId=undefined
      supportSystemMessage(item,'automatic_resolution','This conversation is closed after '+hours+' hours without a reply. It remains in Previous conversations.',now,uuid)
      changed=true;continue
    }
    if(inactiveFor>=SUPPORT_REMINDER_AFTER_MS && !item.reminderSentAt) {
      item.reminderSentAt=now;item.updatedAt=now
      supportSystemMessage(item,'automatic_reminder',protectSupportCase(item)?'Pocket Support is waiting for your reply. This payment case will stay open for review.':'Pocket Support is waiting for your reply. This conversation closes after 72 hours without a response.',now,uuid)
      changed=true
    }
  }
  return changed
}
