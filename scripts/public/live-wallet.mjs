/** Reviewed EIP-1193 bridge for a root-operated Sepolia browser rehearsal.
 * Library only: importing never reads keys, connects, signs or sends.
 * Node owns private keys, reviewed stages and the exclusive durable journal.
 * Browser requests can match exact intents; they cannot append approvals/stages.
 * No fee replacement, arbitrary RPC proxy, personal_sign or raw transaction API.
 * Node API: loadLiveAccounts(privateJSON) -> {seller,buyer,holder} accounts;
 * createLiveWallet({client,accounts,journalPath,pins:{address:runtimeHash}});
 * appendReviewedStage({id,prerequisiteHashes,transactions:[{id,from,to,data,
 * valueWei,gasLimit,usdcBudgetMicros}],typedData:[{id,address,payload}],pins:{}}).
 * CREATE uses to:null, exact initcode and zero value. Later stages require
 * successful canonical receipts already in this journal; initial pins must
 * remain identical across restart (append dynamic pins through a stage).
 * USDC budgets for nonstandard router/activity calls are operator-reviewed
 * upper bounds, not inferred token-flow proofs. Direct transfers and funded
 * offer proceeds are cross-checked; all signatures consume conservative caps.
 * install(page,{address,origin}) installs the guarded standard browser provider.
 * Hard crash: establish all bridge processes are offline before removing ONLY
 * journal.json.lock. Preserve journal.json and all signed bytes; never reset it.
 */
import assert from 'node:assert/strict';
import {readFileSync,lstatSync,existsSync,openSync,writeFileSync,fsyncSync,closeSync,unlinkSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {parseTransaction,recoverTransactionAddress,keccak256,hashTypedData,recoverTypedDataAddress,getContractAddress,toFunctionSelector} from 'viem';
import {privateKeyToAccount} from 'viem/accounts';
import {privateDirectory,privateJSON} from '../../packages/operations/src/config.mjs';
export const LIMITS=Object.freeze({chainId:11155111,usdc:'0x1c7d4b196cb0c7b01d743fbc6116a902379c7238',keeper:'0xffaa5fe1c38aa538fd9b1a28d8cf8516fa3728ad',genesisHash:'0x25a5cc106eea7138acab33231d7160d69cb777ee0c2c553fcddf5138993e6dd9',maxFeePerGas:30000000000n,ethBudgetWei:250000000000000000n,usdcBudgetMicros:3000000n,maxGas:6000000n,maxEntries:128});
const addr=v=>{assert(typeof v==='string'&&/^0x[0-9a-f]{40}$/i.test(v));return v.toLowerCase();};
const uint=v=>{assert(['string','number','bigint'].includes(typeof v));const s=String(v);assert(/^(0|[1-9][0-9]*)$/.test(s));return BigInt(s);};
const hex=v=>{assert(typeof v==='string'&&/^0x(?:[0-9a-f]{2})*$/i.test(v)&&v.length<=32768);return v.toLowerCase();};
const canonical=v=>JSON.stringify(v,(_,value)=>typeof value==='bigint'?String(value):value);
const clone=v=>JSON.parse(canonical(v));
const digest=v=>createHash('sha256').update(canonical(v)).digest('hex');
const ident=v=>{assert(typeof v==='string'&&/^[a-zA-Z0-9_-]{1,64}$/.test(v));return v;};
const FUND_OFFER_SELECTOR=toFunctionSelector('fundOffer(address,uint256,uint256,uint256,uint256,uint64,uint64,bytes32)');
const exact=(v,keys)=>assert.deepEqual(Object.keys(v).sort(),[...keys].sort());
const notFound=(e,name)=>e?.name===name;
function readJSON(path){const s=lstatSync(path);assert(s.isFile()&&!s.isSymbolicLink()&&s.size<2*1024*1024);return JSON.parse(readFileSync(path,'utf8'));}
export function loadLiveAccounts(path){
 assert((lstatSync(path).mode&0o077)===0,'Key file must be private');const value=readJSON(path),accounts={};assert(Object.keys(value).length>=1&&Object.keys(value).length<=4);
 for(const [role,key] of Object.entries(value)){ident(role);assert(typeof key==='string'&&/^0x[0-9a-f]{64}$/i.test(key));accounts[role]=privateKeyToAccount(key);}
 assert(new Set(Object.values(accounts).map(a=>a.address.toLowerCase())).size===Object.keys(accounts).length);assert(!Object.values(accounts).some(a=>addr(a.address)===LIMITS.keeper));return accounts;
}
function normalizePins(pins){const result={};for(const [address,hash] of Object.entries(pins)){assert(/^0x[0-9a-f]{64}$/i.test(hash)&&hash!=='0x'+'00'.repeat(32));result[addr(address)]=hash.toLowerCase();}return Object.fromEntries(Object.entries(result).sort());}
function intent(entry){return {from:addr(entry.from),to:entry.to===null?null:addr(entry.to),data:hex(entry.data),valueWei:String(uint(entry.valueWei))};}
function requestIntent(tx,address){
 assert(tx&&typeof tx==='object'&&!Array.isArray(tx));assert(Object.keys(tx).every(k=>['from','to','data','input','value','chainId','gas','gasPrice','maxFeePerGas','maxPriorityFeePerGas','nonce','type'].includes(k)));
 assert(addr(tx.from)===address);if(tx.chainId!==undefined)assert(BigInt(tx.chainId)===11155111n);
 if(tx.type!==undefined)assert(['0x2','0x02','eip1559'].includes(tx.type));assert(tx.gasPrice===undefined);
 if(tx.input!==undefined&&tx.data!==undefined)assert(hex(tx.input)===hex(tx.data));
 return {from:address,to:tx.to==null?null:addr(tx.to),data:hex(tx.data??tx.input??'0x'),valueWei:String(BigInt(tx.value??'0x0'))};
}
function typedPayload(value){
 const p=typeof value==='string'?JSON.parse(value):clone(value);assert(p&&p.domain&&p.types&&p.message);
 assert(BigInt(p.domain.chainId)===11155111n);addr(p.domain.verifyingContract);
 assert(p.domain.name==='usufruct Listing'&&p.domain.version==='1');
 assert(['Listing','CancelListing'].includes(p.primaryType));
 assert(p.message.intent===(p.primaryType==='Listing'?'NONBINDING_FUNDED_OFFER_REQUEST':'WITHDRAW_NONBINDING_LISTING'));
 assert(Object.keys(p).every(k=>['domain','types','primaryType','message'].includes(k)));
 return p;
}
export function normalizeStage(value,knownAddresses,pins){
 const s=clone(value);assert(Object.keys(s).every(k=>['id','prerequisiteHashes','transactions','typedData','pins'].includes(k)));ident(s.id);
 s.prerequisiteHashes??=[];s.transactions??=[];s.typedData??=[];s.pins=normalizePins(s.pins??{});
 assert(Array.isArray(s.prerequisiteHashes)&&s.prerequisiteHashes.length<=128&&s.prerequisiteHashes.every(h=>/^0x[0-9a-f]{64}$/.test(h)));
 const combined={...pins,...s.pins};for(const [a,h] of Object.entries(s.pins))assert(!pins[a]||pins[a]===h,'Cannot replace a runtime pin');
 assert(Array.isArray(s.transactions)&&Array.isArray(s.typedData)&&s.transactions.length+s.typedData.length<=32);
 s.transactions=s.transactions.map(t=>{exact(t,['id','from','to','data','valueWei','gasLimit','usdcBudgetMicros']);ident(t.id);const exactIntent=intent(t);assert(knownAddresses.includes(exactIntent.from));
  assert(exactIntent.to===null?(exactIntent.data.length>10&&uint(t.valueWei)===0n):(combined[exactIntent.to]||(knownAddresses.includes(exactIntent.to)&&exactIntent.data==='0x')),'Unpinned transaction target');
  const gas=uint(t.gasLimit),usdc=uint(t.usdcBudgetMicros);assert(gas>=21000n&&gas<=LIMITS.maxGas&&usdc<=LIMITS.usdcBudgetMicros&&uint(t.valueWei)<=LIMITS.ethBudgetWei);
  if(exactIntent.data.startsWith(FUND_OFFER_SELECTOR)){assert(exactIntent.data.length===10+8*64);const proceeds=BigInt('0x'+exactIntent.data.slice(10+4*64,10+5*64));assert(usdc>=proceeds,'Funded offer exceeds declared USDC budget');}
  if(exactIntent.to===LIMITS.usdc&&['0xa9059cbb','0x095ea7b3'].includes(exactIntent.data.slice(0,10))){assert(exactIntent.data.length===138);const amount=BigInt('0x'+exactIntent.data.slice(74));assert(amount<=LIMITS.usdcBudgetMicros);if(exactIntent.data.startsWith('0xa9059cbb'))assert(usdc>=amount,'USDC transfer exceeds declared budget');}
  return {...t,...exactIntent,gasLimit:String(gas),usdcBudgetMicros:String(usdc)};});
 s.typedData=s.typedData.map(t=>{exact(t,['id','address','payload']);ident(t.id);t.address=addr(t.address);assert(knownAddresses.includes(t.address));t.payload=typedPayload(t.payload);assert(combined[addr(t.payload.domain.verifyingContract)]);assert(addr(t.payload.message.seller)===t.address);return t;});
 assert(new Set([...s.transactions,...s.typedData].map(t=>t.id)).size===s.transactions.length+s.typedData.length);
 return s;
}
export async function validateSignedTransaction(entry,action){
 exact(entry,['stage','action','raw','hash','nonce','gas','maxFeePerGas','maxPriorityFeePerGas','reservedWei','usdcBudgetMicros','receipt']);
 assert(typeof entry.raw==='string'&&entry.raw.length<65536&&keccak256(entry.raw)===entry.hash);
 assert(addr(await recoverTransactionAddress({serializedTransaction:entry.raw}))===action.from);
 const tx=parseTransaction(entry.raw);assert(tx.type==='eip1559'&&tx.chainId===LIMITS.chainId&&tx.nonce===entry.nonce&&Number.isSafeInteger(entry.nonce)&&entry.nonce>=0);
 assert((action.to===null?tx.to===undefined:addr(tx.to)===action.to)&&hex(tx.data??'0x')===action.data&&(tx.value??0n)===uint(action.valueWei));assert((tx.accessList?.length??0)===0);
 assert(tx.gas===uint(entry.gas)&&tx.gas<=uint(action.gasLimit)&&tx.gas>=21000n);
 assert(tx.maxFeePerGas===uint(entry.maxFeePerGas)&&tx.maxFeePerGas>0n&&tx.maxFeePerGas<=LIMITS.maxFeePerGas);
 assert(tx.maxPriorityFeePerGas===uint(entry.maxPriorityFeePerGas)&&tx.maxPriorityFeePerGas<=tx.maxFeePerGas);
 assert(uint(entry.reservedWei)===(tx.value??0n)+tx.gas*tx.maxFeePerGas);assert(entry.usdcBudgetMicros===action.usdcBudgetMicros);return tx;
}
export function reservedBudget(entries){const eth=entries.reduce((s,e)=>s+uint(e.reservedWei),0n),usdc=entries.reduce((s,e)=>s+uint(e.usdcBudgetMicros),0n);assert(eth<=LIMITS.ethBudgetWei&&usdc<=LIMITS.usdcBudgetMicros,'Aggregate rehearsal budget exceeded');return {ethWei:String(eth),usdcMicros:String(usdc)};}
/** client is a viem PublicClient with timeout/no-retry transport; accounts remain Node-only. */
export async function createLiveWallet({client,accounts,journalPath,pins}){
 const byAddress=new Map(Object.values(accounts).map(a=>[addr(a.address),a]));assert(byAddress.size===Object.values(accounts).length&&byAddress.size>=1&&byAddress.size<=4&&!byAddress.has(LIMITS.keeper));pins=normalizePins(pins);assert(Object.keys(pins).length>0);
 const policy={chainId:LIMITS.chainId,genesisHash:LIMITS.genesisHash,addresses:[...byAddress.keys()].sort(),pins,ethBudgetWei:String(LIMITS.ethBudgetWei),usdcBudgetMicros:String(LIMITS.usdcBudgetMicros)};
 const path=resolve(journalPath),lock=path+'.lock',token=randomUUID();privateDirectory(dirname(path));const fd=openSync(lock,'wx',0o600);writeFileSync(fd,canonical({pid:process.pid,token}));fsyncSync(fd);
 let journal,closed=false,tail=Promise.resolve();
 const assertLock=()=>{assert(!closed&&readJSON(lock).token===token,'Exclusive bridge lock lost');};
 const save=()=>{assertLock();privateJSON(path,journal);};
 const exclusive=fn=>{const result=tail.then(fn);tail=result.catch(()=>{});return result;};
 const allPins=()=>Object.assign({},pins,...journal.stages.map(s=>s.pins));
 async function observe(){
  const [chainId,genesis,head]=await Promise.all([client.getChainId(),client.getBlock({blockNumber:0n}),client.getBlock({blockTag:'latest'})]);
  assert(chainId===LIMITS.chainId&&genesis.hash?.toLowerCase()===LIMITS.genesisHash);assert(typeof head.number==='bigint'&&typeof head.timestamp==='bigint'&&head.hash&&Date.now()/1000-Number(head.timestamp)<120&&Number(head.timestamp)<=Date.now()/1000+15);
  for(const [address,expected] of Object.entries(allPins()))assert(keccak256(await client.getBytecode({address,blockNumber:head.number})??'0x')===expected,'Runtime pin changed');
  for(const address of byAddress.keys())assert(['0x',undefined].includes(await client.getBytecode({address,blockNumber:head.number})),'Delegated signer unsupported');
  assert((await client.getBlock({blockNumber:head.number})).hash===head.hash);return head;
 }
 const actionFor=e=>journal.stages.find(s=>s.id===e.stage)?.transactions.find(a=>a.id===e.action);
 function expectedNonce(address){
  let next=journal.initialNonces[address];assert(Number.isSafeInteger(next)&&next>=0,'Missing initial nonce binding');
  for(const entry of journal.transactions.filter(e=>actionFor(e).from===address)){assert(entry.nonce===next,'Journal nonce sequence changed');next++;}
  assert(Number.isSafeInteger(next));return next;
 }
 async function receipt(entry){
  let r;try{r=await client.getTransactionReceipt({hash:entry.hash});}catch(e){if(notFound(e,'TransactionReceiptNotFoundError'))return null;throw e;}
  const a=actionFor(entry);assert(r.transactionHash===entry.hash&&addr(r.from)===a.from&&(a.to===null?r.to===null:addr(r.to)===a.to));if(a.to===null)assert(addr(r.contractAddress)===addr(getContractAddress({from:a.from,nonce:BigInt(entry.nonce)})));assert(r.gasUsed<=uint(entry.gas)&&r.effectiveGasPrice<=uint(entry.maxFeePerGas));assert(['success','reverted'].includes(r.status));
  assert((await client.getBlock({blockNumber:r.blockNumber})).hash===r.blockHash);
  return {transactionHash:r.transactionHash,blockNumber:String(r.blockNumber),blockHash:r.blockHash,status:r.status,contractAddress:r.contractAddress??null,gasUsed:String(r.gasUsed),effectiveGasPrice:String(r.effectiveGasPrice)};
 }
 async function prerequisites(stage){for(const h of stage.prerequisiteHashes){const entry=journal.transactions.find(e=>e.hash===h);assert(entry,'Prerequisite is outside journal');const r=await receipt(entry);assert(r?.status==='success','Prerequisite is not canonically successful');}}
 async function resume(entry){
  await validateSignedTransaction(entry,actionFor(entry));const r=await receipt(entry);entry.receipt=r;save();if(r)return entry.hash;
  const a=actionFor(entry),latest=await client.getTransactionCount({address:a.from,blockTag:'latest'}),pending=await client.getTransactionCount({address:a.from,blockTag:'pending'});
  assert(latest===entry.nonce&&pending<=latest+1,'Nonce changed without exact receipt');
  let known;try{known=await client.getTransaction({hash:entry.hash});}catch(e){if(!notFound(e,'TransactionNotFoundError'))throw e;}
  if(known){assert(known.hash===entry.hash&&known.nonce===entry.nonce&&addr(known.from)===a.from);return entry.hash;}
  assert(pending===latest,'Unknown pending replacement');assert(await client.getBalance({address:a.from})>=uint(entry.reservedWei));
  assertLock();const hash=await client.sendRawTransaction({serializedTransaction:entry.raw});assert(hash===entry.hash);return hash;
 }
 try{
  journal=existsSync(path)?readJSON(path):{version:2,initialNonces:null,policy,stages:[],transactions:[],signatures:[],pendingIntents:[]};
  assert([1,2].includes(journal.version)&&digest(journal.policy)===digest(policy));assert(journal.stages.length<=32&&journal.transactions.length<=LIMITS.maxEntries&&journal.signatures.length<=128&&journal.pendingIntents.length<=32);
  let known=pins;for(const s of journal.stages){assert.deepEqual(normalizeStage(s,policy.addresses,known),s);known={...known,...s.pins};}
  assert(new Set(journal.stages.map(s=>s.id)).size===journal.stages.length);
  for(const e of journal.transactions){const a=actionFor(e);assert(a);await validateSignedTransaction(e,a);}reservedBudget(journal.transactions);
  assert(new Set(journal.transactions.map(e=>e.stage+':'+e.action)).size===journal.transactions.length);
  assert(new Set(journal.transactions.map(e=>actionFor(e).from+':'+e.nonce)).size===journal.transactions.length);
  for(const sig of journal.signatures){const a=journal.stages.find(s=>s.id===sig.stage)?.typedData.find(t=>t.id===sig.action);assert(a&&sig.digest===hashTypedData(a.payload));assert(addr(await recoverTypedDataAddress({...a.payload,signature:sig.signature}))===a.address);}
  const initialHead=await observe();
  if(journal.initialNonces===null||journal.version===1){
   // Only an unsigned journal may acquire its first nonce binding. Never infer
   // a new baseline from an existing signed history or reset it on restart.
   assert(journal.transactions.length===0,'Signed legacy journal needs independent recovery');
   const initial={};for(const address of policy.addresses){
    const [atHead,latest,pending]=await Promise.all([client.getTransactionCount({address,blockNumber:initialHead.number}),client.getTransactionCount({address,blockTag:'latest'}),client.getTransactionCount({address,blockTag:'pending'})]);
    assert(Number.isSafeInteger(atHead)&&atHead>=0&&atHead===latest&&latest===pending,'Initial nonce not exclusive');initial[address]=atHead;
   }
   assert((await client.getBlock({blockNumber:initialHead.number})).hash===initialHead.hash);journal.initialNonces=initial;journal.version=2;
  }
  assert(journal.initialNonces&&typeof journal.initialNonces==='object');exact(journal.initialNonces,policy.addresses);
  for(const address of policy.addresses)expectedNonce(address);
  save();
 }catch(error){closeSync(fd);if(readJSON(lock).token===token)unlinkSync(lock);throw error;}
 const capture=(address,request)=>{if(journal.pendingIntents.length===32)journal.pendingIntents.shift();const encoded=canonical(request);journal.pendingIntents.push({address,request:encoded.length<=32768?clone(request):{method:request.method,truncated:true},observedAt:new Date().toISOString()});save();};
 async function mutate(address,request){
  assertLock();assert(byAddress.has(address));assert(canonical(request).length<=65536);await observe();
  if(request.method==='eth_sendTransaction'){
   assert(Array.isArray(request.params)&&request.params.length===1);const tx=request.params[0],wanted=requestIntent(tx,address);
   let stage,action;for(const s of [...journal.stages].reverse()){const a=s.transactions.find(a=>canonical(intent(a))===canonical(wanted));if(a){stage=s;action=a;break;}}
   if(!action){capture(address,request);throw new Error('UNREVIEWED_WALLET_INTENT');}await prerequisites(stage);
   const existing=journal.transactions.find(e=>e.stage===stage.id&&e.action===action.id);if(existing)return resume(existing);
   assert(journal.transactions.length<LIMITS.maxEntries);
   for(const entry of journal.transactions){const r=await receipt(entry);entry.receipt=r;assert(r||actionFor(entry).from!==address,'Previous account transaction unresolved');}
   save();const [nonce,pending,balance,fees]=await Promise.all([client.getTransactionCount({address,blockTag:'latest'}),client.getTransactionCount({address,blockTag:'pending'}),client.getBalance({address}),client.estimateFeesPerGas({type:'eip1559'})]);
   assert(Number.isSafeInteger(nonce)&&nonce>=0&&nonce===pending&&nonce===expectedNonce(address),'Untracked confirmed account transaction');if(tx.nonce!==undefined)assert(BigInt(tx.nonce)===BigInt(nonce));
   const gas=uint(action.gasLimit);if(tx.gas!==undefined)assert(BigInt(tx.gas)<=gas);
   assert(fees.maxFeePerGas>0n&&fees.maxFeePerGas<=LIMITS.maxFeePerGas&&fees.maxPriorityFeePerGas<=fees.maxFeePerGas);
   for(const k of ['maxFeePerGas','maxPriorityFeePerGas'])if(tx[k]!==undefined)assert(BigInt(tx[k])<=LIMITS.maxFeePerGas);
   const transaction={chainId:LIMITS.chainId,type:'eip1559',...(action.to===null?{}:{to:action.to}),data:action.data,value:uint(action.valueWei),nonce,gas,maxFeePerGas:fees.maxFeePerGas,maxPriorityFeePerGas:fees.maxPriorityFeePerGas};
   const reserved=transaction.value+gas*fees.maxFeePerGas;assert(balance>=reserved);
   assert(await client.estimateGas({...transaction,account:address})<=gas);
   reservedBudget([...journal.transactions,{reservedWei:String(reserved),usdcBudgetMicros:action.usdcBudgetMicros}]);
   await observe();assert(nonce===expectedNonce(address));assert(await client.getTransactionCount({address,blockTag:'latest'})===nonce&&await client.getTransactionCount({address,blockTag:'pending'})===nonce);await prerequisites(stage);
   assertLock();const raw=await byAddress.get(address).signTransaction(transaction);
   const entry={stage:stage.id,action:action.id,raw,hash:keccak256(raw),nonce,gas:String(gas),maxFeePerGas:String(fees.maxFeePerGas),maxPriorityFeePerGas:String(fees.maxPriorityFeePerGas),reservedWei:String(reserved),usdcBudgetMicros:action.usdcBudgetMicros,receipt:null};
   await validateSignedTransaction(entry,action);assertLock();journal.transactions.push(entry);save();return resume(entry);
  }
  if(request.method==='eth_signTypedData_v4'){
   assert(Array.isArray(request.params)&&request.params.length===2&&addr(request.params[0])===address);const payload=typedPayload(request.params[1]),hash=hashTypedData(payload);
   let stage,action;for(const s of [...journal.stages].reverse()){const a=s.typedData.find(a=>a.address===address&&hashTypedData(a.payload)===hash);if(a){stage=s;action=a;break;}}
   if(!action){capture(address,request);throw new Error('UNREVIEWED_WALLET_INTENT');}await prerequisites(stage);
   const prior=journal.signatures.find(e=>e.stage===stage.id&&e.action===action.id);if(prior)return prior.signature;
   assert(journal.signatures.length<128);assertLock();const signature=await byAddress.get(address).signTypedData(action.payload);
   assert(addr(await recoverTypedDataAddress({...action.payload,signature}))===address);journal.signatures.push({stage:stage.id,action:action.id,digest:hash,signature});save();return signature;
  }
  capture(address,request);throw new Error('UNREVIEWED_WALLET_METHOD');
 }
 const bridge={
  appendReviewedStage(value){return exclusive(async()=>{assertLock();assert(journal.stages.length<32);const stage=normalizeStage(value,policy.addresses,allPins());assert(!journal.stages.some(s=>s.id===stage.id));
   if(journal.stages.length>0)assert(stage.prerequisiteHashes.length>0,'Later stages require canonical receipt prerequisites');await prerequisites(stage);await observe();
   const head=await client.getBlock({blockTag:'latest'});for(const [a,h] of Object.entries(stage.pins))assert(keccak256(await client.getBytecode({address:a,blockNumber:head.number})??'0x')===h);assert((await client.getBlock({blockNumber:head.number})).hash===head.hash);
   journal.stages.push(stage);save();return {stageId:stage.id,transactions:stage.transactions.length,typedData:stage.typedData.length};});},
  async request(address,request){
   try{address=addr(address);assert(byAddress.has(address));if(['eth_accounts','eth_requestAccounts'].includes(request.method))return [address];if(request.method==='eth_chainId')return '0xaa36a7';
    if(request.method==='wallet_switchEthereumChain'){assert(request.params?.length===1&&BigInt(request.params[0].chainId)===11155111n);return null;}
    return await exclusive(()=>mutate(address,request));
   }catch(error){const code=['UNREVIEWED_WALLET_INTENT','UNREVIEWED_WALLET_METHOD'].includes(error.message)?error.message:'LIVE_WALLET_POLICY_REJECTED';throw Object.assign(new Error(code),{code:4001});}
  },
  publicJournal(){return {initialNonces:clone(journal.initialNonces),budget:reservedBudget(journal.transactions),transactions:journal.transactions.map(({raw,...e})=>clone(e)),pendingIntents:clone(journal.pendingIntents)};},
  async install(page,{address,origin}){
   address=addr(address);assert(byAddress.has(address));const url=new URL(origin);assert(url.protocol==='https:'&&url.origin===origin);
   await page.exposeBinding('__usufructReviewedWallet',async(source,request)=>{assert(source.frame===source.page.mainFrame()&&new URL(source.frame.url()).origin===origin);try{return {ok:true,result:await bridge.request(address,request)};}catch(error){return {ok:false,error:{code:4001,message:error.message}};}});
   await page.addInitScript(({address})=>{const listeners=new Map();const provider={isUsufructRehearsal:true,selectedAddress:address,chainId:'0xaa36a7',isConnected:()=>true,request:async request=>{const result=await window.__usufructReviewedWallet(request);if(!result.ok)throw Object.assign(new Error(result.error.message),{code:result.error.code});return result.result;},on:(name,fn)=>{if(!listeners.has(name))listeners.set(name,new Set());listeners.get(name).add(fn);return provider;},removeListener:(name,fn)=>{listeners.get(name)?.delete(fn);return provider;}};Object.defineProperty(window,'ethereum',{value:provider,configurable:true});},{address});
  },
  async close(){await tail;assertLock();closed=true;closeSync(fd);if(readJSON(lock).token===token)unlinkSync(lock);},
 };
 return bridge;
}
