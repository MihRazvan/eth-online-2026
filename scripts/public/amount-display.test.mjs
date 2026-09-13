import test from 'node:test';
import assert from 'node:assert/strict';
import {money} from '../../apps/web/src/amounts.ts';
test('sub-cent USDC payments and liabilities remain visible down to a micro-unit',()=>{
 assert.equal(money(3150n),'$0.003150');
 assert.equal(money(1n),'$0.000001');
 assert.equal(money(-9999n),'−$0.009999');
 assert.equal(money(0n),'$0.00');
 assert.equal(money(10000n),'$0.01');
 assert.equal(money(50000n),'$0.05');
 assert.equal(money(3150n,6),'$0.003150');
});
