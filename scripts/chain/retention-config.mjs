import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createPublicClient,http} from 'viem';
import {localRetentionConfig} from '../../packages/settlement/src/local-config.mjs';

// Explicitly disposable local setup. Public operator pins are never generated here.
const deployment=JSON.parse(readFileSync('apps/web/public/deployment.json','utf8'));
const client=createPublicClient({transport:http(deployment.rpcUrl,{timeout:8000,retryCount:0})});
const config=await localRetentionConfig(deployment,client);
const directory=resolve('.scratch/retention/local');mkdirSync(directory,{recursive:true,mode:0o700});
const path=resolve(directory,'local.generated.json');
writeFileSync(path,JSON.stringify({...config,database:resolve(directory,'keeper.sqlite'),artifactRoots:[resolve(directory,'primary'),resolve(directory,'secondary')]},null,2)+'\n',{mode:0o600});
console.log('Local-only retention configuration written to .scratch/retention/local/local.generated.json');
