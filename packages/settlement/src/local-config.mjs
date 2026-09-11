import {keccak256} from 'viem';
/** Development helper only. Public deployment pins must be supplied and independently verified by the operator. */
export async function localRetentionConfig(deployment,client){
 const url=new URL(deployment.rpcUrl);
 if(deployment.chainId!==31337||await client.getChainId()!==31337||!['localhost','127.0.0.1','[::1]'].includes(url.hostname))throw new Error('Local retention configuration requires loopback chain31337');
 const names=['feeStrip','verifier','checkpoints','poolManager'];
 const codes=await Promise.all(names.map(async name=>{const code=await client.getBytecode({address:deployment[name]});if(!code)throw new Error('Missing local deployment code');return [name,keccak256(code)];}));
 const codeHashes=Object.fromEntries(codes);
 return {chainId:31337,genesisHash:(await client.getBlock({blockNumber:0n})).hash,...Object.fromEntries([...names,'usdc'].map(name=>[name,deployment[name]])),managerCodeHash:codeHashes.poolManager,codeHashes,rpcUrls:[deployment.rpcUrl]};
}
