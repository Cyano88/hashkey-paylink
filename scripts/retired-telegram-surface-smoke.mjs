import assert from 'node:assert/strict'
import {access,readFile} from 'node:fs/promises'
for(const name of ['CreateLink','TelegramPaymentLinks','AgentWorkspace','PolyDesk']) {
 await assert.rejects(access(new URL('../src/pages/'+name+'.tsx',import.meta.url)),e=>e.code==='ENOENT')
}
const pocket=await readFile(new URL('../src/pocket/pages/PocketAssistantPage.tsx',import.meta.url),'utf8')
assert.match(pocket,/components\/AgentHashPanel/)
assert.match(pocket,/lockedHelperMode='circle-pocket'/)
const panel=await readFile(new URL('../src/components/AgentHashPanel.tsx',import.meta.url),'utf8')
assert.match(panel,/askPocketAgent/)
assert.match(panel,/pocketApiUrl\('\/api\/pocket\/paylink-requests'\)/)
const layout=await readFile(new URL('../src/Layout.tsx',import.meta.url),'utf8')
assert.doesNotMatch(layout,/TELEGRAM_CHAT_URL|showTelegramHomeFab|TelegramMark|hashpaylink-home-surface/)
const alias=await readFile(new URL('../api/telegram-request.ts',import.meta.url),'utf8')
assert.match(alias,/export \{ default \} from '.\/pocket\/paylink-requests.js'/)
console.log('Retired surfaces absent; Pocket assistant, native request URL and legacy API alias preserved')
