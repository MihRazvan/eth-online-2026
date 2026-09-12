import {validTarget,forward,json} from '../../packages/operations/src/http.mjs';
/** Secrets are runtime-only Vercel variables; only four fixed read-only routes are forwarded. */
export function proxyFor(path,{env=process.env,fetcher=fetch}={}){
 return async(req,res)=>{
  let url;try{url=validTarget(req.url);}catch{}
  if(req.method!=='GET'||!url||url.pathname!==path)return json(res,404,{error:'NOT_FOUND'});
  try{
   const origin=new URL(env.OPERATIONS_ORIGIN);
   if(origin.protocol!=='https:'||origin.username||origin.password||origin.pathname!=='/'||origin.search||origin.hash||!env.OPERATIONS_GATEWAY_TOKEN||env.OPERATIONS_GATEWAY_TOKEN.length<32)throw new Error();
   await forward(res,new URL(path+url.search,origin),{token:env.OPERATIONS_GATEWAY_TOKEN,fetcher});
  }catch{return json(res,503,{error:'OPERATIONS_NOT_AVAILABLE',allocationAuthority:'contract-only'});}
 };
}
