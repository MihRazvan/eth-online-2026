#!/usr/bin/env node
/** Read-only bounded Sepolia rehearsal preflight. Never loads keys, signs or sends.
 * SEPOLIA_RPC_URL=https://... node scripts/public/test-plan.mjs [--window-blocks 120|180] [--buyer ADDRESS --holder ADDRESS]
 * Output is a snapshot and execution checklist, not a signed or automatically renewable intent.
 */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseArgs} from 'node:util';
import {pathToFileURL} from 'node:url';
import {createPublicClient,http,parseAbi,parseAbiParameters,encodeAbiParameters,keccak256,toHex,zeroAddress} from 'viem';
import {verify} from '../deploy/verify-operations.mjs';
import {readBounded} from '../../packages/operations/src/http.mjs';

const root=new URL('../../',import.meta.url),read=path=>JSON.parse(readFileSync(new URL(path,root),'utf8'));
const same=(a,b)=>typeof a==='string'&&typeof b==='string'&&a.toLowerCase()===b.toLowerCase();
export const LIMITS=Object.freeze({chainId:11155111,tokenId:39216n,seller:'0x92AAe0857979a139344f5b6F008e71F27A507522',keeper:'0xFfaa5fE1C38Aa538fd9B1A28D8CF8516fa3728Ad',
 genesisHash:'0x25a5cc106eea7138acab33231d7160d69cb777ee0c2c553fcddf5138993e6dd9',originalQ:10000n*10n**18n,buyerQuantity:2500n*10n**18n,paymentMicros:250000n,
 maximumEthWei:250000000000000000n,maximumUsdcMicros:3000000n,maxFeePerGas:30000000000n});
const posmAbi=parseAbi(['function ownerOf(uint256) view returns(address)','function getPositionLiquidity(uint256) view returns(uint128)',
 'function getPoolAndPositionInfo(uint256) view returns((address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks),uint256)']);
const feeAbi=parseAbi(['function positionCommitment(uint256) view returns(bytes32)','function nextSeriesId() view returns(uint256)',
 'function positionManager() view returns(address)','function poolManager() view returns(address)','function usdc() view returns(address)']);
const tokenAbi=parseAbi(['function balanceOf(address) view returns(uint256)','function decimals() view returns(uint8)']);
const managerAbi=parseAbi(['function extsload(bytes32) view returns(bytes32)']);
const poolType=parseAbiParameters('(address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks)');
export function budgets(){
 // Conservatively count funding transfers and their later use separately; never recycle payouts into this cap.
 const eth={buyerFundingWei:25000000000000000n,holderFundingWei:10000000000000000n,allActorGasReserveWei:200000000000000000n,nativeActivityCapWei:5000000000000000n};
 const usdc={buyerFundingMicros:500000n,holderFundingMicros:250000n,salePaymentMicros:LIMITS.paymentMicros,secondaryPurchaseMicros:50000n,preEndpointActivityMicros:1000000n,postEndpointActivityMicros:500000n};
 const sum=value=>Object.values(value).reduce((a,b)=>a+b,0n);
 assert(sum(eth)<=LIMITS.maximumEthWei);assert(sum(usdc)<=LIMITS.maximumUsdcMicros);
 return {eth:{...eth,conservativeTotalWei:sum(eth),hardCapWei:LIMITS.maximumEthWei},usdc:{...usdc,conservativeTotalMicros:sum(usdc),hardCapMicros:LIMITS.maximumUsdcMicros},
  rule:'Reserve value plus gasLimit*maxFeePerGas for every signed transaction and every replacement before signing. Include activity deployment/approvals, all wallets, keeper checkpoint and proof allocation. No balance reset, extra mint, recycled payout or unbounded approval.'};
}
export function termsAt(head,windowBlocks=120){
 assert([120,180].includes(windowBlocks),'Only reviewed 120/180-block windows');
 return {tokenId:LIMITS.tokenId,originalSupply:LIMITS.originalQ,buyerQuantity:LIMITS.buyerQuantity,proceedsMicros:LIMITS.paymentMicros,
  endBlock:head.number+BigInt(windowBlocks),deadlineTimestamp:head.timestamp+600n,windowBlocks,approximateMinutes:windowBlocks/5,
  timing:'Choose the exact endpoint only after setup and activity qualification, before signing the listing. Acceptance must finish while at least 32 blocks remain. Never refresh signed terms silently. Block production and finality can exceed the estimate.'};
}
function actor(address){assert(/^0x[0-9a-f]{40}$/i.test(address)&&!same(address,zeroAddress),'Invalid participant address');return address;}
export async function inspectPosition(client,deployment,{buyer,holder,now=Date.now()}={}){
 const [chain,genesis,head]=await Promise.all([client.getChainId(),client.getBlock({blockNumber:0n}),client.getBlock({blockTag:'latest'})]);
 assert.equal(chain,LIMITS.chainId);assert(same(genesis.hash,LIMITS.genesisHash));assert(head.hash&&head.timestamp>BigInt(Math.floor(now/1000)-120)&&head.timestamp<=BigInt(Math.floor(now/1000)+15),'Stale head');
 const readAt=(address,abi,functionName,args=[])=>client.readContract({address,abi,functionName,args,blockNumber:head.number});
 const [owner,liquidity,[key,info],commitment,nextSeriesId,decimals,...bindings]=await Promise.all([
  readAt(deployment.positionManager,posmAbi,'ownerOf',[LIMITS.tokenId]),readAt(deployment.positionManager,posmAbi,'getPositionLiquidity',[LIMITS.tokenId]),
  readAt(deployment.positionManager,posmAbi,'getPoolAndPositionInfo',[LIMITS.tokenId]),readAt(deployment.feeStrip,feeAbi,'positionCommitment',[LIMITS.tokenId]),
  readAt(deployment.feeStrip,feeAbi,'nextSeriesId'),readAt(deployment.usdc,tokenAbi,'decimals'),
  ...['positionManager','poolManager','usdc'].map(name=>readAt(deployment.feeStrip,feeAbi,name))]);
 assert(same(owner,LIMITS.seller),'Selected NFT is no longer seller-owned');assert(liquidity>0n&&info%256n===0n&&same(key.hooks,zeroAddress),'Ineligible position');
 assert([key.currency0,key.currency1].some(c=>same(c,deployment.usdc)));assert.equal(decimals,6);
 ['positionManager','poolManager','usdc'].forEach((name,i)=>assert(same(bindings[i],deployment[name]),'Contract binding mismatch'));
 const poolId=keccak256(encodeAbiParameters(poolType,[key]));
 const slot=BigInt(keccak256(encodeAbiParameters(parseAbiParameters('bytes32,uint256'),[poolId,6n])));
 const [word,activeWord]=await Promise.all([readAt(deployment.poolManager,managerAbi,'extsload',[toHex(slot,{size:32})]),readAt(deployment.poolManager,managerAbi,'extsload',[toHex(slot+3n,{size:32})])]);
 const tick=Number(BigInt.asIntN(24,BigInt(word)>>160n)),lower=Number(BigInt.asIntN(24,info>>8n)),upper=Number(BigInt.asIntN(24,info>>32n)),activeLiquidity=BigInt(activeWord)&((1n<<128n)-1n);
 const addresses=[LIMITS.seller,...[buyer,holder].filter(Boolean).map(actor)];assert.equal(new Set(addresses.map(a=>a.toLowerCase())).size,addresses.length,'Roles must use distinct wallets');
 const wallets=await Promise.all(addresses.map(async address=>{
  const [code,ethWei,usdcMicros,nonce,pendingNonce]=await Promise.all([client.getBytecode({address,blockNumber:head.number}),client.getBalance({address,blockNumber:head.number}),
   readAt(deployment.usdc,tokenAbi,'balanceOf',[address]),client.getTransactionCount({address,blockNumber:head.number}),client.getTransactionCount({address,blockTag:'pending'})]);
  assert(!code||code==='0x','Only undelegated EOA test wallets');assert.equal(nonce,pendingNonce,'Another transaction is pending');
  return {address,ethWei,usdcMicros,nonce};
 }));
 assert(same((await client.getBlock({blockNumber:head.number})).hash,head.hash),'Observation reorg');
 const inRange=lower<=tick&&tick<upper;
 return {blockNumber:head.number,blockHash:head.hash,timestamp:head.timestamp,owner,tokenId:LIMITS.tokenId,commitment,liquidity,poolId,key,tickLower:lower,tickUpper:upper,tick,activeLiquidity,inRange,nextSeriesId,wallets,
  activityCurrency:[key.currency0,key.currency1].some(c=>same(c,zeroAddress))?'native-ETH-aware route required':'ERC20 currencies; verify actual route token bindings',
  illustrativeControlledDonationPositionMicros:inRange&&activeLiquidity>0n?1000000n*liquidity/activeLiquidity:0n,
  incomeLimit:'This proportional donation estimate is not authenticated sold-period income. Qualify actual in-range activity and a nonzero native fee delta before activation; no forecast, organic-volume claim or payout authority.'};
}
const steps=[
 {stage:'prepare',actions:'Generate isolated buyer and secondary-holder wallets once in a private Node-side journal. Keep seller/deployer key separate from keeper. Fund at most the exact plan allocations; do not recreate roles on retry.',evidence:'Addresses, canonical opening balances/nonces, private file permissions, cumulative cap reservations.'},
 {stage:'qualify',actions:'Verify graceful hosted restart, fresh four-component readiness and authenticated restoration rehearsal. Qualify the actual NFT pool activity route in a separate pinned fork before public use; count any router deployment inside the caps.',evidence:'Hosted observations, retained endpoint/proof drill, correct currencies/range/liquidity, bounded activity simulation and fee delta. Fork evidence remains separately labeled.'},
 {stage:'publish-and-fund',actions:'Use actual live frontend ListingForm via a constrained EIP-1193 bridge. Keys remain in Node; allow only reviewed account/chain, exact typed messages and transaction envelopes. Seller publishes 25% of original Q for 0.25 USDC; buyer discovers and funds exact signed terms.',evidence:'Listing signature/ID, persistent discovery after reload, unchanged NFT/USDC/nonce at publication, buyer allowance and exact funded offer receipt; no issued claims yet.'},
 {stage:'accept',actions:'Recheck readiness, owner, exact position commitment, signed terms, endpoint runway and offer immediately before approval/acceptance. Seller receives exactly 0.25 USDC and escrows NFT39216.',evidence:'2500e18 buyer claims, 7500e18 seller claims, immutable original Q10000e18, same NFT/range/liquidity, baseline clearing and receipt balances.'},
 {stage:'earn-and-trade',actions:'Run bounded pre-N controlled pool activity. Buyer publishes an actual Aqua ask; secondary holder buys exactly 1000e18 claims for 0.05 USDC. Renew quote state only through a new reviewed quote; preserve the original sale endpoint.',evidence:'Actual Aqua/SwapVM transfers, holder1000e18/buyer1500e18/seller7500e18; claims include whole-period unpaid income, including accrual before the trade.'},
 {stage:'endpoint',actions:'Observe N without mining or time manipulation. Preserve canonical N hash via keeper inside its usable window; retain authenticated witness for that exact deployment/endpoint. Never stop obligations if the recording deadline passes.',evidence:'Actual keeper transaction, endpoint hash, retained proof digest, independent off-host copy and canonical inclusion/finality status.'},
 {stage:'capture-and-return',actions:'Run bounded post-N activity, capture at M>N, then return NFT39216 before allocating. Do not substitute early recombination or change liquidity during the sale.',evidence:'Same original NFT returned; captured USDC reserve remains protected; captured=true,nftReturned=true,allocated=false. Post-N income remains residual.'},
 {stage:'restore-and-settle',actions:'Use exact-endpoint authenticated restoration into a fresh isolated verifier database, with no RPC-witness fallback and no deletion of production artifacts. Allocate using the valid witness or authenticated onchain cache.',evidence:'Restoration digest and canonical rediscovery, proof validation/receipt, sold and residual reserves; Graph does not authorize allocation.'},
 {stage:'redeem-and-report',actions:'Seller, buyer and secondary holder independently redeem their remaining claims. Seller withdraws residual. Reconcile all balances, remaining liabilities and rounding dust; preserve every journal and unused test balance.',evidence:'Each payout=floor(claims*soldPeriodUSDC/originalQ), denominator unchanged by prior redemption. Distinguish actual public automation from human wallet acceptance; J19 human acceptance stays open.'},
];
export function makePlan(position,{buyer,holder,windowBlocks=120,operations,independentPins=false,listingAvailable=false}={}){
 const budget=budgets(),seller=position.wallets[0],blockers=[];
 if(!operations?.ready)blockers.push('HOSTED_PRESERVATION_NOT_READY');if(!independentPins)blockers.push('INDEPENDENT_SNAPSHOT_NOT_VERIFIED');if(!listingAvailable)blockers.push('LISTING_SERVICE_NOT_READY');
 if(!position.inRange||position.illustrativeControlledDonationPositionMicros<10n)blockers.push('NONZERO_ACTIVITY_NOT_QUALIFIED');
 if(seller.ethWei<budget.eth.conservativeTotalWei||seller.usdcMicros<budget.usdc.conservativeTotalMicros)blockers.push('SELLER_BUDGET_UNAVAILABLE');
 if(!buyer||!holder)blockers.push('ISOLATED_PARTICIPANT_ADDRESSES_NOT_PREPARED');
 return {schemaVersion:1,scope:'Read-only Sepolia automated self-test plan; no signature, transfer, custody change or human acceptance.',transactionSent:false,
  snapshot:position,termsPreview:termsAt({number:position.blockNumber,timestamp:position.timestamp},windowBlocks),roles:{seller:LIMITS.seller,buyer:buyer??null,secondaryHolder:holder??null,keeper:LIMITS.keeper},
  budget,readiness:{operations,independentPins,listingAvailable,blockers},executionAuthorizedByThisFile:false,
  remainingExecutionGates:['Exact signed-envelope and typed-message journal review; nonce/receipt/reorg reconciliation before every retry.','Hosted restart and actual endpoint/restoration qualification; this service probe alone does not establish them.','Reviewed activity route and actual nonzero delta; stop before activation if unavailable.','Freeze exact terms only when roles and setup are ready; do not treat this changing-head preview as a saved intent.'],
  steps,stopPolicy:'Before acceptance, stop on stale readiness, changed wallet/position/terms, unexpected nonce, insufficient runway or cap breach. Cancel any unaccepted funded offer explicitly. After acceptance, continue mandatory checkpoint/proof preservation and recovery; a deadline never authorizes deleting journals or abandoning locked assets.'};
}
async function main(){
 const {values}=parseArgs({options:{'window-blocks':{type:'string',default:'120'},buyer:{type:'string'},holder:{type:'string'},origin:{type:'string',default:'https://usufruct-mu.vercel.app'}}});
 const windowBlocks=Number(values['window-blocks']);assert([120,180].includes(windowBlocks));
 const deployment=read('deployments/sepolia.json'),evidence=read('docs/evidence/sepolia-deployment.json');
 const rpc=process.env.SEPOLIA_RPC_URL??deployment.rpcUrl,backup=process.env.SEPOLIA_BACKUP_RPC_URL??deployment.rpcUrl;
 for(const value of [rpc,backup,values.origin]){const url=new URL(value);assert(url.protocol==='https:'&&!url.username&&!url.password);}
 const client=createPublicClient({transport:http(rpc,{timeout:8000,retryCount:0})});
 const [position,operations]=await Promise.all([inspectPosition(client,deployment,{buyer:values.buyer,holder:values.holder}),verify({client,deployment,evidence,signer:LIMITS.keeper,origin:values.origin})]);
 let independentPins=false,listingAvailable=false;
 if(new URL(rpc).host!==new URL(backup).host){
  const independent=createPublicClient({transport:http(backup,{timeout:8000,retryCount:0})});
  const head=await independent.getBlock({blockNumber:position.blockNumber});assert(same(head.hash,position.blockHash),'Independent block mismatch');
  for(const name of ['feeStrip','verifier','checkpoints'])assert(same(keccak256(await independent.getBytecode({address:deployment[name],blockNumber:head.number})),evidence.contracts[name].observedRuntimeHash),'Independent runtime mismatch');
  assert(same((await independent.getBlock({blockNumber:head.number})).hash,position.blockHash));independentPins=true;
 }
 try{
  const response=await fetch(new URL('/api/listings?limit=1',values.origin),{redirect:'error',signal:AbortSignal.timeout(12000)});
  if(response.ok){const body=JSON.parse((await readBounded(response,65536)).toString());listingAvailable=body.status==='available'&&body.scope?.chainId===LIMITS.chainId&&same(body.scope?.feeStrip,deployment.feeStrip)&&body.scope?.intent==='NONBINDING_FUNDED_OFFER_REQUEST';}
  else await response.body?.cancel();
 }catch{}
 const plan=makePlan(position,{buyer:values.buyer,holder:values.holder,windowBlocks,operations,independentPins,listingAvailable});
 console.log(JSON.stringify(plan,(_,v)=>typeof v==='bigint'?String(v):v,2));process.exitCode=plan.readiness.blockers.length?2:0;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(()=>{console.error(JSON.stringify({error:'PUBLIC_TEST_PREFLIGHT_FAILED',transactionSent:false}));process.exitCode=1;});
