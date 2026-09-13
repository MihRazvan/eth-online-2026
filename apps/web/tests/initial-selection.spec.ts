import { expect, test } from "@playwright/test";

async function boundedMarket(page: import("@playwright/test").Page, capacity: string) {
  await page.route("**/src/fixtureAdapter.ts", async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: await response.text() + `
const capacityLoad = FixtureAdapter.prototype.load;
FixtureAdapter.prototype.load = async function() {
 const s=await capacityLoad.call(this); s.markets[0].availableClaims=window.testCapacity || ${JSON.stringify(capacity)};
 s.markets[1].availableClaims='12500000000000000000'; return s;
};` });
  });
  await page.goto("/#market/fs-1482");
  await page.getByRole("button", { name: "Use fixture wallet", exact: true }).first().click();
}

test("pristine selection follows executable capacity but edits survive refresh and another route resets the draft", async ({ page }) => {
  await boundedMarket(page, "990000000000000000000");
  const input=page.getByLabel("Claims to buy"), buy=page.getByRole("button",{name:"Review purchase",exact:true});
  await expect(input).toHaveValue("990"); await expect(buy).toBeEnabled();
  await page.evaluate(()=>{(window as any).testCapacity="500000000000000000000";window.dispatchEvent(new Event("focus"));});
  await expect(input).toHaveValue("500");
  await input.fill("200.123456789123456789");
  await page.evaluate(()=>{(window as any).testCapacity="100000000000000000000";window.dispatchEvent(new Event("focus"));});
  await expect(page.getByText("Quantity exceeds available maker inventory.",{exact:true})).toBeVisible();
  await expect(input).toHaveValue("200.123456789123456789"); await expect(buy).toBeDisabled();
  await page.evaluate(()=>{location.hash="#market/fs-1483";});
  await expect(input).toHaveValue("12.5"); await expect(buy).toBeEnabled();
  await page.evaluate(()=>{location.hash="#market/fs-1482";});
  await expect(input).toHaveValue("100");
});

test("a tiny executable fraction becomes the exact initial amount without whole-claim rounding", async ({ page }) => {
  await boundedMarket(page,"1");
  await expect(page.getByLabel("Claims to buy")).toHaveValue("0.000000000000000001");
  await page.getByRole("button",{name:"Review purchase",exact:true}).click();
  await expect(page.getByRole("dialog")).toContainText("0.000000000000000001 fee claims");
  await expect(page.getByRole("dialog")).toContainText("$0.000001 USDC");
});
