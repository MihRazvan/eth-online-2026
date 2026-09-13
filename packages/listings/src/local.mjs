import {createServer} from 'node:http';
import {readFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {createPublicClient,http} from 'viem';
import {ListingStore} from './store.mjs';
import {createListingService} from './service.mjs';
import {createListingsHandler} from './http.mjs';

// Development only: no keys, public RPC, public listen address or keeper capability.
const deployment=JSON.parse(readFileSync(new URL('../../../apps/web/public/deployment.json',import.meta.url),'utf8'));
const rpc=new URL(deployment.rpcUrl);
if(deployment.mode!=='local'||deployment.chainId!==31337||!['127.0.0.1','localhost','[::1]'].includes(rpc.hostname)||rpc.username||rpc.password)throw new Error('Local listing service requires a loopback chain31337 deployment. Run pnpm local:reset first.');
const client=createPublicClient({transport:http(rpc.href,{timeout:4000,retryCount:0})});
if(await client.getChainId()!==31337)throw new Error('Wrong local chain.');
const scope=Object.fromEntries(['chainId','feeStrip','positionManager','usdc'].map(key=>[key,deployment[key]]));
const directory=resolve('.scratch/listings-local');mkdirSync(directory,{recursive:true,mode:0o700});
const store=new ListingStore(resolve(directory,'listings.sqlite'),scope);
const port=Number(process.env.LISTINGS_PORT??8791);
if(!Number.isSafeInteger(port)||port<1024||port>65535)throw new Error('Invalid listing port.');
const server=createServer(createListingsHandler(createListingService({client,scope,store})));
server.requestTimeout=15000;server.headersTimeout=10000;
server.listen(port,'127.0.0.1',()=>console.log(JSON.stringify({status:'local-listings-ready',port,chainId:31337})));
let stopping=false;
const stop=()=>{if(stopping)return;stopping=true;server.close(()=>store.close());};
process.once('SIGINT',stop);process.once('SIGTERM',stop);
