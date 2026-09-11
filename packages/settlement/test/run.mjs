import {spawnSync} from 'node:child_process';
import {readdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../../../',import.meta.url));
const commands=[
 [process.env.FEESTRIP_PROOF_PYTHON??'python3',['scripts/proof/test_validate_witness.py']],
 [process.execPath,['--test',...readdirSync(new URL('.',import.meta.url)).filter(name=>name.endsWith('.test.mjs')).sort().map(name=>`packages/settlement/test/${name}`)]],
];
for(const [command,args] of commands){
 const result=spawnSync(command,args,{cwd:root,stdio:'inherit',env:process.env});
 if(result.error){console.error('Settlement test dependency unavailable. Install scripts/proof/requirements.txt and set FEESTRIP_PROOF_PYTHON.');process.exit(1);}
 if(result.status!==0)process.exit(result.status??1);
}
