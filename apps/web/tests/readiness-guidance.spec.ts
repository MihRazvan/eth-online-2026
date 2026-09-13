import { openClaimDetails } from "./claim-details";
import { test, expect, type Page } from "@playwright/test";

const address = "0x1111111111111111111111111111111111111111";
const readiness = (ready = false, observedAt = Date.now()) => ({ schemaVersion: 1, chainId: "11155111", feeStrip: address, observedAt, readyForNewSales: ready, checks: Object.fromEntries(["protocol", "keeper", "retention", "replication"].map((key) => [key, { ready, code: ready ? "READY" : "UNAVAILABLE" }])), allocationAuthority: "contract-only" });

// Exercise the real App and operations validator with explicitly labelled simulated
// snapshots. This adapter cannot send transactions or contact any public RPC.
async function mount(page: Page, route = "#market", positionPair = "WETH / USDC") {
  await page.goto("/" + route);
  await page.evaluate(async ({ address, positionPair }) => {
    const [{ App }, { initialFixture }, { readOperations }, { default: React }, { default: { createRoot } }] = await Promise.all([
      import("/src/App.tsx"), import("/src/fixtureAdapter.ts"), import("/src/operations.ts"), import("/node_modules/.vite/deps/react.js"), import("/node_modules/.vite/deps/react-dom_client.js"),
    ]);
    const state = (window as any).guidance = { connected: false, gas: "0", noQuote: false, noOffer: false, walletRequests: 0, signatures: 0, analysisRequests: 0 };
    const adapter = {
      mode: "testnet",
      async load() {
        const s = initialFixture(); s.mode = "testnet"; s.feeStrip = address; s.network = "Simulated Sepolia · browser regression";
        s.saleReadiness = await readOperations({ chainId: 11155111, feeStrip: address });
        s.wallet = { ...s.wallet, connected: state.connected, address, chainId: 11155111, ethBalanceWei: state.gas };
        s.positions = [{ ...s.positions[0], pair: positionPair, owner: address, ownedByWallet: true }];
        if (state.noOffer) { s.positions[0].offer = undefined; s.positions[0].offers = []; }
        s.fundedOffers = [{ id: "2", tokenId: "999", seller: "0x2222222222222222222222222222222222222222", buyer: address, fundedMicros: "250000", claims: "2500000000000000000000", originalSupply: "10000000000000000000000", endBlock: "11972000", deadlineTimestamp: "1789214400", expired: false }];
        if (state.noQuote) { s.quote.available = false; s.markets[0].availableClaims = "0"; }
        return s;
      },
      async connect() { state.walletRequests++; state.connected = true; return (await this.load()).wallet; },
      async execute() { state.signatures++; throw new Error("Browser fixture cannot submit transactions"); },
      async readAnalysis(seriesId, quantity, price, executionCost) {
        state.analysisRequests++;
        return (await fetch("/test/analysis?" + new URLSearchParams({ seriesId, quantity, price, executionCost }))).json();
      },
    };
    const host = document.createElement("div"); document.body.replaceChildren(host);
    createRoot(host).render(React.createElement(React.Fragment, null,
      React.createElement("p", { style: { padding: "12px 24px", borderBottom: "1px solid", margin: 0 } }, "Browser regression · simulated services and balances · no public transactions"),
      React.createElement(App, { adapter })));
  }, { address, positionPair });
  await expect(page.getByRole("region", { name: "New-sale service status" })).toBeVisible();
  if (route.startsWith("#market/")) await openClaimDetails(page);
}

const analysis = (patch = {}) => ({ status: "available", analysis: { seriesId: "fs-1482", poolKey: "pool", sourceBlock: 11842994, sourceHash: "0x" + "3".repeat(64), subgraphDeployment: "simulated-subgraph", substreamsPackage: "simulated-substreams", substreamsCursor: "simulated-cursor", lagBlocks: 6, stale: false, grossBreakEvenUSDC: "840000", netBreakEvenUSDC: "840000", knownBlocks: 75, inRangeBlocks: 50, totalBlocks: 100, occupancyBps: 6667, coverageBps: 7500, substreamsFinalBlock: null, sourceFinalized: false, allocationAuthority: "contract-only", caveats: ["Simulated source data for a browser regression."], ...patch } });

test("service pause belongs to the project team; read-only retry cannot bypass wallet or stale-service gates", async ({ page }, testInfo) => {
  let body = readiness(), checks = 0;
  await page.route("**/api/operations", async (route) => { checks++; await route.fulfill({ json: body }); });
  await mount(page);
  const notice = page.getByRole("region", { name: "New-sale service status" });
  await expect(notice).toContainText("The project team is restoring settlement services");
  await expect(page.getByText("Service-check details", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Network & data", { exact: true })).toHaveCount(0);
  await expect(page.locator(".environment")).not.toContainText("Read at block");
  await expect(notice).toContainText("No wallet signature or extra USDC");
  const before = checks;
  await notice.getByRole("button", { name: "Check service again" }).click();
  await expect.poll(() => checks).toBeGreaterThan(before);
  expect(await page.evaluate(() => (window as any).guidance.walletRequests)).toBe(0);
  await page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: "Pin a seed", exact: true }).click();
  await expect(notice).toBeVisible();
  await page.getByRole("button", { name: "Connect wallet", exact: true }).first().click();
  await expect(page.getByRole("heading", { name: "Your wallet", exact: true })).toBeVisible();
  await page.getByRole("button", { name: /3 · Funded offers/ }).click();
  await expect(page.getByText("Add ETH before onchain transactions.", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "1. Approve this NFT", exact: true })).toBeDisabled();
  await page.evaluate(() => { (window as any).guidance.gas = "1000000000000000000"; (window as any).guidance.noOffer = true; });
  await notice.getByRole("button", { name: "Check service again" }).click();
  await expect(page.getByRole("button", { name: "1. Approve this NFT", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "1. Approve this NFT", exact: true })).toHaveAccessibleDescription(/NFT approval and sale acceptance are paused/);
  await expect(page.getByText("A draft or approval alone never activates a sale.", { exact: false })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("service-pause-desktop.png"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("service-pause-mobile.png"), fullPage: true });
  body = readiness(true);
  await notice.getByRole("button", { name: "Check service again" }).click();
  await expect(notice).not.toBeVisible();
  await expect(page.getByRole("button", { name: "1. Approve this NFT", exact: true })).toBeEnabled();
  await expect(page.getByRole("button", { name: "2. Review funded sale", exact: false })).toBeDisabled();
  body = readiness(true, Date.now() - 60001);
  await page.getByRole("button", { name: "Refresh chain state", exact: true }).click();
  await expect(notice).toContainText("New sales are paused");
  await expect(page.getByRole("button", { name: "1. Approve this NFT", exact: true })).toBeDisabled();
  await page.getByRole("link", { name: "Holdings", exact: true }).click();
  await expect(notice).toBeVisible();
  await page.getByRole("button", { name: "Review cancellation", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("$0.250000");
  await expect(page.getByRole("button", { name: "Cancel offer and recover USDC" })).toBeEnabled();
  expect(await page.evaluate(() => (window as any).guidance.signatures)).toBe(0);
});

test("analysis distinguishes not-requested, provider failure, stale success and invalid inputs without a wallet", async ({ page }, testInfo) => {
  await page.route("**/api/operations", (route) => route.fulfill({ json: readiness() }));
  let response: any = { status: "unavailable", reason: "Common source block has not been indexed yet." };
  await page.route("**/test/analysis?*", (route) => route.fulfill({ json: response }));
  await mount(page, "#market/fs-1482");
  const panel = page.locator(".sourced-analysis");
  await expect(panel).toContainText("Source comparison not requested");
  await expect(panel).not.toContainText("provider not connected");
  expect(await page.evaluate(() => (window as any).guidance.analysisRequests)).toBe(0);
  await panel.getByRole("button", { name: "Load sourced analysis" }).click();
  await expect(panel).toContainText("Source comparison unavailable");
  await panel.getByText("Why this comparison is unavailable", { exact: true }).click();
  await expect(panel).toContainText("Common source block has not been indexed yet.");
  response = analysis({ stale: true, lagBlocks: 120 });
  await panel.getByRole("button", { name: "Refresh sourced analysis" }).click();
  await expect(panel).toContainText("Source comparison is behind the chain");
  await expect(panel).toContainText("Provisional source state");
  await expect(panel).toContainText("120 blocks · stale");
  await panel.getByText("Source identity & analysis limits", { exact: true }).click();
  await expect(panel).toContainText("simulated-subgraph");
  await expect(panel).not.toContainText("simulated-cursor");
  await panel.screenshot({ path: testInfo.outputPath("analysis-stale-desktop.png") });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await panel.screenshot({ path: testInfo.outputPath("analysis-stale-mobile.png") });
  response = analysis({ stale: false, sourceFinalized: true, substreamsFinalBlock: 11842994, lagBlocks: 96, finalityLagBlocks: 96, indexingLagBlocks: 0 });
  await panel.getByRole("button", { name: "Refresh sourced analysis" }).click();
  await expect(panel).toContainText("Source comparison loaded");
  await expect(panel).toContainText("Fresh against finalized history");
  await expect(panel).toContainText("96 blocks · expected wait for finality");
  await expect(panel).toContainText("0 blocks behind finalized head");
  await expect(panel).not.toContainText("Refresh the comparison before using it");
  response = analysis({ stale: true, sourceFinalized: true, substreamsFinalBlock: 11842994, lagBlocks: 136, finalityLagBlocks: 96, indexingLagBlocks: 40 });
  await panel.getByRole("button", { name: "Refresh sourced analysis" }).click();
  await expect(panel).toContainText("Source comparison is behind the chain");
  await expect(panel).toContainText("40 blocks behind finalized head");
  await panel.getByLabel("Analysis execution cost").fill("-1");
  await expect(panel).toContainText("Check the comparison inputs");
  await expect(panel.getByRole("button")).toBeDisabled();
  await expect(panel.getByText("Break-even, before execution cost", { exact: true })).not.toBeVisible();
  await panel.getByLabel("Analysis execution cost").fill("0");
  await page.evaluate(() => { (window as any).guidance.noQuote = true; });
  await page.getByRole("button", { name: "Refresh chain state", exact: true }).click();
  await expect(panel).toContainText("Waiting for an executable quote");
  await expect(panel.getByRole("button")).toBeDisabled();
  await expect(panel.getByText("Break-even, before execution cost", { exact: true })).not.toBeVisible();
  expect(await page.evaluate(() => (window as any).guidance.walletRequests)).toBe(0);
});

test("analysis lag breakdown accepts older responses but rejects malformed optional lag values", async () => {
  const { ChainAdapter } = await import("../src/chainAdapter");
  const adapter = new ChainAdapter({ mode: "testnet", chainId: 11155111, rpcUrl: "https://example.invalid", feeStrip: address } as any);
  const previous = globalThis.fetch;
  try {
    for (const patch of [{}, { indexingLagBlocks: 0, finalityLagBlocks: 96 }, { indexingLagBlocks: -1 }, { finalityLagBlocks: "96" }, { indexingLagBlocks: 1.5 }, { finalityLagBlocks: null }, { finalityLagBlocks: Number.MAX_SAFE_INTEGER + 1 }]) {
      globalThis.fetch = async () => new Response(JSON.stringify(analysis({ seriesId: "1", ...patch }).analysis));
      const result = await adapter.readAnalysis("1", "1000000000000000000", "1000000");
      expect(result.status).toBe(Object.keys(patch).length === 0 || ("indexingLagBlocks" in patch && patch.indexingLagBlocks === 0) ? "available" : "unavailable");
    }
  } finally { globalThis.fetch = previous; }
});

test("an older analysis request cannot clear a newer request's loading state or replace its result", async ({ page }) => {
  await page.route("**/api/operations", (route) => route.fulfill({ json: readiness() }));
  const pending: any[] = [];
  await page.route("**/test/analysis?*", (route) => { pending.push(route); });
  await mount(page, "#market/fs-1482");
  const panel = page.locator(".sourced-analysis");
  await panel.getByRole("button", { name: "Load sourced analysis" }).click();
  await expect.poll(() => pending.length).toBe(1);
  await panel.getByLabel("Analysis execution cost").fill("1");
  await panel.getByRole("button", { name: "Load sourced analysis" }).click();
  await expect.poll(() => pending.length).toBe(2);
  await pending[0].fulfill({ json: { status: "unavailable", reason: "Old input request" } });
  await expect(panel.getByRole("button", { name: "Loading verified sources…" })).toBeDisabled();
  await expect(panel).toContainText("Checking the analysis sources");
  await pending[1].fulfill({ json: analysis({ netBreakEvenUSDC: "1840000" }) });
  await expect(panel).toContainText("Source comparison loaded");
  await expect(panel).toContainText("$1.840000 USDC");
  await expect(panel).not.toContainText("Old input request");
  await panel.getByLabel("Analysis execution cost").fill("0");
  await panel.getByRole("button", { name: "Load sourced analysis" }).click();
  await expect.poll(() => pending.length).toBe(3);
  await panel.getByLabel("Analysis execution cost").fill("2");
  await panel.getByRole("button", { name: "Load sourced analysis" }).click();
  await expect.poll(() => pending.length).toBe(4);
  await pending[3].fulfill({ json: analysis({ netBreakEvenUSDC: "2840000" }) });
  await expect(panel).toContainText("$2.840000 USDC");
  await pending[2].fulfill({ json: { status: "unavailable", reason: "Late obsolete response" } });
  await expect(panel).toContainText("Source comparison loaded");
  await expect(panel).toContainText("$2.840000 USDC");
});


test("Sepolia Pin explains exact test-pool ratios without implying a USD valuation", async ({ page }, testInfo) => {
  await page.route("**/api/operations", route => route.fulfill({ json: readiness() }));
  for (const symbol of ["WETH", "ETH"]) {
    await page.setViewportSize({ width: symbol === "ETH" ? 390 : 1440, height: 1000 });
    await mount(page, "#pin/2041", `${symbol} / USDC`);
    await page.getByRole("radio").first().check();
    await expect(page.getByText(`Test-pool price range (USDC per ${symbol})`, { exact: true })).toBeVisible();
    await expect(page.getByText("Pool ratio, not a USD market valuation.", { exact: true })).toBeVisible();
    await expect(page.locator(".mini-range")).toContainText("2,800 — 3,600");
    await expect(page.locator(".mini-range")).not.toContainText("$");
    await expect(page.locator(".mini-range")).toContainText("Fixed during term");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`pin-price-unit-${symbol}.png`), fullPage: true });
    await page.getByRole("button", { name: /1 · Choose a position/ }).click();
    await expect(page.getByText(`Test-pool range 2,800–3,600 USDC per ${symbol}`, { exact: true })).toBeVisible();
  }
});


test("real-network claim scenarios start neutral and calculate only explicit valid inputs", async ({ page }, testInfo) => {
  await page.route("**/api/operations", route => route.fulfill({ json: readiness() }));
  await mount(page, "#market/fs-1482");
  const scenario = page.locator(".scenario-box"), input = scenario.getByLabel("Scenario: total sold-period USDC");
  await expect(input).toHaveValue("");
  await expect(scenario.getByText("Enter a scenario", { exact: true })).toBeVisible();
  await expect(scenario.locator(".scenario-results")).toHaveCount(0);
  const range = page.locator(".range-view");
  await expect(range).toContainText("Test-pool price range (USDC per WETH)");
  await expect(range).toContainText("Pool ratio, not a USD market valuation.");
  await expect(range.locator(".range-labels")).toHaveText("2,8003,600");
  await expect(range).not.toContainText("$");
  await input.fill("0.6");
  await expect(scenario.getByText("Your scenario payout", { exact: true }).locator("..").locator("dd")).toHaveText("$0.06");
  await page.getByRole("button", { name: "Refresh chain state", exact: true }).click();
  await expect(input).toHaveValue("0.6");
  await input.fill("0");
  await expect(scenario.getByText("Your scenario payout", { exact: true }).locator("..").locator("dd")).toHaveText("$0.00");
  for (const invalid of ["-1", "0.0000001"]) {
    await input.fill(invalid);
    await expect(scenario.locator(".scenario-results")).toHaveCount(0);
    await expect(scenario).toContainText("Enter a nonnegative amount with at most 6 decimals.");
  }
  await input.fill("");
  await expect(scenario.getByText("Enter a scenario", { exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 1000 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await range.screenshot({ path: testInfo.outputPath("claim-test-pool-ratio.png") });
  await scenario.screenshot({ path: testInfo.outputPath("claim-neutral-scenario.png") });
  await input.fill("1");
  await page.evaluate(() => { location.hash = "#market/fs-1483"; });
  await expect(input).toHaveValue("");
  expect(await page.evaluate(() => (window as any).guidance.signatures)).toBe(0);
});
