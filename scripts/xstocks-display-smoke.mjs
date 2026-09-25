import assert from 'node:assert/strict';
import { stockDisplayAmount } from '../src/lib/xstocksAgreement/display.ts';
assert.deepEqual(stockDisplayAmount('2219999999999999',18),{text:'0.00222',approximate:true});
assert.deepEqual(stockDisplayAmount('2220000000000000',18),{text:'0.00222',approximate:false});
assert.deepEqual(stockDisplayAmount('0',18),{text:'0',approximate:false});
assert.deepEqual(stockDisplayAmount('1',18),{text:'<0.000001',approximate:true});
assert.deepEqual(stockDisplayAmount('999999999999999999',18),{text:'1',approximate:true});
assert.deepEqual(stockDisplayAmount('123456789012345678901234567890',18),{text:'123456789012.345679',approximate:true});
console.log('Display rounding preserves exact source units and handles tiny amounts and large values.');
