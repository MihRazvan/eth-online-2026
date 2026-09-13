import { expect, test } from "@playwright/test";

for (const [phase, decimals] of [["captured", 18], ["allocated", 8], ["allocated", 6], ["allocated", null]] as const) test(`${phase}, decimals ${decimals} residual review shows exact reserves and excludes holder funds`, async ({ page }) => {
  await page.goto("/#positions");
  await page.evaluate(async ({ phase, decimals }) => {
    const [{ App }, { initialFixture }, { default: React }, { default: { createRoot } }] = await Promise.all([
      import("/src/App.tsx"), import("/src/fixtureAdapter.ts"), import("/node_modules/.vite/deps/react.js"), import("/node_modules/.vite/deps/react-dom_client.js"),
    ]);
    const owner = "0x1111111111111111111111111111111111111111";
    const adapter = { mode: "testnet", async load() {
      const s = initialFixture(); s.mode = "testnet"; s.network = "Simulated residual review · no public transactions";
      s.wallet = { ...s.wallet, connected: true, address: owner, chainId: s.chainId, ethBalanceWei: "1000000000000000000" };
      s.markets = [{ ...s.markets[2], pair: "WETH / USDC", phase, residualOwner: owner, residualUsdcMicros: phase === "allocated" ? "3150" : "0", otherReserve: "123456789123456789", otherTokenDecimals: decimals ?? undefined, otherTokenSymbol: "WETH", allocatedMicros: phase === "allocated" ? "840000000" : "0" }];
      s.positions = [{ ...s.positions[0], tokenId: "1484", seriesId: "fs-1484", owner, ownedByWallet: true }];
      return s;
    }, async execute() { throw new Error("Read-only browser regression"); } };
    const host = document.createElement("div"); document.body.replaceChildren(host); createRoot(host).render(React.createElement(App, { adapter }));
  }, { phase, decimals });
  await page.getByRole("button", { name: "Withdraw residual fees", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText(phase === "allocated" ? "$0.003150 USDC" : "$0.000000 USDC");
  const expectedOther = decimals === 18 ? "0.123456789123456789 WETH" : decimals === 8 ? "1234567891.23456789 WETH" : decimals === 6 ? "123456789123.456789 WETH" : "123,456,789,123,456,789 WETH base units";
  await expect(dialog).toContainText(expectedOther);
  await expect(dialog).toContainText("0x1111111111111111111111111111111111111111");
  await expect(dialog).toContainText("Excluded from this withdrawal");
  await expect(dialog).not.toContainText("$840");
  await expect(dialog).toContainText("does not redeem fee claims or release their reserve");
  if (phase === "captured") await expect(dialog).toContainText("any later residual USDC needs a separate withdrawal");
  await expect(dialog.getByRole("button", { name: "Confirm transaction", exact: true })).toBeEnabled();
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
});
