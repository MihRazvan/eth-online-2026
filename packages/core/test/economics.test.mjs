import {test} from 'node:test';import assert from 'node:assert/strict';
import {parseUnitsStrict,formatUnitsExact,breakEven,claimPayout,rangeOccupancy} from '../src/economics.mjs';
test('transaction precision and large amounts survive round trips',()=>{
 for(const input of ['0','0.000001','12345678901234567890.123456'])assert.equal(formatUnitsExact(parseUnitsStrict(input)),input);
 for(const input of ['1e6','1.0000001','-1','01','Infinity',' 1'])assert.throws(()=>parseUnitsStrict(input));
});
test('whole-period claims carry income and round against overpayment',()=>{
 assert.equal(breakEven({price:10n,quantity:3n,originalSupply:10n}),34n);
 assert.equal(claimPayout({allocation:34n,quantity:3n,originalSupply:10n}),10n);
 for(let a=0n;a<100n;a++)assert.ok(claimPayout({allocation:a,quantity:3n,originalSupply:10n})+claimPayout({allocation:a,quantity:7n,originalSupply:10n})<=a);
});
test('occupancy measures elapsed blocks, not percentage of swaps',()=>{
 const samples=[{block:0,logIndex:0,tick:0},{block:9,logIndex:0,tick:100},{block:9,logIndex:1,tick:101}];
 assert.deepEqual(rangeOccupancy({samples,fromBlock:0,toBlock:10,tickLower:-10,tickUpper:10}),{knownBlocks:10,inRangeBlocks:9,totalBlocks:10,occupancyBps:9000,coverageBps:10000});
});
test('range includes lower boundary but excludes upper and exposes unknown history',()=>{
 const r=rangeOccupancy({samples:[{block:5,logIndex:0,tick:10}],fromBlock:0,toBlock:10,tickLower:0,tickUpper:10});
 assert.equal(r.coverageBps,5000);assert.equal(r.occupancyBps,0);
 assert.equal(rangeOccupancy({samples:[],fromBlock:0,toBlock:10,tickLower:0,tickUpper:10}).occupancyBps,null);
});
