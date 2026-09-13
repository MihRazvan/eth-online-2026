import {test,expect,type Page} from '@playwright/test';
import {execFileSync} from 'node:child_process';
import {createServer,type Server} from 'node:http';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createPublicClient,http,erc20Abi,getAddress,parseAbi,type Address} from 'viem';
import {ListingStore} from '../../../packages/listings/src/store.mjs';
import {createListingService} from '../../../packages/listings/src/service.mjs';
import {createListingsHandler} from '../../../packages/listings/src/http.mjs';
import {ORIGINAL_Q} from '../../../packages/listings/src/shared.mjs';
import {feeStripAbi,positionManagerAbi} from '../src/generated/contracts';
import type {Deployment} from '../src/chainAdapter';
import type {SellerListingTerms} from '../src/listingTypes';

// Destructive only to an explicitly dedicated loopback Anvil chain31337.
// No fixture wallet state, synthetic HTTP response or public transaction is used.
const repo=process.env.FEESTRIP_REPO_ROOT??fileURLToPath(new URL('../../../',import.meta.url));
const rpcURL=process.env.LOCAL_RPC_URL??'http://127.0.0.1:8545';
const rpc=new URL(rpcURL);
if(!['localhost','127.0.0.1','[::1]'].includes(rpc.hostname)||rpc.username||rpc.password)throw new Error('Listing browser tests require a dedicated loopback RPC.');
const port=Number(process.env.FEESTRIP_TEST_LISTINGS_PORT??8791);
if(!Number.isInteger(port)||port<1024||port>65535)throw new Error('Invalid listing test port.');
const client=createPublicClient({transport:http(rpcURL,{timeout:8000,retryCount:0})});
let deployment:Deployment,directory:string,store:ListingStore,server:Server;
const balance=(token:Address,account:Address)=>client.readContract({address:token,abi:erc20Abi,functionName:'balanceOf',args:[account]});
const owner=()=>client.readContract({address:deployment.positionManager,abi:positionManagerAbi,functionName:'ownerOf',args:[1n]});
const nextSeries=()=>client.readContract({address:deployment.feeStrip,abi:feeStripAbi,functionName:'nextSeriesId'});
async function startDirectory(){
  const scope={chainId:deployment.chainId,feeStrip:deployment.feeStrip,positionManager:deployment.positionManager,usdc:deployment.usdc};
  store=new ListingStore(resolve(directory,'listings.sqlite'),scope);
  server=createServer(createListingsHandler(createListingService({client,scope,store})));
  await new Promise<void>((done,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',done);});
}
async function stopDirectory(){
  if(server?.listening){server.closeAllConnections();await new Promise<void>(done=>server.close(()=>done()));}
  store?.close();
}
async function login(page:Page,actor:'seller'|'buyer',route='market'){
  await page.goto(`/?wallet=${actor}#${route}`);
  await expect(page.getByText('Onchain local',{exact:true})).toBeVisible();
  const connect=page.getByRole('button',{name:'Connect wallet',exact:true}).first();
  if(await connect.isVisible())await connect.click();
  await expect(page.locator('.wallet-button')).toContainText(getAddress(deployment.actors![actor]).slice(0,6));
}
async function confirm(page:Page,label:string){
  await page.getByRole('dialog').getByRole('button',{name:label,exact:true}).click();
  await expect(page.getByRole('dialog')).not.toBeVisible({timeout:30000});
}
async function publication(page:Page,terms:SellerListingTerms){
  return page.evaluate(async terms=>{
    // Vite serves the production adapter; local mode signs through actual Anvil accounts.
    // @ts-expect-error Absolute module URL is resolved by the Vite browser server.
    const {ChainAdapter}=await import('/src/chainAdapter.ts');
    const adapter=await ChainAdapter.fromDeployment('/deployment.json',{enableTestWallet:true,testActor:'seller'});
    await adapter.connect();return adapter.execute({type:'publishListing',terms,reviewedAccount:terms.seller});
  },terms);
}

test.beforeAll(async()=>{
  test.setTimeout(180000);
  if(await client.getChainId()!==31337)throw new Error('Listing browser test requires dedicated chain31337.');
  try {
    execFileSync(process.execPath,[resolve(repo,'scripts/chain/reset-and-seed.mjs'),'--reset'],{cwd:repo,timeout:120000,stdio:'pipe',env:{...process.env,LOCAL_RPC_URL:rpcURL}});
  }catch{throw new Error('Dedicated local reset/seed failed; compile contracts first and inspect local setup independently. No public RPC is supported.');}
  deployment=JSON.parse(readFileSync(resolve(repo,'apps/web/public/deployment.json'),'utf8'));
  expect(deployment.mode).toBe('local');expect(deployment.chainId).toBe(31337);
  directory=mkdtempSync(resolve(tmpdir(),'usufruct-listing-browser-'));
  await startDirectory();
});
test.afterAll(async()=>{await stopDirectory();if(directory)rmSync(directory,{recursive:true,force:true});});

test('seller signed publication survives restart, buyer funds exact terms, cancellation preserves funded offer, seller accepts real NFT sale',async({browser},testInfo)=>{
  const sellerContext=await browser.newContext(),buyerContext=await browser.newContext();
  const sellerPage=await sellerContext.newPage(),buyerPage=await buyerContext.newPage();
  const {seller,buyer}=deployment.actors!;
  try {
    await login(sellerPage,'seller');
    const block=await client.getBlock();
    const commitment=await client.readContract({address:deployment.feeStrip,abi:feeStripAbi,functionName:'positionCommitment',args:[1n]});
    const terms:SellerListingTerms={schemaVersion:1,chainId:31337,feeStrip:deployment.feeStrip,positionManager:deployment.positionManager,usdc:deployment.usdc,seller,tokenId:'1',positionCommitment:commitment,originalSupply:ORIGINAL_Q.toString(),buyerQuantity:(ORIGINAL_Q*3n/5n).toString(),proceedsMicros:'101000000',endBlock:(block.number+600n).toString(),deadlineTimestamp:(block.timestamp+3600n).toString(),nonce:`0x${'41'.repeat(32)}`};
    const sellerBefore=await balance(deployment.usdc,seller),buyerBefore=await balance(deployment.usdc,buyer),escrowBefore=await balance(deployment.usdc,deployment.feeStrip);
    const nonceBefore=await client.getTransactionCount({address:seller});
    const result=await publication(sellerPage,terms);
    expect(result.listingId).toMatch(/^0x[0-9a-f]{64}$/);expect(result.transactionHash).toBeUndefined();
    expect(await client.getTransactionCount({address:seller})).toBe(nonceBefore);
    expect((await owner()).toLowerCase()).toBe(seller.toLowerCase());
    expect(await nextSeries()).toBe(1n);
    expect(await balance(deployment.usdc,seller)).toBe(sellerBefore);
    expect(await balance(deployment.usdc,deployment.feeStrip)).toBe(escrowBefore);

    await stopDirectory();await startDirectory();
    await login(buyerPage,'buyer');
    const row=buyerPage.locator(`a[href="#listing/${result.listingId}"]`).first();
    await expect(row).toContainText('60.00%');await row.click();
    await expect(buyerPage.getByRole('region',{name:'Seller listing details'})).toContainText('$101.000000 USDC');
    await buyerPage.reload();
    await expect(buyerPage.getByText('Onchain local',{exact:true})).toBeVisible();
    const buyerConnect=buyerPage.getByRole('button',{name:'Connect wallet',exact:true}).first();
    if(await buyerConnect.isVisible())await buyerConnect.click();
    await expect(buyerPage.getByRole('button',{name:'Review exact funding'})).toBeEnabled();
    await buyerPage.getByRole('button',{name:'Review exact funding'}).click();
    await expect(buyerPage.getByRole('dialog')).toContainText('refundable offer');
    await expect(buyerPage.getByRole('dialog')).toContainText('60.00%');
    await confirm(buyerPage,'Fund offer');
    expect(await balance(deployment.usdc,buyer)).toBe(buyerBefore-101000000n);
    expect(await balance(deployment.usdc,seller)).toBe(sellerBefore);
    expect(await balance(deployment.usdc,deployment.feeStrip)).toBe(escrowBefore+101000000n);
    expect((await owner()).toLowerCase()).toBe(seller.toLowerCase());expect(await nextSeries()).toBe(1n);
    const offer=await client.readContract({address:deployment.feeStrip,abi:feeStripAbi,functionName:'offers',args:[2n]});
    expect(offer[0].toLowerCase()).toBe(buyer.toLowerCase());expect(offer[1].toLowerCase()).toBe(seller.toLowerCase());
    expect(offer[3]).toBe(ORIGINAL_Q);expect(offer[4]).toBe(ORIGINAL_Q*3n/5n);expect(offer[5]).toBe(101000000n);
    expect(offer[6]).toBe(BigInt(terms.endBlock));expect(offer[7]).toBe(BigInt(terms.deadlineTimestamp));expect(offer[8].toLowerCase()).toBe(commitment.toLowerCase());expect(offer[9]).toBe(false);

    // Withdraw the advertisement after funding. This cannot cancel a buyer's offer.
    await login(sellerPage,'seller',`listing/${result.listingId}`);
    const cancelNonce=await client.getTransactionCount({address:seller});
    await sellerPage.getByRole('button',{name:'Withdraw listing',exact:true}).click();
    await confirm(sellerPage,'Sign listing withdrawal');
    await expect(sellerPage.getByRole('region',{name:'Seller listing details'})).toContainText('cancelled');
    expect(await client.getTransactionCount({address:seller})).toBe(cancelNonce);
    expect((await client.readContract({address:deployment.feeStrip,abi:feeStripAbi,functionName:'offers',args:[2n]}))[9]).toBe(false);
    expect(await balance(deployment.usdc,deployment.feeStrip)).toBe(escrowBefore+101000000n);
    await stopDirectory();await startDirectory();
    await buyerPage.reload();
    await expect(buyerPage.getByRole('region',{name:'Seller listing details'})).toContainText('cancelled');
    await expect(buyerPage.getByRole('button',{name:'Review exact funding'})).toBeDisabled();

    // A separate signed listing for the same NFT remains discoverable before
    // activation, then must become unavailable when custody actually changes.
    const second=await publication(sellerPage,{...terms,nonce:`0x${'42'.repeat(32)}`});
    expect(second.listingId).not.toBe(result.listingId);
    await login(sellerPage,'seller','pin/1?offer=2');
    await sellerPage.getByRole('button',{name:'1. Approve this NFT',exact:true}).click();
    await confirm(sellerPage,'Approve NFT transfer');
    expect((await owner()).toLowerCase()).toBe(seller.toLowerCase());
    await sellerPage.getByRole('button',{name:'2. Review funded sale',exact:true}).click();
    await expect(sellerPage.getByRole('dialog')).toContainText('6,000 / 10,000');
    await expect(sellerPage.getByRole('dialog')).toContainText('$101.000000 USDC');
    await confirm(sellerPage,'Accept exact funded terms');
    const series=await client.readContract({address:deployment.feeStrip,abi:feeStripAbi,functionName:'series',args:[1n]});
    expect(series.tokenId).toBe(1n);expect(series.quantity).toBe(ORIGINAL_Q);
    expect(series.endBlock).toBe(BigInt(terms.endBlock));expect(series.residualOwner.toLowerCase()).toBe(seller.toLowerCase());
    expect((await owner()).toLowerCase()).toBe(deployment.feeStrip.toLowerCase());
    expect(await balance(series.claim,buyer)).toBe(ORIGINAL_Q*3n/5n);expect(await balance(series.claim,seller)).toBe(ORIGINAL_Q*2n/5n);
    expect(await client.readContract({address:series.claim,abi:erc20Abi,functionName:'totalSupply'})).toBe(ORIGINAL_Q);
    expect(await balance(deployment.usdc,seller)).toBeGreaterThanOrEqual(sellerBefore+101000000n); // Includes native pre-activation fees owed only to seller.
    expect(await balance(deployment.usdc,deployment.feeStrip)).toBe(escrowBefore);
    expect((await client.readContract({address:deployment.feeStrip,abi:feeStripAbi,functionName:'offers',args:[2n]}))[9]).toBe(true);
    expect(await client.readContract({address:deployment.feeStrip,abi:parseAbi(['function fundedOfferUSDC() view returns(uint256)']),functionName:'fundedOfferUSDC'})).toBe(escrowBefore);
    await buyerPage.goto(`/?wallet=buyer#listing/${second.listingId}`);
    await expect(buyerPage.getByRole('region',{name:'Seller listing details'})).toContainText('OWNER_CHANGED');
    await expect(buyerPage.getByRole('button',{name:'Review exact funding'})).toBeDisabled();
    await testInfo.attach('listing-local-evidence',{body:JSON.stringify({scope:'Actual isolated local Anvil contracts, production ChainAdapter, durable SQLite listing service and separate browser wallets; no public acceptance claimed.',listingId:result.listingId,secondListingId:second.listingId,offerId:'2',seriesId:'1',originalQ:ORIGINAL_Q.toString(),buyerClaims:(ORIGINAL_Q*3n/5n).toString(),sellerClaims:(ORIGINAL_Q*2n/5n).toString(),paidProceedsMicros:'101000000'},null,2),contentType:'application/json'});
  }finally{await sellerContext.close();await buyerContext.close();}
});
