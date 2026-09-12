import {createServer} from 'node:http';
import {timingSafeEqual} from 'node:crypto';

export const apiPaths=new Set(['/api/operations','/api/recovery','/api/recovery/artifact','/api/analysis']);
export function validTarget(raw){
 if(typeof raw!=='string'||raw.length>1024||!raw.startsWith('/')||raw.startsWith('//'))return null;
 const url=new URL(raw,'http://localhost');
 if(!apiPaths.has(url.pathname))return null;
 const allowed=url.pathname==='/api/operations'?[]:url.pathname==='/api/analysis'?['seriesId','quantity','price','executionCost']:url.pathname.endsWith('/artifact')?['seriesId','digest']:['seriesId'];
 for(const key of url.searchParams.keys())if(!allowed.includes(key)||url.searchParams.getAll(key).length!==1)return null;
 return url;
}
export function json(res,status,value){res.writeHead(status,{'content-type':'application/json','cache-control':'no-store','x-content-type-options':'nosniff'});res.end(JSON.stringify(value));}
export async function readBounded(response,max=2*1024*1024){
 if(Number(response.headers.get('content-length'))>max){await response.body?.cancel();throw new Error('RESPONSE_TOO_LARGE');}
 const chunks=[];let length=0;
 for await(const chunk of response.body??[]){length+=chunk.length;if(length>max)throw new Error('RESPONSE_TOO_LARGE');chunks.push(Buffer.from(chunk));}
 return Buffer.concat(chunks);
}
export async function forward(res,target,{token,fetcher=fetch,timeoutMs=35000}={}){
 const response=await fetcher(target,{headers:token?{authorization:`Bearer ${token}`}:{},redirect:'error',signal:AbortSignal.timeout(timeoutMs)});
 if(!response.headers.get('content-type')?.startsWith('application/json'))throw new Error('INVALID_UPSTREAM');
 const body=await readBounded(response);
 res.writeHead(response.status,{'content-type':'application/json','cache-control':'no-store','x-content-type-options':'nosniff'});res.end(body);
}
function authorized(req,token){
 const expected=Buffer.from(`Bearer ${token}`),actual=Buffer.from(req.headers.authorization??'');
 return actual.length===expected.length&&timingSafeEqual(actual,expected);
}
/** The public surface is GET-only. No RPC forwarding, arbitrary upstreams or signer entry points. */
export function operationsServer({status,recoveryHandler,token,analysisHandler=null,analysisOrigin=null,fetcher=fetch}){
 if(typeof token!=='string'||token.length<32)throw new Error('GATEWAY_TOKEN_REQUIRED');
 let active=0;
 const server=createServer(async(req,res)=>{
  if(req.method==='GET'&&req.url==='/healthz')return json(res,200,{status:'running'});
  if(!authorized(req,token))return json(res,401,{error:'UNAUTHORIZED'});
  let url;try{url=validTarget(req.url);}catch{}
  if(req.method!=='GET'||!url)return json(res,404,{error:'NOT_FOUND'});
  if(active>=8)return json(res,429,{error:'SERVICE_BUSY'});
  active++;res.once('close',()=>{active--;});
  try{
   if(url.pathname==='/api/operations')return json(res,200,await status());
   if(url.pathname.startsWith('/api/recovery'))return await recoveryHandler(req,res);
   if(analysisHandler)return await analysisHandler(req,res);
   if(!analysisOrigin)return json(res,503,{error:'Historical activity is not available yet. The project operator needs to start the history service.',allocationAuthority:'contract-only'});
   return await forward(res,new URL(url.pathname+url.search,analysisOrigin),{fetcher});
  }catch{return json(res,503,{error:'SERVICE_UNAVAILABLE'});}
 });
 server.requestTimeout=40000;server.headersTimeout=10000;return server;
}
