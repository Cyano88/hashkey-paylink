import assert from 'node:assert/strict'
import {
  advancePocketSupportLifecycle,
  SUPPORT_AUTO_RESOLVE_AFTER_MS,
  SUPPORT_REMINDER_AFTER_MS,
} from '../api/pocket/support-case-lifecycle.ts'

let sequence = 0
const uuid = () => `message-${++sequence}`
const waitingCase = (overrides = {}) => ({
  status: 'waiting_user',
  priority: 'normal',
  messages: [],
  updatedAt: 1_000,
  waitingSince: 1_000,
  ...overrides,
})

const beforeReminder = { case1: waitingCase() }
assert.equal(advancePocketSupportLifecycle(beforeReminder, 1_000 + SUPPORT_REMINDER_AFTER_MS - 1, uuid), false)
assert.equal(beforeReminder.case1.messages.length, 0)

const reminder = { case1: waitingCase() }
assert.equal(advancePocketSupportLifecycle(reminder, 1_000 + SUPPORT_REMINDER_AFTER_MS, uuid), true)
assert.equal(reminder.case1.status, 'waiting_user')
assert.equal(reminder.case1.messages.at(-1)?.kind, 'automatic_reminder')
assert.ok(reminder.case1.reminderSentAt)
assert.equal(advancePocketSupportLifecycle(reminder, 1_000 + SUPPORT_REMINDER_AFTER_MS + 1, uuid), false)

const closure = { case1: waitingCase() }
assert.equal(advancePocketSupportLifecycle(closure, 1_000 + SUPPORT_AUTO_RESOLVE_AFTER_MS, uuid), true)
assert.equal(closure.case1.status, 'resolved')
assert.equal(closure.case1.messages.length, 1)
assert.equal(closure.case1.messages[0].kind, 'automatic_resolution')

const highPriority = { case1: waitingCase({ priority: 'high' }) }
assert.equal(advancePocketSupportLifecycle(highPriority, 1_000 + SUPPORT_AUTO_RESOLVE_AFTER_MS * 2, uuid), true)
assert.equal(highPriority.case1.status, 'waiting_user')
assert.equal(highPriority.case1.messages.length, 1)
assert.equal(highPriority.case1.messages[0].kind, 'automatic_reminder')

const assigned = { case1: waitingCase({ status: 'assigned' }) }
assert.equal(advancePocketSupportLifecycle(assigned, 1_000 + SUPPORT_AUTO_RESOLVE_AFTER_MS * 2, uuid), false)
assert.equal(assigned.case1.status, 'assigned')

console.log('Pocket Support lifecycle smoke checks passed.')
