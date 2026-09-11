import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { receiptSnapshot } from "../src/components/EntitlementReceipt";
import { initialFixture } from "../src/fixtureAdapter";

async function connect(page: Page, route = "market/fs-1482") {
  await page.goto("/#" + route);
  await page
    .getByRole("button", { name: "Use fixture wallet", exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("button", { name: "Fixture wallet", exact: true }),
  ).toBeVisible();
}
async function confirm(page: Page) {
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Confirm fixture action", exact: true })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
}

test("disconnected receipt never presents fixture balances as owned; purchase shares its rights language", async ({
  page,
}) => {
  await page.goto("/#market/fs-1482");
  const receipt = page.getByRole("region", {
    name: "Fee-claim rights",
    exact: true,
  });
  await expect(receipt).toContainText("Connect to view");
  await expect(receipt.locator(".receipt-share")).not.toContainText("250");
  await page
    .getByRole("button", { name: "Use fixture wallet", exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("region", { name: "Your fee-claim receipt", exact: true }),
  ).toContainText("2.50%");
  await page
    .getByRole("button", { name: "Review purchase", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText(
    "all unpaid native-USDC income for the whole sold period",
  );
  await expect(page.getByRole("dialog")).toContainText(
    "do not include the NFT return right",
  );
});

test("matured rights survive capture and NFT return; allocation uses original Q through redemption", async ({
  page,
}) => {
  await connect(page, "market/fs-1484");
  const receipt = page.getByRole("region", {
    name: "Your fee-claim receipt",
    exact: true,
  });
  await expect(receipt).toContainText("Period ended · capture pending");
  await expect(receipt).toContainText("your unpaid claim remains valid");
  await page.getByRole("link", { name: "Your positions", exact: true }).click();
  await page
    .getByRole("button", { name: "Capture actual fees", exact: true })
    .click();
  await confirm(page);
  await page
    .getByRole("button", { name: "Recover NFT #1484", exact: true })
    .click();
  await confirm(page);
  await page
    .locator(".holding-row")
    .filter({ hasText: "NFT #1484" })
    .getByRole("link", { name: "View claim" })
    .click();
  await expect(receipt).toContainText("Proof allocation pending");
  await expect(receipt).toContainText(
    "NFT return does not release the fee reserve",
  );
  await page
    .getByRole("button", { name: "Preview fixture allocation", exact: true })
    .click();
  await confirm(page);
  await expect(receipt).toContainText("Ready to redeem");
  await expect(receipt).toContainText("$33.600000 USDC");
  await expect(receipt.locator(".receipt-share")).toContainText("10,000");
  await page
    .getByRole("button", { name: "Redeem 400 claims", exact: true })
    .click();
  await confirm(page);
  await expect(receipt).toContainText("This wallet has no unredeemed claims");
  await expect(receipt.locator(".receipt-share")).toContainText("10,000");
});

test("compact holdings disclosure works by keyboard and downloads an explicitly non-authoritative exact record", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await connect(page, "positions");
  const compact = page.locator(".compact-receipt").first();
  await expect(compact).not.toHaveAttribute("open");
  await expect(compact.locator(":scope > summary")).toContainText(
    "2.50% of original Q",
  );
  await compact.locator(":scope > summary").focus();
  await page.keyboard.press("Enter");
  await expect(compact).toHaveAttribute("open", "");
  const source = compact.locator(".receipt-record > summary");
  await source.focus();
  await page.keyboard.press("Enter");
  const pending = page.waitForEvent("download");
  await compact.getByRole("button", { name: "Download receipt JSON" }).click();
  const download = await pending;
  const file = await download.path();
  const record = JSON.parse(await readFile(file!, "utf8"));
  expect(record).toMatchObject({
    authority: "informational-only",
    mode: "fixture",
    chainId: 11155111,
    sourceBlock: "11842994",
    seriesId: "fs-1482",
    originalNFT: "1482",
    originalSupplyBase18: "10000000000000000000000",
    heldQuantityBase18: "250000000000000000000",
    earningStartBlock: "11842000",
    earningEndBlock: "11972000",
    allocationPhase: "active",
  });
  expect(record.notice).toContain("not proof of ownership");
  expect(record.notice).toContain("historical witness is available");
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
});

test("receipt exports preserve 18-decimal quantities and closed-series state without Number conversion", () => {
  const snapshot = initialFixture();
  const market = {
    ...snapshot.markets[0],
    originalSupply: "90071992547409930000000000000000000",
    phase: "active" as const,
  };
  const result = receiptSnapshot({
    market,
    quantity: "1",
    chainId: 31337,
    sourceBlock: "9007199254740993",
    mode: "local",
  });
  expect(result.originalSupplyBase18).toBe(market.originalSupply);
  expect(result.heldQuantityBase18).toBe("1");
  expect(result.sourceBlock).toBe("9007199254740993");
  expect(result.allocationPhase).toBe("active");
  expect(result.allocatedUSDCBase6).toBeNull();
  const closed = receiptSnapshot({
    market: { ...market, phase: "closed" },
    quantity: "0",
    chainId: 31337,
    sourceBlock: "9007199254740993",
    mode: "local",
  });
  expect(closed.allocationPhase).toBe("closed");
  expect(closed.heldQuantityBase18).toBe("0");
});
