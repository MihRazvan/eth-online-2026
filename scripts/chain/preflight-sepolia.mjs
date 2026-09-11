import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {createPublicClient,http,keccak256} from 'viem';
import {artifact} from './common.mjs';
const retained=JSON.parse(readFileSync('scripts/proof/sepolia-witness.json'));
const client=createPublicClient({transport:http(process.env.SEPOLIA_RPC_URL??'https://ethereum-sepolia-rpc.publicnode.com')});
assert.equal(await client.getChainId(),11155111,'Ethereum Sepolia required');
const block=await client.getBlock();
const expected=[['PoolManager',retained.manager,keccak256(retained.managerCode)],['PositionManager',retained.positionManager,retained.positionManagerCodeHash],['USDC',retained.usdc,retained.usdcCodeHash]];
const verified=[];
for(const [name,address,codeHash] of expected){
 const code=await client.getCode({address,blockNumber:block.number});assert.ok(code&&code!=='0x',`${name}: no code`);
 assert.equal(keccak256(code),codeHash,`${name}: pinned deployed code changed; investigate before deployment`);
 verified.push({name,address,codeHash});
}
const manager=await client.readContract({address:retained.positionManager,abi:artifact('PositionManager').abi,functionName:'poolManager',blockNumber:block.number});
assert.equal(manager.toLowerCase(),retained.manager.toLowerCase());
const decimals=await client.readContract({address:retained.usdc,abi:[{type:'function',name:'decimals',stateMutability:'view',inputs:[],outputs:[{type:'uint8'}]}],functionName:'decimals',blockNumber:block.number});
assert.equal(decimals,6);
console.log(JSON.stringify({scope:'Read-only public deployment preflight. No deployment, signer or proof-provider availability established. USDC proxy runtime pin does not freeze implementation upgrades.',chainId:11155111,block:block.number.toString(),blockHash:block.hash,verified},null,2));
