// Rehearse only two replacement deployments on an isolated fork. Never signs or sends to Sepolia.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {once} from 'node:events';
import {setTimeout as delay} from 'node:timers/promises';
import {createPublicClient,createWalletClient,http,keccak256,parseAbi} from 'viem';
import {sepolia} from 'viem/chains';
import {artifact} from '../chain/common.mjs';
import {privateJSON} from '../../packages/operations/src/config.mjs';
const rpc='https://ethereum-sepolia-rpc.publicnode.com',local='http://127.0.0.1:8564';
let processAnvil,stage='configuration';
try{
 const manifest=JSON.parse(readFileSync('deployments/sepolia.json')),evidence=JSON.parse(readFileSync('docs/evidence/sepolia-deployment.json'));
 const publicClient=createPublicClient({chain:sepolia,transport:http(rpc,{timeout:10000,retryCount:0})});
 stage='public block';const block=await publicClient.getBlock();assert.equal(await publicClient.getChainId(),11155111);
 const probe=createServer();probe.listen(8564,'127.0.0.1');await once(probe,'listening');await new Promise(r=>probe.close(r));
 processAnvil=spawn('anvil',['--host','127.0.0.1','--port','8564','--fork-url',rpc,'--fork-block-number',String(block.number),'--chain-id','11155111','--silent'],{stdio:'ignore'});
 const client=createPublicClient({chain:sepolia,transport:http(local,{retryCount:0})});
 for(let i=0;;i++){try{await client.getChainId();break;}catch{if(i===100)throw new Error();await delay(100);}}
 assert.match(await client.request({method:'web3_clientVersion'}),/anvil/i);
 const account=evidence.account,wallet=createWalletClient({account,chain:sepolia,transport:http(local)});
 await client.request({method:'anvil_impersonateAccount',params:[account]});
 stage='old deployment emptiness';const [series,offers,liabilities,balance]=await Promise.all([
  client.readContract({address:manifest.feeStrip,abi:artifact('FeeStrip').abi,functionName:'nextSeriesId'}),
  client.readContract({address:manifest.feeStrip,abi:artifact('FeeStrip').abi,functionName:'nextOfferId'}),
  client.readContract({address:manifest.feeStrip,abi:artifact('FeeStrip').abi,functionName:'fundedOfferUSDC'}),
  client.readContract({address:manifest.usdc,abi:parseAbi(['function balanceOf(address) view returns(uint256)']),functionName:'balanceOf',args:[manifest.feeStrip]})]);
 assert.equal(series,1n,'Existing series require a migration design');assert(offers>=1n&&offers<=101n,'Review large offer history separately');assert.equal(balance,liabilities,'Unattributed assets require a migration design');
 const requiredRefunds=[];
 // Rehearse each participant refund on this fork only. The actual buyer must authorize it publicly.
 for(let id=1n;id<offers;id++){
  const offer=await client.readContract({address:manifest.feeStrip,abi:artifact('FeeStrip').abi,functionName:'offers',args:[id]});
  if(offer[9])continue;
  const buyer=offer[0];await client.request({method:'anvil_impersonateAccount',params:[buyer]});
  const buyerWallet=createWalletClient({account:buyer,chain:sepolia,transport:http(local)});
  const hash=await buyerWallet.writeContract({address:manifest.feeStrip,abi:artifact('FeeStrip').abi,functionName:'cancelOffer',args:[id]});
  assert.equal((await client.waitForTransactionReceipt({hash})).status,'success');
  requiredRefunds.push({offerId:String(id),buyer,amountMicros:String(offer[5]),forkRefundTransaction:hash,publicConfirmationRequired:true});
 }
 assert.equal(await client.readContract({address:manifest.feeStrip,abi:artifact('FeeStrip').abi,functionName:'fundedOfferUSDC'}),0n);
 assert.equal(await client.readContract({address:manifest.usdc,abi:parseAbi(['function balanceOf(address) view returns(uint256)']),functionName:'balanceOf',args:[manifest.feeStrip]}),0n);
 stage='old runtime pins';for(const name of ['feeStrip','verifier','checkpoints'])assert.equal(keccak256(await client.getCode({address:manifest[name]})),evidence.contracts[name].observedRuntimeHash);
 const nonce=await client.getTransactionCount({address:account}),transactions=[];
 async function deploy(name,args){const a=artifact(name),hash=await wallet.deployContract({abi:a.abi,bytecode:a.bytecode.object,args});
  const receipt=await client.waitForTransactionReceipt({hash});assert.equal(receipt.status,'success');assert(receipt.contractAddress);
  const tx=await client.getTransaction({hash});transactions.push({name,address:receipt.contractAddress,nonce:tx.nonce,constructorArgs:args,calldataHash:keccak256(tx.input),runtimeHash:keccak256(await client.getCode({address:receipt.contractAddress})),gasUsed:String(receipt.gasUsed),transactionHash:hash});return receipt.contractAddress;}
 stage='FeeStrip deployment';const feeStrip=await deploy('FeeStrip',[manifest.positionManager,manifest.usdc,manifest.verifier]);
 stage='market deployment';const market=await deploy('FeeStripMarket',[feeStrip,manifest.swapRouter]);
 stage='new immutable bindings';for(const [key,expected] of Object.entries({positionManager:manifest.positionManager,poolManager:manifest.poolManager,usdc:manifest.usdc,verifier:manifest.verifier}))assert.equal((await client.readContract({address:feeStrip,abi:artifact('FeeStrip').abi,functionName:key})).toLowerCase(),expected.toLowerCase());
 assert.equal((await client.readContract({address:market,abi:artifact('FeeStripMarket').abi,functionName:'feeStrip'})).toLowerCase(),feeStrip.toLowerCase());
 assert.equal((await client.readContract({address:market,abi:artifact('FeeStripMarket').abi,functionName:'router'})).toLowerCase(),manifest.swapRouter.toLowerCase());
 stage='canonical position getter';const commitment=await client.readContract({address:feeStrip,abi:artifact('FeeStrip').abi,functionName:'positionCommitment',args:[39216n]});assert.match(commitment,/^0x[0-9a-f]{64}$/);
 const plan={scope:'Isolated Sepolia fork; participant refunds followed by two replacement deployments; no public transactions or manifests changed',chainId:11155111,baseBlock:String(block.number),baseHash:block.hash,account,initialNonce:nonce,oldFeeStrip:manifest.feeStrip,oldMarket:manifest.market,oldDeploymentEmptyOnPublicChain:liabilities===0n,requiredRefunds,transactions,
  totalDeploymentGas:String(transactions.reduce((sum,t)=>sum+BigInt(t.gasUsed),0n)),remaining:['Fresh public nonce/state/balance checks','Public deployment and independent runtime/binding readback','Update manifest and operational pins','Redeploy Subgraph at new FeeStrip address','Operate endpoint service before new sales']};
 privateJSON('.scratch/operations/commitment-upgrade-plan.json',plan);console.log(JSON.stringify(plan));
}catch(error){console.error(JSON.stringify({error:'UPGRADE_REHEARSAL_FAILED',stage,code:error.code??error.name,detail:String(error.shortMessage??error.message).split('\n')[0].slice(0,250)}));process.exitCode=1;}
finally{if(processAnvil){processAnvil.kill('SIGTERM');await once(processAnvil,'exit').catch(()=>{});}}
