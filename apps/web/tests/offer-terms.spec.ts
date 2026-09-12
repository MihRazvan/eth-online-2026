import { test, expect } from "@playwright/test";
import { offerTerms, ORIGINAL_Q, parsePositionRoute } from "../src/offerTerms";
import { validateOperations } from "../src/operations";

test("offer quantities preserve fixed Q and decimal input without financial Number rounding", () => {
  const input = { payment: "1.000001", percentage: "0.000000000000000001", endBlock: "1600", deadline: "2026-09-12T15:00:00Z" };
  const timestamp = String(Date.parse("2026-09-12T14:00:00Z") / 1000);
  expect(offerTerms(input, "1000", timestamp)).toMatchObject({ paymentMicros: "1000001", claims: "100", endBlock: "1600" });
  expect(offerTerms({ ...input, percentage: "100" }, "1000", timestamp).claims).toBe(ORIGINAL_Q.toString());
  for (const patch of [{ payment: "0" }, { payment: "1000.000001" }, { payment: "1e3" }, { percentage: "0" }, { percentage: "100.1" }, { endBlock: "1032" }, { endBlock: "217001" }, { endBlock: "1e6" }, { deadline: "2026-09-12T14:01:00Z" }, { deadline: "2026-09-14T14:00:00Z" }]) expect(() => offerTerms({ ...input, ...patch }, "1000", timestamp)).toThrow();
});

test("new sales require fresh checks scoped to the exact deployment and chain", () => {
  const scope = { chainId: 11155111, feeStrip: "0x1111111111111111111111111111111111111111" };
  const now = 1800000000000;
  const good = { schemaVersion: 1, chainId: "11155111", feeStrip: scope.feeStrip, observedAt: now, readyForNewSales: true, checks: { protocol: { ready: true, code: "ready" }, keeper: { ready: true, code: "ready" }, retention: { ready: true, code: "ready" }, replication: { ready: true, code: "ready" } }, allocationAuthority: "contract-only" };
  expect(validateOperations(good, scope, now).ready).toBe(true);
  expect(validateOperations({ ...good, readyForNewSales: false, checks: { ...good.checks, protocol: { ready: false, code: "CONTRACT_UPGRADE_REQUIRED" } } }, scope, now).reason).toContain("contract upgrade");
  for (const patch of [{ observedAt: now - 60001 }, { observedAt: now + 5001 }, { observedAt: "1800000000000" }, { chainId: "1" }, { feeStrip: "0x2222222222222222222222222222222222222222" }, { readyForNewSales: "true" }, { checks: { ...good.checks, replication: { ready: false, code: "unavailable" } } }, { checks: {} }, { allocationAuthority: "server" }]) expect(validateOperations({ ...good, ...patch }, scope, now).ready).toBe(false);
  for (const body of [null, "ready", {}, []]) expect(validateOperations(body, scope, now).ready).toBe(false);
});

test("target links permit only canonical decimal NFT and explicit offer identifiers", () => {
  expect(parsePositionRoute("pin/39220?offer=2")).toEqual({ tokenId: "39220", offerId: "2" });
  for (const route of ["pin/0", "pin/1?offer=0", "pin/1?offer=2&seller=evil", "pin/1/extra", "pin/-1", "pin/1?chain=1"]) expect(parsePositionRoute(route)).toBeNull();
});

test("editable offer review preserves exact terms and rejects unaffordable funding", async ({ page }) => {
  await page.goto("/#pin");
  await page.getByRole("button", { name: "Use fixture wallet", exact: true }).first().click();
  await page.getByRole("button", { name: "Fund an offer", exact: true }).click();
  await expect(page.getByLabel("Upfront USDC", { exact: true })).toHaveValue("1");
  await page.getByLabel("Upfront USDC", { exact: true }).fill("1.234567");
  await page.getByLabel("Sold share (%)", { exact: true }).fill("12.5");
  await page.getByLabel("Exact end block").fill("11844000");
  await page.getByRole("button", { name: "Review funding", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("$1.234567 USDC");
  await expect(page.getByRole("dialog")).toContainText("1,250 of 10,000 (12.50%)");
  await expect(page.getByRole("dialog")).toContainText("End of block 11,844,000");
  await expect(page.getByRole("dialog")).toContainText("Expiry does not refund automatically");
  await page.getByRole("button", { name: "Close transaction review" }).click();
  await page.getByLabel("Sold share (%)", { exact: true }).fill("101");
  await page.getByRole("button", { name: "Review funding", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("at most 100%");
  await expect(page.getByRole("dialog")).not.toBeVisible();
});

test("a completed action closes its review even when the follow-up snapshot fails", async ({ page }) => {
  await page.route("**/src/fixtureAdapter.ts", async (route) => {
    const response = await route.fetch();
    await route.fulfill({ response, body: await response.text() + `\nconst originalExecute = FixtureAdapter.prototype.execute; FixtureAdapter.prototype.execute = async function(action) { const result = await originalExecute.call(this, action); this.load = async () => { throw new Error("Simulated post-confirmation RPC outage"); }; return result; };` });
  });
  await page.goto("/#market/fs-1482");
  await page.getByRole("button", { name: "Use fixture wallet", exact: true }).first().click();
  await page.getByRole("button", { name: "Review purchase", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Confirm claim purchase", exact: true }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(page.getByRole("alert")).toContainText("do not repeat");
  await expect(page.getByRole("status")).toContainText("No transaction was broadcast");
});

test("repricing resolves the original receipt and preserves the replacement hash", async () => {
  const { ChainAdapter } = await import("../src/chainAdapter");
  const A = "0x1111111111111111111111111111111111111111", B = "0x2222222222222222222222222222222222222222";
  const originalHash = `0x${"1".repeat(64)}`, replacementHash = `0x${"2".repeat(64)}`;
  const adapter = new ChainAdapter({ mode: "local", chainId: 31337, rpcUrl: "http://127.0.0.1:8561", feeStrip: A, positionManager: B } as any) as any;
  adapter.signer = async () => ({ account: A, wallet: { sendTransaction: async () => originalHash } });
  adapter.client.call = async () => {};
  adapter.client.getTransaction = async () => { throw new Error("Original transaction not supplied by this stub"); };
    adapter.client.estimateGas = async () => 21000n;
  adapter.client.estimateFeesPerGas = async () => ({ maxFeePerGas: 100n, maxPriorityFeePerGas: 1n });
  adapter.client.getBalance = async () => 10n ** 18n;
  adapter.client.waitForTransactionReceipt = async ({ onReplaced }: any) => {
    onReplaced({ reason: "repriced", replacedTransaction: { hash: originalHash }, transactionReceipt: { transactionHash: replacementHash, blockNumber: 100n, blockHash: `0x${"3".repeat(64)}` } });
    return { status: "success", transactionHash: replacementHash, blockNumber: 100n, blockHash: `0x${"3".repeat(64)}` };
  };
  const progress: any[] = []; adapter.subscribeProgress((event: any) => progress.push(event));
  const { parseAbi } = await import("viem");
  expect(await adapter.write(A, B, parseAbi(["function approve(address,uint256)"]), "approve", [A, 1n])).toBe(replacementHash);
  expect(progress).toContainEqual(expect.objectContaining({ hash: originalHash, stage: "replaced", replacementHash }));
  expect(progress.at(-1)).toMatchObject({ stage: "confirmed", hash: replacementHash });
});

test("funding cannot bypass an unavailable operations gate or turn the seller's own balance into proceeds", async () => {
  const { ChainAdapter } = await import("../src/chainAdapter");
  const A = "0x1111111111111111111111111111111111111111";
  const adapter = new ChainAdapter({ mode: "testnet", chainId: 11155111, rpcUrl: "https://example.invalid", feeStrip: A, positionManager: A } as any) as any;
  adapter.validate = async () => {}; adapter.signer = async () => ({ account: A });
  let reads = 0; adapter.read = async () => { reads++; return A; };
  const fetch = globalThis.fetch;
  globalThis.fetch = async () => new Response("{}", { status: 503 });
  const action = { type: "fundOffer", tokenId: "1", paymentMicros: "1000000", claims: "1000000000000000000", endBlock: "1600", deadlineTimestamp: "5000" };
  try {
    await expect(adapter.execute(action)).rejects.toThrow("New sales are paused");
    expect(reads).toBe(0);
    adapter.mode = "local";
    await expect(adapter.execute(action)).rejects.toThrow("separate buyer");
    expect(reads).toBe(1);
  } finally { globalThis.fetch = fetch; }
});

test("a receipt timeout preserves the pending hash and prevents a duplicate submission", async () => {
  const { ChainAdapter } = await import("../src/chainAdapter");
  const { saveReceipt } = await import("../src/receipts");
  const { parseAbi } = await import("viem");
  const A = "0x1111111111111111111111111111111111111111", B = "0x2222222222222222222222222222222222222222";
  const hash = `0x${"1".repeat(64)}`; let sent = 0;
  const storage = new Map<string, string>();
  const previousStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) } });
  try {
    const adapter = new ChainAdapter({ mode: "local", chainId: 31337, rpcUrl: "http://127.0.0.1:8561", feeStrip: A, positionManager: B } as any) as any;
    adapter.validate = async () => {}; adapter.signer = async () => ({ account: A, wallet: { sendTransaction: async () => { sent++; return hash; } } });
    adapter.read = async () => A;
    adapter.client.call = async () => {}; adapter.client.getTransaction = async () => { throw new Error("Original transaction not supplied by this stub"); };
    adapter.client.estimateGas = async () => 21000n;
    adapter.client.estimateFeesPerGas = async () => ({ maxFeePerGas: 100n, maxPriorityFeePerGas: 1n }); adapter.client.getBalance = async () => 10n ** 18n;
    adapter.client.waitForTransactionReceipt = async () => { throw new Error("RPC receipt timeout"); };
    adapter.readTransaction = async () => "pending";
    adapter.subscribeProgress(saveReceipt);
    const action = { type: "approvePosition", tokenId: "1", reviewedAccount: A };
    await expect(adapter.execute(action)).rejects.toThrow("RPC receipt timeout");
    await expect(adapter.execute(action)).rejects.toThrow("still unresolved");
    expect(sent).toBe(1);
    // The wallet can confirm later; a fresh instance sees the persisted original hash too.
    expect(JSON.parse([...storage.values()][0])[0]).toMatchObject({ hash, stage: "pending", account: A });
  } finally {
    if (previousStorage) Object.defineProperty(globalThis, "localStorage", previousStorage); else Reflect.deleteProperty(globalThis, "localStorage");
  }
});
