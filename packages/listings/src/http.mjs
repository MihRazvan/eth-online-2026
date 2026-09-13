const json=(res,status,value)=>{res.writeHead(status,{'content-type':'application/json','cache-control':'no-store','x-content-type-options':'nosniff'});res.end(JSON.stringify(value));};
const inputErrors=new Set(['INVALID_FIELDS','INVALID_SCOPE','INVALID_TERMS','WRONG_SCOPE','INVALID_CANCELLATION','INVALID_SIGNATURE','EOA_SIGNATURE_REQUIRED','LISTING_ID_MISMATCH','INVALID_LISTING_ID','INVALID_QUERY','EXPIRED','CLOSING_SOON','TERMS_TOO_DISTANT','OWNER_CHANGED','POSITION_CHANGED','NOT_LISTING_SELLER','INVALID_BODY']);
const conflictErrors=new Set(['LISTING_CANCELLED','NONCE_ALREADY_USED','LISTING_CAPACITY_REACHED']);
async function body(req) {
  if(!req.headers['content-type']?.startsWith('application/json')||Number(req.headers['content-length'])>16384)throw new Error('INVALID_BODY');
  const chunks=[];let bytes=0;for await(const chunk of req){bytes+=chunk.length;if(bytes>16384)throw new Error('INVALID_BODY');chunks.push(chunk);}
  try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw new Error('INVALID_BODY');}
}
/** Public, bounded signed-intent handler; no keeper token or signing key is exposed. */
export function createListingsHandler(service) {
  let active=0;
  return async(req,res)=>{
    if(active>=4)return json(res,429,{error:'SERVICE_BUSY',message:'Try again shortly.'});
    active++;
    try {
      if(typeof req.url!=='string'||req.url.length>1024||!req.url.startsWith('/')||req.url.startsWith('//'))throw new Error('INVALID_QUERY');
      const url=new URL(req.url,'http://localhost');
      if(url.pathname!=='/api/listings')return json(res,404,{error:'NOT_FOUND',message:'Unknown listing route.'});
      for(const [key] of url.searchParams)if(!['listingId','cursor','limit','seller','tokenId'].includes(key)||url.searchParams.getAll(key).length!==1)throw new Error('INVALID_QUERY');
      if(req.method==='GET') {
        const query=Object.fromEntries(url.searchParams);
        if(query.listingId!==undefined){if(Object.keys(query).length!==1)throw new Error('INVALID_QUERY');return json(res,200,await service.detail(query.listingId));}
        if(query.limit!==undefined){if(!/^[1-9][0-9]?$/.test(query.limit))throw new Error('INVALID_QUERY');query.limit=Number(query.limit);}
        return json(res,200,await service.list(query));
      }
      if(req.method!=='POST')return json(res,405,{error:'METHOD_NOT_ALLOWED',message:'Use GET or signed POST.'});
      if(url.search)throw new Error('INVALID_QUERY');
      const value=await body(req);
      if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==2)throw new Error('INVALID_BODY');
      if(value.operation==='publish'&&Object.hasOwn(value,'listing'))return json(res,200,await service.publish(value.listing));
      if(value.operation==='cancel'&&Object.hasOwn(value,'cancellation'))return json(res,200,await service.cancel(value.cancellation));
      throw new Error('INVALID_BODY');
    }catch(error){
      const code=error.message;
      const status=code==='LISTING_NOT_FOUND'?404:inputErrors.has(code)?400:conflictErrors.has(code)?409:503;
      const safe=status===503?'LISTING_SERVICE_UNAVAILABLE':code;
      json(res,status,{error:safe,message:status===503?'Listing service could not verify canonical chain state. Try again.':safe.replaceAll('_',' ')});
    }finally{active--;}
  };
}
