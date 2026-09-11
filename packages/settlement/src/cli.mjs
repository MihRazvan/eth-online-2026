import {readFileSync} from 'node:fs';
import {setTimeout as delay} from 'node:timers/promises';
import {RetentionStore,RetentionError} from './store.mjs';
import {RetentionWorker} from './worker.mjs';
import {recoveryServer} from './server.mjs';

let store,server,stopping=false;
try{
 if(!process.env.RETENTION_CONFIG)throw new RetentionError('RETENTION_CONFIG_REQUIRED');
 const config=JSON.parse(readFileSync(process.env.RETENTION_CONFIG,'utf8'));
 if(typeof config.database!=='string')throw new RetentionError('DATABASE_PATH_REQUIRED');
 const interval=config.intervalMs??1000,port=config.port??8788;
 if(!Number.isSafeInteger(interval)||interval<250||interval>10000||!Number.isSafeInteger(port)||port<1024||port>65535)throw new RetentionError('INVALID_RUNTIME_CONFIGURATION');
 if(process.argv.slice(2).some(arg=>!['--once','--serve'].includes(arg)))throw new RetentionError('UNKNOWN_ARGUMENT');
 store=new RetentionStore(config.database,{artifactRoots:config.artifactRoots});
 const worker=new RetentionWorker(config,store);
 if(process.argv.includes('--serve')){
  server=recoveryServer({store,scope:worker.scope});await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});
  console.log(JSON.stringify({service:'recovery-api',host:'loopback',port}));
 }
 for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>{stopping=true;});
 do{
  const result=await worker.tick();console.log(JSON.stringify(result));
  if(process.argv.includes('--once')){if(result.status==='unavailable')process.exitCode=1;break;}
  if(!stopping)await delay(interval);
 }while(!stopping);
}catch(error){
 console.error(JSON.stringify({error:error instanceof RetentionError?error.code:'RETENTION_STARTUP_FAILED'}));process.exitCode=1;
}finally{
 if(server)await new Promise(resolve=>server.close(resolve));
 store?.close();
}
