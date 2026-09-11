#!/usr/bin/env python3
"""Offline independent Python verification of retained real public-chain witness.
Authenticates to retained header hash; canonical consensus requires the Solidity fork/onchain anchor.
"""
import json, pathlib
import rlp
from eth_hash.auto import keccak
from trie import HexaryTrie
from acquire import raw, word, integer, signed24

j=json.loads(pathlib.Path(__file__).with_name('sepolia-witness.json').read_text())
h=rlp.decode(raw(j['headerRlp']))
assert keccak(raw(j['headerRlp']))==raw(j['blockHash'])
assert int.from_bytes(h[8],'big')==j['blockNumber']
p=j['proof']
a=rlp.decode(HexaryTrie.get_from_proof(h[3],keccak(raw(j['manager'])),[rlp.decode(raw(x)) for x in p['accountProof']]))
assert a[2]==raw(p['storageHash']) and a[3]==raw(p['codeHash'])==keccak(raw(j['managerCode']))
base=int.from_bytes(keccak(raw(j['poolId'])+word(6)),'big');off=1 if j['usdcIsCurrency0'] else 2
slots=[base,base+off,*[int.from_bytes(keccak(word(j[t])+word(base+4)),'big')+off for t in ['tickLower','tickUpper']]]
assert ['0x'+word(s).hex() for s in slots]==j['slots']
bykey={integer(v['key']):v for v in p['storageProof']};values=[]
for s in slots:
 v=bykey[s]
 b=HexaryTrie.get_from_proof(a[2],keccak(word(s)),[rlp.decode(raw(x)) for x in v['proof']])
 n=int.from_bytes(rlp.decode(b),'big') if b else 0
 assert n==integer(v['value']);values.append(n)
assert list(map(str,values))==j['values']
tick=signed24(values[0]>>160);assert tick==j['storedTick']
below=values[2] if tick>=j['tickLower'] else values[1]-values[2]
above=values[3] if tick<j['tickUpper'] else values[1]-values[3]
assert (values[1]-below-above)%(1<<256)==int(j['feeGrowthInsideX128'])
print(f"Verified public witness N={j['blockNumber']}, account + four canonical slots, insideGrowth={j['feeGrowthInsideX128']}")
