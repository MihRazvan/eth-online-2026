#!/usr/bin/env python3
"""Retain public Sepolia EIP-1186 witness; never substitutes values on RPC failure.
Dependencies: pip install -r scripts/proof/requirements.txt
RPC URL is read from PROOF_RPC_URL; credentials are never written to evidence.
"""
import argparse, datetime, json, os, pathlib, subprocess, urllib.request
import rlp
from eth_hash.auto import keccak
from trie import HexaryTrie

MANAGER = '0xE03A1074c86CFeDd5C142C4F04F1a1536e203543'
POSM = '0x429ba70129df741B2Ca2a85BC3A2a3328e5c09b4'
USDC = '0x1c7d4b196cb0c7b01d743fbc6116a902379c7238'
RPC = os.environ.get('PROOF_RPC_URL', 'https://ethereum-sepolia-rpc.publicnode.com')

def rpc(method, params):
    body=json.dumps({'jsonrpc':'2.0','id':1,'method':method,'params':params}).encode()
    req=urllib.request.Request(RPC, data=body, headers={'Content-Type':'application/json','User-Agent':'FeeStrip-proof/1.0'})
    with urllib.request.urlopen(req,timeout=60) as response: out=json.load(response)
    if 'error' in out: raise RuntimeError(f'{method}: {out["error"]}')
    return out['result']

def raw(h): return bytes.fromhex(h.removeprefix('0x'))
def word(n): return (n % (1<<256)).to_bytes(32,'big')
def integer(n): return int(n,16)
def call(to, signature, token=None, block='latest'):
    data=keccak(signature.encode())[:4]+(word(token) if token is not None else b'')
    return raw(rpc('eth_call',[{'to':to,'data':'0x'+data.hex()},block]))
def pool_info(token,block):
    b=call(POSM,'getPoolAndPositionInfo(uint256)',token,block)
    vals=[int.from_bytes(b[i:i+32],'big') for i in range(0,len(b),32)]
    return vals,b[:160]
def signed24(n):
    n &= (1<<24)-1
    return n-(1<<24) if n&(1<<23) else n

def main():
    ap=argparse.ArgumentParser();ap.add_argument('--token',type=int);ap.add_argument('--block',type=int);ap.add_argument('--out',default='scripts/proof/sepolia-witness.json');args=ap.parse_args()
    assert integer(rpc('eth_chainId',[])) == 11155111
    n=args.block or integer(rpc('eth_blockNumber',[]))-8; block=hex(n)
    token=args.token
    if token is None:
        latest=int.from_bytes(call(POSM,'nextTokenId()',block=block),'big')
        for candidate in range(latest-1,max(0,latest-2000),-1):
            vals,_=pool_info(candidate,block)
            if int(USDC,16) in vals[:2] and vals[4]==0:
                liq=int.from_bytes(call(POSM,'getPositionLiquidity(uint256)',candidate,block),'big')
                if liq: token=candidate;print(f'Eligible token {token}',flush=True);break
        if token is None: raise RuntimeError('No eligible USDC NFT found; provide --token')
    if args.block is None: n=integer(rpc('eth_blockNumber',[]));block=hex(n)
    vals,key=pool_info(token,block); assert vals[4]==0 and int(USDC,16) in vals[:2]
    # PositionInfo packs hasSubscriber byte, signed lower 24 bits, upper 24 bits, poolId prefix.
    lower=signed24(vals[5]>>8);upper=signed24(vals[5]>>32);c0=vals[0]==int(USDC,16)
    pool=keccak(key);base=int.from_bytes(keccak(pool+word(6)),'big')
    slots=[base,base+(1 if c0 else 2),int.from_bytes(keccak(word(lower)+word(base+4)),'big')+(1 if c0 else 2),int.from_bytes(keccak(word(upper)+word(base+4)),'big')+(1 if c0 else 2)]
    slots=['0x'+word(s).hex() for s in slots]
    header=rpc('eth_getBlockByNumber',[block,False]);proof=rpc('eth_getProof',[MANAGER,slots,block])
    fields=['parentHash','sha3Uncles','miner','stateRoot','transactionsRoot','receiptsRoot','logsBloom','difficulty','number','gasLimit','gasUsed','timestamp','extraData','mixHash','nonce','baseFeePerGas','withdrawalsRoot','blobGasUsed','excessBlobGas','parentBeaconBlockRoot','requestsHash']
    ints={'difficulty','number','gasLimit','gasUsed','timestamp','baseFeePerGas','blobGasUsed','excessBlobGas'}
    encoded=rlp.encode([integer(header[k]) if k in ints else raw(header[k]) for k in fields if k in header and header[k] is not None])
    assert keccak(encoded)==raw(header['hash']), 'Header RLP mismatch'
    account=HexaryTrie.get_from_proof(raw(header['stateRoot']),keccak(raw(MANAGER)),[rlp.decode(raw(x)) for x in proof['accountProof']])
    a=rlp.decode(account);assert a[2]==raw(proof['storageHash']) and a[3]==raw(proof['codeHash'])
    code=rpc('eth_getCode',[MANAGER,block]);assert keccak(raw(code))==a[3]
    storageNodes=list(dict.fromkeys(x for s in proof['storageProof'] for x in s['proof']))
    values=[]
    byslot={integer(s['key']):s for s in proof['storageProof']}
    for slot in slots:
        s=byslot[integer(slot)]
        encodedValue=HexaryTrie.get_from_proof(a[2],keccak(raw(slot)),[rlp.decode(raw(x)) for x in s['proof']])
        v=int.from_bytes(rlp.decode(encodedValue),'big') if encodedValue else 0
        assert v==integer(s['value']);values.append(v)
    tick=signed24(values[0]>>160);mod=(1<<256)
    below=values[2] if tick>=lower else (values[1]-values[2])%mod
    above=values[3] if tick<upper else (values[1]-values[3])%mod
    growth=(values[1]-below-above)%mod
    # Native deployed StateView is a separately executed oracle for raw inside growth.
    sig='getFeeGrowthInside(bytes32,int24,int24)';data=keccak(sig.encode())[:4]+pool+word(lower)+word(upper)
    native=raw(rpc('eth_call',[{'to':'0xe1dd9c3fa50edb962e442f60dfbc432e24537e4c','data':'0x'+data.hex()},block]))
    assert growth==int.from_bytes(native[0:32] if c0 else native[32:64],'big')
    witness=subprocess.check_output(['cast','abi-encode','f(bytes,bytes[],bytes[])','0x'+encoded.hex(),'['+','.join(proof['accountProof'])+']','['+','.join(storageNodes)+']'],text=True).strip()
    result={'scope':'genuine public Sepolia witness; no FeeStrip deployment or native collection acceptance claimed','retrievedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'chainId':11155111,'blockNumber':n,'blockHash':header['hash'],'manager':MANAGER,'positionManager':POSM,'usdc':USDC,'tokenId':token,'poolId':'0x'+pool.hex(),'tickLower':lower,'tickUpper':upper,'usdcIsCurrency0':c0,'liquidity':str(int.from_bytes(call(POSM,'getPositionLiquidity(uint256)',token,block),'big')),'feeGrowthInsideX128':str(growth),'storedTick':tick,'slots':slots,'values':[str(v) for v in values],'header':header,'headerRlp':'0x'+encoded.hex(),'proof':proof,'managerCode':code,'witness':witness}
    for label,address in [('positionManager',POSM),('usdc',USDC)]:
        deployedCode=rpc('eth_getCode',[address,block]);result[label+'CodeHash']='0x'+keccak(raw(deployedCode)).hex();result[label+'CodeBytes']=len(raw(deployedCode))
    pathlib.Path(args.out).write_text(json.dumps(result,indent=2)+'\n')
    print(json.dumps({k:result[k] for k in ['blockNumber','blockHash','tokenId','poolId','tickLower','tickUpper','liquidity','feeGrowthInsideX128']}))
if __name__=='__main__': main()
