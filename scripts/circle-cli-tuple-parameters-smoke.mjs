import assert from 'node:assert/strict'
import { patchCircleCliTupleParameters } from './patch-circle-cli-tuple-parameters.mjs'

const marker = '  const abiParameters = pos.slice(1);\n  const estimate = args2.includes("--estimate");'
const fixture = `before\n${marker}\nafter\n`
const patched = patchCircleCliTupleParameters(fixture)

assert.equal(patched.changed, true)
assert.match(patched.source, /JSON\.parse\(value2\)/)
assert.match(patched.source, /Array\.isArray\(parsed\)/)
assert.equal(patchCircleCliTupleParameters(patched.source).changed, false)
assert.throws(
  () => patchCircleCliTupleParameters(`${fixture}${fixture}`),
  /missing or ambiguous/,
)

console.log('Circle CLI tuple parameter smoke checks passed.')
