import test from 'node:test';
import {runInNewContext} from 'node:vm';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync,writeFileSync,chmodSync,realpathSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {privateKeyToAccount} from 'viem/accounts';
import {keccak256,parseTransaction,encodeFunctionData,parseAbi,getContractAddress} from 'viem';
import {createLiveWallet,loadLiveAccounts,LIMITS,normalizeStage,reservedBudget,validateSignedTransaction} from './live-wallet.mjs';
import {cancellationTypedData} from '../../packages/listings/src/shared.mjs';
const signer=privateKeyToAccount('0x'+'11'.repeat(32)),buyer=privateKeyToAccount('0x'+'22'.repeat(32)),address=signer.address.toLowerCase(),target='0x'+'ab'.repeat(20),hash='0x'+'cd'.repeat(32),code='0x6000';
const missing=name=>Object.assign(new Error('private upstream error must not escape'),{name});
async function setup(t){
 const dir=mkdtempSync(join(realpathSync(tmpdir()),'live-wallet-')),path=join(dir,'journal.json');let wallet;
 const state={sent:[],known:new Map(),receipts:new Map(),nonce:0,pending:0,fee:1000000000n,pin:code,ambiguous:false};
 const block=()=>({number:100n,hash,timestamp:BigInt(Math.floor(Date.now()/1000)),baseFeePerGas:1n});
 const client={getChainId:async()=>11155111,getBlock:async({blockNumber})=>blockNumber===0n?{hash:LIMITS.genesisHash}:block(),getBytecode:async({address:a})=>[address,buyer.address.toLowerCase()].includes(a)?'0x':state.pin,getBalance:async()=>10n**18n,getTransactionCount:async({blockTag})=>blockTag==='pending'?state.pending:state.nonce,estimateFeesPerGas:async()=>({maxFeePerGas:state.fee,maxPriorityFeePerGas:1000000n}),estimateGas:async()=>21000n,
 getTransactionReceipt:async({hash:h})=>{if(!state.receipts.has(h))throw missing('TransactionReceiptNotFoundError');return state.receipts.get(h);},getTransaction:async({hash:h})=>{if(!state.known.has(h))throw missing('TransactionNotFoundError');return state.known.get(h);},
 sendRawTransaction:async({serializedTransaction:raw})=>{const saved=JSON.parse(readFileSync(path,'utf8'));assert(saved.transactions.some(e=>e.raw===raw),'Signed bytes must be durable before broadcast');state.sent.push(raw);if(state.ambiguous)throw new Error('RPC secret');const tx=parseTransaction(raw),h=keccak256(raw);state.known.set(h,{hash:h,from:address,nonce:tx.nonce});state.pending=tx.nonce+1;return h;},
 };
 const options={client,accounts:{seller:signer,buyer},journalPath:path,pins:{[target]:keccak256(code)}};
 wallet=await createLiveWallet(options);
 t.after(async()=>{try{await wallet.close();}catch{}rmSync(dir,{recursive:true,force:true});});
 const action=(id='call',patch={})=>({id,from:address,to:target,data:'0x12345678',valueWei:'0',gasLimit:'50000',usdcBudgetMicros:'250000',...patch});
 const request=(patch={})=>({method:'eth_sendTransaction',params:[{from:address,to:target,data:'0x12345678',value:'0x0',chainId:'0xaa36a7',...patch}]});
 const confirm=h=>{const tx=parseTransaction(state.sent.find(raw=>keccak256(raw)===h));state.receipts.set(h,{transactionHash:h,from:address,to:tx.to??null,contractAddress:tx.to?null:getContractAddress({from:address,nonce:BigInt(tx.nonce)}),blockNumber:100n,blockHash:hash,status:'success',gasUsed:21000n,effectiveGasPrice:1000000000n});state.nonce=tx.nonce+1;state.pending=state.nonce;};
 return {dir,path,state,client,options,wallet,action,request,confirm,reopen:async()=>{await wallet.close();wallet=await createLiveWallet(options);return wallet;}};
}
test('standard EIP1193 read methods expose account and Sepolia only; unrelated methods are private pending intents',async t=>{
 const f=await setup(t);assert.deepEqual(await f.wallet.request(address,{method:'eth_requestAccounts'}),[address]);assert.equal(await f.wallet.request(address,{method:'eth_chainId'}),'0xaa36a7');
 assert.equal(await f.wallet.request(address,{method:'wallet_switchEthereumChain',params:[{chainId:'0xaa36a7'}]}),null);
 await assert.rejects(f.wallet.request(address,{method:'wallet_switchEthereumChain',params:[{chainId:'0x1'}]}),/POLICY_REJECTED/);
 await assert.rejects(f.wallet.request(address,{method:'personal_sign',params:['0x1234',address]}),/UNREVIEWED/);assert.equal(f.wallet.publicJournal().pendingIntents.length,1);assert.equal(f.state.sent.length,0);
});
test('exact reviewed request is signed once, persisted before send, and replay/restart returns the original hash',async t=>{
 const f=await setup(t);await f.wallet.appendReviewedStage({id:'first',transactions:[f.action()]});
 const [a,b]=await Promise.all([f.wallet.request(address,f.request()),f.wallet.request(address,f.request())]);assert.equal(a,b);assert.equal(f.state.sent.length,1);
 let wallet=await f.reopen();assert.equal(await wallet.request(address,f.request()),a);assert.equal(f.state.sent.length,1);
 f.confirm(a);assert.equal(await wallet.request(address,f.request()),a);assert.equal(f.state.sent.length,1);assert.equal(wallet.publicJournal().transactions[0].receipt.status,'success');
});
test('lost broadcast response preserves exact raw bytes and same nonce for restart retry',async t=>{
 const f=await setup(t);await f.wallet.appendReviewedStage({id:'first',transactions:[f.action()]});f.state.ambiguous=true;
 await assert.rejects(f.wallet.request(address,f.request()),/POLICY_REJECTED/);const original=f.state.sent[0];assert.equal(JSON.parse(readFileSync(f.path)).transactions[0].raw,original);
 const wallet=await f.reopen();f.state.ambiguous=false;await wallet.request(address,f.request());assert.equal(f.state.sent.length,2);assert.equal(f.state.sent[1],original);assert.equal(wallet.publicJournal().transactions.length,1);
});
test('unsigned byte/value/recipient substitutions require explicit new review and do not broadcast',async t=>{
 const f=await setup(t);await f.wallet.appendReviewedStage({id:'first',transactions:[f.action()]});
 for(const patch of [{data:'0x12345679'},{value:'0x1'},{to:buyer.address}])await assert.rejects(f.wallet.request(address,f.request(patch)),/UNREVIEWED/);
 assert.equal(f.state.sent.length,0);assert.equal(f.wallet.publicJournal().pendingIntents.length,3);
});
test('fresh chain/runtime changes and unknown pending nonce fail before signing',async t=>{
 const f=await setup(t);await f.wallet.appendReviewedStage({id:'first',transactions:[f.action()]});f.state.pin='0x6001';await assert.rejects(f.wallet.request(address,f.request()),/POLICY_REJECTED/);f.state.pin=code;
 f.state.pending=1;await assert.rejects(f.wallet.request(address,f.request()),/POLICY_REJECTED/);assert.equal(f.state.sent.length,0);assert.equal(f.wallet.publicJournal().transactions.length,0);
});
test('later stages require successful canonical prerequisite; orphaned prerequisite blocks subsequent signatures',async t=>{
 const f=await setup(t);await f.wallet.appendReviewedStage({id:'first',transactions:[f.action()]});const h=await f.wallet.request(address,f.request());
 const second={id:'next',prerequisiteHashes:[h],transactions:[f.action('next',{data:'0x87654321'})]};await assert.rejects(f.wallet.appendReviewedStage(second));f.confirm(h);await f.wallet.appendReviewedStage(second);
 f.state.receipts.get(h).blockHash='0x'+'ef'.repeat(32);await assert.rejects(f.wallet.request(address,f.request({data:'0x87654321'})),/POLICY_REJECTED/);assert.equal(f.state.sent.length,1);
});
test('CREATE permits only exact zero-value initcode and authenticates predicted receipt address',async t=>{
 const f=await setup(t);await f.wallet.appendReviewedStage({id:'create',transactions:[f.action('create',{to:null,data:'0x600060005360016000f3',usdcBudgetMicros:'0'})]});
 const request=f.request({to:null,data:'0x600060005360016000f3'}),h=await f.wallet.request(address,request);assert.equal(parseTransaction(f.state.sent[0]).to,undefined);f.confirm(h);
 assert.equal(await f.wallet.request(address,request),h);assert.equal(f.wallet.publicJournal().transactions[0].receipt.contractAddress,getContractAddress({from:address,nonce:0n}));
 f.state.receipts.get(h).contractAddress=target;await assert.rejects(f.wallet.request(address,request),/POLICY_REJECTED/);
});
test('typed listing withdrawal is hash-exact, seller/domain bound and signature survives restart',async t=>{
 const f=await setup(t),payload=cancellationTypedData({chainId:11155111,feeStrip:target,seller:address,listingId:hash});
 await f.wallet.appendReviewedStage({id:'sign',typedData:[{id:'withdraw',address,payload}]});const request={method:'eth_signTypedData_v4',params:[address,JSON.stringify(payload)]};const signature=await f.wallet.request(address,request);assert.match(signature,/^0x[0-9a-f]{130}$/);
 const wallet=await f.reopen();assert.equal(await wallet.request(address,request),signature);
 await assert.rejects(wallet.request(address,{...request,params:[address,JSON.stringify({...payload,message:{...payload.message,listingId:'0x'+'ef'.repeat(32)}})]}),/UNREVIEWED/);assert.equal(f.state.sent.length,0);
});
test('ETH and USDC aggregate reservations cannot exceed caps; USDC transfers cannot underdeclare or approve unlimited amount',()=>{
 assert.throws(()=>reservedBudget([{reservedWei:String(LIMITS.ethBudgetWei+1n),usdcBudgetMicros:'0'}]));assert.throws(()=>reservedBudget([{reservedWei:'0',usdcBudgetMicros:'3000001'}]));
 const stage=amount=>({id:'test',transactions:[{id:'cash',from:address,to:LIMITS.usdc,data:encodeFunctionData({abi:parseAbi(['function transfer(address,uint256)']),functionName:'transfer',args:[buyer.address,amount]}),valueWei:'0',gasLimit:'50000',usdcBudgetMicros:'0'}]});
 assert.throws(()=>normalizeStage(stage(1n),[address,buyer.address.toLowerCase()],{[LIMITS.usdc]:keccak256(code)}));
 const p=stage(1n);p.transactions[0].data=encodeFunctionData({abi:parseAbi(['function approve(address,uint256)']),functionName:'approve',args:[target,2n**256n-1n]});assert.throws(()=>normalizeStage(p,[address],{[LIMITS.usdc]:keccak256(code)}));
});
test('resume rejects edited nonce, raw digest, reservation and wrong authenticated signer',async t=>{
 const f=await setup(t);await f.wallet.appendReviewedStage({id:'first',transactions:[f.action()]});await f.wallet.request(address,f.request());const data=JSON.parse(readFileSync(f.path)),entry=data.transactions[0],action=data.stages[0].transactions[0];
 for(const patch of [{nonce:8},{hash:'0x'+'ef'.repeat(32)},{reservedWei:'1'},{usdcBudgetMicros:'0'}])await assert.rejects(validateSignedTransaction({...entry,...patch},action));
 await assert.rejects(validateSignedTransaction(entry,{...action,from:buyer.address.toLowerCase()}));
});
test('private key loader rejects permissive files',async t=>{
 const f=await setup(t),file=join(f.dir,'accounts.json');writeFileSync(file,JSON.stringify({seller:'0x'+'11'.repeat(32)}),{mode:0o600});assert.equal(loadLiveAccounts(file).seller.address,signer.address);chmodSync(file,0o644);assert.throws(()=>loadLiveAccounts(file));
});

test('fundOffer proceeds must be fully reserved against the aggregate USDC budget',()=>{
 const data=encodeFunctionData({abi:parseAbi(['function fundOffer(address,uint256,uint256,uint256,uint256,uint64,uint64,bytes32)']),functionName:'fundOffer',args:[address,39216n,10000n,2500n,250000n,500n,1000n,hash]});
 const transaction={id:'fund',from:address,to:target,data,valueWei:'0',gasLimit:'500000',usdcBudgetMicros:'249999'};
 assert.throws(()=>normalizeStage({id:'offer',transactions:[transaction]},[address],{[target]:keccak256(code)}));
 assert.equal(normalizeStage({id:'offer',transactions:[{...transaction,usdcBudgetMicros:'250000'}]},[address],{[target]:keccak256(code)}).transactions.length,1);
});

test('installed browser provider exposes standard results and4001 errors with no key crossing the binding',async t=>{
 const f=await setup(t);let binding,init,initArgs;const frame={url:()=> 'https://usufruct.example/orchard'};
 const page={mainFrame:()=>frame,exposeBinding:async(name,fn)=>{assert.equal(name,'__usufructReviewedWallet');binding=fn;},addInitScript:async(fn,args)=>{init=fn;initArgs=args;}};
 await f.wallet.install(page,{address,origin:'https://usufruct.example'});
 assert.deepEqual(Object.keys(initArgs),['address']);const window={__usufructReviewedWallet:request=>binding({page,frame},request)};
 runInNewContext('('+init.toString()+')('+JSON.stringify(initArgs)+')',{window});
 assert.equal(await window.ethereum.request({method:'eth_chainId'}),'0xaa36a7');
 await assert.rejects(window.ethereum.request({method:'personal_sign',params:['0x12',address]}),error=>error.code===4001&&error.message==='UNREVIEWED_WALLET_METHOD');
 await assert.rejects(binding({page,frame:{url:()=> 'https://attacker.example'}},{method:'eth_accounts'}));
});
