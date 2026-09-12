import {acquireWitness} from '../../../scripts/chain/proof.mjs';
/** Different series can share identical endpoint state. Try bounded rotating matches, never an arbitrary first pointer. */
export function recoveryAcquirer({store,scope,config,replica,acquire=acquireWitness}){
 const cursors=new Map();
 return async(client,args)=>{
  try{return await acquire(client,args);}catch{
   if(!replica())throw new Error('PROOF_UNAVAILABLE');
   const endpoint=await client.getBlock({blockNumber:args.blockNumber});
   const matches=store.jobs(scope()).filter(j=>j.terms.endBlock===String(args.blockNumber)&&
    j.terms.manager.toLowerCase()===config.poolManager.toLowerCase()&&j.terms.managerCodeHash===config.managerCodeHash&&
    String(j.terms.chainId)===String(config.chainId)&&JSON.stringify(j.terms.slots)===JSON.stringify(args.slots));
   const key=String(args.blockNumber)+JSON.stringify(args.slots),cursor=cursors.get(key)??0;
   if(cursors.size>128)cursors.delete(cursors.keys().next().value);
   cursors.set(key,cursor+8);
   for(let i=0;i<Math.min(8,matches.length);i++){
    try{return await replica().restore(matches[(cursor+i)%matches.length],{endpointHash:endpoint.hash.toLowerCase()});}catch{}
   }
   throw new Error('NO_AUTHENTICATED_REMOTE_PROOF');
  }
 };
}
