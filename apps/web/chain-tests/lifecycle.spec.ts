import { test, expect, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync, unlinkSync } from "node:fs";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { RetentionStore, digest } from "../../../packages/settlement/src/store.mjs";
import { RetentionWorker } from "../../../packages/settlement/src/worker.mjs";
import { localRetentionConfig } from "../../../packages/settlement/src/local-config.mjs";
import { recoveryServer } from "../../../packages/settlement/src/server.mjs";
import { fileURLToPath } from "node:url";
import {
  createPublicClient,
  createWalletClient,
  encodeAbiParameters,
  keccak256,
  http,
  erc20Abi,
  parseAbi,
  parseAbiParameters,
  getAddress,
  type Address,
  type Hex,
} from "viem";
import { feeStripAbi, positionManagerAbi } from "../src/generated/contracts";
import type { Deployment } from "../src/chainAdapter";

// Separate, destructive-to-development-state suite. Requires a dedicated loopback
// Anvil node. It never runs with the hermetic fixture suite or against public RPC.
const repo =
  process.env.FEESTRIP_REPO_ROOT ??
  fileURLToPath(new URL("../../../", import.meta.url));
let deployment: Deployment;
let recoveryDirectory: string, recoveryStore: RetentionStore, recoveryWorker: RetentionWorker, recoveryAPI: ReturnType<typeof recoveryServer>;
const receipts: { action: string; hash: Hex }[] = [];
const cacheOnly=process.env.USE_VERIFIED_GROWTH_CACHE === "true";
const recoveryPort=Number(process.env.FEESTRIP_TEST_RECOVERY_PORT??8788);
const rpcURL = process.env.LOCAL_RPC_URL ?? "http://127.0.0.1:8545";
if (!["localhost", "127.0.0.1", "[::1]"].includes(new URL(rpcURL).hostname))
  throw new Error("Chain browser suite requires a loopback RPC.");
const client = createPublicClient({ transport: http(rpcURL) });
function run(script: string, ...args: string[]) {
  const started = Date.now();
  try {
    return execFileSync(
      process.execPath,
      [resolve(repo, "scripts/chain", script), ...args],
      {
        cwd: repo,
        encoding: "utf8",
        timeout: 120000,
        env: { ...process.env, LOCAL_RPC_URL: rpcURL },
      },
    );
  } catch (error) {
    const failure = error as { code?: string; status?: number | null; signal?: string | null; stdout?: string | Buffer; stderr?: string | Buffer };
    const tail = (value: string | Buffer | undefined) => {
      const output = String(value ?? "")
        .replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, "")
        .replace(/https?:\/\/[^\s"'<>]+/gi, "[URL omitted]")
        .replace(/^.*\b(?:PRIVATE_KEY|MNEMONIC|PASSWORD|DEPLOY_KEY|SECRET|API_KEY|AUTH_TOKEN|JWT)\b.*$/gim, "[credential-labelled line omitted]");
      return output ? (output.length > 6000 ? "[earlier output omitted]\n" : "") + output.slice(-6000) : "(no output captured; nested commands may buffer their output)";
    };
    // Local development scripts only. Do not attach the raw child-process error,
    // environment or arguments: those bypass the bounded, redacted diagnostics.
    throw new Error(`Local-chain script ${script} failed after ${Date.now() - started}ms (limit 120000ms; code ${failure.code ?? "none"}; exit ${failure.status ?? "none"}; signal ${failure.signal ?? "none"}).\nstdout tail:\n${tail(failure.stdout)}\nstderr tail:\n${tail(failure.stderr)}`);
  }
}
async function balance(token: Address, who: Address) {
  return client.readContract({
    address: token,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [who],
  });
}
async function state() {
  return client.readContract({
    address: deployment.feeStrip,
    abi: feeStripAbi,
    functionName: "series",
    args: [1n],
  });
}
async function login(
  page: Page,
  actor: "seller" | "buyer" | "holder",
  route = "positions",
) {
  await page.goto(`/?wallet=${actor}#${route}`);
  await expect(page.getByText("Onchain local", { exact: true })).toBeVisible();
  // Navigating to the same URL/hash can preserve the already connected app.
  // Reuse that connection only after asserting it is the requested actor.
  const connect = page
    .getByRole("button", { name: "Connect wallet", exact: true })
    .first();
  if (await connect.isVisible()) await connect.click();
  await expect(page.locator(".wallet-button")).toContainText(
    getAddress(deployment.actors![actor]).slice(0, 6),
  );
}
async function confirm(page: Page, button: string, action: string) {
  await page
    .getByRole("dialog")
    .getByRole("button", { name: button, exact: true })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible({ timeout: 30000 });
  const status = await page.getByRole("status").innerText();
  expect(status).toContain("Confirmed on local chain");
  const hash = status.match(/0x[a-fA-F0-9]{64}/)?.[0] as Hex;
  expect(hash).toBeTruthy();
  const receipt = await client.getTransactionReceipt({ hash });
  expect(receipt.status).toBe("success");
  receipts.push({ action, hash });
}

test.beforeAll(async () => {
  if ((await client.getChainId()) !== 31337)
    throw new Error(
      "Chain browser suite requires dedicated local chain 31337.",
    );
  run("reset-and-seed.mjs", "--reset");
  deployment = JSON.parse(
    readFileSync(resolve(repo, "apps/web/public/deployment.json"), "utf8"),
  );
  expect(deployment.mode).toBe("local");
  expect(deployment.chainId).toBe(31337);
  recoveryDirectory=mkdtempSync(resolve(tmpdir(), 'feestrip-browser-recovery-'));
  recoveryStore=new RetentionStore(resolve(recoveryDirectory,'keeper.sqlite'),{artifactRoots:[resolve(recoveryDirectory,'a'),resolve(recoveryDirectory,'b')]});
  recoveryWorker=new RetentionWorker(await localRetentionConfig(deployment,client),recoveryStore);
  recoveryAPI=recoveryServer({store:recoveryStore,scope:recoveryWorker.scope});
  await new Promise<void>((resolve,reject)=>{recoveryAPI.once('error',reject);recoveryAPI.listen(recoveryPort,'127.0.0.1',resolve);});
});
test.afterAll(async()=>{
  if(recoveryAPI?.listening)await new Promise<void>(resolve=>recoveryAPI.close(resolve));
  recoveryStore?.close();
  if(recoveryDirectory)rmSync(recoveryDirectory,{recursive:true,force:true});
});

test("real browser funding, exact NFT sale, Aqua maker publication, trade, late capture, NFT return and independent payouts", async ({
  page,
}, testInfo) => {
  const { seller, buyer, holder } = deployment.actors!;
  await login(page, "buyer", "pin");
  await expect(page.locator(".position-entry")).toContainText(
    "Offer target · other wallet",
  );
  await expect(
    page.getByRole("button", { name: "1. Approve this NFT", exact: true }),
  ).toBeDisabled();
  const buyerCashBefore = await balance(deployment.usdc, buyer);
  await page
    .getByRole("button", { name: "Fund an offer", exact: true })
    .click();
  await page.getByLabel("Upfront USDC").fill("101");
  await page
    .getByRole("button", { name: "Review funding", exact: true })
    .click();
  await confirm(page, "Fund offer", "fundOffer");
  expect(await balance(deployment.usdc, buyer)).toBe(
    buyerCashBefore - 101000000n,
  );
  await login(page, "seller", "pin/1?offer=2");
  await expect(page.locator(".funded-offer-row")).toHaveCount(0);
  await page
    .getByRole("button", { name: "1. Approve this NFT", exact: true })
    .click();
  await confirm(page, "Approve NFT transfer", "approveNFT");
  expect(
    (
      await client.readContract({
        address: deployment.positionManager,
        abi: positionManagerAbi,
        functionName: "ownerOf",
        args: [1n],
      })
    ).toLowerCase(),
  ).toBe(seller.toLowerCase());
  await page.getByRole("button", { name: "2. Review funded sale" }).click();
  await expect(page.getByRole("dialog")).toContainText("$101.000000 USDC");
  await expect(page.getByRole("dialog")).toContainText("8,000 / 10,000");
  await confirm(page, "Accept exact funded terms", "acceptOffer");
  const activated = await state();
  expect((await recoveryWorker.tick()).status).toBe("observed");
  expect(recoveryStore.publicStatus(recoveryWorker.scope,"1").state).toBe("scheduled");
  expect(activated.tokenId).toBe(1n);
  expect(activated.quantity).toBe(10000n * 10n ** 18n);
  expect(
    (
      await client.readContract({
        address: deployment.positionManager,
        abi: positionManagerAbi,
        functionName: "ownerOf",
        args: [1n],
      })
    ).toLowerCase(),
  ).toBe(deployment.feeStrip.toLowerCase());
  expect(await balance(activated.claim, buyer)).toBe(8000n * 10n ** 18n);
  expect(await balance(activated.claim, seller)).toBe(2000n * 10n ** 18n);
  await page.screenshot({
    path: testInfo.outputPath("sale-confirmed.png"),
    fullPage: true,
  });
  await login(page, "buyer");
  await page
    .getByRole("button", { name: "Publish sell quote", exact: true })
    .click();
  await page.getByLabel("Maker claim quantity").fill("2000");
  await page.getByLabel("Maker total USDC ask").fill("20");
  await page
    .getByRole("button", { name: "Review maker quote", exact: true })
    .click();
  await confirm(page, "Approve and publish quote", "shipAquaStrategy");
  await login(page, "holder", "market/1");
  await expect(page.locator(".quote-info")).toContainText(getAddress(buyer));
  await expect(
    page.getByText(
      "Historical activity unavailable · Graph provider not connected",
      { exact: true },
    ),
  ).toBeVisible();
  expect(await page.locator(".history-chart").count()).toBe(0);
  const takerBefore = await balance(deployment.usdc, holder),
    makerBefore = await balance(deployment.usdc, buyer);
  await page.getByLabel("Claims to buy").fill("1000");
  await page
    .getByRole("button", { name: "Review purchase", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText("$10.000000 USDC");
  await confirm(page, "Confirm claim purchase", "swapClaims");
  expect(await balance(deployment.usdc, holder)).toBe(takerBefore - 10000000n);
  expect(await balance(deployment.usdc, buyer)).toBe(makerBefore + 10000000n);
  expect(await balance(activated.claim, holder)).toBe(1000n * 10n ** 18n);
  await page.screenshot({
    path: testInfo.outputPath("aqua-trade-confirmed.png"),
    fullPage: true,
  });
  run("mature.mjs", "1");
  expect((await recoveryWorker.tick()).status).toBe("observed");
  const retained=recoveryStore.publicStatus(recoveryWorker.scope,"1");
  expect(retained.state).toBe("retained");expect(retained.copies).toBe(2);
  // The browser must use the real recovery service; the legacy static fallback is absent.
  unlinkSync(resolve(repo,"apps/web/public/witness-1.json"));
  const recoveredResponse=await fetch(`http://127.0.0.1:${recoveryPort}/api/recovery/artifact?seriesId=1&digest=${retained.artifactDigest}`);
  expect(recoveredResponse.ok).toBe(true);expect(digest(await recoveredResponse.text())).toBe(retained.artifactDigest);
  await page
    .getByRole("button", { name: "Refresh chain state", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Capture actual fees", exact: true })
    .click();
  await confirm(page, "Confirm transaction", "capture");
  let s = await state();
  expect(s.captured).toBe(true);
  expect(s.allocated).toBe(false);
  expect(s.capturedUSDC).toBeGreaterThan(0n);
  // The partially funded quote must disappear when capture changes marketState.
  await expect(
    page.getByText("No executable quote. Resale liquidity is not guaranteed.", {
      exact: true,
    }),
  ).toBeVisible();
  await login(page, "seller");
  await page
    .getByRole("button", { name: "Recover NFT #1", exact: true })
    .click();
  await confirm(page, "Confirm transaction", "returnOriginalNFT");
  s = await state();
  expect(s.nftReturned).toBe(true);
  expect(s.allocated).toBe(false);
  expect(s.residualOwner.toLowerCase()).toBe(seller.toLowerCase());
  expect(
    (
      await client.readContract({
        address: deployment.positionManager,
        abi: positionManagerAbi,
        functionName: "ownerOf",
        args: [1n],
      })
    ).toLowerCase(),
  ).toBe(seller.toLowerCase());
  await page.screenshot({
    path: testInfo.outputPath("nft-returned-proof-pending.png"),
    fullPage: true,
  });
  expect((await recoveryWorker.tick()).status).toBe("observed");
  await login(page, "holder", "market/1");
  const recoveryPanel=page.getByRole("region",{name:"Historical proof recovery"});
  await expect(recoveryPanel).toBeVisible();
  const downloadPromise=page.waitForEvent("download");
  await recoveryPanel.getByRole("button",{name:"Download proof JSON",exact:true}).click();
  const proofDownload=await downloadPromise,downloadPath=testInfo.outputPath("retained-proof.json");
  await proofDownload.saveAs(downloadPath);expect(digest(readFileSync(downloadPath))).toBe(retained.artifactDigest);
  await recoveryPanel.screenshot({path:testInfo.outputPath("actual-recovery-panel.png")});
  if(cacheOnly){
    const proof=JSON.parse(readFileSync(downloadPath,'utf8'));
    const poolId=keccak256(encodeAbiParameters([{type:'tuple',components:[{name:'currency0',type:'address'},{name:'currency1',type:'address'},{name:'fee',type:'uint24'},{name:'tickSpacing',type:'int24'},{name:'hooks',type:'address'}]}],[s.key]));
    const hash=await createWalletClient({account:holder,transport:http(rpcURL)}).writeContract({chain:null,address:deployment.verifier,abi:parseAbi(['function cacheGrowth(uint256,bytes32,int24,int24,bool,bytes) returns(uint256)']),functionName:'cacheGrowth',args:[s.endBlock,poolId,s.tickLower,s.tickUpper,s.key.currency0.toLowerCase()===deployment.usdc.toLowerCase(),proof.witness]});
    expect((await client.waitForTransactionReceipt({hash})).status).toBe('success');receipts.push({action:'cacheAuthenticatedGrowth',hash});
    // Simulate loss of all retained artifact bytes after the exact onchain cache is verified.
    recoveryStore.db.exec('DELETE FROM job_artifacts; DELETE FROM artifacts;');
    for(const root of recoveryStore.roots)unlinkSync(resolve(root,`${retained.artifactDigest}.json`));
    expect((await recoveryWorker.tick()).status).toBe('observed');
    const cached=recoveryStore.publicStatus(recoveryWorker.scope,'1');expect(cached.state).toBe('cached-onchain');expect(cached.artifactDigest).toBeNull();
    await recoveryPanel.getByRole('button',{name:'Refresh recovery status',exact:true}).click();
    await expect(recoveryPanel).toContainText('Cached onchain · observed');
    await expect(recoveryPanel.getByRole('button',{name:'Download proof JSON',exact:true})).toBeDisabled();
  }
  await page
    .getByRole("button", { name: "Allocate fee reserve", exact: true })
    .click();
  await confirm(page, "Confirm transaction", "settleRetainedWitness");
  s = await state();
  expect(s.allocated).toBe(true);
  expect(s.soldUSDC).toBeLessThan(s.capturedUSDC);
  let paid = 0n;
  for (const [actor, address, q] of [
    ["holder", holder, 1000n],
    ["buyer", buyer, 7000n],
    ["seller", seller, 2000n],
  ] as const) {
    await login(page, actor, "market/1");
    const before = await balance(deployment.usdc, address);
    await page
      .getByRole("button", {
        name: `Redeem ${q.toLocaleString("en-US")} claims`,
        exact: true,
      })
      .click();
    await confirm(page, "Confirm transaction", `redeem:${actor}`);
    const payout = (await balance(deployment.usdc, address)) - before;
    expect(payout).toBe((s.soldUSDC * q) / 10000n);
    paid += payout;
    expect(await balance(activated.claim, address)).toBe(0n);
  }
  await page.getByRole("link", { name: "My cabinet", exact: true }).click();
  const residualBefore = await balance(deployment.usdc, seller);
  await page
    .getByRole("button", { name: "Withdraw residual fees", exact: true })
    .click();
  await confirm(page, "Confirm transaction", "withdrawResidual");
  expect((await balance(deployment.usdc, seller)) - residualBefore).toBe(
    s.capturedUSDC - s.soldUSDC,
  );
  const reserve = await client.readContract({
    address: deployment.feeStrip,
    abi: feeStripAbi,
    functionName: "reservedUSDC",
  });
  const funded = await client.readContract({
    address: deployment.feeStrip,
    abi: feeStripAbi,
    functionName: "fundedOfferUSDC",
  });
  expect(reserve).toBe(s.soldUSDC - paid);
  expect(await balance(deployment.usdc, deployment.feeStrip)).toBe(
    reserve + funded,
  );
  // The original seed offer was never accepted. Expiry does not refund it;
  // buyer cancellation must recover exactly its capital without touching dust.
  expect(funded).toBe(100000000n);
  await login(page, "buyer");
  await expect(page.locator(".funded-offer-row")).toHaveCount(1);
  await expect(page.locator(".funded-offer-row")).toContainText(
    "Expired · funds recoverable",
  );
  const beforeCancellation = await balance(deployment.usdc, buyer);
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole("button", { name: "Review cancellation", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText("$100.000000 USDC");
  await expect(page.getByRole("dialog")).toContainText(
    "If the seller accepts first, cancellation reverts",
  );
  await page.screenshot({
    path: testInfo.outputPath("offer-cancellation-mobile.png"),
    fullPage: true,
  });
  await confirm(page, "Cancel offer and recover USDC", "cancelUnacceptedOffer");
  expect(await balance(deployment.usdc, buyer)).toBe(
    beforeCancellation + funded,
  );
  await expect(page.locator(".funded-offer-row")).toHaveCount(0);
  const fundedAfterCancellation = await client.readContract({
    address: deployment.feeStrip,
    abi: feeStripAbi,
    functionName: "fundedOfferUSDC",
  });
  expect(fundedAfterCancellation).toBe(0n);
  expect(
    await client.readContract({
      address: deployment.feeStrip,
      abi: feeStripAbi,
      functionName: "reservedUSDC",
    }),
  ).toBe(reserve);
  expect(await balance(deployment.usdc, deployment.feeStrip)).toBe(reserve);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("settled-mobile.png"),
    fullPage: true,
  });
  const evidence = {
    scope:
      "Real local browser transactions with unlocked Anvil actors; no production signing UI or public testnet acceptance.",
    chainId: 31337,
    seriesId: "1",
    tokenId: "1",
    endpoint: s.endBlock.toString(),
    originalSupply: s.quantity.toString(),
    capturedUSDC: s.capturedUSDC.toString(),
    soldUSDC: s.soldUSDC.toString(),
    claimPayoutTotal: paid.toString(),
    reservedDust: reserve.toString(),
    cancelledOfferRefund: funded.toString(),
    recovery:{artifactDigest:retained.artifactDigest,filesystemCopies:cacheOnly?0:2,actualApi:true,staticWitnessRemoved:true,settledFromVerifiedCache:cacheOnly},
    unconsumedFundedOffers: fundedAfterCancellation.toString(),
    receipts,
  };
  const path = resolve(repo, cacheOnly ? "docs/evidence/browser-cache-lifecycle.json" : "docs/evidence/browser-chain-lifecycle.json");
  mkdirSync(resolve(repo, "docs/evidence"), { recursive: true });
  writeFileSync(path, JSON.stringify(evidence, null, 2) + "\n");
  await testInfo.attach("chain-evidence", {
    body: JSON.stringify(evidence, null, 2),
    contentType: "application/json",
  });
});


test("an unlisted canonical NFT connects two wallets through exact small terms, cancellation, reload and counterparty refresh", async ({ page, browser }, testInfo) => {
  const { seller, buyer } = deployment.actors!;
  const wallet = createWalletClient({ account: seller, transport: http(rpcURL) });
  const send = async (address: Address, abi: any, functionName: string, args: any[]) => {
    const hash = await wallet.writeContract({ chain: null, address, abi, functionName, args });
    expect((await client.waitForTransactionReceipt({ hash })).status).toBe("success");
  };
  const [key] = await client.readContract({ address: deployment.positionManager, abi: positionManagerAbi, functionName: "getPoolAndPositionInfo", args: [1n] });
  for (const currency of [key.currency0, key.currency1]) await send(currency, parseAbi(["function mint(address,uint256)"]), "mint", [deployment.positionManager, 1000000000000n]);
  const max = (1n << 128n) - 1n;
  const params = [
    encodeAbiParameters(parseAbiParameters("(address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks),int24,int24,uint256,uint128,uint128,address,bytes"), [key, -120, 120, 1000000000000n, max, max, seller, "0x"]),
    encodeAbiParameters(parseAbiParameters("address,uint256,bool"), [key.currency0, 0n, false]),
    encodeAbiParameters(parseAbiParameters("address,uint256,bool"), [key.currency1, 0n, false]),
    encodeAbiParameters(parseAbiParameters("address,address"), [key.currency0, seller]),
    encodeAbiParameters(parseAbiParameters("address,address"), [key.currency1, seller]),
  ];
  const block = await client.getBlock();
  await send(deployment.positionManager, parseAbi(["function modifyLiquidities(bytes,uint256)"]), "modifyLiquidities", [encodeAbiParameters(parseAbiParameters("bytes,bytes[]"), ["0x020b0b1414", params]), block.timestamp + 3600n]);
  expect(deployment.nftIds).not.toContain("2");
  const newSeriesId = await client.readContract({ address: deployment.feeStrip, abi: feeStripAbi, functionName: "nextSeriesId" });
  const unknownOffer = await client.readContract({ address: deployment.feeStrip, abi: feeStripAbi, functionName: "nextOfferId" });
  // The buyer has never owned NFT2 and there is no offer or manifest entry for it.
  await page.goto("/?wallet=buyer#pin/2");
  await expect(page.locator(".position-entry")).toContainText("NFT #2");
  await expect(page.getByRole("button", { name: "1. Approve this NFT", exact: true })).toBeDisabled();
  await login(page, "buyer", "pin/2");
  const before = await balance(deployment.usdc, buyer);
  await page.getByRole("button", { name: "Fund an offer", exact: true }).click();
  await page.getByLabel("Upfront USDC", { exact: true }).fill("0.25");
  await page.getByLabel("Sold share (%)", { exact: true }).fill("25");
  const endBlock = await page.getByLabel("Exact end block").inputValue();
  await page.getByRole("button", { name: "Review funding", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("$0.250000 USDC");
  await confirm(page, "Fund offer", "fundUnknownPosition");
  expect(await balance(deployment.usdc, buyer)).toBe(before - 250000n);
  const funded = await client.readContract({ address: deployment.feeStrip, abi: feeStripAbi, functionName: "offers", args: [unknownOffer] });
  expect(funded[3]).toBe(10000n * 10n ** 18n); expect(funded[4]).toBe(2500n * 10n ** 18n); expect(funded[6]).toBe(BigInt(endBlock));
  await page.getByText("Saved transaction receipts", { exact: true }).click();
  await expect(page.getByRole("link", { name: `Share offer #${unknownOffer} with the seller` })).toHaveAttribute("href", `#pin/2?offer=${unknownOffer}`);
  await page.reload();
  await login(page, "buyer", "pin/2");
  await page.getByText("Saved transaction receipts", { exact: true }).click();
  await expect(page.getByRole("link", { name: `Share offer #${unknownOffer} with the seller` })).toBeVisible();
  // Another small offer can be cancelled and returns exactly its escrowed payment.
  await page.getByRole("button", { name: "Fund an offer", exact: true }).click();
  await page.getByLabel("Upfront USDC", { exact: true }).fill("0.1");
  await page.getByRole("button", { name: "Review funding", exact: true }).click();
  await confirm(page, "Fund offer", "fundCancellableOffer");
  await page.getByRole("link", { name: "My cabinet", exact: true }).click();
  const cancellable = page.locator(".funded-offer-row").filter({ hasText: `Offer #${unknownOffer + 1n} · NFT #2` });
  await cancellable.getByRole("button", { name: "Review cancellation" }).click();
  await expect(page.getByRole("dialog")).toContainText("$0.100000 USDC");
  await confirm(page, "Cancel offer and recover USDC", "cancelExactOffer");
  expect(await balance(deployment.usdc, buyer)).toBe(before - 250000n);
  await page.goto(`/?wallet=buyer#pin/2?offer=${unknownOffer}`);
  await login(page, "buyer", `pin/2?offer=${unknownOffer}`);
  const sellerContext = await browser.newContext(); const sellerPage = await sellerContext.newPage();
  await login(sellerPage, "seller", `pin/2?offer=${unknownOffer}`);
  await expect(sellerPage.getByLabel("Funded offer to review")).toHaveValue(unknownOffer.toString());
  await sellerPage.getByRole("button", { name: "1. Approve this NFT", exact: true }).click();
  await confirm(sellerPage, "Approve NFT transfer", "approveUnknownPosition");
  await sellerPage.getByRole("button", { name: "2. Review funded sale" }).click();
  await expect(sellerPage.getByRole("dialog")).toContainText("2,500 / 10,000");
  await expect(sellerPage.getByRole("dialog")).toContainText("$0.250000 USDC");
  await confirm(sellerPage, "Accept exact funded terms", "acceptUnknownPosition");
  // No refresh button: the counterparty's visible page updates within its bounded interval.
  await expect(page.getByRole("link", { name: "View its issued fee claims" })).toBeVisible({ timeout: 25000 });
  const current = await client.readContract({ address: deployment.feeStrip, abi: feeStripAbi, functionName: "series", args: [newSeriesId] });
  expect(await balance(current.claim, buyer)).toBe(2500n * 10n ** 18n);
  expect(await balance(current.claim, seller)).toBe(7500n * 10n ** 18n);
  await page.getByRole("link", { name: "My cabinet", exact: true }).click();
  await expect(page.getByRole("button", { name: "Publish sell quote", exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("two-wallet-cabinet-mobile.png"), fullPage: true });
  const evidence = { mode: "local-chain-only", chainId: 31337, tokenId: "2", absentFromManifest: !deployment.nftIds.includes("2"), seller, buyer, fundedOfferId: unknownOffer.toString(), seriesId: newSeriesId.toString(), paymentMicros: "250000", buyerClaims: "2500000000000000000000", originalQ: "10000000000000000000000", endBlock, cancelledRefundMicros: "100000", counterpartyRefreshWithoutButton: true, browserReceiptReload: true, receipts: receipts.filter((row) => ["fundUnknownPosition", "fundCancellableOffer", "cancelExactOffer", "approveUnknownPosition", "acceptUnknownPosition"].includes(row.action)) };
  writeFileSync(testInfo.outputPath("two-wallet-flow.json"), JSON.stringify(evidence, null, 2) + "\n");
  await sellerContext.close();
});

test("a closed browser can authenticate a wallet cancellation and safely clear its pending submission", async ({ page }, testInfo) => {
  const buyer = deployment.actors!.buyer;
  await login(page, "buyer", "positions");
  await page.getByRole("button", { name: "Publish sell quote", exact: true }).click();
  await page.getByLabel("Maker claim quantity").fill("10");
  await page.getByLabel("Maker total USDC ask").fill("0.01");
  await page.getByRole("button", { name: "Review maker quote", exact: true }).click();
  await client.request({ method: "anvil_setAutomine", params: [false] });
  let replacementHash: Hex | undefined;
  try {
    await page.getByRole("dialog").getByRole("button", { name: "Approve and publish quote", exact: true }).click();
    await expect.poll(async () => page.evaluate(() => JSON.parse(localStorage.getItem("usufruct:transaction-receipts:v1") ?? "[]").find((row: any) => row.stage === "pending")?.signedTransaction)).toBeTruthy();
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("usufruct:transaction-receipts:v1") ?? "[]").find((row: any) => row.stage === "pending"));
    const original = await client.getTransaction({ hash: saved.hash });
    const beforeCancellation = await client.request({ method: "evm_snapshot", params: [] });
    const context = page.context();
    await page.close();
    const wallet = createWalletClient({ account: buyer, transport: http(rpcURL) });
    replacementHash = await wallet.sendTransaction({ chain: null, to: buyer, value: 0n, data: "0x", nonce: original.nonce, gas: 21000n, maxFeePerGas: original.maxFeePerGas! * 2n + 1n, maxPriorityFeePerGas: original.maxPriorityFeePerGas! * 2n + 1n });
    await client.request({ method: "anvil_mine", params: ["0x1"] });
    expect((await client.getTransactionReceipt({ hash: replacementHash })).status).toBe("success");
    const fresh = await context.newPage();
    await login(fresh, "buyer", "positions");
    await fresh.getByText("Saved transaction receipts", { exact: true }).click();
    await fresh.getByText("Replaced or cancelled in your wallet?", { exact: true }).click();
    await fresh.getByLabel(/^Replacement transaction hash for /).fill(replacementHash);
    await fresh.getByRole("button", { name: "Check replacement receipt", exact: true }).click();
    await expect(fresh.getByRole("status")).toContainText("original transaction was superseded");
    const records = await fresh.evaluate(() => JSON.parse(localStorage.getItem("usufruct:transaction-receipts:v1") ?? "[]"));
    expect(records.find((row: any) => row.hash === saved.hash)).toMatchObject({ stage: "replaced", replacementHash });
    expect(records.find((row: any) => row.hash === replacementHash)).toMatchObject({ stage: "confirmed", label: "Replacement transaction (different action)" });
    expect(records.find((row: any) => row.hash === replacementHash).action).toBeUndefined();
    expect(records.some((row: any) => row.stage === "pending")).toBe(false);
    await fresh.getByRole("button", { name: "Publish sell quote", exact: true }).click();
    await fresh.getByLabel("Maker claim quantity").fill("10");
    await fresh.getByLabel("Maker total USDC ask").fill("0.01");
    await fresh.getByRole("button", { name: "Review maker quote", exact: true }).click();
    await expect(fresh.getByRole("dialog")).toBeVisible();
    await fresh.screenshot({ path: testInfo.outputPath("verified-wallet-cancellation.png"), fullPage: true });
    // Discard the replacement only AFTER the browser successfully reconciled it.
    // Opening a new review must not bypass canonical checks on the saved guard.
    expect(await client.request({ method: "evm_revert", params: [beforeCancellation] })).toBe(true);
    await expect(client.getTransactionReceipt({ hash: replacementHash })).rejects.toThrow();
    let duplicateSignatures = 0;
    fresh.on("request", (request) => {
      try { const payload = request.postDataJSON(); for (const rpc of Array.isArray(payload) ? payload : [payload]) if (rpc?.method === "eth_sendTransaction" || rpc?.method === "eth_sendRawTransaction") duplicateSignatures++; } catch {}
    });
    await fresh.getByRole("dialog").getByRole("button", { name: "Approve and publish quote", exact: true }).click();
    await expect(fresh.getByRole("alert")).toContainText("No new transaction was requested");
    expect(duplicateSignatures).toBe(0);
    expect(await fresh.evaluate((hash) => JSON.parse(localStorage.getItem("usufruct:transaction-receipts:v1") ?? "[]").find((row: any) => row.hash === hash)?.stage, saved.hash)).toBe("pending");
    expect(await fresh.evaluate((hash) => JSON.parse(localStorage.getItem("usufruct:transaction-receipts:v1") ?? "[]").find((row: any) => row.hash === hash)?.stage, replacementHash)).toBe("pending");
    await fresh.getByRole("button", { name: "Close transaction review" }).click();
    await fresh.screenshot({ path: testInfo.outputPath("later-reorg-blocked-submission.png"), fullPage: true });
    writeFileSync(testInfo.outputPath("replacement-receipt.json"), JSON.stringify({ scope: "local-chain-only", originalHash: saved.hash, replacementHash, originalNonce: original.nonce, sender: buyer, sameSignedNonce: true, originalActionWasNotCompleted: true, browserClosedBeforeReplacement: true, reorgAfterSuccessfulReconciliation: true, duplicateSignatures, originalPendingGuardRestored: true, publicFinalityTestedSeparately: true }, null, 2) + "\n");
  } finally { await client.request({ method: "anvil_setAutomine", params: [true] }); }
});
