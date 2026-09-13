import { test, expect, type Page } from "@playwright/test";
async function wallet(page: Page) {
  await page
    .getByRole("button", { name: "Use fixture wallet", exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("button", { name: "Fixture wallet", exact: true }),
  ).toBeVisible();
}
async function condition(page: Page, value: string) {
  await page.getByText("Data sources & demo controls", { exact: true }).click();
  await page.getByLabel("Fixture condition").selectOption(value);
}
async function detail(page: Page) {
  await page.goto("/#market/fs-1482");
}
async function confirm(page: Page, name: string) {
  await page
    .getByRole("dialog")
    .getByRole("button", { name, exact: true })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
}
test("disconnected market explains original Q and exact earning endpoint; filters and empty search work", async ({
  page,
}) => {
  await page.goto("/#market");
  await expect(
    page.getByText("Deterministic fixtures", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("End of block 11,972,000 · window open", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Open WETH / USDC NFT 1482" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Settling", exact: true }).click();
  await expect(page.locator(".market-row")).toHaveCount(1);
  await page.getByLabel("Search markets").fill("unavailable");
  await expect(
    page.getByRole("heading", { name: "No matching fee markets" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect(page.locator(".market-row")).toHaveCount(3);
});
test("fractional purchase shows exact USDC review and carries unpaid period income", async ({
  page,
}) => {
  await detail(page);
  await wallet(page);
  await page.getByLabel("Claims to buy").fill("0.1");
  await page.getByRole("button", { name: "Review purchase" }).click();
  await expect(
    page.getByRole("dialog").getByText("$0.008400 USDC", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("dialog").getByText("0.1 fee claims", { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("dialog")).toContainText(
    "including income earned before this purchase",
  );
  await confirm(page, "Confirm claim purchase");
  await expect(page.getByRole("status")).toContainText(
    "No transaction was broadcast",
  );
  await page.getByRole("link", { name: "Holdings", exact: true }).click();
  await expect(page.locator(".holding-row").first()).toContainText("250.1");
});
test("NFT approval does not activate; exact funded acceptance preserves retained rights", async ({
  page,
}) => {
  await page.goto("/#pin");
  await wallet(page);
  await page.getByRole("button", { name: /3 · Funded offers/ }).click();
  await page
    .getByRole("button", { name: "1. Approve this NFT", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText(
    "does not activate or lock a sale",
  );
  await confirm(page, "Approve NFT transfer");
  await expect(page.locator(".position-entry").first()).toContainText(
    "In your wallet",
  );
  await page.getByRole("button", { name: "2. Review funded sale" }).click();
  await expect(page.getByRole("dialog")).toContainText("$672.000000 USDC");
  await expect(page.getByRole("dialog")).toContainText("8,000 / 10,000");
  await expect(page.getByRole("dialog")).toContainText(
    "You cannot change bands",
  );
  await confirm(page, "Accept exact funded terms");
  await expect(page).toHaveURL(/#positions$/);
  await expect(page.getByRole("status")).toContainText("No transaction was broadcast");
  await expect(page.locator(".position-entry").first()).toContainText(
    "Held in escrow",
  );
  await expect(page.locator(".holding-row").first()).toContainText("2,000");
});
test("multiple funded offers remain individually recoverable and rejected cancellation preserves funds", async ({
  page,
}) => {
  await page.goto("/#pin");
  await wallet(page);
  await page.getByRole("button", { name: /3 · Funded offers/ }).click();
  await page
    .getByRole("button", { name: "Fund an offer", exact: true })
    .click();
  for (const amount of ["101", "102"]) {
    await page.getByLabel("Upfront USDC").fill(amount);
    await page
      .getByRole("button", { name: "Review funding", exact: true })
      .click();
    await confirm(page, "Fund offer");
  }
  await page.getByRole("link", { name: "Holdings", exact: true }).click();
  await expect(page.locator(".funded-offer-row")).toHaveCount(2);
  await expect(
    page.getByRole("region", { name: "Your funded offers" }),
  ).toContainText("$203.000000 USDC in unaccepted offers");
  await condition(page, "rejected-signature");
  await page
    .getByRole("button", { name: "Review cancellation" })
    .first()
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Cancel fixture offer" })
    .click();
  await expect(page.getByRole("alert")).toContainText("Signature rejected");
  await page.getByRole("button", { name: "Close transaction review" }).click();
  await expect(page.locator(".funded-offer-row")).toHaveCount(2);
  await page.getByLabel("Fixture condition").selectOption("normal");
  await page
    .getByRole("button", { name: "Review cancellation" })
    .last()
    .click();
  await expect(page.getByRole("dialog")).toContainText("$102.000000 USDC");
  await confirm(page, "Cancel fixture offer");
  await expect(page.locator(".funded-offer-row")).toHaveCount(1);
  await expect(page.locator(".funded-offer-row")).toContainText(
    "$101.000000 USDC",
  );
  await page.getByRole("link", { name: "Pin a seed", exact: true }).click();
  await expect(
    page.locator(".position-entry").first().locator(".funded-offer"),
  ).toContainText("$101.00");
  await page.getByRole("link", { name: "Holdings", exact: true }).click();
  await page.getByRole("button", { name: "Review cancellation" }).click();
  await confirm(page, "Cancel fixture offer");
  await expect(page.locator(".funded-offer-row")).toHaveCount(0);
  await expect(
    page.getByRole("region", { name: "Your funded offers" }),
  ).toContainText("$0.000000 USDC in unaccepted offers");
});
test("late capture releases original NFT before allocation; claims redeem afterward independently", async ({
  page,
}) => {
  await page.goto("/#positions");
  await wallet(page);
  await page
    .getByRole("button", { name: "Capture actual fees", exact: true })
    .click();
  await confirm(page, "Confirm fixture action");
  await page
    .getByRole("button", { name: "Recover NFT #1484", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText(
    "reserve stays segregated while proof is pending",
  );
  await confirm(page, "Confirm fixture action");
  await expect(page.locator(".position-entry").last()).toContainText(
    "NFT returned",
  );
  await expect(page.locator(".position-entry").last()).toContainText(
    "USDC allocation is still unresolved",
  );
  await page
    .locator(".position-entry")
    .last()
    .getByRole("link", { name: "View fee claim" })
    .click();
  await page
    .getByRole("button", { name: "Preview fixture allocation" })
    .click();
  await expect(page.getByRole("dialog")).toContainText(
    "does not generate or verify a historical proof",
  );
  await confirm(page, "Confirm fixture action");
  await page.getByRole("button", { name: "Redeem 400 claims" }).click();
  await expect(page.getByRole("dialog")).toContainText("$33.600000 USDC");
  await confirm(page, "Confirm fixture action");
  await expect(
    page.getByText("No claims remaining", { exact: true }),
  ).toBeVisible();
});
test("rejected signature and transaction revert preserve balances and offer state", async ({
  page,
}) => {
  await detail(page);
  await wallet(page);
  await condition(page, "rejected-signature");
  await page.getByRole("button", { name: "Review purchase" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Confirm claim purchase" })
    .click();
  await expect(page.getByRole("alert")).toContainText("Signature rejected");
  await page.getByRole("button", { name: "Close transaction review" }).click();
  await page
    .getByLabel("Fixture condition")
    .selectOption("transaction-failure");
  await page.getByRole("button", { name: "Review purchase" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Confirm claim purchase" })
    .click();
  await expect(page.getByRole("alert")).toContainText("Transaction reverted");
  await page.getByRole("button", { name: "Close transaction review" }).click();
  await page.getByRole("link", { name: "Holdings", exact: true }).click();
  await expect(page.locator(".holding-row").first()).toContainText("250");
});
test("wrong network has an explicit recovery action", async ({ page }) => {
  await detail(page);
  await wallet(page);
  await condition(page, "wrong-network");
  await expect(
    page.getByText(
      "Wrong network. Switch to Sepolia design fixture before a transaction.",
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Review purchase" }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Switch network", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Review purchase" }),
  ).toBeEnabled();
});
for (const [state, message] of [
  ["no-quotes", "No executable quote. Resale liquidity is not guaranteed."],
  ["stale-quote", "Quote expired. Refresh before signing."],
  ["insufficient-funds", "Insufficient USDC for this purchase."],
])
  test(`${state} prevents an invalid purchase`, async ({ page }) => {
    await detail(page);
    await wallet(page);
    await condition(page, state);
    await expect(page.getByText(message, { exact: true })).toBeVisible();
    if (state === "no-quotes" || state === "stale-quote") {
      await expect(
        page
          .locator(".scenario-results")
          .getByText("Unavailable", { exact: true }),
      ).toBeVisible();
    }
    await expect(
      page.getByRole("button", { name: "Review purchase" }),
    ).toBeDisabled();
  });
test("indexer lag is visible and an empty position state explains eligibility", async ({
  page,
}) => {
  await page.goto("/#pin");
  await wallet(page);
  await page.getByRole("button", { name: /3 · Funded offers/ }).click();
  await condition(page, "indexer-lag");
  await expect(
    page.getByText("Indexer lag: 3,000 blocks", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "1 · Choose a position", exact: true }).click();
  await page.getByLabel("Fixture condition").selectOption("no-positions");
  await expect(
    page.getByRole("heading", { name: "No supported positions" }),
  ).toBeVisible();
});
test("keyboard review traps focus and Escape returns to the initiating control", async ({
  page,
}) => {
  await detail(page);
  await wallet(page);
  const review = page.getByRole("button", { name: "Review purchase" });
  await review.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog")).toBeVisible();
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press("Tab");
    expect(
      await page.evaluate(() => !!document.activeElement?.closest("dialog")),
    ).toBe(true);
  }
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(review).toBeFocused();
});
test("narrow market and claim stay within viewport; financial labels remain available", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/#market");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await expect(
    page.getByRole("link", { name: "Open WETH / USDC NFT 1482" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Open WETH / USDC NFT 1482" }).click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await expect(
    page.getByRole("heading", { name: "Buy fee claims" }),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("detail-mobile.png"),
    fullPage: true,
  });
});
