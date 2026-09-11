import {BigInt, ByteArray, Bytes, crypto, dataSource, ethereum} from '@graphprotocol/graph-ts';
import {Activated, Captured, Allocated, NFTReturned, Redeemed, ResidualTransferred, Recombined, FeeStrip} from '../generated/FeeStrip/FeeStrip';
import {Series, LifecycleEvent} from '../generated/schema';

function refresh(id: BigInt, event: ethereum.Event, kind: string): void {
  let contract = FeeStrip.bind(event.address);
  // A failed canonical read is an indexing failure, never invented zero backing.
  let state = contract.series(id);
  let s = new Series(id.toString());
  s.chainId = dataSource.context().getBigInt('chainId');
  s.poolManager = contract.poolManager(); s.positionManager = contract.positionManager();
  let key = state.key;
  let tuple = new ethereum.Tuple();
  tuple.push(ethereum.Value.fromAddress(key.currency0)); tuple.push(ethereum.Value.fromAddress(key.currency1));
  tuple.push(ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(key.fee))); tuple.push(ethereum.Value.fromSignedBigInt(BigInt.fromI32(key.tickSpacing)));tuple.push(ethereum.Value.fromAddress(key.hooks));
  let encoded=ethereum.encode(ethereum.Value.fromTuple(tuple));
  assert(encoded !== null,'Pool key encoding failed');
  s.poolId=Bytes.fromByteArray(crypto.keccak256(encoded as Bytes));
  s.tokenId=state.tokenId;s.claim=state.claim;s.residualOwner=state.residualOwner;
  s.tickLower=state.tickLower;s.tickUpper=state.tickUpper;s.liquidity=state.liquidity;
  s.activationBlock=state.activationBlock;s.endBlock=state.endBlock;s.originalSupply=state.quantity;
  s.captured=state.captured;s.allocated=state.allocated;s.nftReturned=state.nftReturned;s.closed=state.closed;
  s.capturedUSDC=state.capturedUSDC;s.soldUSDC=state.soldUSDC;s.redeemedQuantity=state.redeemedQuantity;
  s.updatedAtBlock=event.block.number;s.save();
  let e=new LifecycleEvent(event.transaction.hash.concatI32(event.logIndex.toI32()));e.series=s.id;e.kind=kind;e.transactionHash=event.transaction.hash;e.blockNumber=event.block.number;e.blockHash=event.block.hash;e.save();
}
export function handleActivated(e:Activated):void{refresh(e.params.seriesId,e,'activated');}
export function handleCaptured(e:Captured):void{refresh(e.params.seriesId,e,'captured');}
export function handleAllocated(e:Allocated):void{refresh(e.params.seriesId,e,'allocated');}
export function handleNFTReturned(e:NFTReturned):void{refresh(e.params.seriesId,e,'nft-returned');}
export function handleRedeemed(e:Redeemed):void{refresh(e.params.seriesId,e,'redeemed');}
export function handleResidualTransferred(e:ResidualTransferred):void{refresh(e.params.seriesId,e,'residual-transferred');}
export function handleRecombined(e:Recombined):void{refresh(e.params.seriesId,e,'recombined');}
