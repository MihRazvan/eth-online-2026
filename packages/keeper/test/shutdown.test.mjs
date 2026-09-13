import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdtempSync,rmSync,writeFileSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
import {keccak256,encodeFunctionData} from 'viem';
import {privateKeyToAccount} from 'viem/accounts';
import {keeperConfig} from '../src/config.mjs';
import {KeeperStore} from '../src/store.mjs';
import {checkpointAbi} from '../src/worker.mjs';
const a=n=>'0x'+String(n).padStart(40,'0'),hash='0x'+'01'.repeat(32),pin=keccak256('0x6000');
const account=privateKeyToAccount('0x'+'11'.repeat(32)); // Throwaway test signer; no public RPC.
async function fixture(t,{held=false}={}){
 const dir=mkdtempSync(join(tmpdir(),'keeper-shutdown-')),database=join(dir,'keeper.sqlite'),pending=[];
 let release=!held,requested;const firstRequest=new Promise(r=>{requested=r;});
 const respond=(response,id)=>{response.writeHead(200,{'content-type':'application/json'});response.end(JSON.stringify({jsonrpc:'2.0',id,error:{code:-32000,message:'Controlled read-only observation failure'}}));};
 const server=createServer(async(req,res)=>{let body='';for await(const chunk of req)body+=chunk;const input=JSON.parse(body);assert.notEqual(input.method,'eth_sendRawTransaction');requested();if(release)respond(res,input.id);else pending.push([res,input.id]);});
 server.listen(0,'127.0.0.1');await once(server,'listening');
 const config={chainId:31337,genesisHash:hash,feeStrip:a(1),verifier:a(2),checkpoints:a(3),poolManager:a(4),usdc:a(5),expectedSigner:account.address,managerCodeHash:pin,codeHashes:Object.fromEntries(['feeStrip','verifier','checkpoints','poolManager'].map(k=>[k,pin])),rpcUrls:[`http://127.0.0.1:${server.address().port}`],enabled:false,gasLimit:'80000',maxFeePerGas:'10000000000',maxPriorityFeePerGas:'5000000000',maxTxCostWei:'800000000000000',dailyBudgetWei:'8000000000000000',minBalanceWei:'100000000000000',intervalMs:30000,database};
 // A real signature was durably journaled before the process starts. Its failed
 // read-only observation must neither erase nor replace those existing bytes.
 const raw=await account.signTransaction({chainId:31337,type:'eip1559',to:config.checkpoints,data:encodeFunctionData({abi:checkpointAbi,functionName:'checkpoint',args:[123n]}),nonce:7,value:0n,gas:80000n,maxFeePerGas:10000000000n,maxPriorityFeePerGas:1000000000n});
 const store=new KeeperStore(database);store.bind(keeperConfig(config).fingerprint);store.upsert(1,123,'due');
 store.journal({hash:keccak256(raw),nonce:7,endpoint:123,raw,max_fee:'10000000000',priority_fee:'1000000000',reserved:'800000000000000',head:124});
 const original=store.activeTxs(),reservation=store.reserveCost();store.close();
 const path=join(dir,'config.json');writeFileSync(path,JSON.stringify(config));
 const child=spawn(process.execPath,[fileURLToPath(new URL('../src/cli.mjs',import.meta.url))],{env:{PATH:process.env.PATH,KEEPER_CONFIG:path},stdio:['ignore','pipe','pipe']});
 const exited=once(child,'exit');let output='',observed;const observation=new Promise(r=>{observed=r;});
 child.stdout.on('data',chunk=>{output+=chunk;if(output.includes('"status":"unavailable"'))observed();});child.stderr.resume();
 const unblock=()=>{release=true;for(const [res,id] of pending.splice(0))if(!res.destroyed)respond(res,id);};
 t.after(async()=>{unblock();if(child.exitCode===null&&child.signalCode===null){child.kill('SIGKILL');await exited;}server.closeAllConnections();await new Promise(r=>server.close(r));rmSync(dir,{recursive:true,force:true});});
 return {database,child,exited,firstRequest,observation,unblock,original,reservation};
}
function preserved(f){
 assert.equal(existsSync(f.database+'.lock'),false,'Graceful shutdown must remove its own lock');
 const reopened=new KeeperStore(f.database);
 try{assert.deepEqual(reopened.activeTxs(),f.original);assert.equal(reopened.reserveCost(),f.reservation);assert.equal(reopened.jobs()[0].end_block,123);}
 finally{reopened.close();}
}
test('real keeper child tolerates repeated SIGTERM during an in-flight RPC and preserves journal on graceful close',{timeout:10000},async t=>{
 const f=await fixture(t,{held:true});await f.firstRequest;assert(existsSync(f.database+'.lock'));
 f.child.kill('SIGTERM');await delay(75);f.child.kill('SIGTERM');await delay(75);
 assert.equal(f.child.exitCode,null);assert.equal(f.child.signalCode,null,'Second SIGTERM must not bypass finally');
 f.unblock();const [code,signal]=await f.exited;assert.equal(code,0);assert.equal(signal,null);preserved(f);
});
test('real keeper child aborts its 30-second idle wait on shutdown instead of exceeding the host drain budget',{timeout:10000},async t=>{
 const f=await fixture(t);await f.observation;await delay(50);const started=Date.now();f.child.kill('SIGINT');
 const [code,signal]=await f.exited;assert.equal(code,0);assert.equal(signal,null);assert(Date.now()-started<1500,'Idle wait was not interrupted promptly');preserved(f);
});
