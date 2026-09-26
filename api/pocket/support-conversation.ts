import { pocketSupportAnswer, requestsPocketHuman } from '../../src/pocket/lib/pocketSupportContent.js'
import type { PocketSupportLifecycleMessage } from './support-case-lifecycle.js'
export type Conversation = {
  id: string; profileId: string; status: 'open' | 'assigned' | 'waiting_user' | 'resolved';
  category: 'other'; priority: 'normal'; summary: string; messages: PocketSupportLifecycleMessage[];
  createdAt: number; updatedAt: number; assignedTo?: string; humanSupport?: boolean;
  waitingSince?: number; reminderSentAt?: number; resolvedAt?: number;
}
export function submitSupportConversation<T extends Omit<Conversation, 'category' | 'priority'> & {category: string; priority: string}>(
  cases: Record<string, T>, input: {profileId: string; caseId?: string; message: string; requestId: string}, now: number, uuid: () => string,
) {
  if (!input.message.trim() || input.message.length > 1500 || !/^[a-zA-Z0-9_-]{16,80}$/.test(input.requestId)) throw Object.assign(new Error('Enter a message of up to 1,500 characters.'), {status: 400})
  const mine = Object.values(cases).filter(c => c.profileId === input.profileId).sort((a,b) => b.updatedAt-a.updatedAt)
  let item = input.caseId ? cases[input.caseId] : mine.find(c => c.status !== 'resolved')
  if (input.caseId && (!item || item.profileId !== input.profileId)) throw Object.assign(new Error('Support case not found.'), {status:404})
  const duplicate = mine.find(c => c.messages.some(m => m.requestId === input.requestId))
  if (duplicate) return duplicate
  if (item?.status === 'resolved') throw Object.assign(new Error('This conversation is closed. Start a new message.'), {status:409})
  const recent = mine.flatMap(c => c.messages).filter(m => m.author === 'user' && now-m.createdAt < 60_000)
  if (recent.length >= 10) throw Object.assign(new Error('Please wait a moment before sending another message.'), {status:429})
  if (!item) {
    if (mine.filter(c => now-c.createdAt < 86_400_000).length >= 10) throw Object.assign(new Error('Please continue an existing conversation or try again tomorrow.'), {status:429})
    item = {id:'pcs_'+uuid().replace(/-/g,'').slice(0,16),profileId:input.profileId,status:'open',category:'other',priority:'normal',summary:input.message.slice(0,100),messages:[],createdAt:now,updatedAt:now} as unknown as T
    cases[item.id] = item
  }
  // Reports and legacy cases were already handed to staff before humanSupport existed.
  const hasStaff = Boolean(item.assignedTo || item.messages.some(m => m.author === 'staff'))
  const legacyHandoff = item.humanSupport === undefined && (item.category !== 'other' || item.messages.some(m => m.kind === 'transaction_report'))
  if (hasStaff || legacyHandoff) item.humanSupport = true
  item.messages.push({id:uuid(),author:'user',text:input.message,createdAt:now,requestId:input.requestId})
  if (!hasStaff && item.humanSupport && (legacyHandoff || requestsPocketHuman(input.message))) {
    item.messages.push({id:uuid(),author:'agent',text:'Your case is already in the Pocket Support queue. A representative has not joined yet. Your additional messages are saved here for the team.',createdAt:now})
  } else if (!hasStaff && !item.humanSupport) {
    const answer = pocketSupportAnswer(input.message)
    item.messages.push({id:uuid(),author:'agent',text:answer.text,createdAt:now})
    item.humanSupport = answer.handoff
  }
  item.status = item.assignedTo ? 'assigned' : 'open'
  item.waitingSince = undefined; item.reminderSentAt = undefined; item.resolvedAt = undefined; item.updatedAt = now
  return item
}
