import type { RecoveryObservation, RecoveryResult } from "./types";
export interface RecoveryScope {
  chainId: number;
  feeStrip: string;
  verifier: string;
  manager: string;
  seriesId: string;
  endBlock: string;
}
const hash = (v: unknown) =>
  typeof v === "string" && /^0x[0-9a-fA-F]{64}$/.test(v);
const decimal = (v: unknown) =>
  (typeof v === "string" && /^(0|[1-9][0-9]*)$/.test(v)) ||
  (typeof v === "number" && Number.isSafeInteger(v) && v >= 0);
const same = (a: unknown, b: string) =>
  typeof a === "string" && a.toLowerCase() === b.toLowerCase();
export function validateRecovery(
  value: unknown,
  expected: RecoveryScope,
  now = Date.now(),
): RecoveryResult {
  if (!value || typeof value !== "object")
    throw new Error(
      "Recovery response is malformed. No artifact was accepted.",
    );
  const x = value as RecoveryObservation;
  if (
    !decimal(x.chainId) ||
    BigInt(x.chainId) !== BigInt(expected.chainId) ||
    x.seriesId !== expected.seriesId ||
    !decimal(x.endBlock) ||
    BigInt(x.endBlock) !== BigInt(expected.endBlock) ||
    !same(x.feeStrip, expected.feeStrip) ||
    !same(x.verifier, expected.verifier) ||
    !same(x.manager, expected.manager)
  )
    throw new Error(
      "Recovery scope mismatch. The service does not match this chain, FeeStrip deployment and exact series endpoint.",
    );
  if (
    x.schemaVersion !== 1 ||
    x.allocationAuthority !== "contract-only" ||
    ![
      "scheduled",
      "retained",
      "unavailable",
      "orphaned",
      "cached-onchain",
      "not-required",
    ].includes(x.state) ||
    !["active", "matured", "captured", "allocated", "closed"].includes(
      x.lifecycle,
    ) ||
    !Number.isSafeInteger(x.copies) ||
    x.copies < 0 ||
    x.copies > 2 ||
    (x.artifactDigest !== null && !/^[0-9a-f]{64}$/.test(x.artifactDigest)) ||
    !Number.isSafeInteger(x.updatedAt) ||
    x.updatedAt < 0 ||
    x.updatedAt > 8640000000000000 ||
    (x.lastObservedAt !== null &&
      (!Number.isSafeInteger(x.lastObservedAt) ||
        x.lastObservedAt < 0 ||
        x.lastObservedAt > 8640000000000000)) ||
    (x.lastObservedBlock !== null && !decimal(x.lastObservedBlock)) ||
    [x.endpointHash, x.checkpointHash, x.lastObservedHash].some(
      (v) => v !== null && !hash(v),
    ) ||
    [
      "finalized",
      "checkpointSaved",
      "growthCached",
      "finalityObserved",
      "discoveryComplete",
    ].some((k) => typeof x[k as keyof RecoveryObservation] !== "boolean") ||
    [x.observationError, x.error].some(
      (v) => v !== null && typeof v !== "string",
    ) ||
    typeof x.storageDescription !== "string"
  )
    throw new Error(
      "Recovery response is malformed. No artifact was accepted.",
    );
  if (
    (x.checkpointSaved &&
      (!x.checkpointHash || x.checkpointHash !== x.endpointHash)) ||
    (x.finalized && !x.endpointHash) ||
    (x.state === "retained" && !x.artifactDigest) ||
    (x.artifactDigest !== null && !x.endpointHash)
  )
    throw new Error(
      "Recovery evidence is inconsistent. No artifact was accepted.",
    );
  return {
    status:
      x.observationError ||
      x.error ||
      !x.discoveryComplete ||
      x.lastObservedAt === null ||
      now - x.lastObservedAt > 120000 ||
      x.lastObservedAt > now + 30000
        ? "stale"
        : "observed",
    observation: x,
  };
}
export async function verifyArtifactDigest(json: string, digest: string) {
  if (new TextEncoder().encode(json).length > 2 * 1024 * 1024)
    throw new Error("Recovery artifact exceeds the supported size.");
  const actual = Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(json)),
    ),
    (b) => b.toString(16).padStart(2, "0"),
  ).join("");
  if (actual !== digest)
    throw new Error(
      "Recovery artifact digest mismatch. No artifact was accepted.",
    );
}
