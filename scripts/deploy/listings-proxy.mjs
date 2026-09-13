import {validTarget,json,readBounded} from '../../packages/operations/src/http.mjs';
import {readListingBody} from '../../packages/listings/src/http.mjs';
/** Only seller-signed listing payloads are relayed. No server key signs transactions. */
export function listingsProxy({env=process.env,fetcher=fetch}={}) {
  return async(req,res)=>{
    let url;try{url=validTarget(req.url);}catch{}
    if(!url||url.pathname!=='/api/listings'||!['GET','POST'].includes(req.method)||(req.method==='POST'&&url.search))return json(res,404,{error:'NOT_FOUND'});
    let body;
    if(req.method==='POST'){
      try {const value=await readListingBody(req);if(!value||!['publish','cancel'].includes(value.operation))throw new Error();body=JSON.stringify(value);}
      catch{return json(res,400,{error:'INVALID_LISTING_REQUEST'});}
    }
    try{
      const origin=new URL(env.OPERATIONS_ORIGIN);
      if(origin.protocol!=='https:'||origin.username||origin.password||origin.pathname!=='/'||origin.search||origin.hash||!env.OPERATIONS_GATEWAY_TOKEN||env.OPERATIONS_GATEWAY_TOKEN.length<32)throw new Error();
      const response=await fetcher(new URL(url.pathname+url.search,origin),{method:req.method,headers:{authorization:`Bearer ${env.OPERATIONS_GATEWAY_TOKEN}`,...(body?{'content-type':'application/json'}:{})},body,redirect:'error',signal:AbortSignal.timeout(15000)});
      if(!response.headers.get('content-type')?.startsWith('application/json'))throw new Error();
      const bytes=await readBounded(response,256*1024);
      res.writeHead(response.status,{'content-type':'application/json','cache-control':'no-store','x-content-type-options':'nosniff'});res.end(bytes);
    }catch{return json(res,503,{error:'LISTING_SERVICE_UNAVAILABLE'});}
  };
}
