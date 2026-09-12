/** Isolated real-chain quote regression. Requires a fresh seed on its own loopback chain and local app. */
import { chromium } from "@playwright/test";
import {
  createPublicClient,
  createWalletClient,
  http,
  defineChain,
  parseAbi,
  getAddress,
} from "viem";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
const repo = resolve(fileURLToPath(new URL("../../../", import.meta.url)));
mkdirSync(resolve(repo, "docs/design/evidence"), { recursive: true });
const d = JSON.parse(
  readFileSync(resolve(repo, "apps/web/public/deployment.json"), "utf8"),
);
const rpcPort = process.env.QUOTE_RPC_PORT ?? "8550";
if (
  new URL(d.rpcUrl).hostname !== "127.0.0.1" ||
  new URL(d.rpcUrl).port !== rpcPort ||
  d.chainId !== 31337
)
  throw new Error(
    `Quote regression requires its dedicated 127.0.0.1:${rpcPort} chain31337`,
  );
const app = process.env.QUOTE_APP_URL ?? "http://127.0.0.1:4186";
if (!["localhost", "127.0.0.1"].includes(new URL(app).hostname))
  throw new Error("Local app only");
const chain = defineChain({
  id: 31337,
  name: "Quote tests",
  nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [d.rpcUrl] } },
});
const client = createPublicClient({ chain, transport: http(d.rpcUrl) });
if ((await client.getChainId()) !== 31337) throw new Error("Wrong chain");
const artifact = (n) =>
  JSON.parse(
    readFileSync(
      resolve(
        repo,
        `contracts/out/${["LocalToken", "LocalActivityRouter"].includes(n) ? "LocalFixtures" : n}.sol/${n}.json`,
      ),
      "utf8",
    ),
  );
const abi = (n) => artifact(n).abi;
const receipts = [];
const check = (condition, reason) => {
  if (!condition) throw new Error(reason);
};
async function send(actor, address, name, fn, args = []) {
  const hash = await createWalletClient({
    account: d.actors[actor],
    chain,
    transport: http(d.rpcUrl),
  }).writeContract({ address, abi: abi(name), functionName: fn, args });
  const r = await client.waitForTransactionReceipt({ hash });
  check(r.status === "success", fn + " reverted");
  receipts.push({ action: fn, hash });
  return r;
}
const read = (address, name, fn, args = []) =>
  client.readContract({ address, abi: abi(name), functionName: fn, args });
const balance = (token, account) =>
  read(token, "LocalToken", "balanceOf", [account]);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
page.setDefaultTimeout(10000);
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
async function login(actor, route = "positions") {
  await page.goto(`${app}/?wallet=${actor}#${route}`);
  await page
    .getByRole("button", { name: "Connect wallet", exact: true })
    .first()
    .click();
  await page.locator(".wallet-button").filter({
    hasText: getAddress(d.actors[actor]).slice(0, 6),
  }).waitFor();
}
async function confirm(label) {
  await page
    .getByRole("dialog")
    .getByRole("button", { name: label, exact: true })
    .click();
  await page.getByRole("dialog").waitFor({ state: "hidden", timeout: 20000 });
  const message = await page.getByRole("status").filter({ hasText: "Confirmed on local chain" }).innerText();
  const hash = message.match(/0x[0-9a-fA-F]{64}/)?.[0];
  check(!!hash, "Missing actual transaction receipt");
  receipts.push({ action: label, hash });
}
async function refresh() {
  await page
    .getByRole("button", { name: "Refresh chain state", exact: true })
    .click();
  await page.waitForTimeout(350);
}
async function publish(actor, amount, cash, side = "ask") {
  await login(actor);
  await page
    .getByRole("button", { name: /Publish (sell|buy) quote/ })
    .first()
    .click();
  await page.getByLabel("Maker direction").selectOption(side);
  await page.getByLabel("Maker claim quantity").fill(amount);
  await page.getByLabel("Maker total USDC ask").fill(cash);
  await page
    .getByRole("button", { name: "Review maker quote", exact: true })
    .click();
  await confirm("Approve and publish quote");
  const logs = await client.getLogs({
    address: d.aqua,
    event: parseAbi([
      "event Shipped(address maker,address app,bytes32 strategyHash,bytes strategy)",
    ])[0],
    fromBlock: 0n,
    toBlock: "latest",
  });
  return logs.at(-1).args.strategyHash;
}
const rows = () => page.locator(".strategy-row");
const row = (hash) => rows().filter({ hasText: hash });
async function dock(hash) {
  await row(hash)
    .getByRole("button", { name: "Review quote cancellation", exact: true })
    .click();
  check(
    (await page.getByRole("dialog").innerText()).includes(hash),
    "Review missing exact hash",
  );
  await confirm("Cancel this maker quote");
}
try {
  await login("seller", "pin");
  await page
    .getByRole("button", { name: "1. Approve this NFT", exact: true })
    .click();
  await confirm("Approve NFT transfer");
  await page
    .getByRole("button", { name: "2. Review funded sale", exact: true })
    .click();
  await confirm("Accept exact funded terms");
  const claim = await read(d.feeStrip, "FeeStrip", "claimToken", [1n]);
  const raw = (hash, token) =>
    read(d.aqua, "Aqua", "rawBalances", [
      d.actors.buyer,
      d.swapRouter,
      hash,
      token,
    ]);
  const ask = await publish("buyer", "2000", "20");
  check(
    (await raw(ask, claim))[0] === 2000n * 10n ** 18n,
    "Initial virtual claim inventory",
  );
  await login("holder");
  await page.getByRole("link", { name: "Orchard", exact: true }).click();
  await page
    .getByRole("link", { name: "Open TEST / USDC NFT 1", exact: true })
    .click();
  await page.getByLabel("Claims to buy").fill("1000");
  await page
    .getByRole("button", { name: "Review purchase", exact: true })
    .click();
  await confirm("Confirm claim purchase");
  await login("buyer");
  check(
    (await row(ask).innerText()).includes("Partially filled"),
    "Partial quote missing",
  );
  check(
    (await raw(ask, claim))[0] === 1000n * 10n ** 18n,
    "Partial virtual claim inventory",
  );
  const cashBeforeDock = await balance(d.usdc, d.actors.buyer),
    claimBeforeDock = await balance(claim, d.actors.buyer),
    reserveBeforeDock = await read(d.feeStrip, "FeeStrip", "reservedUSDC");
  await dock(ask);
  check((await raw(ask, claim))[1] === 255, "Claim virtual balance not docked");
  check((await raw(ask, d.usdc))[1] === 255, "Cash virtual balance not docked");
  let safeRejected = false;
  try {
    await read(d.aqua, "Aqua", "safeBalances", [
      d.actors.buyer,
      d.swapRouter,
      ask,
      d.usdc,
      claim,
    ]);
  } catch {
    safeRejected = true;
  }
  check(safeRejected, "safeBalances must reject docked strategy");
  check(
    (await balance(d.usdc, d.actors.buyer)) === cashBeforeDock &&
      (await balance(claim, d.actors.buyer)) === claimBeforeDock,
    "Dock changed wallet tokens",
  );
  check(
    (await read(d.feeStrip, "FeeStrip", "reservedUSDC")) === reserveBeforeDock,
    "Dock changed reserve",
  );
  check(
    (await row(ask).innerText()).includes("Cancelled"),
    "Docked history missing",
  );
  const bid = await publish("holder", "1000", "8", "bid");
  await page
    .getByRole("region", { name: "Your maker quotes" })
    .screenshot({
      path: resolve(repo, "docs/design/evidence/quotes-real-bid-desktop.png"),
    });
  const sellerCash = await balance(d.usdc, d.actors.seller),
    holderCash = await balance(d.usdc, d.actors.holder),
    holderClaims = await balance(claim, d.actors.holder);
  await login("seller");
  await page.getByLabel("Claims to sell").fill("250");
  await page
    .getByRole("button", { name: "Review claim sale", exact: true })
    .click();
  check(
    (await page.getByRole("dialog").innerText()).includes("$2.000000 USDC"),
    "Wrong minimum sale proceeds",
  );
  await page
    .getByRole("dialog")
    .screenshot({
      path: resolve(repo, "docs/design/evidence/quotes-real-sale-review.png"),
    });
  await confirm("Confirm claim sale");
  check(
    (await balance(d.usdc, d.actors.seller)) === sellerCash + 2000000n,
    "Seller exact proceeds",
  );
  check(
    (await balance(d.usdc, d.actors.holder)) === holderCash - 2000000n,
    "Bid maker cash movement",
  );
  check(
    (await balance(claim, d.actors.holder)) ===
      holderClaims + 250n * 10n ** 18n,
    "Bid maker claim movement",
  );
  await send("holder", d.usdc, "LocalToken", "approve", [d.aqua, 0n]);
  await login("holder");
  check(
    (await row(bid).innerText()).includes("Allowance revoked"),
    "Revoked quote hidden",
  );
  const latest = await client.getBlock();
  await client.request({
    method: "evm_setNextBlockTimestamp",
    params: [Number(latest.timestamp + 7200n)],
  });
  await client.request({ method: "evm_mine", params: [] });
  await refresh();
  check((await row(bid).innerText()).includes("Expired"), "Expired bid hidden");
  await dock(bid);
  const stale = await publish("buyer", "1000", "10");
  await send("buyer", claim, "LocalToken", "transfer", [
    d.actors.seller,
    await balance(claim, d.actors.buyer),
  ]);
  await refresh();
  check(
    (await row(stale).innerText()).includes("Depleted"),
    "Depleted wallet quote hidden",
  );
  await send("buyer", d.activityRouter, "LocalActivityRouter", "donate", [
    300000000n,
    100000000n,
  ]);
  const now = await client.getBlockNumber();
  if (now <= BigInt(d.endBlock))
    await client.request({
      method: "anvil_mine",
      params: ["0x" + (BigInt(d.endBlock) + 1n - now).toString(16)],
    });
  await login("seller");
  await page
    .getByRole("button", { name: "Capture actual fees", exact: true })
    .click();
  await confirm("Confirm transaction");
  const capturedReserve = await read(d.feeStrip, "FeeStrip", "reservedUSDC"),
    escrowBalance = await balance(d.usdc, d.feeStrip);
  check(
    capturedReserve > 0n,
    "Need positive captured reserve for custody check",
  );
  await login("buyer");
  check(
    (await row(stale).innerText()).includes("Series state changed"),
    "Stale strategy hidden",
  );
  mkdirSync(resolve(repo, "docs/design/evidence"), { recursive: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("region", { name: "Your maker quotes" }).screenshot({
    path: resolve(repo, "docs/design/evidence/quotes-real-mobile.png"),
  });
  check(
    (await page.evaluate(() => document.documentElement.scrollWidth)) <= 390,
    "Mobile overflow",
  );
  await dock(stale);
  check(
    (await read(d.feeStrip, "FeeStrip", "reservedUSDC")) === capturedReserve &&
      (await balance(d.usdc, d.feeStrip)) === escrowBalance,
    "Dock touched captured reserve",
  );
  check(errors.length === 0, "Browser errors: " + errors.join(";"));
  writeFileSync(
    resolve(repo, "docs/design/quotes-chain-evidence.json"),
    JSON.stringify(
      {
        scope:
          `Actual isolated local${rpcPort} transactions; no public signing or live liquidity claim`,
        chainId: 31337,
        ask,
        bid,
        stale,
        partialAskRemaining: "1000000000000000000000",
        sellerBidProceeds: "2000000",
        capturedReserve: capturedReserve.toString(),
        escrowBalanceAfterDock: escrowBalance.toString(),
        safeBalancesRejectsDocked: true,
        receipts,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    "PASS: actual ask fill, exact bid fill, revoked/expired/depleted/stale retention, docking and untouched captured reserve",
  );
} finally {
  await browser.close();
}
