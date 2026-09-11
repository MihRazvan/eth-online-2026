import {createServer} from 'node:http';
import {digest,stableJSON} from './store.mjs';
import {publicArtifact} from './artifact.mjs';
import {validateWitness} from './validate.mjs';
import {expectedFor} from './worker.mjs';

/** Same-origin reverse proxy target. GET only; never exposes configuration, paths, or a signing operation. */
export function recoveryServer({store,scope,validate=validateWitness}){
 let validating=0;
 const server=createServer(async(req,res)=>{
  res.setHeader('content-type','application/json');res.setHeader('cache-control','no-store');res.setHeader('x-content-type-options','nosniff');
  const respond=(status,value)=>{res.writeHead(status);res.end(JSON.stringify(value));};
  let url;try{url=new URL(req.url,'http://localhost');}catch{return respond(400,{error:'INVALID_REQUEST_TARGET'});}
  try{
  const seriesId=url.searchParams.get('seriesId');
  if(req.method!=='GET'||!['/api/recovery','/api/recovery/artifact'].includes(url.pathname))return respond(404,{error:'NOT_FOUND'});
  if(!/^[1-9][0-9]{0,77}$/.test(seriesId??''))return respond(400,{error:'INVALID_SERIES_ID'});
  const status=store.publicStatus(scope,seriesId);
  if(!status)return respond(404,{error:'SERIES_NOT_REGISTERED',allocationAuthority:'contract-only'});
  if(url.pathname==='/api/recovery')return respond(200,status);
  const id=url.searchParams.get('digest');
  if(!id||id!==status.artifactDigest||!['retained','unavailable'].includes(status.state))return respond(409,{error:'ARTIFACT_NOT_CURRENT'});
  if(validating>=2)return respond(429,{error:'VALIDATION_BUSY'});
  validating++;
  try{
   const row=store.artifact(id),job=store.jobs(scope).find(j=>j.series_id===seriesId);
   if(!row||digest(row.payload)!==id||!job)throw new Error();
   const artifact=publicArtifact(JSON.parse(row.payload));await validate(artifact,expectedFor(job.terms));
   // A worker may have orphaned the candidate while offline authentication ran.
   const latest=store.publicStatus(scope,seriesId);
   if(latest?.artifactDigest!==id||!['retained','unavailable'].includes(latest.state))return respond(409,{error:'ARTIFACT_NOT_CURRENT'});
   res.setHeader('content-disposition',`attachment; filename="feestrip-witness-${seriesId}-${id}.json"`);
   const payload=stableJSON(artifact);if(digest(payload)!==id)throw new Error();
   res.writeHead(200);return res.end(payload);
  }catch{return respond(503,{error:'ARTIFACT_VALIDATION_UNAVAILABLE'});}
  finally{validating--;}
  }catch{return respond(503,{error:'RECOVERY_UNAVAILABLE'});}
 });
 server.requestTimeout=35000;server.headersTimeout=10000;
 return server;
}
