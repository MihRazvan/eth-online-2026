// Local read-only fork upstream. Credentials never enter Anvil arguments or logs.
import {createServer} from 'node:http';
import {readFileSync} from 'node:fs';
import {parseEnv} from 'node:util';
let upstream;
try {
  const env = {...parseEnv(readFileSync('.env', 'utf8')), ...process.env};
  upstream = env.SEPOLIA_RPC_URL;
  if (!upstream || new URL(upstream).protocol !== 'https:') throw new Error();
} catch { console.error('Configure a valid HTTPS Sepolia RPC in ignored .env');process.exit(1); }
const methods = new Set(['eth_chainId','eth_blockNumber','eth_getBlockByNumber','eth_getBlockByHash','eth_getCode','eth_getBalance','eth_getTransactionCount','eth_getStorageAt','eth_getProof','eth_call','eth_getLogs','eth_getTransactionByHash','eth_getTransactionReceipt','eth_gasPrice','eth_feeHistory','net_version']);
const server = createServer(async (req,res) => {
  res.setHeader('content-type','application/json');
  try {
    if (req.method !== 'POST') throw new Error('POST required');
    let body = ''; for await (const chunk of req) { body += chunk; if (body.length > 2_000_000) throw new Error('Request too large'); }
    const input = JSON.parse(body), calls = Array.isArray(input) ? input : [input];
    if (!calls.length || calls.length > 100 || calls.some(c => !methods.has(c.method))) throw new Error('Read methods only');
    const reply = await fetch(upstream,{method:'POST',headers:{'content-type':'application/json'},body,signal:AbortSignal.timeout(30_000)});
    if (!reply.ok) throw new Error('Upstream unavailable');
    const result = await reply.json();
    const sanitize = r => r.error ? {jsonrpc:'2.0',id:r.id,error:{code:r.error.code,message:'Upstream read failed'}} : r;
    res.end(JSON.stringify(Array.isArray(result) ? result.map(sanitize) : sanitize(result)));
  } catch { res.statusCode=502; res.end(JSON.stringify({jsonrpc:'2.0',id:null,error:{code:-32000,message:'Read proxy rejected request or upstream unavailable'}})); }
});
server.listen(8790,'127.0.0.1',()=>console.log('Private read-only fork upstream listening on 127.0.0.1:8790'));
