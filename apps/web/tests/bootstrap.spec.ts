import { expect, test, type Page } from "@playwright/test";
import { createServer } from "node:http";
import { ChainAdapter } from "../src/chainAdapter";

async function onchainBootstrap(page: Page) {
  await page.route("**/src/main.tsx*", async route => {
    const response = await route.fetch();
    const source = await response.text();
    expect(source).toContain('const mode = import.meta.env.VITE_DATA_MODE ?? "fixture";');
    await route.fulfill({ response, body: source.replace('const mode = import.meta.env.VITE_DATA_MODE ?? "fixture";', 'const mode = "testnet";') });
  });
}

test("a hanging manifest renders immediately, times out, and offers retry without fixtures", async ({ page }, testInfo) => {
  await onchainBootstrap(page);
  await page.route("**/deployment.json", () => {});
  await page.goto("/");
  await expect(page.getByRole("status")).toHaveText("Loading network configuration…");
  await expect(page.getByRole("heading", { name: "USUFRUCT", exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.getByRole("alert")).toHaveText("Network configuration took longer than 10 seconds. Retry connection.", { timeout: 13000 });
  await expect(page.getByRole("button", { name: "Retry connection", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.getByRole("button", { name: "Use fixture wallet", exact: true })).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("bounded-bootstrap-mobile.png"), fullPage: true });
});

test("normal manifest loading replaces the shell with the configured onchain application", async ({ page }) => {
  await onchainBootstrap(page);
  // Exercise real bootstrap and manifest parsing, with explicitly simulated
  // validation/state. This regression has no public RPC or signing access.
  await page.route("**/src/chainAdapter.ts*", async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: await response.text() + `
import { initialFixture as bootstrapFixture } from "/src/fixtureAdapter.ts";
ChainAdapter.prototype.validate = async function() {};
ChainAdapter.prototype.load = async function() { const s = bootstrapFixture(); s.mode = "testnet"; s.network = "Simulated bootstrap network"; return s; };
` });
  });
  const address = "0x1111111111111111111111111111111111111111";
  await page.route("**/deployment.json", route => route.fulfill({ json: {
    mode: "testnet", chainId: 11155111, rpcUrl: "https://example.invalid", nftIds: ["1"],
    ...Object.fromEntries(["feeStrip", "usdc", "other", "positionManager", "poolManager", "verifier", "checkpoints", "market", "swapRouter", "aqua"].map(key => [key, address])),
  } }));
  await page.goto("/#market");
  await expect(page.getByRole("heading", { name: "MARKET", exact: true })).toBeVisible();
  await expect(page.getByText("Onchain testnet", { exact: true })).toBeVisible();
  await expect(page.getByText("Loading network configuration…", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Deterministic fixtures", { exact: true })).toHaveCount(0);
});

test("the manifest deadline also aborts a body that stalls after successful headers", async () => {
  const server = createServer((_request, response) => {
    response.writeHead(200, { "content-type": "application/json" });
    response.write('{"mode":');
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Missing loopback test port");
    await expect(ChainAdapter.fromDeployment(`http://127.0.0.1:${address.port}/deployment.json`)).rejects.toThrow("Network configuration took longer than 10 seconds");
  } finally {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});
