import {readFileSync,existsSync} from 'node:fs';
import {createPublicClient,createWalletClient,http,defineChain} from 'viem';
export const rpcURL=process.env.LOCAL_RPC_URL??'http://127.0.0.1:8545';
export const localChain=defineChain({id:31337,name:'FeeStrip local chain',nativeCurrency:{name:'Test Ether',symbol:'ETH',decimals:18},rpcUrls:{default:{http:[rpcURL]}}});
export const client=createPublicClient({chain:localChain,transport:http(rpcURL)});
export const wallet=account=>createWalletClient({account,chain:localChain,transport:http(rpcURL)});
const source=name=>['LocalToken','LocalActivityRouter'].includes(name)?'LocalFixtures':name;
export const artifact=name=>{let p=new URL(`../../contracts/out/${source(name)}.sol/${name}.json`,import.meta.url);if(!existsSync(p))p=new URL(`../../contracts/out/${source(name)}.sol/${name}.0.8.26.json`,import.meta.url);return JSON.parse(readFileSync(p,'utf8'));};
export async function send(account,address,name,fn,args=[]){const hash=await wallet(account).writeContract({address,abi:artifact(name).abi,functionName:fn,args});const receipt=await client.waitForTransactionReceipt({hash});if(receipt.status!=='success')throw new Error(`${fn} reverted: ${hash}`);return receipt;}
export async function deploy(account,name,args=[]){const a=artifact(name);const hash=await wallet(account).deployContract({abi:a.abi,bytecode:a.bytecode.object,args});const r=await client.waitForTransactionReceipt({hash});if(r.status!=='success'||!r.contractAddress)throw new Error(`Deployment ${name} reverted`);return r.contractAddress;}
export async function read(address,name,fn,args=[]){return client.readContract({address,abi:artifact(name).abi,functionName:fn,args});}
export async function assertLocal(){if(await client.getChainId()!==31337)throw new Error('This command only operates on local chain31337');}
