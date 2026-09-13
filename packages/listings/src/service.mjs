import {decodeFunctionResult, encodeFunctionData, parseAbi, recoverTypedDataAddress} from 'viem';
import {listingId,listingTypedData,cancellationTypedData,validateTerms,validateScope,validateCancellation,validateTiming,exactKeys,sameAddress,LISTING_INTENT} from './shared.mjs';

const abi=parseAbi(['function ownerOf(uint256) view returns(address)','function positionCommitment(uint256) view returns(bytes32)','function positionManager() view returns(address)','function usdc() view returns(address)']);
const signatureShape=value=>typeof value==='string'&&/^0x[0-9a-fA-F]{130}$/.test(value);
const publicScope=scope=>({chainId:scope.chainId,feeStrip:scope.feeStrip,positionManager:scope.positionManager,usdc:scope.usdc,intent:LISTING_INTENT,signatureSupport:'EOA_ONLY',custody:'NONE',activation:'SELLER_ACCEPTS_FUNDED_OFFER'});

/** client exposes viem PublicClient.request. Every canonical read uses EIP-1898. */
export function createListingService({client,scope,store}) {
  validateScope(scope);
  scope=structuredClone(scope);
  async function request(method,params){return client.request({method,params});}
  async function context() {
    if(BigInt(await request('eth_chainId',[]))!==BigInt(scope.chainId))throw new Error('RPC_CHAIN_MISMATCH');
    const block=await request('eth_getBlockByNumber',['latest',false]);
    if(!block||!/^0x[0-9a-fA-F]{64}$/.test(block.hash)||!/^0x[0-9a-f]+$/i.test(block.number)||!/^0x[0-9a-f]+$/i.test(block.timestamp))throw new Error('RPC_BLOCK_UNAVAILABLE');
    const reference={blockHash:block.hash,requireCanonical:true};
    const read=async(address,functionName,args=[])=>decodeFunctionResult({abi,functionName,data:await request('eth_call',[{to:address,data:encodeFunctionData({abi,functionName,args})},reference])});
    const [posm,cash]=await Promise.all([read(scope.feeStrip,'positionManager'),read(scope.feeStrip,'usdc')]);
    if(!sameAddress(posm,scope.positionManager)||!sameAddress(cash,scope.usdc))throw new Error('RPC_DEPLOYMENT_MISMATCH');
    return {block,reference,read};
  }
  async function signature(seller,signed,data,ctx) {
    if(!signatureShape(signed))throw new Error('INVALID_SIGNATURE');
    let recovered;try{recovered=await recoverTypedDataAddress({...data,signature:signed});}catch{throw new Error('INVALID_SIGNATURE');}
    if(!sameAddress(recovered,seller))throw new Error('INVALID_SIGNATURE');
    // ERC-1271 and EIP-7702 accounts are deliberately not advertised as supported.
    if(await request('eth_getCode',[seller,ctx.reference])!=='0x')throw new Error('EOA_SIGNATURE_REQUIRED');
  }
  async function position(terms,ctx,{publishing=false}={}) {
    validateTiming(terms,ctx.block,{publishing});
    const owner=await ctx.read(scope.positionManager,'ownerOf',[BigInt(terms.tokenId)]);
    if(!sameAddress(owner,terms.seller))throw new Error('OWNER_CHANGED');
    // This contract call validates nonempty/hookless/unsubscribed/authentic-USDC eligibility.
    const commitment=await ctx.read(scope.feeStrip,'positionCommitment',[BigInt(terms.tokenId)]);
    if(commitment.toLowerCase()!==terms.positionCommitment.toLowerCase())throw new Error('POSITION_CHANGED');
  }
  async function canonical(ctx) {
    const block=await request('eth_getBlockByNumber',[ctx.block.number,false]);
    if(block?.hash?.toLowerCase()!==ctx.block.hash.toLowerCase())throw new Error('RPC_REORG');
  }
  function envelope(listing,ctx,status='available',reason=null) {
    return {...listing,status,reason,observedBlock:BigInt(ctx.block.number).toString(),observedHash:ctx.block.hash,observedAt:BigInt(ctx.block.timestamp).toString()};
  }
  async function observe(listing,ctx) {
    if(store.cancelled(listing.listingId,listing.terms.seller))return envelope(listing,ctx,'cancelled','LISTING_CANCELLED');
    try {
      validateTerms(listing.terms,scope);
      await signature(listing.terms.seller,listing.signature,listingTypedData(listing.terms),ctx);
      await position(listing.terms,ctx);
      return envelope(listing,ctx);
    }catch(error){
      const reason=['EXPIRED','CLOSING_SOON','OWNER_CHANGED','POSITION_CHANGED','EOA_SIGNATURE_REQUIRED','INVALID_SIGNATURE'].includes(error.message)?error.message:'POSITION_UNAVAILABLE';
      return envelope(listing,ctx,reason==='EXPIRED'?'expired':reason==='POSITION_UNAVAILABLE'?'unavailable':'stale',reason);
    }
  }
  return {
    scope:publicScope(scope),
    async publish(listing) {
      listing=structuredClone(listing);
      exactKeys(listing,['listingId','terms','signature']);validateTerms(listing.terms,scope);
      const expected=listingId(listing.terms);
      if(typeof listing.listingId!=='string'||listing.listingId.toLowerCase()!==expected)throw new Error('LISTING_ID_MISMATCH');
      const ctx=await context();
      await signature(listing.terms.seller,listing.signature,listingTypedData(listing.terms),ctx);
      await position(listing.terms,ctx,{publishing:true});await canonical(ctx);
      return {status:'available',scope:publicScope(scope),listing:envelope(store.publish({...listing,listingId:expected}),ctx)};
    },
    async cancel(cancellation) {
      cancellation=structuredClone(cancellation);
      exactKeys(cancellation,['chainId','feeStrip','seller','listingId','signature']);
      const {signature:signed,...terms}=cancellation;validateCancellation(terms,scope);
      const known=store.get(terms.listingId);
      if(known&&!sameAddress(known.terms.seller,terms.seller))throw new Error('NOT_LISTING_SELLER');
      const ctx=await context();await signature(terms.seller,signed,cancellationTypedData(terms),ctx);await canonical(ctx);
      store.cancel(cancellation);
      return {status:'available',scope:publicScope(scope),listingId:terms.listingId.toLowerCase(),cancelled:true,note:'Listing withdrawn. Existing onchain funded offers remain unchanged.'};
    },
    async detail(id) {
      if(typeof id!=='string'||!/^0x[0-9a-fA-F]{64}$/.test(id))throw new Error('INVALID_LISTING_ID');
      const listing=store.get(id);if(!listing)throw new Error('LISTING_NOT_FOUND');
      const ctx=await context(),observed=await observe(listing,ctx);await canonical(ctx);
      return {status:'available',scope:publicScope(scope),listing:observed};
    },
    async list(query={}) {
      const {cursor='',limit=10,seller,tokenId}=query;
      if(!Number.isInteger(limit)||limit<1||limit>20||(cursor!==''&&!/^0x[0-9a-fA-F]{64}$/.test(cursor))||(seller!==undefined&&!/^0x[0-9a-fA-F]{40}$/.test(seller))||(tokenId!==undefined&&!/^[1-9][0-9]{0,77}$/.test(tokenId)))throw new Error('INVALID_QUERY');
      const ctx=await context(),rows=store.list({cursor,limit,seller,tokenId}),hasMore=rows.length>limit;
      const listings=[];for(const row of rows.slice(0,limit))listings.push(await observe(row,ctx));await canonical(ctx);
      return {status:'available',scope:publicScope(scope),listings,nextCursor:hasMore?listings.at(-1).listingId:null};
    },
  };
}
