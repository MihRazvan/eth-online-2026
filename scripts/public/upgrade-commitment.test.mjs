import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {generatePrivateKey,privateKeyToAccount} from 'viem/accounts';
import {keccak256,getContractAddress} from 'viem';
import {validateSignedEntry,LIMITS} from './upgrade-commitment.mjs';

// Disposable unfunded accounts; no deployment credentials, RPC or network writes.
function fixture(){
 const signer=privateKeyToAccount(generatePrivateKey());
 const planned={name:'FeeStrip',nonce:7,address:getContractAddress({from:signer.address,nonce:7n}),data:'0x60006000f3'};
 const base={chainId:11155111,type:'eip1559',data:planned.data,value:0n,nonce:7,gas:50000n,maxFeePerGas:2000000000n,maxPriorityFeePerGas:1000000000n};
 const entry=async(modification={},account=signer)=>{
  const request={...base,...modification},raw=await account.signTransaction(request);
  return {name:planned.name,nonce:7,address:planned.address,initCodeHash:keccak256(planned.data),gas:String(request.gas),maxFeePerGas:String(request.maxFeePerGas),maxPriorityFeePerGas:String(request.maxPriorityFeePerGas),maximumCost:String(request.gas*request.maxFeePerGas),raw,hash:keccak256(raw)};
 };
 return {signer,planned,entry};
}

test('persisted signed deployment authorization revalidates unchanged in a fresh process',async t=>{
 const f=fixture(),entry=await f.entry();await validateSignedEntry(entry,f.planned,f.signer.address);
 const directory=mkdtempSync(join(tmpdir(),'usufruct-upgrade-journal-'));t.after(()=>rmSync(directory,{recursive:true,force:true}));
 const path=join(directory,'journal.json');writeFileSync(path,JSON.stringify({entry,planned:f.planned,account:f.signer.address}),{mode:0o600});
 const moduleURL=new URL('./upgrade-commitment.mjs',import.meta.url).href;
 const child=spawnSync(process.execPath,['--input-type=module','-e',
  `import {readFileSync} from 'node:fs'; import {validateSignedEntry} from ${JSON.stringify(moduleURL)}; const j=JSON.parse(readFileSync(process.argv[1])); await validateSignedEntry(j.entry,j.planned,j.account); console.log('authorization-valid');`,path],{encoding:'utf8',timeout:10000,env:{PATH:process.env.PATH}});
 assert.equal(child.status,0);assert.equal(child.stdout.trim(),'authorization-valid');assert(!child.stdout.includes(entry.raw));
});

test('signed chain, nonce, destination, value, initcode, gas, fees and signer cannot change on resume',async()=>{
 const f=fixture();let rejected=0;
 for(const change of [{chainId:1},{nonce:8},{to:'0x'+'12'.repeat(20)},{value:1n},{data:'0x60016000f3'},{gas:LIMITS.gas.FeeStrip+1n},{maxFeePerGas:LIMITS.maxFeePerGas+1n}]){
  await assert.rejects(validateSignedEntry(await f.entry(change),f.planned,f.signer.address));rejected++;
 }
 await assert.rejects(validateSignedEntry(await f.entry({},privateKeyToAccount(generatePrivateKey())),f.planned,f.signer.address));rejected++;
 assert.equal(rejected,8);
});

test('journal metadata cannot weaken the recovered signed authorization or change deployment order',async()=>{
 const f=fixture(),entry=await f.entry();let rejected=0;
 for(const change of [{maximumCost:'1'},{nonce:6},{initCodeHash:'0x'+'12'.repeat(32)},{hash:'0x'+'12'.repeat(32)},{name:'FeeStripMarket'},{address:'0x'+'12'.repeat(20)},{gas:'1'},{maxFeePerGas:'1'},{maxPriorityFeePerGas:'1'}]){
  await assert.rejects(validateSignedEntry({...entry,...change},f.planned,f.signer.address));rejected++;
 }
 assert.equal(rejected,9);
});

test('individually valid gas and fee caps still cannot exceed the total test-ETH authorization',async()=>{
 const f=fixture(),entry=await f.entry({gas:LIMITS.gas.FeeStrip,maxFeePerGas:LIMITS.maxFeePerGas});
 assert(BigInt(entry.maximumCost)>LIMITS.totalCost);await assert.rejects(validateSignedEntry(entry,f.planned,f.signer.address),/Authorization budget exceeded/);
});
