import { expect, test } from "@playwright/test";

for (const theme of ["dark", "light"]) {
  test(`reference claim hierarchy and disclosure access in ${theme}`, async ({ page }, testInfo) => {
    await page.addInitScript(value => localStorage.setItem("usufruct-theme", value), theme);
    await page.goto("/#market/fs-1482");
    const art = page.getByRole("region", { name: "Position identity" });
    const trade = page.locator(".claim-trade");
    await expect(page.getByRole("heading", { name: "NFT 1482", exact: true })).toBeVisible();
    await expect(page.locator(".claim-terms li")).toHaveCount(6);
    await expect(page.locator(".claim-disclosure[open]")).toHaveCount(0);
    await expect(page.getByRole("region", { name: "Historical proof recovery" })).not.toBeVisible();
    const artBox = (await art.boundingBox())!, tradeBox = (await trade.boundingBox())!;
    expect(artBox.x + artBox.width).toBeLessThan(tradeBox.x);
    expect(tradeBox.width / artBox.width).toBeGreaterThan(.95);
    const slider = page.getByRole("slider", { name: "Select claim share" });
    await slider.focus(); await page.keyboard.press("Home"); await page.keyboard.press("ArrowRight");
    await expect(page.getByLabel("Claims to buy")).toHaveValue("1");
    await expect(page.locator(".claim-readout")).toContainText("0.01%");
    await expect(page.locator(".claim-readout")).toContainText("$0.08");
    await page.getByRole("button", { name: "Select all executable" }).click();
    await expect(page.getByLabel("Claims to buy")).toHaveValue("6000");
    await expect(slider).toHaveAttribute("aria-valuetext", /6,000 claims.*60.00 percent/);
    await page.screenshot({ path: testInfo.outputPath(`claim-primary-${theme}-desktop.png`), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
    const mobileArt = (await art.boundingBox())!, mobileTrade = (await trade.boundingBox())!;
    expect(mobileArt.y + mobileArt.height).toBeLessThan(mobileTrade.y);
    await page.screenshot({ path: testInfo.outputPath(`claim-primary-${theme}-mobile.png`), fullPage: true });
    const receipt = page.getByText("Claim rights & your receipt", { exact: true });
    await receipt.focus(); await page.keyboard.press("Enter");
    await expect(page.getByRole("region", { name: "Fee-claim rights", exact: true })).toContainText("Your share of unpaid native USDC for this entire period.");
    await page.getByText("Settlement & proof recovery", { exact: true }).click();
    await expect(page.getByRole("region", { name: "Historical proof recovery" })).toBeVisible();
  });
}

for (const phase of ["lookup", "refresh"]) test(`manual NFT ${phase} pauses background polling, times out, and ignores a late response`, async ({ page }) => {
  await page.route("**/src/fixtureAdapter.ts", async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: await response.text() + `
const lookupLoad = FixtureAdapter.prototype.load;
FixtureAdapter.prototype.load = async function() { window.lookupLoads = (window.lookupLoads || 0) + 1; if (window.holdLookupRefresh) { await new Promise(resolve => { window.resolveLookup = resolve; }); } return lookupLoad.call(this); };
FixtureAdapter.prototype.findPosition = async function() { if (${JSON.stringify(phase)} === "refresh") { window.holdLookupRefresh = true; return "2041"; } return new Promise(resolve => { window.resolveLookup = resolve; }); };
` });
  });
  await page.goto("/#pin");
  await page.getByRole("button", { name: "Use fixture wallet", exact: true }).first().click();
  await page.clock.install();
  await page.getByLabel("NFT ID or Uniswap link").fill("2041");
  await page.getByRole("button", { name: "Find position", exact: true }).click();
  await expect(page.getByRole("button", { name: "Finding…", exact: true })).toBeDisabled();
  const loads = await page.evaluate(() => (window as any).lookupLoads);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page.clock.runFor(20_001);
  await expect(page.getByRole("alert")).toContainText("Position lookup took longer than 20 seconds");
  expect(await page.evaluate(() => (window as any).lookupLoads)).toBe(loads);
  await page.evaluate(() => (window as any).resolveLookup("2041"));
  await expect(page).toHaveURL(/#pin$/);
  await expect(page.getByRole("button", { name: "Find position", exact: true })).toBeEnabled();
  expect(await page.evaluate(() => (window as any).lookupLoads)).toBe(loads);
});

for (const phase of ["lookup", "refresh"]) test(`deep-link NFT ${phase} releases loading and ignores late replies after its deadline`, async ({ page }) => {
  await page.route("**/src/fixtureAdapter.ts", async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: await response.text() + `
const linkedLookupLoad = FixtureAdapter.prototype.load;
FixtureAdapter.prototype.load = async function() { window.linkedLoads = (window.linkedLoads || 0) + 1; if (window.holdLinkedRefresh) await new Promise(resolve => { window.resolveLinked = resolve; }); return linkedLookupLoad.call(this); };
FixtureAdapter.prototype.findPosition = async function() { if (${JSON.stringify(phase)} === "refresh") { window.holdLinkedRefresh = true; return "2041"; } return new Promise(resolve => { window.resolveLinked = resolve; }); };
` });
  });
  await page.goto("/#pin");
  await page.getByRole("button", { name: "Use fixture wallet", exact: true }).first().click();
  await page.clock.install();
  await page.evaluate(() => { location.hash = "#pin/2041"; });
  await expect(page.locator(".pin-steps button.on")).toContainText("2 · Set your listing");
  await page.getByRole("button", { name: "1 · Choose a position", exact: true }).click();
  await expect(page.getByText("Loading the linked canonical position…", { exact: true })).toBeVisible();
  const loads = await page.evaluate(() => (window as any).linkedLoads);
  await page.clock.runFor(20_001);
  await expect(page.getByRole("alert")).toContainText("Position lookup took longer than 20 seconds");
  await expect(page.getByText("Loading the linked canonical position…", { exact: true })).not.toBeVisible();
  await page.evaluate(() => (window as any).resolveLinked("2041"));
  expect(await page.evaluate(() => (window as any).linkedLoads)).toBe(loads);
  await expect(page).toHaveURL(/#pin\/2041$/);
  await page.getByLabel("NFT ID or Uniswap link").fill("2041");
  await expect(page.getByRole("button", { name: "Find position", exact: true })).toBeEnabled();
});
