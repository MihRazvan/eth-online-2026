import { expect, test } from "@playwright/test";

test("full Pin discards a previous NFT's delayed estimate and only explicit apply changes its ask", async ({ page }, testInfo) => {
  await page.route("**/src/fixtureAdapter.ts", async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: await response.text() + `
const pinReviewLoad = FixtureAdapter.prototype.load;
FixtureAdapter.prototype.load = async function() {
 const s = await pinReviewLoad.call(this);
 s.positions.push({...s.positions.find(p=>p.tokenId==='2041'),tokenId:'2042'});
 return s;
};
FixtureAdapter.prototype.estimatePositionFees = async function(tokenId) {
 const p = (await this.load()).positions.find(p=>p.tokenId===tokenId);
 const result = {status:'available',positionCommitment:p.commitment || '0x'+'1'.repeat(64),sampleUsdcMicros:tokenId==='2041'?9000000n:3000000n,durationSeconds:3600n,source:{fromBlock:11842600n,toBlock:11842900n}};
 if(tokenId==='2041') return new Promise(resolve => { (window.oldPinEstimates ||= []).push(()=>resolve(result)); });
 return result;
};` });
  });
  await page.goto("/#pin");
  await page.getByRole("button", { name: "Use fixture wallet", exact: true }).first().click();
  await page.getByRole("button", { name: "2 · Set your listing", exact: true }).click();
  await expect(page.getByRole("region", { name: "Window fee estimate" })).toContainText("Reading recent fees…");
  await page.getByRole("button", { name: "1 · Choose a position", exact: true }).click();
  await page.locator(".tree-option").filter({ hasText: "#2042" }).click();
  const panel = page.getByRole("region", { name: "Window fee estimate" });
  await expect(panel.locator(".estval")).toHaveText("5.100000 USDC");
  const ask = page.getByLabel("Asking USDC for this share");
  await expect(ask).toHaveValue("1");
  await page.evaluate(() => (window as any).oldPinEstimates.forEach((resolve: () => void) => resolve()));
  await expect(panel.locator(".estval")).toHaveText("5.100000 USDC");
  await expect(ask).toHaveValue("1");
  await page.getByLabel("Share of the window to sell (%)").fill("25");
  await expect(panel.locator(".estval")).toHaveText("1.275000 USDC");
  await expect(ask).toHaveValue("1");
  await panel.getByRole("button", { name: "Use estimate" }).click();
  await expect(ask).toHaveValue("1.275000");
  await expect(panel).toContainText("Includes donations; future fees can be zero.");
  await panel.locator("summary").click();
  await expect(panel).toContainText("not probabilities or a confidence interval");
  await panel.locator("summary").click();
  await page.screenshot({ path: testInfo.outputPath("pin-estimate-desktop.png"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await page.screenshot({ path: testInfo.outputPath("pin-estimate-mobile.png"), fullPage: true });
});
