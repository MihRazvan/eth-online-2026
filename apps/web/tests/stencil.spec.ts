import { openClaimDetails } from "./claim-details";
import { expect, test } from "@playwright/test";

test("landing and legal information render before a delayed adapter snapshot", async ({ page }) => {
  await page.route("**/src/fixtureAdapter.ts", async (route) => {
    const response = await route.fetch();
    await route.fulfill({ response, body: await response.text() + `\nFixtureAdapter.prototype.load = async function() { return new Promise(() => {}); };` });
  });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "USUFRUCT", exact: true, level: 1 })).toBeVisible();
  await expect(page.getByRole("link", { name: "Look at the sheet first", exact: true })).toBeVisible();
  await expect(page.getByText("This is a deterministic fixture preview.", { exact: false })).toBeVisible();
  await page.getByRole("link", { name: "Privacy", exact: true }).click();
  await expect(page.getByRole("heading", { name: "PRIVACY", level: 1 })).toBeVisible();
  await expect(page.getByText("SELLER LISTINGS", { exact: true })).toBeVisible();
  await expect(page.locator(".legal")).toContainText("Pending terms and signatures");
});

test("theme persists across reload and both mobile themes preserve reference routes", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByRole("button", { name: "Switch colour mode", exact: true }).click();
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.getByRole("link", { name: "Look at the sheet first", exact: true }).click();
  for (const name of ["Market", "Pin a seed", "Holdings"]) {
    await page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name, exact: true }).click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.getByRole("button", { name: "Switch colour mode", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});

test("share slider uses original Q while exact input retains fractional base units", async ({ page }) => {
  await page.goto("/#market/fs-1482");
  await page.getByRole("button", { name: "Use fixture wallet", exact: true }).first().click();
  const slider = page.getByRole("slider", { name: "Select claim share" });
  await slider.focus();
  await slider.press("Home");
  await slider.press("ArrowRight");
  await expect(page.getByLabel("Claims to buy")).toHaveValue("1");
  await page.getByRole("button", { name: "Select all executable", exact: true }).click();
  await expect(page.getByLabel("Claims to buy")).toHaveValue("6000");
  await expect(slider).toHaveValue("6000");
  await page.getByLabel("Claims to buy").fill("0.000000000000000001");
  await expect(slider).toHaveValue("0");
  await page.getByRole("button", { name: "Review purchase", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("0.000000000000000001 fee claims");
  await expect(page.getByRole("dialog")).toContainText("$0.000001 USDC");
  await expect(page.getByRole("dialog")).toContainText("including income earned before this purchase");
});

for (const suffix of ["", "?offer=1"]) {
  test(`a counterparty activation keeps the linked claim reachable from pin/2041${suffix}`, async ({ page }) => {
    await page.route("**/src/fixtureAdapter.ts", async (route) => {
      const response = await route.fetch();
      await route.fulfill({ response, body: await response.text() + `
const preActivationLoad = FixtureAdapter.prototype.load;
FixtureAdapter.prototype.findPosition = async function() { return "2041"; };
FixtureAdapter.prototype.load = async function() {
  const s = await preActivationLoad.call(this);
  if (window.counterpartyAccepted) {
    s.positions = s.positions.map(p => p.tokenId === "2041" ? { ...p, seriesId: "fs-2041", offer: undefined, offers: [] } : p);
    s.markets.push({ ...s.markets[0], id: "fs-2041", tokenId: "2041" });
  }
  return s;
};` });
    });
    await page.goto("/#pin/2041" + suffix);
    await page.getByRole("button", { name: "Use fixture wallet", exact: true }).first().click();
    if (suffix) await expect(page.getByRole("button", { name: "1. Approve this NFT", exact: true })).toBeVisible();
    else await expect(page.getByRole("button", { name: "Review funded offers →", exact: true })).toBeVisible();
    // A different wallet accepted; focus refresh observes the new series without
    // changing this browser's deep link or sending any action from this browser.
    await page.evaluate(() => { (window as any).counterpartyAccepted = true; window.dispatchEvent(new Event("focus")); });
    const claims = page.getByRole("link", { name: "View its issued fee claims", exact: true });
    await expect(claims).toBeVisible();
    await expect(claims).toHaveAttribute("href", "#market/fs-2041");
    await expect(page.getByRole("heading", { name: "No supported positions to pin", exact: true })).not.toBeVisible();
    await expect(page.getByRole("button", { name: "1. Approve this NFT", exact: true })).not.toBeVisible();
    await claims.click();
    await expect(page).toHaveURL(/#market\/fs-2041$/);
    await openClaimDetails(page);
    await expect(page.getByRole("region", { name: "Your fee-claim receipt", exact: true })).toContainText("2041");
  });
}
