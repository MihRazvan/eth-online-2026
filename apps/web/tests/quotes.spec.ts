import {
  concatHex,
  encodeAbiParameters,
  parseAbiParameters,
  toHex,
  sliceHex,
  type Hex,
} from "viem";
import { test, expect, type Page } from "@playwright/test";
import {
  executableCapacity,
  strategyCapacity,
  decodeFrozenOrder,
  restoreFrozenOrder,
} from "../src/quotes";
async function publish(page: Page) {
  await page.getByLabel("Maker claim quantity").fill("200");
  await page.getByLabel("Maker total USDC ask").fill("16");
  await page
    .getByRole("button", { name: "Review maker quote", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Approve and publish quote", exact: true })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
}
test("maker keeps separately identified shared-inventory strategies and can cancel one without moving holdings", async ({
  page,
}) => {
  await page.goto("/#positions");
  await page
    .getByRole("button", { name: "Use fixture wallet", exact: true })
    .first()
    .click();
  await page
    .getByRole("button", { name: "Publish sell quote", exact: true })
    .first()
    .click();
  await publish(page);
  await publish(page);
  const quotes = page.getByRole("region", { name: "Your maker quotes" });
  await expect(quotes.locator(".strategy-row")).toHaveCount(2);
  await expect(quotes).toContainText(
    "adding them would count the same funds more than once",
  );
  for (const row of await quotes.locator(".strategy-row").all()) {
    await expect(row).toContainText("Executable now");
    await expect(row.locator(".strategy-amounts")).toContainText("200");
  }
  await quotes
    .getByRole("button", { name: "Review quote cancellation", exact: true })
    .first()
    .click();
  await expect(page.getByRole("dialog")).toContainText("fixture-strategy-1");
  await expect(page.getByRole("dialog")).toContainText(
    "no fee-claim reserve is withdrawn",
  );
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Cancel this maker quote", exact: true })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(quotes.locator(".strategy-row").first()).toContainText(
    "Cancelled",
  );
  await expect(quotes.locator(".strategy-row").last()).toContainText(
    "Executable now",
  );
  await expect(page.locator(".holding-row").first()).toContainText("250");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
});
test("unavailable bid has no enabled sell action or promised proceeds", async ({
  page,
}) => {
  await page.goto("/#positions");
  await page
    .getByRole("button", { name: "Use fixture wallet", exact: true })
    .first()
    .click();
  const sale = page.locator(".no-bid-note").first();
  await expect(sale).toContainText("No executable bid");
  await expect(sale).toContainText("Resale liquidity is not guaranteed");
  await expect(
    page.getByRole("button", { name: "Review claim sale" }),
  ).toHaveCount(0);
});
test("integer capacity equals exhaustive exact-input execution at small rounding boundaries", () => {
  for (let claims = 1n; claims <= 17n; claims++)
    for (let cash = 1n; cash <= 13n; cash++)
      for (let limit = 0n; limit <= 20n; limit++)
        for (const bid of [false, true]) {
          const maxIn = bid ? claims : cash,
            outRatio = bid ? cash : claims;
          let best = 0n;
          for (let input = 1n; input <= maxIn; input++) {
            const output = (input * outRatio) / maxIn;
            if (output > 0n && output <= limit) best = bid ? input : output;
          }
          expect(executableCapacity(bid, claims, cash, limit)).toBe(best);
        }
});
test("expired, depleted, revoked, changed and cancelled strategies stay distinguishable with zero executable capacity", () => {
  const base = {
    claimsIn: false,
    claimUnits: 200n,
    usdcUnits: 16n,
    virtual: 200n,
    balance: 250n,
    allowance: 200n,
    cancelled: false,
    expired: false,
    stale: false,
    active: true,
  };
  for (const [override, label] of [
    [{ expired: true }, "expired"],
    [{ virtual: 0n }, "depleted"],
    [{ allowance: 0n }, "allowance-revoked"],
    [{ stale: true }, "series-state-changed"],
    [{ cancelled: true, active: false }, "cancelled"],
  ] as const) {
    const result = strategyCapacity({ ...base, ...override });
    expect(result.available).toBe(0n);
    expect(result.limitations).toContain(label);
  }
  expect(strategyCapacity({ ...base, virtual: 100n }).limitations).toContain(
    "partially-filled",
  );
  expect(strategyCapacity({ ...base, balance: 100n }).limitations).toContain(
    "wallet-balance-limited",
  );
  expect(strategyCapacity({ ...base, allowance: 100n }).limitations).toContain(
    "allowance-limited",
  );
});

test("pinned program uses high-bit direction and frozen restoration cannot mask token or hook substitutions", () => {
  const maker = "0x1111111111111111111111111111111111111111" as const,
    market = "0x2222222222222222222222222222222222222222" as const,
    claim = "0x3333333333333333333333333333333333333333" as const,
    cash = "0x4444444444444444444444444444444444444444" as const;
  const traits =
    (124n << 160n) | (208n << 176n) | (208n << 192n) | (292n << 208n);
  const state = toHex(10n, { size: 32 }),
    freshState = toHex(20n, { size: 32 });
  const make = (state: Hex, deadline: bigint, direction: Hex) => {
    const guard = encodeAbiParameters(parseAbiParameters("uint256,bytes32"), [
      1n,
      state,
    ]);
    return {
      maker,
      traits,
      data: concatHex([
        claim,
        cash,
        market,
        guard,
        market,
        guard,
        market,
        guard,
        "0x2005",
        toHex(deadline, { size: 5 }),
        "0x9040",
        toHex(100n, { size: 32 }),
        toHex(8n, { size: 32 }),
        "0x5301",
        direction,
        "0x0220",
        toHex(1n, { size: 32 }),
      ]),
    };
  };
  const original = make(state, 50n, "0x80"),
    fresh = make(freshState, 500n, "0x80");
  expect(decodeFrozenOrder(original, market, cash, claim).claimsIn).toBe(true);
  expect(
    decodeFrozenOrder(make(state, 50n, "0x00"), market, cash, claim).claimsIn,
  ).toBe(false);
  expect(() =>
    decodeFrozenOrder(make(state, 50n, "0x01"), market, cash, claim),
  ).toThrow("Invalid direction");
  const restored = restoreFrozenOrder(fresh, 1n, state, 50n);
  expect(restored).toEqual(original);
  // Complete order comparison must still detect substitutions outside the frozen fields.
  expect({
    ...original,
    data: concatHex([cash, sliceHex(original.data, 20)]),
  }).not.toEqual(restored);
  expect({
    ...original,
    data: concatHex([
      sliceHex(original.data, 0, 124),
      maker,
      sliceHex(original.data, 144),
    ]),
  }).not.toEqual(restored);
});

test("injected wallet changes cannot replace the reviewed signer during refresh, approval or simulation", async () => {
  const { ChainAdapter } = await import("../src/chainAdapter");
  const A = "0x1111111111111111111111111111111111111111",
    B = "0x2222222222222222222222222222222222222222";
  const hash = toHex(1n, { size: 32 });
  for (const stage of [
    "refresh",
    "approval",
    "simulation",
    "review",
    "multiple-accounts",
  ] as const) {
    let selected = [A],
      sent: string[] = [];
    const provider = {
      request: async ({ method }: { method: string }) => {
        if (method === "eth_chainId") return "0x7a69";
        if (method === "eth_accounts") return selected;
        throw new Error("Unexpected injected request: " + method);
      },
    };
    const deployment = {
      mode: "local",
      chainId: 31337,
      rpcUrl: "http://127.0.0.1:8550",
      feeStrip: A,
      usdc: A,
      other: B,
      positionManager: A,
      poolManager: A,
      verifier: A,
      checkpoints: A,
      market: A,
      swapRouter: A,
      aqua: A,
      nftIds: [],
    };
    // Stub only RPC reads and transaction transport. The adapter's actual signer,
    // walletState, execute, approval and simulation sequencing remain under test.
    const adapter = new ChainAdapter(deployment as any, {
      provider: provider as any,
    }) as any;
    adapter.account = A;
    adapter.validate = async () => {};
    adapter.read = async (_address: string, _abi: unknown, fn: string) => {
      if (fn === "balanceOf") return 1000n;
      if (fn === "allowance") return 0n;
      if (fn === "takerData") return "0x";
      if (fn === "quote") return [1n, 1n, hash];
      throw new Error("Unexpected read " + fn);
    };
    adapter.quotes.set("1", {
      strategyHash: hash,
      order: { maker: A, traits: 0n, data: "0x" },
      claimUnits: 1n,
      usdcUnits: 1n,
      available: 10n,
      deadline: 100n,
      claim: B,
    });
    adapter.load = async () => {
      if (stage === "refresh") selected = [B];
      return { timestamp: 10, wallet: await adapter.walletState(1n) };
    };
    adapter.client.call = async () => {
      if (stage === "simulation") selected = [B];
    };
    adapter.wallet.sendTransaction = async ({
      account,
    }: {
      account: string;
    }) => {
      sent.push(account);
      return hash;
    };
    adapter.client.waitForTransactionReceipt = async () => {
      if (stage === "approval") selected = [B];
      return { status: "success", transactionHash: hash };
    };
    if (stage === "review") {
      selected = [B];
      adapter.account = B;
    }
    if (stage === "multiple-accounts") selected = [B, A];
    await expect(
      adapter.execute({
        type: "buyClaims",
        reviewedAccount: A,
        seriesId: "1",
        quantity: "1",
        maximumPaymentMicros: "1",
        expiresAt: "100",
        strategyHash: hash,
      }),
    ).rejects.toThrow("Wallet account changed");
    expect(sent, stage).toEqual(stage === "approval" ? [A] : []);
  }
});
