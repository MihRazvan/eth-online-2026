import { expect, test } from "@playwright/test";

for (const [width, height, theme] of [[1440, 1000, "dark"], [390, 844, "light"]] as const) {
  test(`reference intro is skippable and shown once at ${width}px in ${theme}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height });
    await page.addInitScript(theme => localStorage.setItem("usufruct-theme", theme), theme);
    await page.goto("/");
    const intro = page.getByRole("dialog", { name: "Welcome to usufruct" });
    await expect(intro).toBeVisible();
    await expect(intro.getByRole("button", { name: "Skip intro", exact: true })).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(intro.getByRole("button", { name: "Skip intro", exact: true })).toBeFocused();
    await expect(page.getByRole("button", { name: "Use fixture wallet", exact: true })).not.toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`intro-${theme}-${width}.png`), fullPage: false });
    await page.keyboard.press("Escape");
    await expect(intro).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "USUFRUCT", exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("heading", { name: "USUFRUCT", exact: true })).toBeVisible();
    await expect(intro).toHaveCount(0);
  });
}

test("direct claim links bypass intro and transaction review is never covered", async ({ page }) => {
  await page.goto("/#market/fs-1482");
  await expect(page.getByRole("dialog", { name: "Welcome to usufruct" })).toHaveCount(0);
  await page.getByRole("button", { name: "Use fixture wallet", exact: true }).first().click();
  await page.getByRole("button", { name: "Review purchase", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("including income earned before this purchase");
  await expect(page.getByRole("button", { name: "Skip intro", exact: true })).toHaveCount(0);
});

test("reduced-motion intro remains static and finishes without a mandatory action", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "USUFRUCT", exact: true })).toBeVisible({ timeout: 2000 });
  await expect(page.getByRole("dialog", { name: "Welcome to usufruct" })).toHaveCount(0);
});

test("a new deep link dismisses the introduction immediately", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("dialog", { name: "Welcome to usufruct" })).toBeVisible();
  await page.evaluate(() => { location.hash = "market/fs-1482"; });
  await expect(page.getByRole("dialog", { name: "Welcome to usufruct" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Buy fee claims", exact: true })).toBeVisible();
});

test("normal intro completes automatically without reporting transaction success", async ({ page }) => {
  await page.goto("/");
  const intro = page.getByRole("dialog", { name: "Welcome to usufruct" });
  await expect(intro).toBeVisible();
  await expect(intro).toContainText("This animation does not indicate network or transaction progress");
  await expect(intro).toHaveCount(0, { timeout: 4500 });
  await expect(page.getByRole("heading", { name: "USUFRUCT", exact: true })).toBeVisible();
  await expect(page.getByRole("status")).toHaveCount(0);
});
