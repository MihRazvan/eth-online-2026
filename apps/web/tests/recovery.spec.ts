import { test, expect, type Page } from "@playwright/test";
import { createHash } from "node:crypto";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  decodeFunctionData,
  toHex,
  keccak256,
  encodeAbiParameters,
  parseAbiParameters,
  zeroAddress,
} from "viem";
import { ChainAdapter } from "../src/chainAdapter";
import { feeStripAbi } from "../src/generated/contracts";
import { validateRecovery } from "../src/recovery";
const A = "0x1111111111111111111111111111111111111111",
  B = "0x2222222222222222222222222222222222222222",
  H = toHex(1n, { size: 32 });
const scope = {
  chainId: 31337,
  feeStrip: A,
  verifier: A,
  manager: B,
  seriesId: "1",
  endBlock: "124",
};
const artifact = {
  chainId: "31337",
  blockNumber: "124",
  manager: B,
  blockHash: H,
  witness: "0x0102",
};
const json = JSON.stringify(artifact),
  digest = createHash("sha256").update(json).digest("hex");
const observation = (extra = {}) => ({
  schemaVersion: 1,
  ...scope,
  state: "retained",
  lifecycle: "captured",
  endpointHash: H,
  finalized: false,
  checkpointSaved: true,
  checkpointHash: H,
  growthCached: false,
  artifactDigest: digest,
  copies: 2,
  storageDescription: "SQLite and two filesystem copies",
  lastObservedBlock: "130",
  lastObservedHash: H,
  lastObservedAt: Date.now(),
  finalityObserved: false,
  discoveryComplete: true,
  observationError: null,
  error: null,
  allocationAuthority: "contract-only",
  updatedAt: Date.now(),
  ...extra,
});
const deployment = {
  mode: "local",
  chainId: 31337,
  rpcUrl: "http://127.0.0.1:8550",
  feeStrip: A,
  usdc: A,
  other: B,
  positionManager: A,
  poolManager: B,
  verifier: A,
  checkpoints: A,
  market: A,
  swapRouter: A,
  aqua: A,
  nftIds: [],
};
async function mount(
  page: Page,
  status: unknown,
  artifactJSON = json,
  httpStatus = 200,
) {
  await page.route("**/api/recovery?*", (route) =>
    route.fulfill({
      status: httpStatus,
      contentType: "application/json",
      body: JSON.stringify(status),
    }),
  );
  await page.route("**/api/recovery/artifact?*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: artifactJSON,
    }),
  );
  await page.goto("/");
  await page.evaluate(
    async ({ deployment }) => {
      const [
        { ChainAdapter },
        { FixtureAdapter },
        { RecoveryPanel },
        { default: React },
        {
          default: { createRoot },
        },
      ] = await Promise.all([
        import("/src/chainAdapter.ts"),
        import("/src/fixtureAdapter.ts"),
        import("/src/components/RecoveryPanel.tsx"),
        import("/node_modules/.vite/deps/react.js"),
        import("/node_modules/.vite/deps/react-dom_client.js"),
      ]);
      const adapter = new ChainAdapter(deployment as any) as any;
      adapter.validate = async () => {};
    adapter.client.getBalance = async () => 10n ** 18n;
    adapter.client.getTransaction = async () => { throw new Error("Original transaction not supplied by this stub"); };
    adapter.client.estimateGas = async () => 21000n;
    adapter.client.estimateFeesPerGas = async () => ({ maxFeePerGas: 1000000000n, maxPriorityFeePerGas: 100000000n });
      adapter.read = async () => ({ endBlock: 124n });
      const snapshot = await new FixtureAdapter().load();
      const host = document.createElement("div");
      host.style.cssText = "max-width:850px;margin:40px auto;padding:20px";
      document.body.replaceChildren(host);
      createRoot(host).render(
        React.createElement(
          "div",
          null,
          React.createElement(
            "p",
            null,
            "Browser regression · simulated API observation",
          ),
          React.createElement(RecoveryPanel, {
            adapter,
            market: { ...snapshot.markets[0], id: "1", endBlock: "124" },
            sourceBlock: "130",
          }),
        ),
      );
    },
    { deployment },
  );
}
test("unavailable recovery never promises proof or a download; fixture receipt has explicit contract identity", async ({
  page,
}) => {
  await page.goto("/#market/fs-1482");
  await expect(
    page.getByRole("region", { name: "Historical proof recovery" }),
  ).toContainText("Fixture · no proof service");
  await page.getByText("Receipt source & download", { exact: true }).click();
  await expect(
    page.getByText(
      "Escrow contract: Simulated fixture · no deployed contract",
    ),
  ).toBeVisible();
  await mount(page, { error: "RECOVERY_UNAVAILABLE" }, json, 503);
  const panel = page.getByRole("region", { name: "Historical proof recovery" });
  await expect(panel).toContainText("Unavailable");
  await expect(
    panel.getByRole("button", { name: "Download proof JSON", exact: true }),
  ).toBeDisabled();
});
test("stale retained evidence separates filesystem copies, checkpoint, finality and cache on mobile", async ({
  page,
}) => {
  await mount(page, observation({ lastObservedAt: Date.now() - 180000 }));
  const panel = page.getByRole("region", { name: "Historical proof recovery" });
  await expect(panel).toContainText("Stale observation");
  await expect(panel).toContainText("Retained candidate");
  await expect(panel).toContainText("2 filesystem copies reported");
  await expect(panel).toContainText("Finality not confirmed");
  await expect(panel).toContainText("Not observed as cached");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  const directory = resolve(
    fileURLToPath(new URL("../../../docs/design/evidence/", import.meta.url)),
  );
  mkdirSync(directory, { recursive: true });
  await panel.screenshot({
    path: resolve(directory, "recovery-stale-mobile.png"),
  });
});
test("wrong deployment status is rejected before a proof can be downloaded", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await mount(page, observation({ feeStrip: B }));
  await expect(
    page.getByRole("region", { name: "Historical proof recovery" }),
  ).toContainText("Recovery scope mismatch");
  await mount(page, observation({ lastObservedAt: 9000000000000000 }));
  await expect(
    page.getByRole("region", { name: "Historical proof recovery" }),
  ).toContainText("Recovery response is malformed");
  expect(errors).toEqual([]);
  await expect(
    page.getByRole("button", { name: "Download proof JSON", exact: true }),
  ).toBeDisabled();
});
test("download authenticates the exact artifact digest and mandatory endpoint metadata", async ({
  page,
}) => {
  await mount(page, observation());
  const pending = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download proof JSON", exact: true })
    .click();
  const download = await pending;
  expect(download.suggestedFilename()).toBe(
    `feestrip-witness-31337-1-${digest}.json`,
  );
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(chunk);
  expect(JSON.parse(Buffer.concat(chunks).toString())).toEqual(artifact);
  const directory = resolve(
    fileURLToPath(new URL("../../../docs/design/evidence/", import.meta.url)),
  );
  mkdirSync(directory, { recursive: true });
  await page
    .getByRole("region", { name: "Historical proof recovery" })
    .screenshot({ path: resolve(directory, "recovery-observed-desktop.png") });
  await mount(
    page,
    observation(),
    JSON.stringify({ ...artifact, witness: "0x0304" }),
  );
  await page
    .getByRole("button", { name: "Download proof JSON", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("digest mismatch");
  const wrong = JSON.stringify({ ...artifact, manager: A });
  await mount(
    page,
    observation({
      artifactDigest: createHash("sha256").update(wrong).digest("hex"),
    }),
    wrong,
  );
  await page
    .getByRole("button", { name: "Download proof JSON", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "Witness metadata does not match",
  );
});
test("recovery scope and observation validation fail closed for substituted or malformed facts", () => {
  for (const extra of [
    { chainId: 1 },
    { feeStrip: B },
    { manager: A },
    { verifier: B },
    { seriesId: "2" },
    { endBlock: "125" },
    { chainId: 31337.1 },
    { copies: 3 },
    { checkpointHash: toHex(2n, { size: 32 }) },
    { artifactDigest: "bogus" },
    { allocationAuthority: "server" },
    { lastObservedAt: "today" },
    { lastObservedAt: 9000000000000000 },
    { updatedAt: 9000000000000000 },
    { endpointHash: null, checkpointSaved: false, checkpointHash: null },
  ])
    expect(() => validateRecovery(observation(extra), scope)).toThrow();
  expect(
    validateRecovery(
      observation({ observationError: "RPC_UNAVAILABLE" }),
      scope,
    ).status,
  ).toBe("stale");
  expect(
    validateRecovery(
      observation({ lastObservedAt: Date.now() + 120000 }),
      scope,
    ).status,
  ).toBe("stale");
});
test("settlement prefers scoped API bytes, rejects mismatches and only falls back when retention is absent", async () => {
  const originalFetch = globalThis.fetch;
  try {
    for (const scenario of [
      "api",
      "scope",
      "metadata",
      "orphaned",
      "refused",
      "absent",
    ] as const) {
      const adapter = new ChainAdapter(deployment as any) as any;
      adapter.validate = async () => {};
    adapter.client.getBalance = async () => 10n ** 18n;
    adapter.client.getTransaction = async () => { throw new Error("Original transaction not supplied by this stub"); };
    adapter.client.estimateGas = async () => 21000n;
    adapter.client.estimateFeesPerGas = async () => ({ maxFeePerGas: 1000000000n, maxPriorityFeePerGas: 100000000n });
      adapter.account = A;
      adapter.wallet = {
        getChainId: async () => 31337,
        getAddresses: async () => [A],
        sendTransaction: async () => H,
      };
      adapter.read = async (_address: string, _abi: unknown, fn: string) =>
        fn === "endpointGrowth"
          ? [false, 0n]
          : {
              endBlock: 124n,
              key: {
                currency0: A,
                currency1: B,
                fee: 3000,
                tickSpacing: 60,
                hooks: "0x0000000000000000000000000000000000000000",
              },
              tickLower: -60,
              tickUpper: 60,
            };
      let simulated: any,
        staticRequests = 0,
        apiRequests = 0;
      adapter.client.call = async ({ data }: { data: `0x${string}` }) => {
        simulated = decodeFunctionData({ abi: feeStripAbi, data });
      };
      adapter.client.waitForTransactionReceipt = async () => ({
        status: "success",
        transactionHash: H, blockNumber: 125n, blockHash: H,
      });
      const file =
        scenario === "metadata"
          ? JSON.stringify({ ...artifact, blockNumber: "125" })
          : json;
      globalThis.fetch = async (input) => {
        const url = String(input);
        if (url.startsWith("/api/recovery/artifact")) {
          apiRequests++;
          return new Response(file);
        }
        if (url.startsWith("/api/recovery?"))
          return new Response(
            JSON.stringify(
              observation({
                ...(scenario === "scope" ? { feeStrip: B } : {}),
                ...(scenario === "orphaned" ? { state: "orphaned" } : {}),
                artifactDigest: createHash("sha256").update(file).digest("hex"),
              }),
            ),
            {
              status:
                scenario === "absent"
                  ? 503
                  : scenario === "refused"
                    ? 409
                    : 200,
            },
          );
        if (url.startsWith("/witness-")) {
          staticRequests++;
          return new Response(json);
        }
        throw new Error("Unexpected fetch " + url);
      };
      const execute = adapter.execute({
        type: "settle",
        seriesId: "1",
        reviewedAccount: A,
      });
      if (["scope", "metadata", "orphaned", "refused"].includes(scenario)) {
        await expect(execute).rejects.toThrow(
          /mismatch|does not match|orphaned|could not provide/,
        );
        expect(simulated).toBeUndefined();
        expect(staticRequests).toBe(0);
      } else {
        await execute;
        expect(simulated.functionName).toBe("settle");
        expect(simulated.args).toEqual([1n, "0x0102"]);
        expect(staticRequests).toBe(scenario === "absent" ? 1 : 0);
        expect(apiRequests).toBe(scenario === "api" ? 1 : 0);
      }
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("only a direct verified cache for the exact series endpoint can settle without proof bytes", async () => {
  const originalFetch = globalThis.fetch;
  try {
    for (const verified of [true, false]) {
      const adapter = new ChainAdapter(deployment as any) as any;
      adapter.validate = async () => {};
    adapter.client.getBalance = async () => 10n ** 18n;
    adapter.client.getTransaction = async () => { throw new Error("Original transaction not supplied by this stub"); };
    adapter.client.estimateGas = async () => 21000n;
    adapter.client.estimateFeesPerGas = async () => ({ maxFeePerGas: 1000000000n, maxPriorityFeePerGas: 100000000n });
      adapter.account = A;
      adapter.wallet = {
        getChainId: async () => 31337,
        getAddresses: async () => [A],
        sendTransaction: async () => H,
      };
      const poolKey = {
        currency0: B,
        currency1: A,
        fee: 500,
        tickSpacing: 10,
        hooks: zeroAddress,
      };
      const poolId = keccak256(
        encodeAbiParameters(
          parseAbiParameters("address,address,uint24,int24,address"),
          [B, A, 500, 10, zeroAddress],
        ),
      );
      const expectedKey = keccak256(
        encodeAbiParameters(
          parseAbiParameters("uint256,bytes32,int24,int24,bool"),
          [124n, poolId, -120, 80, false],
        ),
      );
      let cacheReads = 0,
        fetches = 0,
        simulated: any;
      adapter.read = async (
        address: string,
        _abi: unknown,
        fn: string,
        args: any[],
      ) => {
        if (fn === "endpointGrowth") {
          expect(address).toBe(A);
          expect(args).toEqual([expectedKey]);
          cacheReads++;
          return [verified, 42n];
        }
        expect(fn).toBe("series");
        expect(args).toEqual([1n]);
        return { endBlock: 124n, key: poolKey, tickLower: -120, tickUpper: 80 };
      };
      adapter.client.call = async ({ data }: { data: `0x${string}` }) => {
        simulated = decodeFunctionData({ abi: feeStripAbi, data });
      };
      adapter.client.waitForTransactionReceipt = async () => ({
        status: "success",
        transactionHash: H, blockNumber: 125n, blockHash: H,
      });
      globalThis.fetch = async (input) => {
        fetches++;
        if (String(input).startsWith("/api/recovery?"))
          return new Response(
            JSON.stringify(
              observation({
                state: "cached-onchain",
                growthCached: true,
                artifactDigest: null,
                copies: 0,
              }),
            ),
          );
        return new Response("{}", { status: 404 });
      };
      const action = adapter.execute({
        type: "settle",
        seriesId: "1",
        reviewedAccount: A,
      });
      if (verified) {
        await action;
        expect(simulated.args).toEqual([1n, "0x"]);
        expect(fetches).toBe(0);
      } else {
        await expect(action).rejects.toThrow("Historical witness unavailable");
        expect(simulated).toBeUndefined();
        expect(fetches).toBe(2);
      }
      expect(cacheReads).toBe(1);
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});
