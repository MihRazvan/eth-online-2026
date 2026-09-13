/** Root-operated, private browser rehearsal; never a public wallet service.
 * Start from the repository root after preparing reviewed browser-config.json:
 *   {"pins":{"0xContractAddress":"0xRuntimeKeccak"}}
 *   node --env-file=.env scripts/public/live-browser.mjs
 * Accounts: .scratch/live-demo/accounts.json (private seller/buyer/holder keys).
 * Commands: .scratch/live-demo/browser/commands.jsonl (0600, append only).
 * One complete JSON object per line, each with a unique id. Examples:
 * {"id":"seller-home","op":"goto","role":"seller","path":"/#pin"}
 * {"id":"seller-view","op":"snapshot","role":"seller"}
 * {"id":"seller-connect","op":"click","role":"seller","name":"Connect wallet"}
 * {"id":"seller-amount","op":"fill","role":"seller","label":"Asking USDC","value":"0.25"}
 * {"id":"review-01","op":"stage","stage":{...EXACT ROOT-REVIEWED HELPER STAGE...}}
 * {"id":"setup-send","op":"send-reviewed","stageId":"setup","actionId":"transfer"}
 * {"id":"wallet-status","op":"journal"}
 * {"id":"stop-01","op":"stop"}
 * Stage payloads are never sent to a page. Unknown wallet mutations are retained
 * and refused by live-wallet.mjs, not implicitly approved by a browser click.
 * A command marked started is NEVER retried after restart, even if interrupted.
 * Inspect the helper journal and onchain receipts before creating another action.
 * A completed UI command is NOT a transaction-success acknowledgement.
 * A stale driver.lock requires confirming its PID/browser are stopped before
 * manually removing ONLY that lock; never discard either durable journal.
 * CDP at http://127.0.0.1:9225 is powerful local access; never tunnel/expose it.
 * Output snapshots, profiles, plans and journals are PRIVATE, not Git evidence.
 * Self-test is offline and neither loads accounts nor opens a browser:
 *   node scripts/public/live-browser.mjs --self-test
 */
import assert from 'node:assert/strict';
import {constants,openSync,closeSync,readFileSync,writeFileSync,fsyncSync,lstatSync,existsSync,chmodSync,mkdtempSync,rmSync,unlinkSync,realpathSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {EventEmitter} from 'node:events';
import {fileURLToPath} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
import {privateDirectory,privateJSON} from '../../packages/operations/src/config.mjs';

export const ORIGIN='https://usufruct-mu.vercel.app';
const ROLES=['seller','buyer','holder'];
const hash=value=>createHash('sha256').update(value).digest('hex');
const validID=value=>typeof value==='string'&&/^[a-zA-Z0-9_-]{1,64}$/.test(value)&&!['__proto__','constructor','prototype'].includes(value);
function exact(value,keys){assert(value&&typeof value==='object'&&!Array.isArray(value));assert(Object.keys(value).every(k=>keys.includes(k)));}
function short(value,max=300){assert(typeof value==='string'&&value.length>0&&value.length<=max);return value;}
export function validateCommand(command){
 exact(command,['id','op','role','path','name','label','value','control','stage','checked','stageId','actionId']);assert(validID(command.id));
 const fields={'send-reviewed':['stageId','actionId'],stage:['stage'],journal:[],stop:[],goto:['role','path'],snapshot:['role'],screenshot:['role'],click:['role','name'],fill:['role','label','value'],select:['role','label','value'],check:['role','label','checked']};
 assert(Object.hasOwn(fields,command.op));
 const optional=command.op==='click'?['control']:[];
 assert.deepEqual(Object.keys(command).filter(k=>!optional.includes(k)).sort(),['id','op',...fields[command.op]].sort());
 if(command.role!==undefined)assert(ROLES.includes(command.role));
 if(command.op==='goto'){
  short(command.path,500);const url=new URL(command.path,ORIGIN);
  assert(url.origin===ORIGIN&&!url.username&&!url.password);assert(url.pathname==='/'||url.pathname==='');
 }
 if(command.name!==undefined)short(command.name);
 if(command.label!==undefined)short(command.label);
 if(command.value!==undefined){assert(typeof command.value==='string'&&command.value.length<=2000);}
 if(command.checked!==undefined)assert(typeof command.checked==='boolean');
 if(command.control!==undefined)assert(['button','link','tab','radio','checkbox','combobox'].includes(command.control));
 if(command.op==='send-reviewed')assert(validID(command.stageId)&&validID(command.actionId));
 if(command.op==='stage')assert(command.stage&&typeof command.stage==='object'&&!Array.isArray(command.stage));
 return command;
}
function readPrivate(path,max=8*1024*1024){
 const st=lstatSync(path);assert(st.isFile()&&!st.isSymbolicLink()&&(st.mode&0o077)===0&&st.uid===process.getuid());assert(st.size<=max);
 const fd=openSync(path,constants.O_RDONLY|constants.O_NOFOLLOW);
 try{return readFileSync(fd);}finally{closeSync(fd);}
}
function createPrivateFile(path){if(!existsSync(path)){const fd=openSync(path,'wx',0o600);closeSync(fd);}readPrivate(path);}
function appendPrivate(path,value){
 readPrivate(path);const fd=openSync(path,constants.O_WRONLY|constants.O_APPEND|constants.O_NOFOLLOW);
 try{writeFileSync(fd,JSON.stringify(value)+'\n');fsyncSync(fd);}finally{closeSync(fd);}
}
/** Prefix validation rejects rewriting/truncation. Durable started records precede effects. */
export function commandQueue({commandsPath,statePath,ackPath,execute,shouldStop=()=>false}){
 createPrivateFile(commandsPath);createPrivateFile(ackPath);
 let state=existsSync(statePath)?JSON.parse(readPrivate(statePath)): {version:1,offset:0,prefixHash:hash(''),commands:{}};
 assert(state.version===1&&Number.isSafeInteger(state.offset)&&state.offset>=0&&state.commands&&typeof state.commands==='object');
 const save=()=>privateJSON(statePath,state);
 return {async poll(){
  const data=readPrivate(commandsPath);assert(data.length>=state.offset&&hash(data.subarray(0,state.offset))===state.prefixHash,'COMMAND_PREFIX_CHANGED');
  let end;
  while((end=data.indexOf(10,state.offset))!==-1){
   if(shouldStop())break;
   const raw=data.subarray(state.offset,end);assert(raw.length>0&&raw.length<=256*1024);
   const command=validateCommand(JSON.parse(raw.toString('utf8'))),digest=hash(raw),prior=Object.hasOwn(state.commands,command.id)?state.commands[command.id]:undefined;
   assert(!prior||prior.digest===digest,'COMMAND_ID_CHANGED');
   state.offset=end+1;state.prefixHash=hash(data.subarray(0,state.offset));
   if(prior){save();continue;}
   assert(Object.keys(state.commands).length<2000);state.commands[command.id]={digest,status:'started'};save();
   let status='completed',result;
   try{result=await execute(command);}catch{status='failed-review-required';}
   state.commands[command.id].status=status;save();
   const acknowledgment={id:command.id,op:command.op,status};appendPrivate(ackPath,acknowledgment);
   // Only validated identifiers and enumerated outcomes, never errors/plans/RPC URLs.
   process.stdout.write(JSON.stringify(acknowledgment)+'\n');
   if(result==='stop')break;
  }
 }};
}

/** Only exact identifiers enter this path. The bridge rechecks its own reviewed
 * policy, prerequisites, nonce and budgets before signing/sending. Journal raw
 * transactions/signatures are never returned, logged or passed to a browser. */
export async function sendReviewed({command,journalPath,bridge}){
 validateCommand(command);assert(command.op==='send-reviewed');
 const journal=JSON.parse(readPrivate(journalPath));assert(Array.isArray(journal.stages));
 const stages=journal.stages.filter(stage=>stage.id===command.stageId);assert(stages.length===1);
 assert(Array.isArray(stages[0].transactions));
 const actions=stages[0].transactions.filter(action=>action.id===command.actionId);assert(actions.length===1);
 const action=actions[0];assert(/^0x[0-9a-f]{40}$/i.test(action.from));
 assert(action.to===null||/^0x[0-9a-f]{40}$/i.test(action.to));
 assert(typeof action.data==='string'&&/^0x(?:[0-9a-f]{2})*$/i.test(action.data));
 assert(typeof action.valueWei==='string'&&/^(0|[1-9][0-9]*)$/.test(action.valueWei));
 // bridge.request matches transaction bytes across stages. Refuse aliases so an
 // old exact ID cannot accidentally select a newer identical approved action.
 const envelope=value=>JSON.stringify([value.from.toLowerCase(),value.to===null?null:value.to.toLowerCase(),value.data.toLowerCase(),BigInt(value.valueWei).toString()]);
 const selected=envelope(action);let matches=0;
 for(const stage of journal.stages){assert(Array.isArray(stage.transactions));for(const candidate of stage.transactions)if(envelope(candidate)===selected)matches++;}
 assert(matches===1,'AMBIGUOUS_REVIEWED_ENVELOPE');
 return bridge.request(action.from,{method:'eth_sendTransaction',params:[{from:action.from,to:action.to,data:action.data,value:'0x'+BigInt(action.valueWei).toString(16)}]});
}
export function installShutdownSignals(target,onStop){
 let requested=false;
 const stop=()=>{if(!requested){requested=true;onStop();}};
 target.on('SIGINT',stop);target.on('SIGTERM',stop);
 return ()=>{target.removeListener('SIGINT',stop);target.removeListener('SIGTERM',stop);};
}
export async function closeDriverResources({context,bridge,releaseLock,releaseSignals}){
 try{await context?.close();}
 finally{try{await bridge?.close();}finally{try{releaseLock();}finally{releaseSignals();}}}
}

export async function runBrowser(){
 process.umask(0o077);
 const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
 const directory=privateDirectory(resolve(root,'.scratch/live-demo/browser'));
 const config=JSON.parse(readPrivate(resolve(root,'.scratch/live-demo/browser-config.json'),256*1024));exact(config,['pins']);assert(config.pins);
 const rpc=process.env.SEPOLIA_RPC_URL;assert(typeof rpc==='string'&&new URL(rpc).protocol==='https:','SEPOLIA_RPC_REQUIRED');
 const token=randomUUID(),lock=resolve(directory,'driver.lock');
 const lockfd=openSync(lock,'wx',0o600);writeFileSync(lockfd,JSON.stringify({pid:process.pid,token}));fsyncSync(lockfd);
 let context,bridge,stopping=false;
 const stop=()=>{stopping=true;},releaseSignals=installShutdownSignals(process,stop);
 const journalPath=resolve(root,'.scratch/live-demo/wallet-journal.json');
 try{
  const [{chromium},{createPublicClient,http},{createLiveWallet,loadLiveAccounts}]=await Promise.all([import('@playwright/test'),import('viem'),import('./live-wallet.mjs')]);
  if(stopping)return;
  const accounts=loadLiveAccounts(resolve(root,'.scratch/live-demo/accounts.json'));assert.deepEqual(Object.keys(accounts).sort(),[...ROLES].sort());
  bridge=await createLiveWallet({client:createPublicClient({transport:http(rpc,{timeout:15000,retryCount:0})}),accounts,journalPath,pins:config.pins});
  if(stopping)return;
  context=await chromium.launchPersistentContext(privateDirectory(resolve(directory,'profile')),{headless:false,env:Object.fromEntries(['HOME','PATH','TMPDIR','LANG','LC_ALL','DISPLAY','XAUTHORITY','XDG_RUNTIME_DIR'].filter(key=>process.env[key]!==undefined).map(key=>[key,process.env[key]])),viewport:{width:1440,height:1000},args:['--remote-debugging-address=127.0.0.1','--remote-debugging-port=9225']});
  if(stopping)return;
  context.setDefaultTimeout(15000);context.setDefaultNavigationTimeout(30000);
  const pages={};
  // Replace restored tabs without ever closing the last tab during startup.
  const restored=context.pages();
  for(const role of ROLES){if(stopping)return;const page=await context.newPage();await bridge.install(page,{address:accounts[role].address,origin:ORIGIN});pages[role]=page;await page.goto(ORIGIN,{waitUntil:'domcontentloaded'});}
  for(const page of restored)await page.close();
  const out=privateDirectory(resolve(directory,'output'));
  const output=(command,extension)=>resolve(out,`${command.id}.${extension}`);
  const queue=commandQueue({commandsPath:resolve(directory,'commands.jsonl'),statePath:resolve(directory,'command-state.json'),ackPath:resolve(directory,'acknowledgments.jsonl'),shouldStop:()=>stopping,execute:async command=>{
   if(command.op==='send-reviewed'){const hash=await sendReviewed({command,journalPath,bridge});assert(/^0x[0-9a-f]{64}$/i.test(hash));privateJSON(output(command,'json'),{stageId:command.stageId,actionId:command.actionId,hash});return;}
   if(command.op==='stage'){await bridge.appendReviewedStage(command.stage);return;}
   if(command.op==='journal'){privateJSON(output(command,'json'),bridge.publicJournal());return;}
   if(command.op==='stop'){stopping=true;return 'stop';}
   const page=pages[command.role];assert(page&&!page.isClosed());
   if(command.op==='goto'){await page.goto(new URL(command.path,ORIGIN).href,{waitUntil:'domcontentloaded'});return;}
   assert(new URL(page.url()).origin===ORIGIN);
   if(command.op==='snapshot'){const snapshot=await page.locator('body').ariaSnapshot({timeout:10000});const fd=openSync(output(command,'txt'),'wx',0o600);try{writeFileSync(fd,snapshot);fsyncSync(fd);}finally{closeSync(fd);}return;}
   if(command.op==='screenshot'){await page.screenshot({path:output(command,'png'),fullPage:true});chmodSync(output(command,'png'),0o600);return;}
   if(command.op==='click'){await page.getByRole(command.control??'button',{name:command.name,exact:true}).click();return;}
   const field=page.getByLabel(command.label,{exact:true});
   if(command.op==='fill')await field.fill(command.value);
   if(command.op==='select')await field.selectOption(command.value);
   if(command.op==='check')await field.setChecked(command.checked);
  }});
  context.on('close',stop);
  if(stopping)return;
  process.stdout.write(JSON.stringify({status:'ready',cdp:'http://127.0.0.1:9225',tabs:ROLES,commands:'.scratch/live-demo/browser/commands.jsonl'})+'\n');
  while(!stopping){await queue.poll();if(!stopping)await new Promise(resolve=>setTimeout(resolve,500));}
 }finally{
  await closeDriverResources({context,bridge,releaseLock:()=>{try{closeSync(lockfd);}finally{if(JSON.parse(readPrivate(lock)).token===token)unlinkSync(lock);}},releaseSignals});
 }
}

async function selfTest(){
 assert.throws(()=>validateCommand({id:'x',op:'goto',role:'seller',path:'https://evil.example/'}));
 assert.throws(()=>validateCommand({id:'x',op:'goto',role:'seller',path:'//evil.example/'}));
 assert.throws(()=>validateCommand({id:'x',op:'evaluate',role:'seller',value:'secret'}));
 assert.throws(()=>validateCommand({id:'../x',op:'journal'}));
 assert.throws(()=>validateCommand({id:'__proto__',op:'journal'}));
 assert.throws(()=>validateCommand({id:'x',op:'click',role:'keeper',name:'Accept'}));
 assert.throws(()=>validateCommand({id:'x',op:'fill',role:'buyer',label:'Quantity',value:'1',stage:{}}));
 assert.equal(validateCommand({id:'x',op:'goto',role:'holder',path:'/#market/1'}).role,'holder');
 const reviewedCommand={id:'send',op:'send-reviewed',stageId:'setup',actionId:'transfer'};
 for(const field of ['tx','params','from','to','data','value','role','unknown'])assert.throws(()=>validateCommand({...reviewedCommand,[field]:'forbidden'}));
 assert.throws(()=>validateCommand({...reviewedCommand,actionId:'../bad'}));
 const signals=new EventEmitter();let stops=0;const release=installShutdownSignals(signals,()=>stops++);
 signals.emit('SIGTERM');signals.emit('SIGINT');signals.emit('SIGTERM');assert.equal(stops,1);assert.equal(signals.listenerCount('SIGTERM'),1);
 const closed=[];
 await assert.rejects(closeDriverResources({context:{async close(){closed.push('context');signals.emit('SIGTERM');throw new Error('close failed');}},bridge:{async close(){closed.push('bridge');signals.emit('SIGINT');throw new Error('bridge failed');}},releaseLock:()=>closed.push('lock'),releaseSignals:()=>{closed.push('signals');release();}}));
 assert.deepEqual(closed,['context','bridge','lock','signals']);assert.equal(stops,1);assert.equal(signals.listenerCount('SIGTERM'),0);

 const directory=mkdtempSync(resolve(realpathSync(tmpdir()),'usufruct-browser-test-'));chmodSync(directory,0o700);
 try{
  const reviewedPath=resolve(directory,'reviewed.json');let calls=[];
  const action={id:'transfer',from:'0x'+'11'.repeat(20),to:'0x'+'22'.repeat(20),data:'0x1234',valueWei:'16',gasLimit:'21000',usdcBudgetMicros:'0'};
  const reviewed={stages:[{id:'setup',transactions:[action]}],transactions:[{raw:'PRIVATE_RAW'}]};privateJSON(reviewedPath,reviewed);
  const stubBridge={request:async(address,request)=>{calls.push({address,request});return '0x'+'33'.repeat(32);}};
  await sendReviewed({command:reviewedCommand,journalPath:reviewedPath,bridge:stubBridge});
  assert.deepEqual(calls,[{address:action.from,request:{method:'eth_sendTransaction',params:[{from:action.from,to:action.to,data:'0x1234',value:'0x10'}]}}]);
  for(const command of [{...reviewedCommand,stageId:'missing'},{...reviewedCommand,actionId:'missing'},{...reviewedCommand,tx:{to:action.to}}])await assert.rejects(sendReviewed({command,journalPath:reviewedPath,bridge:stubBridge}));assert.equal(calls.length,1);
  reviewed.stages[0].transactions.push({...action});privateJSON(reviewedPath,reviewed);await assert.rejects(sendReviewed({command:reviewedCommand,journalPath:reviewedPath,bridge:stubBridge}));assert.equal(calls.length,1);
  reviewed.stages[0].transactions=[action];reviewed.stages.push({id:'newer',transactions:[{...action,id:'alias',from:action.from.toUpperCase().replace('0X','0x'),data:action.data.toUpperCase().replace('0X','0x'),valueWei:'016'}]});privateJSON(reviewedPath,reviewed);
  await assert.rejects(sendReviewed({command:reviewedCommand,journalPath:reviewedPath,bridge:stubBridge}));assert.equal(calls.length,1);reviewed.stages.pop();
  reviewed.stages[0].transactions=[{...action,to:null}];privateJSON(reviewedPath,reviewed);await sendReviewed({command:reviewedCommand,journalPath:reviewedPath,bridge:stubBridge});assert.equal(calls[1].request.params[0].to,null);
  await assert.rejects(sendReviewed({command:reviewedCommand,journalPath:reviewedPath,bridge:{request:async()=>{throw new Error('BRIDGE_POLICY_REFUSAL');}}}));
  const paths={commandsPath:resolve(directory,'commands.jsonl'),statePath:resolve(directory,'state.json'),ackPath:resolve(directory,'ack.jsonl')};let count=0;
  const execute=async()=>{count++;};let queue=commandQueue({...paths,execute});
  const c={id:'once',op:'journal'};appendPrivate(paths.commandsPath,c);await queue.poll();assert.equal(count,1);
  appendPrivate(paths.commandsPath,c);await queue.poll();assert.equal(count,1);
  queue=commandQueue({...paths,execute});await queue.poll();assert.equal(count,1);
  const interrupted={id:'interrupted',op:'journal'};const raw=Buffer.from(JSON.stringify(interrupted));const state=JSON.parse(readPrivate(paths.statePath));state.commands.interrupted={digest:hash(raw),status:'started'};privateJSON(paths.statePath,state);
  appendPrivate(paths.commandsPath,interrupted);queue=commandQueue({...paths,execute});await queue.poll();assert.equal(count,1);
  appendPrivate(paths.commandsPath,{id:'once',op:'stop'});await assert.rejects(queue.poll());assert.equal(count,1);
  writeFileSync(paths.commandsPath,'');await assert.rejects(queue.poll());
  const failurePaths={commandsPath:resolve(directory,'failed-commands.jsonl'),statePath:resolve(directory,'failed-state.json'),ackPath:resolve(directory,'failed-ack.jsonl')};
  let failures=0;const fail=async()=>{failures++;throw new Error('PRIVATE_PLAN_MUST_NOT_ESCAPE');};
  let failing=commandQueue({...failurePaths,execute:fail});appendPrivate(failurePaths.commandsPath,{id:'failed',op:'journal'});await failing.poll();
  failing=commandQueue({...failurePaths,execute:fail});await failing.poll();assert.equal(failures,1);assert(!readPrivate(failurePaths.ackPath).includes('PRIVATE_PLAN'));
  chmodSync(failurePaths.commandsPath,0o644);await assert.rejects(failing.poll());
  const stopPaths={commandsPath:resolve(directory,'stop-commands.jsonl'),statePath:resolve(directory,'stop-state.json'),ackPath:resolve(directory,'stop-ack.jsonl')};let stoppedCount=0;
  const stopping=commandQueue({...stopPaths,execute:async()=>{stoppedCount++;return 'stop';}});appendPrivate(stopPaths.commandsPath,{id:'stop',op:'stop'});appendPrivate(stopPaths.commandsPath,{id:'later',op:'journal'});await stopping.poll();assert.equal(stoppedCount,1);
  console.log('PASS: offline schema/origin restrictions, private-file checks, durable deduplication, uncertain/failed-command refusal, sanitized errors, stop boundary, repeated signals/nested cleanup, exact reviewed-ID sends and append-only prefix checks');
 }finally{rmSync(directory,{recursive:true,force:true});}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 (process.argv.includes('--self-test')?selfTest():runBrowser()).catch(error=>{if(process.argv.includes('--self-test'))console.error(error);process.stderr.write('LIVE_BROWSER_STOPPED: inspect private command/wallet journals; no automatic retry.\n');process.exitCode=1;});
}
