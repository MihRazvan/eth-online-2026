// Actual canonical Sepolia contracts on the dedicated fork; never public writes.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createPublicClient,createWalletClient,http,parseAbi,toHex} from 'viem';
import {sepolia} from 'viem/chains';
import {artifact} from '../chain/common.mjs';
const client=createPublicClient({chain:sepolia,transport:http('http://127.0.0.1:8552')});
const evidence=JSON.parse(readFileSync('.scratch/public-rehearse/evidence.json'));
const manifest=JSON.parse(readFileSync('.scratch/public-rehearse/deployment.json'));
let snapshot;
try {
  assert.equal(await client.getChainId(),11155111);
  assert.match(await client.request({method:'web3_clientVersion'}),/anvil/i);
  const account=evidence.account,nftId=BigInt(evidence.position.nftId);
  const wallet=createWalletClient({account,chain:sepolia,transport:http('http://127.0.0.1:8552')});
  await client.request({method:'anvil_impersonateAccount',params:[account]});
  snapshot=await client.request({method:'evm_snapshot'});
  const receipts=[];
  const read=(address,name,functionName,args=[])=>client.readContract({address,abi:artifact(name).abi,functionName,args});
  async function send(address,abi,functionName,args) {
    const {request}=await client.simulateContract({address,abi,functionName,args,account});
    const hash=await wallet.writeContract(request),r=await client.waitForTransactionReceipt({hash});
    assert.equal(r.status,'success');receipts.push({functionName,transactionHash:hash,blockNumber:r.blockNumber.toString(),gasUsed:r.gasUsed.toString()});
  }
  const fs=manifest.feeStrip,posm=manifest.positionManager;
  await send(manifest.usdc,parseAbi(['function approve(address,uint256) returns(bool)']),'approve',[fs,1_000_000n]);
  await send(posm,artifact('PositionManager').abi,'approve',[fs,nftId]);
  const block=await client.getBlock(),end=block.number+12n;
  const offer=await read(fs,'FeeStrip','nextOfferId'),seriesId=await read(fs,'FeeStrip','nextSeriesId');
  const commitment=await read(fs,'FeeStrip','positionCommitment',[nftId]);
  await send(fs,artifact('FeeStrip').abi,'fundOffer',[account,nftId,10000n*10n**18n,7500n*10n**18n,1_000_000n,end,block.timestamp+3600n,commitment]);
  await send(fs,artifact('FeeStrip').abi,'acceptOffer',[offer,1_000_000n]);
  assert.equal((await read(posm,'PositionManager','ownerOf',[nftId])).toLowerCase(),fs.toLowerCase());
  const active=await read(fs,'FeeStrip','series',[seriesId]);
  assert.equal(active.liquidity,BigInt(evidence.position.liquidity));
  assert.equal(active.tokenId,nftId);
  await client.request({method:'anvil_mine',params:[toHex(end+1n-await client.getBlockNumber())]});
  await send(fs,artifact('FeeStrip').abi,'capture',[seriesId]);
  await send(fs,artifact('FeeStrip').abi,'withdrawNFT',[seriesId,account]);
  const captured=await read(fs,'FeeStrip','series',[seriesId]);
  assert.equal(captured.captured,true);assert.equal(captured.nftReturned,true);assert.equal(captured.allocated,false);
  assert.equal((await read(posm,'PositionManager','ownerOf',[nftId])).toLowerCase(),account.toLowerCase());
  assert.equal(await read(posm,'PositionManager','getPositionLiquidity',[nftId]),active.liquidity);
  assert.equal(await client.request({method:'evm_revert',params:[snapshot]}),true);snapshot=undefined;
  writeFileSync('.scratch/public-rehearse/custody.json',JSON.stringify({scope:'Actual deployed canonical Sepolia PosM on isolated historical fork. One-wallet funded custody, zero-liquidity collection and original NFT return before allocation. State reverted after test. No public sale, proof or independent participant acceptance.',status:'passed',implementationHash:evidence.implementationHash,nftId:nftId.toString(),capturedUSDC:captured.capturedUSDC.toString(),receipts},null,2)+'\n');
  console.log('Canonical fork custody passed; original NFT returned before proof. Fork test changes reverted.');
} catch {console.error('Canonical fork custody failed; inspect local fork without printing credentials.');process.exitCode=1;}
finally {if(snapshot)await client.request({method:'evm_revert',params:[snapshot]});}
