import {readFileSync,existsSync} from 'node:fs';
import {parseEnv} from 'node:util';
import {randomBytes} from 'node:crypto';
import {generatePrivateKey,privateKeyToAccount} from 'viem/accounts';
import {privateDirectory,privateJSON,hostedConfig} from '../../packages/operations/src/config.mjs';
import {resolve} from 'node:path';
try{
 const directory=privateDirectory('.scratch/operations'),file=resolve(directory,'host-secrets.json');
 const existing=existsSync(file)?JSON.parse(readFileSync(file,'utf8')):null;
 const local=parseEnv(readFileSync('.env','utf8'));
 const key=existing?.KEEPER_PRIVATE_KEY??local.KEEPER_PRIVATE_KEY??generatePrivateKey();
 const signer=privateKeyToAccount(key).address;
 const sourceRpc=local.SEPOLIA_RPC_URL??local.ENDPOINT_URL;
 const output={SEPOLIA_RPC_URL:sourceRpc,OPERATIONS_GATEWAY_TOKEN:existing?.OPERATIONS_GATEWAY_TOKEN??randomBytes(32).toString('hex'),
  KEEPER_ENABLED:'false',KEEPER_PRIVATE_KEY:key,KEEPER_EXPECTED_SIGNER:signer};
 if(local.PRIVATE_KEY&&privateKeyToAccount(local.PRIVATE_KEY).address.toLowerCase()===signer.toLowerCase())throw new Error();
 if(existing?.KEEPER_EXPECTED_SIGNER&&existing.KEEPER_EXPECTED_SIGNER.toLowerCase()!==signer.toLowerCase())throw new Error();
 hostedConfig(output);privateJSON(file,output);
 console.log(JSON.stringify({status:'prepared-privately',keeperSigner:signer,keeperEnabled:false,scope:'No secrets printed, uploaded, funded or activated'}));
}catch{console.error('Operations secret preparation failed; private diagnostics suppressed.');process.exitCode=1;}
