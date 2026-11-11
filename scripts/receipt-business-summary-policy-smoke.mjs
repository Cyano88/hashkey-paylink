import assert from 'node:assert/strict'
import {normalizeBusinessSummaryPreferences} from '../src/lib/businessSummaryPreferences.ts'
import {nextReceiptSummaryPeriod} from '../api/receipt-summary-periods.ts'
const now='2026-11-11T12:00:00.000Z',settings={enabled:true,frequency:'daily',timeZone:'Africa/Lagos'}
const p=normalizeBusinessSummaryPreferences({...settings,startedAt:'2000-01-01'},undefined,now)
assert.equal(p.startedAt,now,'client cannot backdate email enrollment')
assert.equal(nextReceiptSummaryPeriod(p,Date.parse('2026-11-11T23:14:59Z')),undefined)
let period=nextReceiptSummaryPeriod(p,Date.parse('2026-11-11T23:15:00Z'));assert.equal(period.from,Date.parse(now));assert.equal(period.to,Date.parse('2026-11-11T23:00:00Z'))
period=nextReceiptSummaryPeriod(p,Date.parse('2026-11-15T00:00:00Z'),period.to);assert.equal(period.from,Date.parse('2026-11-11T23:00:00Z'));assert.equal(period.to,Date.parse('2026-11-12T23:00:00Z'))
assert.equal(normalizeBusinessSummaryPreferences(settings,p,'2026-11-12T12:00:00Z').startedAt,now)
assert.equal(normalizeBusinessSummaryPreferences({...settings,frequency:'weekly'},p,'2026-11-12T12:00:00Z').startedAt,'2026-11-12T12:00:00Z')
assert.equal(nextReceiptSummaryPeriod({...p,enabled:false},Date.now()),undefined)
const week=nextReceiptSummaryPeriod({...p,frequency:'weekly'},Date.parse('2026-11-16T00:00:00Z'));assert.equal(week.to,Date.parse('2026-11-15T23:00:00Z'))
for(const [start,end,hours] of [['2026-03-08T05:00:00Z','2026-03-09T04:00:00Z',23],['2026-11-01T04:00:00Z','2026-11-02T05:00:00Z',25]]){const dst=nextReceiptSummaryPeriod({...p,timeZone:'America/New_York',startedAt:start},Date.parse(end)+900000);assert.equal(dst.to-dst.from,hours*3600000)}
assert.throws(()=>normalizeBusinessSummaryPreferences({...settings,timeZone:'Not/AZone'},p,now))
console.log('PASS summary enrollment boundary, daily/weekly timezone periods, DST, missed-period catch-up and preference changes. No email sent.')
