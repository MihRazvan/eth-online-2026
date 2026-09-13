import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdtempSync,rmSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from 'node:http';
import {connect} from 'node:net';
import {KeeperStore} from '../../keeper/src/store.mjs';
import {childShutdown,drainServer} from '../src/shutdown.mjs';

test('repeated supervisor stop and final drain let a real child release its exclusive journal', {timeout:5000},async t=>{
 const dir=mkdtempSync(join(tmpdir(),'usufruct-supervisor-')),path=join(dir,'keeper.sqlite');
 t.after(()=>rmSync(dir,{recursive:true,force:true}));
 const module=new URL('../../keeper/src/store.mjs',import.meta.url).href;
 const child=spawn(process.execPath,['--input-type=module','-e',`
  import {KeeperStore} from ${JSON.stringify(module)};
  const store=new KeeperStore(process.env.TEST_JOURNAL);
  store.set('config','immutable-policy');
  store.journal({hash:'known-signed-hash',nonce:7,endpoint:101,raw:'retained-signed-bytes',max_fee:'2',priority_fee:'1',reserved:'160000',head:100});
  const alive=setInterval(()=>{},1000);
  process.once('SIGTERM',()=>{
   process.send('stopping');
   setTimeout(()=>{store.close();clearInterval(alive);process.disconnect();},120);
  });
  process.send('ready');
 `],{env:{PATH:process.env.PATH,TEST_JOURNAL:path},stdio:['ignore','ignore','pipe','ipc']});
 t.after(()=>{if(child.exitCode===null&&child.signalCode===null)child.kill('SIGKILL');});
 assert.deepEqual(await once(child,'message'),['ready',undefined]);
 assert.equal(existsSync(path+'.lock'),true);
 const shutdown=childShutdown({children:()=>[child],graceMs:2000});
 const stopping=once(child,'message');shutdown.stop();await stopping;
 // The child's once-handler is now removed: another SIGTERM would bypass store.close().
 shutdown.stop();await shutdown.drain();await shutdown.drain();
 assert.equal(child.exitCode,0);assert.equal(child.signalCode,null);assert.equal(existsSync(path+'.lock'),false);
 const reopened=new KeeperStore(path);try{
  assert.equal(reopened.get('config'),'immutable-policy');assert.equal(reopened.activeTxs()[0].raw,'retained-signed-bytes');
  assert.equal(reopened.activeTxs()[0].nonce,7);assert.equal(reopened.reserveCost(),160000n);
 }finally{reopened.close();}
});

test('unresponsive children share a bounded drain before forced termination', {timeout:5000},async t=>{
 const children=[];t.after(()=>{for(const child of children)if(child.exitCode===null&&child.signalCode===null)child.kill('SIGKILL');});
 for(let i=0;i<2;i++){
  const child=spawn(process.execPath,['-e',"process.on('SIGTERM',()=>{});setInterval(()=>{},1000);process.send('ready')"],{stdio:['ignore','ignore','ignore','ipc']});
  children.push(child);await once(child,'message');
 }
 const shutdown=childShutdown({children:()=>children,graceMs:100});
 const started=Date.now();shutdown.stop();await shutdown.drain();
 assert.ok(Date.now()-started<1500);for(const child of children)assert.equal(child.signalCode,'SIGKILL');
});

test('HTTP drain terminates an unfinished request without blocking child cleanup', {timeout:5000},async()=>{
 const server=createServer(()=>{});server.listen(0,'127.0.0.1');await once(server,'listening');
 const socket=connect(server.address().port,'127.0.0.1');socket.on('error',()=>{});await once(socket,'connect');
 const request=once(server,'request');socket.write('GET / HTTP/1.1\r\nHost: localhost\r\n\r\n');await request;
 try{await drainServer(server,{graceMs:50});assert.equal(server.listening,false);}finally{socket.destroy();server.closeAllConnections();server.close();}
});
