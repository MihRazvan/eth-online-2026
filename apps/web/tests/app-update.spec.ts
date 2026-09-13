import { expect, test } from "@playwright/test";
import { isAppUpdateError } from "../src/appUpdate";

test("module update classification distinguishes module failures from ordinary RPC errors", () => {
  for (const message of ["Failed to fetch dynamically imported module: [provider URL redacted] Earlier confirmed approval: 0x123", "Importing a module script failed.", "Loading chunk 18 failed", "Unable to preload CSS for /assets/a.css"]) expect(isAppUpdateError(new Error(message))).toBe(true);
  expect(isAppUpdateError(new Error("Failed to fetch RPC response"))).toBe(false);
  expect(isAppUpdateError("User rejected the request")).toBe(false);
});

test("Vite preload failures offer explicit reload and retain the route and stored receipts", async ({ page }) => {
  await page.goto("/#market");
  await expect(page.getByRole("heading", { name: "MARKET", exact: true })).toBeVisible();
  await page.evaluate(() => {
    localStorage.setItem("usufruct:transaction-receipts:v1", JSON.stringify([{ hash: "0x" + "1".repeat(64), stage: "confirmed", label: "USDC approval" }]));
    sessionStorage.setItem("update-test-marker", "kept");
    window.dispatchEvent(new Event("vite:preloadError"));
  });
  const notice = page.getByRole("alert", { name: "App update available" });
  await expect(notice).toContainText("Confirmed transactions remain onchain.");
  await expect(notice.getByRole("button", { name: "Reload app", exact: true })).toBeEnabled();
  expect(await page.evaluate(() => sessionStorage.getItem("update-test-marker"))).toBe("kept");
  await notice.getByRole("button", { name: "Reload app", exact: true }).click();
  await expect(page.getByRole("heading", { name: "MARKET", exact: true })).toBeVisible();
  expect(new URL(page.url()).hash).toBe("#market");
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("usufruct:transaction-receipts:v1")!)[0].stage)).toBe("confirmed");
});

test("update during approval waits for pending request and preserves confirmed approval across reload", async ({ page }, testInfo) => {
  await page.goto("/#market/fs-1482");
  await page.evaluate(async () => {
    const [{ App }, { FixtureAdapter }, { default: React }, { default: { createRoot } }] = await Promise.all([
      import("/src/App.tsx"), import("/src/fixtureAdapter.ts"), import("/node_modules/.vite/deps/react.js"), import("/node_modules/.vite/deps/react-dom_client.js"),
    ]);
    const adapter = new FixtureAdapter(); await adapter.connect();
    let listener: (value: any) => void;
    (adapter as any).subscribeProgress = (next: typeof listener) => { listener = next; return () => {}; };
    (adapter as any).execute = async () => {
      const s = await adapter.load();
      const progress = { label: "USDC approval", stage: "pending", hash: "0x" + "1".repeat(64), account: s.wallet.address, chainId: s.chainId, feeStrip: s.feeStrip, action: { type: "buyClaims", seriesId: "fs-1482", claims: "1000000000000000000000", maxCostMicros: "84000000" } };
      listener(progress);
      await new Promise<void>((_resolve, reject) => {
        (window as any).finishUpdateApproval = () => {
          listener({ ...progress, stage: "confirmed" });
          reject(new Error("Failed to fetch dynamically imported module: [provider URL redacted] Earlier confirmed approval: " + progress.hash));
        };
      });
    };
    const host = document.createElement("div"); document.body.replaceChildren(host);
    createRoot(host).render(React.createElement(App, { adapter }));
  });
  await page.getByRole("button", { name: "Review purchase", exact: true }).click();
  await page.getByRole("button", { name: "Confirm claim purchase", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("USDC approval: submitted; waiting for chain confirmation");
  await page.evaluate(() => window.dispatchEvent(new Event("vite:preloadError")));
  const notice = page.getByRole("dialog").getByRole("alert", { name: "App update available" });
  await expect(notice.getByRole("button", { name: "Reload app", exact: true })).toBeDisabled();
  await page.evaluate(() => (window as any).finishUpdateApproval());
  await expect(notice.getByRole("button", { name: "Reload app", exact: true })).toBeEnabled();
  await expect(page.getByRole("dialog").getByRole("button", { name: "Confirm claim purchase", exact: true })).toBeDisabled();
  await expect(page.getByRole("dialog")).not.toContainText("provider URL redacted");
  const receipt = await page.evaluate(() => JSON.parse(localStorage.getItem("usufruct:transaction-receipts:v1")!)[0]);
  expect(receipt.stage).toBe("confirmed");
  await page.setViewportSize({ width: 390, height: 1000 });
  await page.getByRole("dialog").screenshot({ path: testInfo.outputPath("app-update-after-approval.png") });
  await notice.getByRole("button", { name: "Reload app", exact: true }).click();
  await expect(page.getByRole("banner").getByRole("button", { name: "Use fixture wallet", exact: true })).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("usufruct:transaction-receipts:v1")!)[0])).toEqual(receipt);
});

test("a stale adapter chunk during bootstrap shows app-update recovery without fixtures", async ({ page }) => {
  await page.route("**/src/main.tsx*", async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: (await response.text()).replace('const mode = import.meta.env.VITE_DATA_MODE ?? "fixture";', 'const mode = "testnet";') });
  });
  await page.route("**/src/chainAdapter.ts*", route => route.abort("failed"));
  await page.goto("/#market");
  await expect(page.getByRole("alert", { name: "App update available" })).toContainText("A new app version is available.");
  await expect(page.getByRole("button", { name: "Reload app", exact: true })).toBeEnabled();
  await expect(page.getByText("Deterministic fixtures", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Retry connection", exact: true })).toHaveCount(0);
});
