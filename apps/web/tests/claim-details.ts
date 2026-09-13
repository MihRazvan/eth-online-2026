import { expect, type Page } from "@playwright/test";

// Financial assertions below the compact purchase panel still inspect every
// original value, through the same disclosure controls a user opens.
export async function openClaimDetails(page: Page) {
  await expect(page.locator(".claim-disclosure")).toHaveCount(5);
  for (const details of await page.locator(".claim-disclosure").all()) {
    if (!(await details.evaluate(node => (node as HTMLDetailsElement).open)))
      await details.locator(":scope > summary").click();
  }
}
