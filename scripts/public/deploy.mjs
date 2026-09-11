import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,existsSync,renameSync,openSync,closeSync,fsyncSync,unlinkSync} from 'node:fs';
import {parseEnv} from 'node:util';
import {createPublicClient,createWalletClient,http,encodeDeployData,keccak256,parseAbi,toHex,parseTransaction,recoverTransactionAddress} from 'viem';
import {privateKeyToAccount} from 'viem/accounts';
import {sepolia} from 'viem/chains';
import {artifact} from '../chain/common.mjs';

const mode = process.argv[2];
assert.ok(['rehearse','broadcast'].includes(mode),'Usage: node scripts/public/deploy.mjs rehearse|broadcast');
const json = value => JSON.stringify(value,(_,v)=>typeof v === 'bigint' ? v.toString() : v,2)+'\n';
const directory = `.scratch/public-${mode}`;
mkdirSync(directory,{recursive:true,mode:0o700});
const file = `${directory}/journal.json`;
let stage = 'configuration';
let lock;
try {
  lock=openSync(`${directory}/runner.lock`,'wx',0o600);
  writeFileSync(lock,String(process.pid));fsyncSync(lock);
  const {preparePosition} = await import('./position.mjs');
  const contractNames=['BlockHashCheckpoints','HistoricalFeeVerifier','FeeStrip','Aqua','FeeStripRouter','FeeStripMarket'];
  const implementationHash=keccak256(toHex([...['deploy.mjs','position.mjs','rehearse-custody.mjs'].map(n=>readFileSync(`scripts/public/${n}`,'utf8')),...contractNames.map(n=>json({abi:artifact(n).abi,bytecode:artifact(n).bytecode.object}))].join('\n')));
  if(mode==='broadcast') {
    const rehearsal=JSON.parse(readFileSync('.scratch/public-rehearse/evidence.json'));
    assert.equal(rehearsal.implementationHash,implementationHash,'Rehearse this exact implementation before broadcast');
    assert.ok(rehearsal.position?.nftId,'Completed position rehearsal required');
    const custody=JSON.parse(readFileSync('.scratch/public-rehearse/custody.json'));
    assert.equal(custody.status,'passed');assert.equal(custody.implementationHash,implementationHash);
    assert.equal(custody.nftId,String(rehearsal.position.nftId));
  }
  const env = {...parseEnv(readFileSync('.env','utf8')), ...process.env};
  const signer = privateKeyToAccount(env.PRIVATE_KEY);
  if(mode==='broadcast') {
    const rehearsal=JSON.parse(readFileSync('.scratch/public-rehearse/evidence.json'));
    assert.equal(rehearsal.account.toLowerCase(),signer.address.toLowerCase(),'Rehearsal signer mismatch');
    assert.equal(rehearsal.chainId,11155111);
  }
  const rpc = mode === 'rehearse' ? 'http://127.0.0.1:8552' : env.SEPOLIA_RPC_URL;
  const client = createPublicClient({chain:sepolia,transport:http(rpc,{retryCount:0,timeout:30_000})});
  const account = signer.address;
  const wallet = createWalletClient({account:mode === 'rehearse' ? account : signer,chain:sepolia,transport:http(rpc,{retryCount:0,timeout:30_000})});
  assert.equal(await client.getChainId(),11155111);
  if (mode === 'rehearse') {
    assert.match(await client.request({method:'web3_clientVersion'}),/anvil/i);
    await client.request({method:'anvil_impersonateAccount',params:[account]});
  }
  const retained = JSON.parse(readFileSync('scripts/proof/sepolia-witness.json'));
  const addresses = {poolManager:retained.manager,positionManager:retained.positionManager,usdc:retained.usdc,
    weth:'0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14',permit2:'0x000000000022D473030F116dDEE9F6B43aC78BA3'};
  const pins = {poolManager:keccak256(retained.managerCode),positionManager:retained.positionManagerCodeHash,usdc:retained.usdcCodeHash,
    weth:'0xc864e10689f2da18833652a3b075d43106e87f0f90d95ee64f6f0b33bc026083',permit2:'0x96d9f5c3f0fb0423426b7f970186235b7347027f4e5c19c40c412b7d97fc3751'};
  if(mode==='broadcast')assert.deepEqual(JSON.parse(readFileSync('.scratch/public-rehearse/evidence.json')).pins,pins,'Canonical pins changed since rehearsal');
  stage = 'canonical contract qualification';
  const start = await client.getBlock();
  for (const [name,hash] of Object.entries(pins)) assert.equal(keccak256(await client.getCode({address:addresses[name],blockNumber:start.number})),hash,`${name} pin mismatch`);
  const read = (address,name,functionName,args=[]) => client.readContract({address,abi:artifact(name).abi,functionName,args});
  const same = (a,b) => assert.equal(a.toLowerCase(),b.toLowerCase());
  same(await read(addresses.positionManager,'PositionManager','poolManager'),addresses.poolManager);
  same(await read(addresses.positionManager,'PositionManager','permit2'),addresses.permit2);
  same(await read(addresses.positionManager,'PositionManager','WETH9'),addresses.weth);
  const decimals = await client.readContract({address:addresses.usdc,abi:parseAbi(['function decimals() view returns (uint8)']),functionName:'decimals'});
  assert.equal(decimals,6);
  const usdcBalance=await client.readContract({address:addresses.usdc,abi:parseAbi(['function balanceOf(address) view returns (uint256)']),functionName:'balanceOf',args:[account]});
  const journal = existsSync(file) ? JSON.parse(readFileSync(file)) : {mode,chainId:11155111,account,startBlock:start.number.toString(),startHash:start.hash,pins,transactions:[]};
  assert.equal(journal.mode,mode); same(journal.account,account); assert.equal(journal.chainId,11155111);
  assert.equal((await client.getBlock({blockNumber:BigInt(journal.startBlock)})).hash,journal.startHash,'Journal belongs to a different fork or reorg');
  const save = () => {
    const fd=openSync(`${file}.tmp`,'w',0o600);
    try {writeFileSync(fd,json(journal));fsyncSync(fd);} finally {closeSync(fd);}
    renameSync(`${file}.tmp`,file);
    const parent=openSync(directory,'r');try {fsyncSync(parent);} finally {closeSync(parent);}
  };
  save();
  if (!journal.transactions.length) assert.ok(usdcBalance>=20_000_000n,'Initial setup requires 20 test USDC');
  let cursor = 0;
  async function send(label,tx) {
    stage = label;
    const call = {to:tx.to??null,data:tx.data??'0x',value:(tx.value??0n).toString()};
    let entry = journal.transactions[cursor++];
    if (entry) {
      assert.equal(entry.label,label,'Journal action order changed');assert.deepEqual(entry.call,call,'Journal transaction changed');
      if (!entry.hash) throw new Error('Ambiguous interrupted fork send; inspect journal');
    } else {
      const latest = await client.getTransactionCount({address:account,blockTag:'latest'});
      assert.equal(await client.getTransactionCount({address:account,blockTag:'pending'}),latest,'Pending wallet transaction; do not race another session');
      const previous = journal.transactions.at(-1);
      if (previous) assert.equal(latest,previous.nonce+1,'Wallet nonce changed outside this runner');
      const gas = (await client.estimateGas({account,...tx}))*120n/100n;
      const fees = await client.estimateFeesPerGas();
      assert.ok(fees.maxFeePerGas <= 50_000_000_000n,'Unexpectedly expensive testnet gas');
      const maximumCost = gas*fees.maxFeePerGas+(tx.value??0n);
      const committed = journal.transactions.reduce((n,t)=>n+BigInt(t.maximumCost),0n);
      assert.ok(committed+maximumCost <= 250_000_000_000_000_000n,'Setup exceeds 0.25 test ETH maximum authorization budget');
      assert.ok(await client.getBalance({address:account}) >= maximumCost,'Insufficient test ETH');
      entry={label,call,nonce:latest,maximumCost:maximumCost.toString()};
      journal.transactions.push(entry);
      if (mode === 'broadcast') {
        const request = await wallet.prepareTransactionRequest({...tx,nonce:latest,gas,...fees});
        entry.raw = await signer.signTransaction(request);
        entry.hash = keccak256(entry.raw);
        save(); // Persist exact signed transaction before the only network write.
      } else {
        save();
        entry.hash = await wallet.sendTransaction({...tx,nonce:latest,gas,...fees});save();
      }
    }
    // Re-broadcasting the persisted identical bytes is safe if submission was interrupted.
    if (entry.raw) {
      assert.equal(keccak256(entry.raw),entry.hash,'Persisted transaction hash mismatch');
      same(await recoverTransactionAddress({serializedTransaction:entry.raw}),account);
      const decoded=parseTransaction(entry.raw);
      assert.equal(decoded.chainId,11155111);assert.equal(decoded.nonce,entry.nonce);
      assert.equal((decoded.to??null)?.toLowerCase(),call.to?.toLowerCase());
      assert.equal(decoded.data??'0x',call.data);assert.equal((decoded.value??0n).toString(),call.value);
      assert.ok(decoded.maxFeePerGas<=50_000_000_000n);
      assert.equal((decoded.gas*decoded.maxFeePerGas+(decoded.value??0n)).toString(),entry.maximumCost);
      assert.ok(journal.transactions.reduce((n,t)=>n+BigInt(t.maximumCost),0n)<=250_000_000_000_000_000n);
      const known = await client.getTransaction({hash:entry.hash}).catch(()=>null);
      if (!known) {
        assert.ok(await client.getTransactionCount({address:account,blockTag:'latest'})<=entry.nonce,'Persisted nonce was replaced; inspect chain');
        await client.sendRawTransaction({serializedTransaction:entry.raw});
      }
    }
    const receipt = await client.waitForTransactionReceipt({hash:entry.hash,confirmations:mode==='broadcast'?2:1,timeout:180_000,pollingInterval:mode==='broadcast'?3000:100});
    assert.equal(receipt.transactionHash,entry.hash,'Transaction was replaced; inspect exact authorization before continuing');
    assert.equal(receipt.status,'success',`${label} reverted`);
    entry.receipt = {transactionHash:receipt.transactionHash,blockNumber:receipt.blockNumber.toString(),blockHash:receipt.blockHash,contractAddress:receipt.contractAddress,gasUsed:receipt.gasUsed.toString(),effectiveGasPrice:receipt.effectiveGasPrice.toString()};save();
    console.log(`${mode}: ${label}: ${receipt.transactionHash}`);
    return receipt;
  }
  send.plan = async (key,produce) => {
    journal.plans??={};
    if (!(key in journal.plans)) {journal.plans[key]=JSON.parse(json(await produce()));save();}
    return journal.plans[key];
  };
  async function deploy(key,name,args=[]) {
    const a = artifact(name),data=encodeDeployData({abi:a.abi,bytecode:a.bytecode.object,args});
    const receipt = await send(`deploy ${name}`,{data});
    assert.ok(receipt.contractAddress);addresses[key]=receipt.contractAddress;
    const code=await client.getCode({address:receipt.contractAddress});assert.ok(code&&code!=='0x');
    journal.contracts??={};journal.contracts[key]={name,address:receipt.contractAddress,constructorArgs:args,compiler:a.metadata?.compiler??JSON.parse(a.rawMetadata??'{}').compiler,creationBytecodeHash:keccak256(a.bytecode.object),initCodeHash:keccak256(data),observedRuntimeHash:keccak256(code)};save();
  }
  await deploy('checkpoints','BlockHashCheckpoints');
  await deploy('verifier','HistoricalFeeVerifier',[addresses.poolManager,addresses.checkpoints]);
  await deploy('feeStrip','FeeStrip',[addresses.positionManager,addresses.usdc,addresses.verifier]);
  await deploy('aqua','Aqua');
  await deploy('swapRouter','FeeStripRouter',[addresses.aqua,addresses.weth,account]);
  await deploy('market','FeeStripMarket',[addresses.feeStrip,addresses.swapRouter]);
  stage='postdeployment immutable bindings';
  for (const [key,name,fn,expected] of [
    ['verifier','HistoricalFeeVerifier','poolManager',addresses.poolManager],['verifier','HistoricalFeeVerifier','checkpoints',addresses.checkpoints],['verifier','HistoricalFeeVerifier','managerCodeHash',pins.poolManager],
    ['feeStrip','FeeStrip','positionManager',addresses.positionManager],['feeStrip','FeeStrip','poolManager',addresses.poolManager],['feeStrip','FeeStrip','usdc',addresses.usdc],['feeStrip','FeeStrip','verifier',addresses.verifier],
    ['feeStrip','FeeStrip','positionManagerCodehash',pins.positionManager],['feeStrip','FeeStrip','poolManagerCodehash',pins.poolManager],
    ['swapRouter','FeeStripRouter','AQUA',addresses.aqua],['swapRouter','FeeStripRouter','WETH',addresses.weth],['swapRouter','FeeStripRouter','owner',account],
    ['market','FeeStripMarket','feeStrip',addresses.feeStrip],['market','FeeStripMarket','router',addresses.swapRouter],
  ]) same(await read(addresses[key],name,fn),expected);
  assert.equal(await read(addresses.verifier,'HistoricalFeeVerifier','chainId'),11155111n);
  const position = await preparePosition({client,account,send,read,addresses});
  journal.position=position;save();
  const manifest={mode:'testnet',chainId:11155111,rpcUrl:'https://ethereum-sepolia-rpc.publicnode.com',...Object.fromEntries(Object.entries(addresses).filter(([k])=>!['permit2','weth'].includes(k))),other:addresses.weth,nftIds:[String(position.nftId)],deploymentBlock:journal.transactions[0].receipt.blockNumber,blockTimeSeconds:12};
  writeFileSync(`${directory}/deployment.json`,json(manifest));
  const evidence={scope:mode==='rehearse'?'Isolated Sepolia fork rehearsal; no public transactions':'Public Sepolia deployment and owned liquidity NFT; no activated sale, settlement, live Graph or human-wallet acceptance claimed',implementationHash,chainId:11155111,account,pins,contracts:journal.contracts,position,transactions:journal.transactions.map(({raw,call,...t})=>({...t,to:call.to,value:call.value,calldataHash:keccak256(call.data)}))};
  writeFileSync(`${directory}/evidence.json`,json(evidence));
  console.log(`${mode} complete. Sanitized manifest and evidence saved in ${directory}.`);
} catch (error) {
  // Viem nested errors can contain private URLs. Never print error objects/causes.
  console.error(`Public setup stopped during: ${stage}. ${error instanceof assert.AssertionError ? error.message.split('\n')[0].replace(/https?:\/\/\S+/g,'[redacted]') : 'Inspect the journal and use a credential-free diagnostic RPC.'}`);
  process.exitCode=1;
} finally {
  if(lock!==undefined) {closeSync(lock);unlinkSync(`${directory}/runner.lock`);}
}
