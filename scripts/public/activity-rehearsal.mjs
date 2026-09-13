#!/usr/bin/env node
/** Exact NFT39216 controlled-donation qualification on a fresh isolated Sepolia fork.
 * Start the credential-isolating read-only rpc-proxy.mjs, then dedicated Anvil8596.
 * node scripts/public/activity-rehearsal.mjs --fork-block NUMBER --fork-hash HASH
 * Requires existing Foundry artifacts. NEVER signs transactions or accepts a public RPC.
 */
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {parseArgs} from 'node:util';
import {pathToFileURL} from 'node:url';
import {createPublicClient,createWalletClient,http,parseAbi,parseAbiParameters,encodeAbiParameters,encodeFunctionData,encodeDeployData,keccak256,toHex} from 'viem';
import {sepolia} from 'viem/chains';
import {LIMITS} from './test-plan.mjs';

const root=new URL('../../',import.meta.url),read=path=>JSON.parse(readFileSync(new URL(path,root),'utf8'));
const same=(a,b)=>a.toLowerCase()===b.toLowerCase();
const artifact=name=>read(`contracts/out/${name==='LocalActivityRouter'?'LocalFixtures':name}.sol/${name}.json`);
const erc20=parseAbi(['function balanceOf(address) view returns(uint256)','function allowance(address,address) view returns(uint256)','function approve(address,uint256) returns(bool)','function transfer(address,uint256) returns(bool)']);
const managerAbi=parseAbi(['function extsload(bytes32) view returns(bytes32)']);
const json=value=>JSON.stringify(value,(_,v)=>typeof v==='bigint'?String(v):v,2);
let stage='arguments';
export async function rehearse({rpc='http://127.0.0.1:8596',forkBlock,forkHash}){
 const url=new URL(rpc);assert(url.protocol==='http:'&&url.hostname==='127.0.0.1'&&url.port==='8596'&&url.pathname==='/'&&!url.search&&!url.username&&!url.password,'Dedicated fork8596 only');
 assert(typeof forkBlock==='bigint'&&forkBlock>0n&&/^0x[0-9a-f]{64}$/i.test(forkHash),'Exact fork identity required');
 const client=createPublicClient({chain:sepolia,transport:http(rpc,{timeout:30000,retryCount:0})});
 const request=(method,params=[])=>client.request({method,params});
 stage='fork-identity';assert.match(await request('web3_clientVersion'),/anvil/i);assert.equal(await client.getChainId(),11155111);
 const head=await client.getBlock({blockTag:'latest'});assert.equal(head.number,forkBlock,'Fresh untouched fork required');assert(same(head.hash,forkHash));
 const d=read('deployments/sepolia.json'),pins=read('docs/evidence/sepolia-deployment.json'),a=artifact('LocalActivityRouter');
 for(const [path,pin] of Object.entries(a.metadata.sources))assert(same(keccak256(readFileSync(new URL(path,root))),pin.keccak256),'Artifact source changed');
 for(const name of ['feeStrip','verifier','checkpoints'])assert(same(keccak256(await client.getBytecode({address:d[name]})),pins.contracts[name].observedRuntimeHash),'Runtime pin mismatch');
 assert(same(keccak256(await client.getBytecode({address:d.poolManager})),pins.pins.poolManager),'Manager pin mismatch');
 const accounts=await request('eth_accounts'),seller=LIMITS.seller,buyer=accounts[1],oracleRecipient=accounts[2];assert(!same(seller,buyer));
 const call=(address,abi,functionName,args=[],blockNumber)=>client.readContract({address,abi,functionName,args,...(blockNumber===undefined?{}:{blockNumber})});
 const readContract=(address,name,functionName,args=[],blockNumber)=>call(address,artifact(name).abi,functionName,args,blockNumber);
 const balance=address=>call(d.usdc,erc20,'balanceOf',[address]);
 const wallet=account=>createWalletClient({chain:sepolia,account,transport:http(rpc,{timeout:30000,retryCount:0})});
 let snapshot;const receipts=[];
 const send=async(account,address,abi,functionName,args=[])=>{
  const {request:tx}=await client.simulateContract({account,address,abi,functionName,args});
  const hash=await wallet(account).writeContract(tx),receipt=await client.waitForTransactionReceipt({hash});assert.equal(receipt.status,'success');
  receipts.push({functionName,from:account,to:address,transactionHash:hash,blockNumber:receipt.blockNumber,gasUsed:receipt.gasUsed});return receipt;
 };
 const tx=(account,address,name,functionName,args=[])=>send(account,address,artifact(name).abi,functionName,args);
 stage='position';assert(same(await readContract(d.positionManager,'PositionManager','ownerOf',[LIMITS.tokenId]),seller));
 const [key,info]=await readContract(d.positionManager,'PositionManager','getPoolAndPositionInfo',[LIMITS.tokenId]);
 assert(same(key.currency0,d.usdc)&&same(key.currency1,d.other)&&BigInt(key.hooks)===0n&&key.fee===3000&&key.tickSpacing===60,'Exact USDC/WETH pool required');
 const liquidity=await readContract(d.positionManager,'PositionManager','getPositionLiquidity',[LIMITS.tokenId]);
 const commitment=await readContract(d.feeStrip,'FeeStrip','positionCommitment',[LIMITS.tokenId]);
 const lower=Number(BigInt.asIntN(24,info>>8n)),upper=Number(BigInt.asIntN(24,info>>32n));
 const poolId=keccak256(encodeAbiParameters(parseAbiParameters('(address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks)'),[key]));
 const slots=await readContract(d.verifier,'HistoricalFeeVerifier','storageSlots',[poolId,lower,upper,true]);
 const growth=async(blockNumber)=>{
  const v=await Promise.all(slots.map(slot=>call(d.poolManager,managerAbi,'extsload',[slot],blockNumber).then(BigInt)));
  const tick=Number(BigInt.asIntN(24,v[0]>>160n));assert(lower<=tick&&tick<upper,'Position left range');
  return BigInt.asUintN(256,v[1]-v[2]-v[3]);
 };
 try{
  snapshot=await request('evm_snapshot');await request('anvil_impersonateAccount',[seller]);
  stage='helper-deployment';const creationData=encodeDeployData({abi:a.abi,bytecode:a.bytecode.object,args:[d.poolManager,key]});
  const hash=await wallet(seller).deployContract({abi:a.abi,bytecode:a.bytecode.object,args:[d.poolManager,key]});
  const deploy=await client.waitForTransactionReceipt({hash});assert.equal(deploy.status,'success');const router=deploy.contractAddress;assert(router);
  receipts.push({functionName:'deploy-LocalActivityRouter',from:seller,to:router,transactionHash:hash,blockNumber:deploy.blockNumber,gasUsed:deploy.gasUsed});
  assert(same(await call(router,a.abi,'manager'),d.poolManager));assert.deepEqual(await call(router,a.abi,'key'),[key.currency0,key.currency1,key.fee,key.tickSpacing,key.hooks]);
  const runtimeHash=keccak256(await client.getBytecode({address:router}));
  const nativeCollect=async owner=>{
   const point=await request('evm_snapshot');try{
    await request('anvil_setBalance',[owner,toHex(10n**20n)]);await request('anvil_impersonateAccount',[owner]);
    const before=await balance(oracleRecipient),b=await client.getBlock();
    const p0=encodeAbiParameters(parseAbiParameters('uint256,uint256,uint128,uint128,bytes'),[LIMITS.tokenId,0n,0n,0n,'0x']);
    const p1=encodeAbiParameters(parseAbiParameters('address,address,address'),[key.currency0,key.currency1,oracleRecipient]);
    const unlock=encodeAbiParameters(parseAbiParameters('bytes,bytes[]'),['0x0111',[p0,p1]]);
    const h=await wallet(owner).writeContract({address:d.positionManager,abi:artifact('PositionManager').abi,functionName:'modifyLiquidities',args:[unlock,b.timestamp+3600n]});
    const receipt=await client.waitForTransactionReceipt({hash:h});assert.equal(receipt.status,'success');return await balance(oracleRecipient)-before;
   }finally{assert.equal(await request('evm_revert',[point]),true);}
  };
  stage='activation';const oldFees=await nativeCollect(seller);
  await send(seller,d.usdc,erc20,'transfer',[buyer,LIMITS.paymentMicros]);await send(buyer,d.usdc,erc20,'approve',[d.feeStrip,LIMITS.paymentMicros]);
  const current=await client.getBlock(),end=current.number+120n,offerId=await readContract(d.feeStrip,'FeeStrip','nextOfferId'),seriesId=await readContract(d.feeStrip,'FeeStrip','nextSeriesId');
  await tx(buyer,d.feeStrip,'FeeStrip','fundOffer',[seller,LIMITS.tokenId,LIMITS.originalQ,LIMITS.buyerQuantity,LIMITS.paymentMicros,end,current.timestamp+600n,commitment]);
  await tx(seller,d.positionManager,'PositionManager','approve',[d.feeStrip,LIMITS.tokenId]);
  const sellerBefore=await balance(seller);await tx(seller,d.feeStrip,'FeeStrip','acceptOffer',[offerId,LIMITS.paymentMicros]);
  assert.equal(await balance(seller)-sellerBefore,LIMITS.paymentMicros+oldFees);assert(same(await readContract(d.positionManager,'PositionManager','ownerOf',[LIMITS.tokenId]),d.feeStrip));
  const active=await readContract(d.feeStrip,'FeeStrip','series',[seriesId]);assert.equal(active.liquidity,liquidity);assert.equal(active.quantity,LIMITS.originalQ);
  stage='controlled-donations';await send(seller,d.usdc,erc20,'approve',[router,1500000n]);
  assert.equal(await call(d.usdc,erc20,'allowance',[d.feeStrip,router]),0n,'No FeeStrip reserve approval');
  const beforeDonation=await balance(seller);await tx(seller,router,'LocalActivityRouter','donate',[1000000n,0n]);assert.equal(beforeDonation-await balance(seller),1000000n);
  assert.equal(await balance(router),0n);assert.equal(await call(d.other,erc20,'balanceOf',[router]),0n);
  const number=await client.getBlockNumber({cacheTime:0});assert(number<end);await request('anvil_mine',[toHex(end-number)]);
  const growthN=await growth(end),nativeAtN=await nativeCollect(d.feeStrip),modeledAtN=liquidity*BigInt.asUintN(256,growthN-active.baselineX128)/(1n<<128n);
  assert(nativeAtN>0n);assert.equal(nativeAtN,modeledAtN,'Independent native collection and actual growth delta disagree');
  const beforePost=await balance(seller);await tx(seller,router,'LocalActivityRouter','donate',[500000n,0n]);assert.equal(beforePost-await balance(seller),500000n);
  const nativeLate=await nativeCollect(d.feeStrip);assert(nativeLate>nativeAtN);
  stage='late-capture-return';await tx(buyer,d.feeStrip,'FeeStrip','capture',[seriesId]);
  const captured=await readContract(d.feeStrip,'FeeStrip','series',[seriesId]);assert.equal(captured.capturedUSDC,nativeLate);
  await tx(seller,d.feeStrip,'FeeStrip','withdrawNFT',[seriesId,seller]);
  assert(same(await readContract(d.positionManager,'PositionManager','ownerOf',[LIMITS.tokenId]),seller));assert.equal(await readContract(d.positionManager,'PositionManager','getPositionLiquidity',[LIMITS.tokenId]),liquidity);
  assert.equal((await readContract(d.feeStrip,'FeeStrip','series',[seriesId])).allocated,false);
  assert.equal(await call(d.usdc,erc20,'allowance',[seller,router]),0n);assert.equal(await balance(router),0n);assert.equal(await call(d.other,erc20,'balanceOf',[router]),0n);
  // Exact allowance is exhausted; a third donation cannot consume payer or reserve funds.
  await assert.rejects(()=>client.simulateContract({account:seller,address:router,abi:a.abi,functionName:'donate',args:[1n,0n]}));
  return {scope:'Pinned isolated Sepolia fork; unsigned impersonated test transactions and controlled USDC donations. No public deployment, organic activity, proof allocation or human acceptance.',passed:true,publicTransactionsSent:false,
   fork:{block:forkBlock,hash:forkHash},position:{tokenId:LIMITS.tokenId,owner:seller,liquidity,poolId,key,lower,upper,commitment},
   helper:{source:'contracts/src/demo/LocalFixtures.sol:LocalActivityRouter',compiler:a.metadata.compiler,sourceHash:a.metadata.sources['contracts/src/demo/LocalFixtures.sol'].keccak256,creationBytecodeHash:keccak256(a.bytecode.object),creationDataHash:keccak256(creationData),runtimeHash,constructorArgs:[d.poolManager,key],forkAddress:router,
    forkEnvelopeExamples:[{to:d.usdc,data:encodeFunctionData({abi:erc20,functionName:'approve',args:[router,1500000n]}),purpose:'Fork address only: regenerate exact1.5USDC approval for the reviewed public deployment'},...[[1000000n,0n],[500000n,0n]].map(args=>({to:router,data:encodeFunctionData({abi:a.abi,functionName:'donate',args}),purpose:'Fork address only: bind the exact reviewed public router; generic swap is not authorized'}))],
    limits:'Existing helper is general and has no chain guard. Only a Sepolia-pinned exact-envelope bridge may deploy/use it publicly. The only payer is msg.sender; no reserve wallet approval, generic swap, arbitrary pool or unlimited allowance is authorized.'},
   accounting:{oldFees,baselineX128:active.baselineX128,growthAtN: growthN,nativeAtN,modeledAtN,nativeLate,capturedUSDC:captured.capturedUSDC,residualUSDC:nativeLate-nativeAtN,totalDonationsMicros:1500000n,routerUSDC:0n,routerWETH:0n,remainingAllowance:0n,nftReturnedBeforeAllocation:true},receipts};
 }finally{
  if(snapshot)assert.equal(await request('evm_revert',[snapshot]),true,'Fork restore failed');
  await request('anvil_stopImpersonatingAccount',[seller]).catch(()=>{});await request('anvil_stopImpersonatingAccount',[d.feeStrip]).catch(()=>{});
 }
}
async function main(){
 const {values}=parseArgs({options:{'fork-block':{type:'string'},'fork-hash':{type:'string'}}});
 const report=await rehearse({forkBlock:BigInt(values['fork-block']),forkHash:values['fork-hash']});
 mkdirSync('.scratch/activity-rehearsal',{recursive:true,mode:0o700});writeFileSync('.scratch/activity-rehearsal/evidence.json',json(report)+'\n',{mode:0o600});
 console.log(json({passed:report.passed,scope:report.scope,helper:report.helper,accounting:report.accounting,gas:report.receipts.map(r=>({function:r.functionName,gas:r.gasUsed}))}));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(()=>{console.error(json({error:'ACTIVITY_REHEARSAL_FAILED',stage,publicTransactionsSent:false}));process.exitCode=1;});
