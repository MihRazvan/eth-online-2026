import test from 'node:test';
import assert from 'node:assert/strict';
import {encodeAbiParameters,keccak256,parseAbiParameters,toHex,zeroAddress} from 'viem';
import {estimatePositionFees,feeGrowthInside,feeGrowthSample} from '../../apps/web/src/feeEstimate.ts';
const address=n=>'0x'+n.toString(16).padStart(40,'0'),hash=n=>toHex(BigInt(n),{size:32}),Q128=1n<<128n;
const d={chainId:11155111,feeStrip:address(1),positionManager:address(2),poolManager:address(3),usdc:address(4)};
function fixture(options={}){
 const key={currency0:options.usdcSecond?address(5):d.usdc,currency1:options.usdcSecond?d.usdc:address(5),fee:3000,tickSpacing:10,hooks:zeroAddress};
 const info=(BigInt.asUintN(24,-10n)<<8n)|(10n<<32n),pool=keccak256(encodeAbiParameters(parseAbiParameters('(address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks)'),[key]));
 const base=BigInt(keccak256(encodeAbiParameters(parseAbiParameters('bytes32,uint256'),[pool,6n]))),lower=BigInt(keccak256(encodeAbiParameters(parseAbiParameters('int24,uint256'),[-10,base+4n]))),upper=BigInt(keccak256(encodeAbiParameters(parseAbiParameters('int24,uint256'),[10,base+4n])));
 let calls=0,headReads=0;const now=BigInt(Math.floor(Date.now()/1000));
 const client={getChainId:async()=>{calls++;return options.chain??d.chainId;},getBlock:async p=>{calls++;if(options.hang)return new Promise(resolve=>{options.resolve=resolve});const n=p.blockTag?10000n:p.blockNumber;if(n===10000n)headReads++;return{number:n,hash:options.reorg&&headReads>1?hash(99):hash(n),timestamp:n===10000n?now:now-90000n};},readContract:async p=>{calls++;if(options.failure)throw Error('credential must never be exposed');const f=p.functionName;if(['positionManager','poolManager','usdc'].includes(f))return options.badBinding?address(99):d[f];if(f==='decimals')return 6;if(f==='positionCommitment')return options.changed&&p.blockTag==='latest'?hash(77):hash(42);if(f==='getPoolAndPositionInfo')return[key,info];if(f==='getPositionLiquidity')return options.liquidityChanged&&p.blockNumber===2800n?99n:100n;if(f==='extsload'){const slot=BigInt(p.args[0]),offset=options.usdcSecond?2n:1n;if(slot===base)return hash(0);if(slot===base+offset)return toHex(p.blockNumber===2800n||options.zeroGrowth?0n:10n*Q128,{size:32});if(slot===lower||slot===upper)return hash(100);if(slot===lower+offset||slot===upper+offset)return hash(0);throw Error('Unexpected storage slot');}throw Error('Unexpected call');}};
 return{client,calls:()=>calls};
}
test('inside growth handles lower inclusion, upper exclusion, and uint256 wrap',()=>{
 assert.equal(feeGrowthInside(-1,0,10,100n,20n,30n),(1n<<256n)-10n);
 assert.equal(feeGrowthInside(0,0,10,100n,20n,30n),50n);
 assert.equal(feeGrowthInside(9,0,10,100n,20n,30n),50n);
 assert.equal(feeGrowthInside(10,0,10,100n,20n,30n),10n);
 assert.equal(feeGrowthSample(Q128-1n,(1n<<256n)-2n,3n),4n);
 assert.throws(()=>feeGrowthInside(0,1,1,0n,0n,0n));assert.throws(()=>feeGrowthSample(0n,0n,1n));
});
test('actual timestamp duration and correct USDC storage word for either currency',async()=>{
 for(const usdcSecond of [false,true]){const {client}=fixture({usdcSecond});const r=await estimatePositionFees(client,d,39216n);assert.equal(r.status,'available');assert.equal(r.sampleUsdcMicros,1000n);assert.equal(r.durationSeconds,90000n);assert.equal(r.source.fromBlock,2800n);assert.equal(r.source.toBlock,10000n);assert.equal(r.liquidityHistoryVerified,false);assert.equal(r.includesDonations,true);assert.equal(r.allocationAuthority,'contract-only');}
});
test('a successfully observed zero sample is distinguishable from unavailable history',async()=>{const r=await estimatePositionFees(fixture({zeroGrowth:true}).client,d,1n);assert.equal(r.status,'available');assert.equal(r.sampleUsdcMicros,0n);});
test('wrong network or bindings reject scope, changed position rejects model',async()=>{
 for(const options of [{chain:1},{badBinding:true}])assert.deepEqual(await estimatePositionFees(fixture(options).client,d,1n),{status:'unavailable',code:'SCOPE_MISMATCH'});
 for(const options of [{changed:true},{liquidityChanged:true}])assert.deepEqual(await estimatePositionFees(fixture(options).client,d,1n),{status:'unavailable',code:'POSITION_CHANGED'});
 assert.deepEqual(await estimatePositionFees(fixture().client,{...d,usdc:zeroAddress},1n),{status:'unavailable',code:'SCOPE_MISMATCH'});
});
test('canonical recheck and archive errors fail explicitly without leaking error details',async()=>{
 for(const options of [{reorg:true},{failure:true}])assert.deepEqual(await estimatePositionFees(fixture(options).client,d,1n),{status:'unavailable',code:'HISTORY_UNAVAILABLE'});
});
test('ten-second total deadline returns and late RPC cannot schedule further reads',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});const options={hang:true},f=fixture(options),pending=estimatePositionFees(f.client,d,1n);await Promise.resolve();t.mock.timers.tick(10000);assert.deepEqual(await pending,{status:'unavailable',code:'TIMEOUT'});const calls=f.calls();options.resolve({number:10000n,hash:hash(10000),timestamp:BigInt(Math.floor(Date.now()/1000))});await new Promise(resolve=>setImmediate(resolve));assert.equal(f.calls(),calls);
});
