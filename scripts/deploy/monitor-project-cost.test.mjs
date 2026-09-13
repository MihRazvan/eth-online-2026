import test from 'node:test';
import assert from 'node:assert/strict';
import {assess,snapshot,projectId,workspaceId} from './monitor-project-cost.mjs';
const start=Date.parse('2026-09-01T00:00:00Z'),hour=3600000;
const raw=(cost=1)=>({project:{id:projectId},workspace:{id:workspaceId},period:'current',currentUsageDollars:cost,billingPeriod:{start:new Date(start).toISOString(),end:'2026-10-01T00:00:00Z'}});
test('rejects unrelated project/workspace, malformed cost, stale billing period',()=>{
 for(const changed of [{project:{id:'other'}},{workspace:{id:'other'}},{currentUsageDollars:-1},{currentUsageDollars:'1'},{currentUsageDollars:Infinity},{period:'previous'}])assert.throws(()=>snapshot({...raw(),...changed},start+hour));
 assert.throws(()=>snapshot(raw(),start-1));
});
test('new or zero/lagged observations do not claim a safe projection',()=>{
 const a=snapshot(raw(0),start+hour),b=snapshot(raw(0),start+2*hour);
 assert.equal(assess(a).status,'UNKNOWN');assert.equal(assess(b,a).status,'UNKNOWN');
 assert.equal(assess(snapshot(raw(1),start+hour+1000),a).status,'UNKNOWN');
});
test('recent usage catches a new expensive service even near billing end',()=>{
 const a=snapshot(raw(1),start+28*24*hour),b=snapshot(raw(1.1),a.observedAt+hour);
 const result=assess(b,a);assert.equal(result.status,'WARNING');assert.ok(result.monthlyRunRateDollars>71);assert.ok(result.projectedPeriodDollars<30);
 assert.ok(result.warnings.includes('PROJECTED_USAGE_AT_OR_ABOVE_BUDGET'));
});
test('actual budget threshold warns despite unavailable estimates',()=>{
 assert.equal(assess(snapshot(raw(30),start+hour)).status,'WARNING');
 assert.ok(assess(snapshot(raw(24),start+hour)).warnings.includes('ACTUAL_USAGE_APPROACHING_BUDGET'));
});
test('period rollover, stale sample, foreign scope and correction reset projection',()=>{
 const a=snapshot(raw(1),start+hour),b=snapshot(raw(2),start+2*hour);
 for(const prev of [{...a,periodStart:start-1},{...a,projectId:'other'},{...a,observedAt:b.observedAt-49*hour},{...a,currentUsageDollars:3}])assert.equal(assess(b,prev).status,'UNKNOWN');
});
test('lower measured rate reports observation scope without a spending guarantee',()=>{
 const a=snapshot(raw(1),start+hour),b=snapshot(raw(1.01),start+2*hour);
 assert.equal(assess(b,a).status,'BELOW_THRESHOLD_AT_OBSERVED_RATE');assert.match(assess(b,a).scope,/not an invoice or spending cap/);
});
