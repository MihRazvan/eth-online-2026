import { keccak256, parseTransaction, recoverTransactionAddress, serializeTransaction, type Hex, type Transaction, type TransactionSerialized } from "viem";

const signedBytes = (value: unknown): value is Hex => typeof value === "string" && value.length <= 262146 && /^0x(?:[0-9a-fA-F]{2})+$/.test(value);
/** Retain public signed bytes, so local-storage nonce edits cannot authenticate a replacement. */
export function serializePublicTransaction(transaction: Transaction): Hex {
  return serializeTransaction({ ...transaction, data: transaction.input } as Parameters<typeof serializeTransaction>[0], {
    r: transaction.r, s: transaction.s, v: transaction.v, yParity: transaction.yParity,
  });
}
export async function transactionIdentity(serialized: unknown, expected: { hash: string; account: string; chainId: number }) {
  if (!signedBytes(serialized) || keccak256(serialized).toLowerCase() !== expected.hash.toLowerCase()) throw new Error("Original transaction bytes do not match its broadcast hash. Replacement could not be authenticated.");
  const transaction = parseTransaction(serialized as TransactionSerialized);
  const sender = await recoverTransactionAddress({ serializedTransaction: serialized as TransactionSerialized });
  if (sender.toLowerCase() !== expected.account.toLowerCase() || transaction.chainId !== expected.chainId || !Number.isSafeInteger(transaction.nonce) || transaction.nonce! < 0) throw new Error("Signed transaction sender, nonce or chain does not match this receipt.");
  return { sender, nonce: transaction.nonce!, type: transaction.type, to: transaction.to?.toLowerCase() ?? null, value: transaction.value ?? 0n, data: (transaction.data ?? "0x").toLowerCase(), serialized };
}
