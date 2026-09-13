import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from 'node:http';
import {decodeFunctionData,encodeFunctionResult,parseAbi,toHex} from 'viem';
import {privateKeyToAccount} from 'viem/accounts';
import {ORIGINAL_Q,listingId,listingTypedData,cancellationTypedData,validateTerms} from '../src/shared.mjs';
import {ListingStore} from '../src/store.mjs';
import {createListingService} from '../src/service.mjs';
import {createListingsHandler} from '../src/http.mjs';

// Deterministic synthetic keys for isolated signature tests. Never funded or deployed.
const seller=privateKeyToAccount(`0x${'11'.repeat(32)}`),other=privateKeyToAccount(`0x${'22'.repeat(32)}`);
const addr=byte=>`0x${byte.repeat(40)}`,hash=byte=>`0x${byte.repeat(64)}`;
const scope={chainId:11155111,feeStrip:addr('a'),positionManager:addr('b'),usdc:addr('c')};
const terms={schemaVersion:1,...scope,seller:seller.address,tokenId:'42',positionCommitment:hash('d'),originalSupply:ORIGINAL_Q.toString(),buyerQuantity:(ORIGINAL_Q/2n).toString(),proceedsMicros:'12000000',endBlock:'2000',deadlineTimestamp:'2000',nonce:hash('1')};
const abi=parseAbi(['function ownerOf(uint256) view returns(address)','function positionCommitment(uint256) view returns(bytes32)','function positionManager() view returns(address)','function usdc() view returns(address)']);
function fixture(path=':memory:') {
  const state={number:1000n,timestamp:1000n,owner:seller.address,commitment:terms.positionCommitment,code:'0x',chainId:scope.chainId,reorg:false,unavailable:false};
  const calls=[];
  const client={async request({method,params}) {
    calls.push({method,params});if(state.unavailable)throw new Error('private upstream detail');
    const block={number:toHex(state.number),timestamp:toHex(state.timestamp),hash:hash('e')};
    if(method==='eth_chainId')return toHex(state.chainId);
    if(method==='eth_getBlockByNumber')return {...block,hash:state.reorg&&params[0]!=='latest'?hash('f'):block.hash};
    assert.deepEqual(params.at(-1),{blockHash:hash('e'),requireCanonical:true});
    if(method==='eth_getCode')return state.code;
    if(method==='eth_call') {
      const {functionName}=decodeFunctionData({abi,data:params[0].data});
      const result={ownerOf:state.owner,positionCommitment:state.commitment,positionManager:scope.positionManager,usdc:scope.usdc}[functionName];
      return encodeFunctionResult({abi,functionName,result});
    }
    throw new Error('unexpected method');
  }};
  const store=new ListingStore(path,scope),service=createListingService({client,scope,store});
  return {state,calls,client,store,service};
}
async function signed(value=terms,account=seller){return {listingId:listingId(value),terms:value,signature:await account.signTypedData(listingTypedData(value))};}
async function cancelled(id,account=seller){const message={chainId:scope.chainId,feeStrip:scope.feeStrip,seller:account.address,listingId:id};return {...message,signature:await account.signTypedData(cancellationTypedData(message))};}

test('genuine EIP-712 publication, hash-pinned reads, exact immutable/idempotent discovery',async()=>{
  const f=fixture();try {
    const listing=await signed(),first=await f.service.publish(listing);
    assert.equal(first.listing.status,'available');assert.deepEqual(first.listing.terms,terms);
    assert.equal(first.scope.intent,'NONBINDING_FUNDED_OFFER_REQUEST');assert.equal(first.scope.custody,'NONE');
    await f.service.publish(listing);const result=await f.service.list();assert.equal(result.listings.length,1);assert.equal(result.nextCursor,null);
    assert.equal((await f.service.detail(listing.listingId)).listing.observedBlock,'1000');
    assert.ok(f.calls.some(c=>c.method==='eth_getCode'));assert.ok(f.calls.every(c=>!c.method.includes('send')));
  }finally{f.store.close();}
});
test('reject tampered price, replay scope, wrong signer, extra fields and nonfixed original Q',async()=>{
  const f=fixture();try {
    const original=await signed(),changed={...terms,proceedsMicros:'13000000'};
    await assert.rejects(f.service.publish({...original,terms:changed}),/LISTING_ID_MISMATCH/);
    await assert.rejects(f.service.publish({...original,terms:changed,listingId:listingId(changed)}),/INVALID_SIGNATURE/);
    await assert.rejects(f.service.publish(await signed(terms,other)),/INVALID_SIGNATURE/);
    await assert.rejects(f.service.publish(await signed({...terms,chainId:1})),/WRONG_SCOPE/);
    await assert.rejects(f.service.publish(await signed({...terms,feeStrip:addr('f')})),/WRONG_SCOPE/);
    assert.throws(()=>validateTerms({...terms,originalSupply:'100'},scope),/INVALID_TERMS/);
    assert.throws(()=>validateTerms({...terms,hiddenPrice:'1'},scope),/INVALID_FIELDS/);
    assert.equal((await f.service.list()).listings.length,0);
  }finally{f.store.close();}
});
test('cancellation is seller-authenticated, durable and cannot be republished',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'usufruct-listing-')),path=join(dir,'listings.sqlite');let f=fixture(path);
  try {
    const listing=await signed();await f.service.publish(listing);
    await assert.rejects(f.service.cancel(await cancelled(listing.listingId,other)),/NOT_LISTING_SELLER/);
    const cancel=await cancelled(listing.listingId);await f.service.cancel(cancel);await f.service.cancel(cancel);
    await assert.rejects(f.service.publish(listing),/LISTING_CANCELLED/);
    f.store.close();f=fixture(path);
    assert.equal((await f.service.detail(listing.listingId)).listing.status,'cancelled');
    await assert.rejects(f.service.publish(listing),/LISTING_CANCELLED/);
    assert.throws(()=>new ListingStore(path,{...scope,chainId:1}),/STORE_SCOPE_MISMATCH/);
  }finally{f.store.close();rmSync(dir,{recursive:true,force:true});}
});
test('pre-publication cancellation prevents replay; unrelated signer cannot poison listing ID',async()=>{
  const f=fixture();try {
    const listing=await signed();await f.service.cancel(await cancelled(listing.listingId,other));
    await f.service.publish(listing);
    const second=await signed({...terms,nonce:hash('2')});await f.service.cancel(await cancelled(second.listingId));
    await assert.rejects(f.service.publish(second),/LISTING_CANCELLED/);
  }finally{f.store.close();}
});
test('same seller nonce cannot silently replace signed terms',async()=>{
  const f=fixture();try {
    await f.service.publish(await signed());
    await assert.rejects(f.service.publish(await signed({...terms,proceedsMicros:'1'})),/NONCE_ALREADY_USED/);
  }finally{f.store.close();}
});
test('cancel signatures bind the exact listing and cannot be substituted',async()=>{
  const f=fixture();try {
    const listing=await signed();await f.service.publish(listing);
    const cancellation=await cancelled(listing.listingId);
    await assert.rejects(f.service.cancel({...cancellation,listingId:hash('f')}),/INVALID_SIGNATURE/);
    await assert.rejects(f.service.cancel({...cancellation,chainId:1}),/WRONG_SCOPE/);
    assert.equal((await f.service.detail(listing.listingId)).listing.status,'available');
  }finally{f.store.close();}
});
test('bounded durable storage keeps existing listings cancellable at capacity',async()=>{
  const store=new ListingStore(':memory:',scope,{maxListings:1,maxUnpublishedCancellations:1,maxSellerListings:1});
  try {
    const first=await signed(),second=await signed({...terms,nonce:hash('2')});store.publish(first);
    assert.throws(()=>store.publish(second),/LISTING_CAPACITY_REACHED/);
    store.cancel(await cancelled(second.listingId));
    assert.throws(()=>store.cancel({listingId:hash('3'),seller:seller.address}),/LISTING_CAPACITY_REACHED/);
    store.cancel(await cancelled(first.listingId));assert.ok(store.cancelled(first.listingId,seller.address));
  }finally{store.close();}
});
test('ownership and position changes invalidate discovery and publication without rewriting commitment',async()=>{
  const f=fixture();try {
    const listing=await signed();await f.service.publish(listing);
    f.state.owner=other.address;
    assert.equal((await f.service.detail(listing.listingId)).listing.reason,'OWNER_CHANGED');
    await assert.rejects(f.service.publish(listing),/OWNER_CHANGED/);
    // Seller can withdraw their advertisement after losing NFT ownership.
    await f.service.cancel(await cancelled(listing.listingId));
    f.state.owner=seller.address;f.state.commitment=hash('f');
    await assert.rejects(f.service.publish(await signed({...terms,nonce:hash('2')})),/POSITION_CHANGED/);
  }finally{f.store.close();}
});
test('end block/deadline bounds are read from chain; expiry remains visible',async()=>{
  const f=fixture();try {
    for(const changes of [{endBlock:'1032'},{deadlineTimestamp:'1060'},{endBlock:'217001'},{deadlineTimestamp:'87401'}])await assert.rejects(f.service.publish(await signed({...terms,...changes})),/CLOSING_SOON|TERMS_TOO_DISTANT/);
    const listing=await signed();await f.service.publish(listing);f.state.number=2000n;
    assert.equal((await f.service.detail(listing.listingId)).listing.status,'expired');
    await assert.rejects(f.service.publish(listing),/EXPIRED/);
  }finally{f.store.close();}
});
test('contract/delegated wallets, wrong RPC chain and observed reorg fail closed',async()=>{
  const f=fixture();try {
    const listing=await signed();f.state.code='0xef0100';
    await assert.rejects(f.service.publish(listing),/EOA_SIGNATURE_REQUIRED/);
    f.state.code='0x';f.state.chainId=1;await assert.rejects(f.service.publish(listing),/RPC_CHAIN_MISMATCH/);
    f.state.chainId=scope.chainId;f.state.reorg=true;await assert.rejects(f.service.publish(listing),/RPC_REORG/);
    assert.equal(f.store.list().length,0);
  }finally{f.store.close();}
});
test('bounded cursor pagination and stable filtering',async()=>{
  const f=fixture();try {
    for(const nonce of ['1','2','3'])await f.service.publish(await signed({...terms,nonce:hash(nonce)}));
    const a=await f.service.list({limit:2,seller:seller.address}),b=await f.service.list({limit:2,cursor:a.nextCursor});
    assert.equal(a.listings.length,2);assert.equal(b.listings.length,1);assert.equal(b.nextCursor,null);
    assert.equal(new Set([...a.listings,...b.listings].map(l=>l.listingId)).size,3);
    await assert.rejects(f.service.list({limit:21}),/INVALID_QUERY/);
  }finally{f.store.close();}
});
test('HTTP signed actions, malformed/oversized bodies and safe upstream failures',async()=>{
  const f=fixture(),server=createServer(createListingsHandler(f.service));
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin=`http://127.0.0.1:${server.address().port}`;
  const post=value=>fetch(`${origin}/api/listings`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(value)});
  try {
    const listing=await signed();assert.equal((await post({operation:'publish',listing})).status,200);
    const detail=await fetch(`${origin}/api/listings?listingId=${listing.listingId}`);assert.equal((await detail.json()).listing.status,'available');
    assert.equal((await fetch(`${origin}/api/listings?limit=1&limit=2`)).status,400);
    assert.equal((await post({operation:'publish',listing,junk:true})).status,400);
    assert.equal((await post({padding:'x'.repeat(17000)})).status,400);
    assert.equal((await post({operation:'cancel',cancellation:await cancelled(listing.listingId)})).status,200);
    f.state.unavailable=true;const response=await fetch(`${origin}/api/listings`);assert.equal(response.status,503);
    assert.ok(!(await response.text()).includes('private upstream detail'));
  }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));f.store.close();}
});
