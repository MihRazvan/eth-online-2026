import {readFileSync} from 'node:fs';
import {setTimeout as delay} from 'node:timers/promises';
import {privateKeyToAccount} from 'viem/accounts';
import {KeeperStore,recoverDeadLock} from './store.mjs';
import {CheckpointKeeper} from './worker.mjs';
import {keeperConfig,fail,safeError} from './config.mjs';
let store,stopping=false;
try{
 if(process.argv.slice(2).some(arg=>!['--once','--recover-dead-lock'].includes(arg)))fail('UNKNOWN_ARGUMENT');
 if(!process.env.KEEPER_CONFIG)fail('KEEPER_CONFIG_REQUIRED');
 const config=keeperConfig(JSON.parse(readFileSync(process.env.KEEPER_CONFIG,'utf8')));
 if(typeof config.database!=='string'||!config.database)fail('KEEPER_DATABASE_REQUIRED');
 if(process.argv.includes('--recover-dead-lock')){recoverDeadLock(config.database);console.log(JSON.stringify({status:'dead-lock-recovered'}));}
 else{
  let account;
  if(config.enabled){
   // Deliberately never load .env and never fall back to deployer PRIVATE_KEY.
   if(!/^0x[0-9a-f]{64}$/i.test(process.env.KEEPER_PRIVATE_KEY??''))fail('KEEPER_PRIVATE_KEY_REQUIRED');
   account=privateKeyToAccount(process.env.KEEPER_PRIVATE_KEY);
  }
  delete process.env.KEEPER_PRIVATE_KEY;
  store=new KeeperStore(config.database);const keeper=new CheckpointKeeper(config,store,{account});
  for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>{stopping=true;});
  do{
   const status=await keeper.tick();console.log(JSON.stringify(status));
   if(process.argv.includes('--once')){if(status.status==='unavailable')process.exitCode=1;break;}
   if(!stopping)await delay(config.intervalMs);
  }while(!stopping);
 }
}catch(error){console.error(JSON.stringify({error:safeError(error)}));process.exitCode=1;}finally{store?.close();}
