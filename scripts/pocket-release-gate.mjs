import { spawn } from 'node:child_process'

const suites = ['test:pocket-contracts','test:pocket-ledger','test:pocket-payment-executions','test:pocket-reconciliation','test:pocket-requests-adapter','test:pocket-balances-adapter','test:pocket-activity-adapter','test:pocket-bank-withdraw-adapter','test:pocket-pos-adapter','test:pocket-bills','test:pocket-support-lifecycle','test:router-security','test:solana-token-security','test:durable-store-security','test:pocket-load']
const timeoutMs = Number(process.env.POCKET_RELEASE_SUITE_TIMEOUT_MS || 180_000)
for (const suite of suites) {
  const code = await new Promise(resolve => {
    const child = process.platform === 'win32'
      ? spawn(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', `npm.cmd run ${suite}`], { stdio: 'inherit' })
      : spawn('npm', ['run', suite], { stdio: 'inherit' })
    const timer = setTimeout(() => { child.kill(); resolve(124) }, timeoutMs)
    child.on('exit', value => { clearTimeout(timer); resolve(value ?? 1) })
  })
  if (code !== 0) { console.error(`Pocket release gate failed: ${suite} exited ${code}.`); process.exit(code) }
}
console.log(`Pocket release gate passed ${suites.length} bounded suites.`)
