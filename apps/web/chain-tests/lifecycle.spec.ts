import { test, expect, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createPublicClient,
  http,
  erc20Abi,
  parseAbi,
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
const receipts: { action: string; hash: Hex }[] = [];
const rpcURL = process.env.LOCAL_RPC_URL ?? "http://127.0.0.1:8545";
if (!["localhost", "127.0.0.1", "[::1]"].includes(new URL(rpcURL).hostname))
  throw new Error("Chain browser suite requires a loopback RPC.");
const client = createPublicClient({ transport: http(rpcURL) });
function run(script: string, ...args: string[]) {
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
});

test("real browser funding, exact NFT sale, Aqua maker publication, trade, late capture, NFT return and independent payouts", async ({
  page,
}, testInfo) => {
  const { seller, buyer, holder } = deployment.actors!;
  await login(page, "buyer");
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
  await page.getByLabel("Upfront USDC for 8,000 claims").fill("101");
  await page
    .getByRole("button", { name: "Review funding", exact: true })
    .click();
  await confirm(page, "Fund offer", "fundOffer");
  expect(await balance(deployment.usdc, buyer)).toBe(
    buyerCashBefore - 101000000n,
  );
  await login(page, "seller");
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
  await login(page, "holder", "market/1");
  await page
    .getByRole("button", { name: "Submit historical proof", exact: true })
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
  await page.getByRole("link", { name: "Your positions", exact: true }).click();
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
    unconsumedFundedOffers: fundedAfterCancellation.toString(),
    receipts,
  };
  const path = resolve(repo, "docs/evidence/browser-chain-lifecycle.json");
  mkdirSync(resolve(repo, "docs/evidence"), { recursive: true });
  writeFileSync(path, JSON.stringify(evidence, null, 2) + "\n");
  await testInfo.attach("chain-evidence", {
    body: JSON.stringify(evidence, null, 2),
    contentType: "application/json",
  });
});
