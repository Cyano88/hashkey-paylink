export const SUPPORT_REMINDER_AFTER_MS = 24 * 60 * 60 * 1000
export const SUPPORT_AUTO_RESOLVE_AFTER_MS = 72 * 60 * 60 * 1000

export type PocketSupportLifecycleMessage = {
  id: string
  author: 'user' | 'agent' | 'staff'
  kind?: 'automatic_reminder' | 'automatic_resolution'
  text: string
  createdAt: number
}

export type PocketSupportLifecycleCase = {
  status: 'open' | 'assigned' | 'waiting_user' | 'resolved'
  priority: 'normal' | 'high'
  messages: PocketSupportLifecycleMessage[]
  updatedAt: number
  waitingSince?: number
  reminderSentAt?: number
  resolvedAt?: number
}

export function advancePocketSupportLifecycle<T extends PocketSupportLifecycleCase>(
  cases: Record<string, T>,
  now: number,
  uuid: () => string,
) {
  let changed = false
  for (const item of Object.values(cases)) {
    if (item.status !== 'waiting_user') continue
    const waitingSince = item.waitingSince || item.updatedAt
    if (!item.waitingSince) {
      item.waitingSince = waitingSince
      changed = true
    }
    const inactiveFor = now - waitingSince
    if (item.priority !== 'high' && inactiveFor >= SUPPORT_AUTO_RESOLVE_AFTER_MS) {
      item.status = 'resolved'
      item.resolvedAt = now
      item.updatedAt = now
      item.messages = [...item.messages, {
        id: uuid(),
        author: 'agent',
        kind: 'automatic_resolution',
        text: 'Pocket Support closed this conversation after 72 hours without a reply. Tap Chat with a human to reopen it whenever you still need help.',
        createdAt: now,
      }].slice(-80)
      changed = true
      continue
    }
    if (inactiveFor >= SUPPORT_REMINDER_AFTER_MS && !item.reminderSentAt) {
      item.reminderSentAt = now
      item.updatedAt = now
      item.messages = [...item.messages, {
        id: uuid(),
        author: 'agent',
        kind: 'automatic_reminder',
        text: 'Pocket Support is waiting for your reply. This conversation will close after 72 hours without a response, and you can reopen it anytime.',
        createdAt: now,
      }].slice(-80)
      changed = true
    }
  }
  return changed
}
