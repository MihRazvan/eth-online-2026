import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {RetentionStore,digest,stableJSON} from '../../packages/settlement/src/store.mjs';
import {publicArtifact} from '../../packages/settlement/src/artifact.mjs';
import {restoreProof} from './verify-proof-restore.mjs';

const raw=JSON.parse(readFileSync(new URL('../proof/sepolia-witness.json',import.meta.url)));
const artifact=publicArtifact(raw),hash=n=>'0x'+n.repeat(64);
const terms={chainId:'11155111',manager:raw.manager.toLowerCase(),managerCodeHash:'0x09930125a49f5b95caf8052991cc14d1240dca8b43f42b899115b86867e4bce1',feeStrip:'0x'+'11'.repeat(20),seriesId:'1',activationBlock:String(BigInt(raw.blockNumber)-100n),activationHash:hash('4'),endBlock:String(raw.blockNumber),slots:raw.slots,lifecycle:'active'};
function setup(t,{proof=artifact}={}){
 const directory=mkdtempSync(join(tmpdir(),'restore-verifier-test-'));
 const store=new RetentionStore(join(directory,'fresh.sqlite'),{artifactRoots:[join(directory,'first'),join(directory,'second')]});
 t.after(()=>{store.close();rmSync(directory,{recursive:true,force:true});});
 const config={chainId:11155111,feeStrip:terms.feeStrip,identity:{chainId:11155111,feeStrip:terms.feeStrip}};
 const scope=digest(stableJSON(config.identity)),job=digest({scope,terms:{...terms,lifecycle:undefined}}),payload=Buffer.from(stableJSON(proof)),id=digest(payload);
 const base=`usufruct-proof-v1/11155111/${terms.feeStrip}/${scope}/1/${terms.activationHash}/${artifact.blockHash}/${job}`;
 const objects=new Map([[`${base}/${id}.json`,payload],[`${base}/current.json`,Buffer.from(JSON.stringify({version:1,scope,job,endpointHash:artifact.blockHash,digest:id,key:`${base}/${id}.json`}))]]);
 let writes=0,reads=0;
 const remote={get:async key=>{reads++;if(!objects.has(key))throw new Error('missing');return objects.get(key);},put:async()=>{writes++;throw new Error('Forbidden remote write');}};
 const chain={observe:async()=>({head:{number:BigInt(raw.blockNumber)+10n,hash:hash('9')},finalized:{number:BigInt(raw.blockNumber),hash:artifact.blockHash}}),discover:async()=>({terms:[terms],complete:true}),assertObservation:async()=>{},endpointObservation:async()=>({hash:artifact.blockHash,finalized:true})};
 return {args:{client:{},config,store,remote,seriesId:'1',chain},objects,get reads(){return reads;},get writes(){return writes;}};
}
test('real witness is restored into an empty DB and two verified copies exclusively through remote reads',async t=>{
 const h=setup(t),result=await restoreProof(h.args);
 assert.equal(result.authenticated,true);assert.equal(result.remoteReads,2);assert.equal(result.remoteWrites,0);assert.equal(result.rpcWitnessFallback,false);assert.equal(h.writes,0);assert.equal(h.args.store.healthy(result.artifactDigest),true);
 await assert.rejects(restoreProof(h.args),/FRESH_RESTORE_STORE_REQUIRED/);
});
test('self-consistent altered proof and missing bucket data cannot fall back to RPC',async t=>{
 const forged=structuredClone(artifact);forged.proof.storageProof[0].value='0x1';
 const corrupt=setup(t,{proof:forged});await assert.rejects(restoreProof(corrupt.args),/REMOTE_PROOF_INVALID/);assert.equal(corrupt.writes,0);
 const missing=setup(t);missing.objects.clear();await assert.rejects(restoreProof(missing.args));assert.equal(missing.writes,0);
 assert.equal(missing.args.store.db.prepare('SELECT count(*) AS n FROM artifacts').get().n,0);
});
test('finalized endpoint and complete discovery are required; a late reorg cannot stage a restored proof',async t=>{
 for(const mutate of [h=>h.args.chain.discover=async()=>({terms:[terms],complete:false}),h=>h.args.chain.endpointObservation=async()=>({hash:artifact.blockHash,finalized:false}),h=>{let calls=0;h.args.chain.endpointObservation=async()=>({hash:++calls===1?artifact.blockHash:hash('8'),finalized:true});}]){
  const h=setup(t);mutate(h);await assert.rejects(restoreProof(h.args));assert.equal(h.args.store.db.prepare('SELECT count(*) AS n FROM artifacts').get().n,0);assert.equal(h.writes,0);
 }
});
