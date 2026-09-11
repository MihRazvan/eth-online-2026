import { test, expect } from "@playwright/test";
import { fruitMarkState } from "../src/components/Orchard";
import { initialFixture } from "../src/fixtureAdapter";

test("fractional inventory remains visible below one basis point of original Q", () => {
  const Q = BigInt(initialFixture().markets[0].originalSupply);
  for (const quantity of [500000000000000000n, 1n]) {
    expect(fruitMarkState(quantity, Q, 0)).toBe("partial");
    for (let index = 1; index < 10; index++)
      expect(fruitMarkState(quantity, Q, index)).toBe("empty");
  }
  expect(fruitMarkState(0n, Q, 0)).toBe("empty");
  expect(fruitMarkState(Q / 10n, Q, 0)).toBe("full");
  expect(fruitMarkState(Q / 10n, Q, 1)).toBe("empty");
});

test("mobile orchard navigation reaches seller and holder tasks with legible type", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page).toHaveTitle(/usufruct/);
  for (const [link, heading] of [
    ["Orchard", "The orchard"],
    ["Pin a tree", "Pin a tree"],
    ["My cabinet", "My cabinet"],
  ]) {
    await page.getByRole("link", { name: link, exact: true }).click();
    await expect(page.getByRole("heading", { name: heading, exact: true, level: 1 })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
  await page.evaluate(() => document.fonts.ready);
  expect(await page.evaluate(() => document.fonts.check('italic 64px "Instrument Serif"'))).toBe(true);
  expect(await page.evaluate(() => document.fonts.check('16px "Courier Prime"'))).toBe(true);
});
