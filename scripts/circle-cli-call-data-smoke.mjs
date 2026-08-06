import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { patchCircleCliCallData } from './patch-circle-cli-call-data.mjs'

const require = createRequire(import.meta.url)
const entryPath = require.resolve('@circle-fin/cli')
const current = await readFile(entryPath, 'utf8')
const patched = patchCircleCliCallData(current)
const source = patched.source

assert.match(source, /readFlagValue\(args2, "--call-data"\)/)
assert.match(source, /async function handleAgentExecute\([^)]*callData/)
assert.match(source, /\.\.\.callData \? \{ callData \} : \{/)
assert.equal(patchCircleCliCallData(source).changed, false)

console.log('Circle CLI raw callData smoke checks passed.')
