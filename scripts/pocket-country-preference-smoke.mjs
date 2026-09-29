import assert from 'node:assert/strict'
import {readPocketCountry,savePocketCountry,currencyForPocketCountry} from '../src/pocket/lib/pocketCountryPreference.ts'
const values=new Map();globalThis.localStorage={getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value)}
assert.equal(currencyForPocketCountry(readPocketCountry('new')),'NGN')
savePocketCountry(' User@Example.test ','UG');assert.equal(currencyForPocketCountry(readPocketCountry('user@example.test')),'UGX')
assert.equal(readPocketCountry('other@example.test'),'NG');savePocketCountry('','UG');assert.equal(readPocketCountry(''),'NG')
savePocketCountry('user@example.test','NG');assert.equal(readPocketCountry('user@example.test'),'NG')
globalThis.localStorage={getItem(){throw Error()},setItem(){throw Error()}};assert.equal(readPocketCountry('user'),'NG');assert.doesNotThrow(()=>savePocketCountry('user','UG'))
console.log('PASS account-isolated country defaults, NGN/UGX selection, storage-unavailable fallback.')
