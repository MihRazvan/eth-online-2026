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
