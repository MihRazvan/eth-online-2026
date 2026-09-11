/** Integer-only underwriting. None of these estimates authorize onchain payouts. */
export function parseUnitsStrict(input, decimals=6) {
  if (!Number.isInteger(decimals) || decimals<0 || decimals>18) throw new Error('Invalid decimals');
  const match=/^(0|[1-9]\d*)(?:\.(\d+))?$/.exec(input);
  if (!match || (match[2]?.length ?? 0)>decimals) throw new Error('Enter a nonnegative amount without excess precision');
  return BigInt(match[1])*10n**BigInt(decimals)+BigInt((match[2]??'').padEnd(decimals,'0')||'0');
}
export function formatUnitsExact(value,decimals=6) {
  const negative=value<0n;const n=negative?-value:value;const base=10n**BigInt(decimals);
  const fraction=(n%base).toString().padStart(decimals,'0').replace(/0+$/,'');
  return `${negative?'-':''}${n/base}${fraction?'.'+fraction:''}`;
}
export function breakEven({price,quantity,originalSupply,executionCost=0n}) {
  if (price<0n||executionCost<0n||quantity<=0n||originalSupply<quantity) throw new Error('Invalid quote');
  const total=(price+executionCost)*originalSupply;
  return (total+quantity-1n)/quantity;
}
export function claimPayout({allocation,quantity,originalSupply}) {
  if(allocation<0n||quantity<0n||quantity>originalSupply||originalSupply<=0n) throw new Error('Invalid claim');
  return allocation*quantity/originalSupply;
}
/** Blocks are end-state samples. Tick at block b governs [b,b+1). Unknown initial state is never zero. */
export function rangeOccupancy({samples,fromBlock,toBlock,tickLower,tickUpper}) {
  if(!Number.isSafeInteger(fromBlock)||!Number.isSafeInteger(toBlock)||toBlock<=fromBlock||tickLower>=tickUpper) throw new Error('Invalid interval');
  const ordered=[...samples].sort((a,b)=>a.block-b.block || a.logIndex-b.logIndex);
  let tick;let cursor=fromBlock;let known=0;let inRange=0;
  for(const s of ordered) {
    if(!Number.isSafeInteger(s.block)||!Number.isInteger(s.tick)||!Number.isInteger(s.logIndex))throw new Error('Invalid sample');
    if(s.block<=fromBlock){tick=s.tick;continue;}
    if(s.block>=toBlock)break;
    if(tick!==undefined){const width=s.block-cursor;known+=width;if(tick>=tickLower&&tick<tickUpper)inRange+=width;}
    cursor=s.block;tick=s.tick;
  }
  if(tick!==undefined){const width=toBlock-cursor;known+=width;if(tick>=tickLower&&tick<tickUpper)inRange+=width;}
  return {knownBlocks:known,inRangeBlocks:inRange,totalBlocks:toBlock-fromBlock,occupancyBps:known===0?null:Math.floor(inRange*10000/known),coverageBps:Math.floor(known*10000/(toBlock-fromBlock))};
}
