import { test, expect } from "@playwright/test";
import { keccak256, parseTransaction, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { ChainAdapter } from "../src/chainAdapter";
import { transactionIdentity } from "../src/transactionIdentity";
import { MAX_RECEIPT_GUARDS, readReceipts, saveReceipt } from "../src/receipts";

// Deterministic test key; never a configured participant or funded public account.
const account = privateKeyToAccount(`0x${"1".repeat(64)}`);
const feeStrip = "0x2222222222222222222222222222222222222222";
const originalTerms = { type: "eip1559" as const, chainId: 31337, nonce: 7, to: feeStrip, value: 0n, data: "0x1234" as Hex, gas: 50000n, maxFeePerGas: 100n, maxPriorityFeePerGas: 1n };
async function sample(patch: Record<string, unknown> = {}) {
  const serialized = await account.signTransaction({ ...originalTerms, ...patch } as any);
  const transaction = { ...parseTransaction(serialized), input: parseTransaction(serialized).data, hash: keccak256(serialized), from: account.address };
  return { serialized, transaction };
}

test("persisted identity is bound to signed bytes, hash, sender and chain rather than editable nonce metadata", async () => {
  const original = await sample();
  const expected = { hash: original.transaction.hash, account: account.address, chainId: 31337 };
  expect(await transactionIdentity(original.serialized, expected)).toMatchObject({ nonce: 7, sender: account.address, to: feeStrip });
  await expect(transactionIdentity(original.serialized, { ...expected, chainId: 11155111 })).rejects.toThrow("chain");
  await expect(transactionIdentity(original.serialized, { ...expected, account: feeStrip })).rejects.toThrow("sender");
  await expect(transactionIdentity((await sample({ nonce: 8 })).serialized, expected)).rejects.toThrow("broadcast hash");
  await expect(transactionIdentity(original.serialized + "00", expected)).rejects.toThrow("broadcast hash");
});

test("manual reconciliation accepts a confirmed same-nonce reprice, distinguishes cancellation and rejects unrelated or orphaned receipts", async () => {
  const original = await sample();
  const originalRow = { stage: "pending", label: "Fund offer", account: account.address, chainId: 31337, feeStrip, hash: original.transaction.hash, signedTransaction: original.serialized, action: { type: "fundOffer", tokenId: "1", paymentMicros: "1000000" } } as any;
  for (const scenario of ["repriced", "cancelled", "nonce", "sender", "chain", "orphaned", "pending"] as const) {
    const replacement = scenario === "sender" ? await (async () => {
      const other = privateKeyToAccount(`0x${"2".repeat(64)}`);
      const serialized = await other.signTransaction({ ...originalTerms, maxFeePerGas: 200n });
      return { serialized, transaction: { ...parseTransaction(serialized), input: parseTransaction(serialized).data, from: other.address, hash: keccak256(serialized) } };
    })() : await sample({ maxFeePerGas: 200n, ...(scenario === "cancelled" ? { to: account.address, data: "0x" } : {}), ...(scenario === "nonce" ? { nonce: 8 } : {}), ...(scenario === "chain" ? { chainId: 11155111 } : {}) });
    const adapter = new ChainAdapter({ mode: "local", chainId: 31337, rpcUrl: "http://127.0.0.1:8561", feeStrip } as any) as any;
    adapter.validate = async () => {}; adapter.signer = async () => ({ account: account.address });
    adapter.client.getChainId = async () => 31337;
    adapter.client.getTransaction = async ({ hash }: any) => {
      // Simulate a browser restart: original is gone from the RPC mempool.
      if (hash === original.transaction.hash) throw new Error("Original dropped");
      return replacement.transaction;
    };
    adapter.client.getTransactionReceipt = async () => {
      if (scenario === "pending") throw new Error("Replacement not confirmed");
      return { transactionHash: replacement.transaction.hash, status: "success", blockNumber: 100n, blockHash: `0x${"3".repeat(64)}` };
    };
    adapter.client.getBlock = async () => ({ hash: `0x${(scenario === "orphaned" ? "4" : "3").repeat(64)}` });
    const result = adapter.reconcileReplacement(originalRow, replacement.transaction.hash);
    if (!["repriced", "cancelled"].includes(scenario)) { await expect(result).rejects.toThrow(); continue; }
    const rows = await result;
    expect(rows[0]).toMatchObject({ hash: original.transaction.hash, stage: "replaced", replacementHash: replacement.transaction.hash, replacementBlockNumber: "100", replacementBlockHash: `0x${"3".repeat(64)}` });
    expect(rows[1].stage).toBe("confirmed");
    if (scenario === "repriced") expect(rows[1].action).toEqual(originalRow.action);
    else { expect(rows[1].action).toBeUndefined(); expect(rows[1].label).toContain("different action"); }
  }
});

function browserStorage() {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const storage = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) } });
  return () => { if (previous) Object.defineProperty(globalThis, "localStorage", previous); else Reflect.deleteProperty(globalThis, "localStorage"); };
}

test("a later reorg after successful cancellation reconciliation restores the original guard before another payment signature", async () => {
  for (const failure of ["orphaned", "missing"] as const) {
    const restore = browserStorage();
    try {
      const original = await sample(), replacement = await sample({ maxFeePerGas: 200n, to: account.address, data: "0x" });
      const originalRow = { stage: "pending", label: "Fund offer", account: account.address, chainId: 31337, feeStrip, hash: original.transaction.hash, signedTransaction: original.serialized, action: { type: "fundOffer", tokenId: "1", paymentMicros: "1000000" } } as any;
      const adapter = new ChainAdapter({ mode: "local", chainId: 31337, rpcUrl: "http://127.0.0.1:8561", feeStrip } as any) as any;
      let orphaned = false, signatures = 0;
      adapter.validate = async () => {}; adapter.signer = async () => ({ account: account.address, wallet: { sendTransaction: async () => { signatures++; } } });
      adapter.client.getChainId = async () => 31337;
      adapter.client.getTransaction = async () => replacement.transaction;
      adapter.client.getTransactionReceipt = async () => {
        if (orphaned && failure === "missing") throw new Error("Receipt no longer exists");
        return { transactionHash: replacement.transaction.hash, status: "success", blockNumber: 100n, blockHash: `0x${"3".repeat(64)}` };
      };
      adapter.client.getBlock = async () => ({ hash: `0x${(orphaned ? "4" : "3").repeat(64)}` });
      for (const row of await adapter.reconcileReplacement(originalRow, replacement.transaction.hash)) saveReceipt(row);
      expect(readReceipts().find((row) => row.hash === originalRow.hash)?.stage).toBe("replaced");
      // The prior check succeeded. Only now does the chain discard its block.
      orphaned = true;
      const emitted: any[] = []; adapter.subscribeProgress((row: any) => emitted.push(row));
      await expect(adapter.execute({ ...originalRow.action, tokenId: "2", reviewedAccount: account.address })).rejects.toThrow("No new transaction was requested");
      expect(signatures).toBe(0);
      expect(emitted.some((row) => row.stage === "signature")).toBe(false);
      expect(readReceipts().find((row) => row.hash === originalRow.hash)).toMatchObject({ stage: "pending", action: originalRow.action, replacementBlockNumber: "100" });
      expect(readReceipts().find((row) => row.hash === replacement.transaction.hash)?.stage).toBe("pending");
    } finally { restore(); }
  }
});

test("public replacements require finality and are checked afresh even after successful finalized reconciliation", async () => {
  const restore = browserStorage();
  try {
    const original = await sample(), replacement = await sample({ maxFeePerGas: 200n, to: account.address, data: "0x" });
    const originalRow = { stage: "pending", label: "Fund offer", account: account.address, chainId: 31337, feeStrip, hash: original.transaction.hash, signedTransaction: original.serialized } as any;
    const adapter = new ChainAdapter({ mode: "testnet", chainId: 31337, rpcUrl: "http://127.0.0.1:8561", feeStrip } as any) as any;
    let finalized = 99n, forkDuringFinality = false, sawFinalized = false;
    adapter.validate = async () => {}; adapter.signer = async () => ({ account: account.address });
    adapter.client.getChainId = async () => 31337; adapter.client.getTransaction = async () => replacement.transaction;
    adapter.client.getTransactionReceipt = async () => ({ transactionHash: replacement.transaction.hash, status: "success", blockNumber: 100n, blockHash: `0x${"3".repeat(64)}` });
    adapter.client.getBlock = async ({ blockTag }: any) => {
      if (blockTag === "finalized") sawFinalized = true;
      return { number: blockTag === "finalized" ? finalized : 100n, hash: `0x${(forkDuringFinality && sawFinalized && blockTag !== "finalized" ? "4" : "3").repeat(64)}` };
    };
    await expect(adapter.reconcileReplacement(originalRow, replacement.transaction.hash)).rejects.toThrow("confirmed but not finalized");
    finalized = 101n;
    forkDuringFinality = true; sawFinalized = false;
    await expect(adapter.reconcileReplacement(originalRow, replacement.transaction.hash)).rejects.toThrow("block changed while finality was checked");
    forkDuringFinality = false;
    for (const row of await adapter.reconcileReplacement(originalRow, replacement.transaction.hash)) saveReceipt(row);
    await expect(adapter.checkReceiptGuards(account.address)).resolves.toBeUndefined();
    // Even an inconsistent provider that retreats finality cannot reuse stored clearance.
    finalized = 99n;
    await expect(adapter.execute({ type: "fundOffer", tokenId: "2", reviewedAccount: account.address })).rejects.toThrow("not finalized");
    expect(readReceipts().find((row) => row.hash === originalRow.hash)?.stage).toBe("pending");
    finalized = 101n;
    for (const row of await adapter.reconcileReplacement(originalRow, replacement.transaction.hash)) saveReceipt(row);
    expect(readReceipts().find((row) => row.hash === originalRow.hash)?.replacementFinalizedBlockNumber).toBe("101");
    // Authenticated finalized public guards can age out with completed history;
    // otherwise accumulated cancellations would permanently exhaust capacity.
    for (let i = 0; i < 30; i++) saveReceipt({ ...originalRow, stage: "confirmed", hash: `0x${i.toString(16).padStart(64, "0")}` });
    expect(readReceipts()).toHaveLength(20);
    expect(readReceipts().find((row) => row.hash === originalRow.hash)).toBeUndefined();
  } finally { restore(); }
});

test("unresolved receipts survive other wallets' history and tracking capacity fails closed without eviction", async () => {
  const restore = browserStorage();
  try {
    const pending = { stage: "pending", label: "Fund offer", account: account.address, chainId: 31337, feeStrip, hash: `0x${"9".repeat(64)}` } as any;
    saveReceipt(pending);
    for (let i = 0; i < 30; i++) saveReceipt({ ...pending, account: feeStrip, chainId: 11155111, stage: "confirmed", hash: `0x${i.toString(16).padStart(64, "0")}` });
    expect(readReceipts()).toHaveLength(21);
    expect(readReceipts().find((row) => row.hash === pending.hash)?.stage).toBe("pending");
    for (let i = 1; i < MAX_RECEIPT_GUARDS; i++) saveReceipt({ ...pending, hash: `0x${(i + 100).toString(16).padStart(64, "0")}` });
    const adapter = new ChainAdapter({ mode: "local", chainId: 31337, rpcUrl: "http://127.0.0.1:8561", feeStrip } as any) as any;
    adapter.validate = async () => {}; adapter.signer = async () => ({ account: account.address });
    await expect(adapter.execute({ type: "fundOffer", tokenId: "2", reviewedAccount: account.address })).rejects.toThrow("receipt tracking limit");
    expect(readReceipts().filter((row) => row.stage === "pending")).toHaveLength(MAX_RECEIPT_GUARDS);
    expect(readReceipts().find((row) => row.hash === pending.hash)?.stage).toBe("pending");
  } finally { restore(); }
});

test("identical call fields with an EIP-7702 authorization are never labelled completion of the original action", async () => {
  const original = await sample();
  const authorization = await account.signAuthorization({ contractAddress: feeStrip, chainId: 31337, nonce: 8 });
  const replacement = await sample({ type: "eip7702", maxFeePerGas: 200n, authorizationList: [authorization] });
  const originalRow = { stage: "pending", label: "Fund offer", account: account.address, chainId: 31337, feeStrip, hash: original.transaction.hash, signedTransaction: original.serialized, action: { type: "fundOffer", tokenId: "1" } } as any;
  const adapter = new ChainAdapter({ mode: "local", chainId: 31337, rpcUrl: "http://127.0.0.1:8561", feeStrip } as any) as any;
  adapter.validate = async () => {}; adapter.signer = async () => ({ account: account.address });
  adapter.client.getChainId = async () => 31337; adapter.client.getTransaction = async () => replacement.transaction;
  adapter.client.getTransactionReceipt = async () => ({ transactionHash: replacement.transaction.hash, status: "success", blockNumber: 100n, blockHash: `0x${"3".repeat(64)}` });
  adapter.client.getBlock = async () => ({ hash: `0x${"3".repeat(64)}` });
  const rows = await adapter.reconcileReplacement(originalRow, replacement.transaction.hash);
  expect(rows[1].action).toBeUndefined();
  expect(rows[1].label).toContain("different action");
});
