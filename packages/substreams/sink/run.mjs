#!/usr/bin/env node
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {parseArgs} from 'node:util';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createGrpcTransport} from '@connectrpc/connect-node';
import {proto3} from '@bufbuild/protobuf';
import {applyParams,createAuthInterceptor,createRegistry,createRequest,createSubstream,streamBlocks,unpackMapOutput} from '@substreams/core';
import {HistoryStore} from '../../data/src/store.mjs';
import {SubstreamsHistorySink} from '../../data/src/substreams.mjs';

export function configurePackage(pkg,network,poolIds){
 const selection=pkg.networks[network];if(!selection)throw new Error('Unsupported package network');
 const modules=pkg.modules?.modules;if(!modules)throw new Error('Package lacks modules');
 for(const [name,initial]of Object.entries(selection.initialBlocks)){const module=modules.find(m=>m.name===name);if(!module)throw new Error('Unknown network module');module.initialBlock=initial;}
 applyParams(Object.entries(selection.params).map(([name,value])=>`${name}=${value}`),modules);
 const module=modules.find(m=>m.name==='map_pool_context');const params=module?.inputs[0]?.input;
 if(params?.case!=='params')throw new Error('Context params are missing');
 const config=new URLSearchParams(params.value.value);config.set('pool_ids',poolIds.join(','));
 // URLSearchParams encodes commas/0x query content; our Rust parser expects literal '&' separated values.
 params.value.value=[...config].map(([k,v])=>`${k}=${v}`).join('&');
 return {chainId:Number(config.get('chain_id')),poolManager:config.get('pool_manager')};
}

export function consumeResponse(response,registry,sink){
 const {case:kind,value:data}=response.message;
 if(kind==='blockScopedData'){
  // SDK0.17 predates partial-block fields13..15. Reject their presence, never silently merge partial state.
  const partial=proto3.bin.listUnknownFields(data).some(field=>[13,14,15].includes(field.no));
  const output=unpackMapOutput(response,registry);if(!output)throw new Error('Missing context output');
  return sink.applyBlock({clock:data.clock,providerCursor:data.cursor,finalBlockHeight:data.finalBlockHeight,
   output:output.toJson({typeRegistry:registry}),module:data.output?.name,partial});
 }
 if(kind==='blockUndoSignal')return sink.undo({number:data.lastValidBlock?.number,hash:data.lastValidBlock?.id,providerCursor:data.lastValidCursor});
 if(kind==='fatalError')throw new Error('Substreams reported a fatal stream error');
 if(!['session','progress'].includes(kind))throw new Error('Unsupported Substreams response');
 return undefined;
}

async function main(){
 const {values:o}=parseArgs({options:{package:{type:'string',default:fileURLToPath(new URL('../feestrip-pool-context-v0.1.0.spkg',import.meta.url))},network:{type:'string',default:'sepolia'},pools:{type:'string'},start:{type:'string'},stop:{type:'string'},db:{type:'string',default:'feestrip-history.db'},endpoint:{type:'string'},'include-unfinalized':{type:'boolean',default:false},'validate-only':{type:'boolean',default:false}}});
 if(!o.pools||!o.start||!/^\d+$/.test(o.start))throw new Error('--pools and an absolute --start are required');
 if(o.stop&&!/^\d+$/.test(o.stop))throw new Error('--stop must be an absolute exclusive block');
 const poolIds=o.pools.split(',');const bytes=readFileSync(o.package);const packageHash=`0x${createHash('sha256').update(bytes).digest('hex')}`;
 const pkg=createSubstream(bytes);const identity=configurePackage(pkg,o.network,poolIds);const registry=createRegistry(pkg);
 const store=new HistoryStore(o['validate-only']?':memory:':o.db);
 try{
  const sink=new SubstreamsHistorySink(store,{...identity,poolIds,packageHash,finalBlocksOnly:!o['include-unfinalized']});
  const request=createRequest({substreamPackage:pkg,outputModule:'map_pool_context',productionMode:true,startBlockNum:BigInt(o.start),stopBlockNum:BigInt(o.stop??0),startCursor:sink.checkpoint()?.providerCursor,finalBlocksOnly:!o['include-unfinalized']});
  if(o['validate-only']){console.log(JSON.stringify({status:'validated-offline',network:o.network,...identity,packageHash,module:request.outputModule,modules:request.modules.modules.map(m=>m.name),finalBlocksOnly:request.finalBlocksOnly}));return;}
  const token=process.env.SUBSTREAMS_API_TOKEN;if(!token)throw new Error('Live stream blocked: SUBSTREAMS_API_TOKEN is required');
  const endpoint=o.endpoint??({sepolia:'https://sepolia.eth.streamingfast.io',mainnet:'https://mainnet.eth.streamingfast.io'})[o.network];
  if(!endpoint||new URL(endpoint).protocol!=='https:')throw new Error('HTTPS Substreams endpoint required');
  const transport=createGrpcTransport({baseUrl:endpoint,interceptors:[createAuthInterceptor(token)],jsonOptions:{typeRegistry:registry}});
  for await(const response of streamBlocks(transport,request)){
   const result=consumeResponse(response,registry,sink);if(result)console.log(JSON.stringify({status:'applied',number:result.number,hash:result.hash,finalBlockHeight:result.finalBlockHeight}));
  }
  console.log(JSON.stringify({status:'stream-ended',head:sink.checkpoint()?.number??null}));
 }finally{store.close();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 main().catch(error=>{ // Avoid serializing transport metadata or credentials from arbitrary provider errors.
  console.error(error?.code!==undefined?`Substreams transport failed (code ${error.code}); checkpoint retained`:error.message);process.exitCode=1;
 });
}
