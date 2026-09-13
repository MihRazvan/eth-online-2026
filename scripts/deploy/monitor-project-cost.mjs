#!/usr/bin/env node
/** Read-only Railway usage observation. Never sets limits or stops workloads. */
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {readFileSync,writeFileSync,renameSync,mkdirSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
export const projectId='cb65063e-ebf1-452c-b077-5e3da03041e2';
export const workspaceId='70d2345d-495a-4927-ba4e-bd94189adab5';
const hour=3600000,month=30*24*hour,budget=30;
const fail=()=>{throw new Error('INVALID_PROJECT_USAGE');};
export function snapshot(value,now=Date.now()){
 const start=Date.parse(value?.billingPeriod?.start),end=Date.parse(value?.billingPeriod?.end);
 if(value?.project?.id!==projectId||value?.workspace?.id!==workspaceId||value.period!=='current'||!Number.isFinite(value.currentUsageDollars)||value.currentUsageDollars<0||!Number.isFinite(start)||!Number.isFinite(end)||start>=end||now<start||now>end)fail();
 return {schemaVersion:1,projectId,workspaceId,observedAt:now,periodStart:start,periodEnd:end,currentUsageDollars:value.currentUsageDollars};
}
export function assess(current,previous){
 const warnings=[];let monthlyRunRateDollars=null,projectedPeriodDollars=null,intervalHours=null;
 if(current.currentUsageDollars>=budget)warnings.push('ACTUAL_USAGE_AT_OR_ABOVE_BUDGET');
 else if(current.currentUsageDollars>=24)warnings.push('ACTUAL_USAGE_APPROACHING_BUDGET');
 const compatible=previous?.schemaVersion===1&&previous.projectId===projectId&&previous.workspaceId===workspaceId&&previous.periodStart===current.periodStart&&previous.periodEnd===current.periodEnd;
 if(compatible&&Number.isFinite(previous.observedAt)&&Number.isFinite(previous.currentUsageDollars)&&previous.currentUsageDollars>=0){
  const dt=current.observedAt-previous.observedAt,delta=current.currentUsageDollars-previous.currentUsageDollars;
  if(dt>=hour&&dt<=48*hour&&delta>0){
   intervalHours=dt/hour;monthlyRunRateDollars=delta/dt*month;
   projectedPeriodDollars=current.currentUsageDollars+delta/dt*(current.periodEnd-current.observedAt);
   if(Math.max(monthlyRunRateDollars,projectedPeriodDollars)>=budget)warnings.push('PROJECTED_USAGE_AT_OR_ABOVE_BUDGET');
  }
 }
 if(monthlyRunRateDollars===null)warnings.push('PROJECTION_UNAVAILABLE_OR_BILLING_LAG');
 return {...current,budgetDollars:budget,intervalHours,monthlyRunRateDollars,projectedPeriodDollars,
  status:warnings.some(x=>x!=='PROJECTION_UNAVAILABLE_OR_BILLING_LAG')?'WARNING':monthlyRunRateDollars===null?'UNKNOWN':'BELOW_THRESHOLD_AT_OBSERVED_RATE',warnings,
  scope:'Project resource usage only; approximate trailing-rate projection, not an invoice or spending cap. Excludes workspace subscription, other projects, taxes and any charges absent from Railway project usage. Bucket and external-provider costs require separate verification. No workload or account changes.'};
}
async function main(){
 const args=process.argv.slice(2);if(args.length!==1)throw new Error('USAGE: node scripts/deploy/monitor-project-cost.mjs PATH_TO_PRIVATE_SAMPLE_JSON');
 const path=resolve(args[0]);let previous;
 try{previous=JSON.parse(readFileSync(path,'utf8'));}catch(error){if(error.code!=='ENOENT')throw new Error('INVALID_PREVIOUS_SAMPLE');}
 const {stdout}=await promisify(execFile)('pnpm',['exec','railway','usage','projects','--project',projectId,'--workspace',workspaceId,'--period','current','--json'],{timeout:30000,maxBuffer:256*1024,encoding:'utf8'});
 const current=snapshot(JSON.parse(stdout)),result=assess(current,previous);
 // Preserve the baseline for frequent polling; rotate hourly, at period rollover, or on billing correction.
 if(!previous||previous.periodStart!==current.periodStart||current.observedAt-previous.observedAt>=hour||current.currentUsageDollars<previous.currentUsageDollars){
  mkdirSync(dirname(path),{recursive:true});const temp=`${path}.${process.pid}.tmp`;
  writeFileSync(temp,JSON.stringify(current)+'\n',{mode:0o600,flag:'wx'});renameSync(temp,path);
 }
 console.log(JSON.stringify(result,null,2));process.exitCode=result.status==='WARNING'?2:result.status==='UNKNOWN'?3:0;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main().catch(()=>{console.error(JSON.stringify({status:'UNKNOWN',error:'PROJECT_USAGE_CHECK_FAILED'}));process.exitCode=1;});
