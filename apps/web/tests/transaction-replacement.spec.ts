import { test, expect } from "@playwright/test";
import { keccak256, parseTransaction, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { ChainAdapter } from "../src/chainAdapter";
import { transactionIdentity } from "../src/transactionIdentity";

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
    expect(rows[0]).toMatchObject({ hash: original.transaction.hash, stage: "replaced", replacementHash: replacement.transaction.hash });
    expect(rows[1].stage).toBe("confirmed");
    if (scenario === "repriced") expect(rows[1].action).toEqual(originalRow.action);
    else { expect(rows[1].action).toBeUndefined(); expect(rows[1].label).toContain("different action"); }
  }
});
