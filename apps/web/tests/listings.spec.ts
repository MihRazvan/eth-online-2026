import { test, expect } from "@playwright/test";
import { privateKeyToAccount } from "viem/accounts";
import type { Hex } from "viem";
import { listingId, listingTypedData, ORIGINAL_Q } from "../../../packages/listings/src/shared.mjs";
import { assertListingFunding, verifiedListing, readSellerListing, readListingDirectory } from "../src/listings";
import { pendingListing, pendingListingTerms, savePendingListing, clearPendingListing } from "../src/listingJournal";
import type { SellerListing, SellerListingTerms } from "../src/listingTypes";
import type { Action } from "../src/types";

// Deterministic unfunded test identities. No public wallet, RPC or transaction is used.
const seller = privateKeyToAccount(`0x${"11".repeat(32)}`);
const other = privateKeyToAccount(`0x${"22".repeat(32)}`);
const address = (byte: string) => `0x${byte.repeat(40)}` as Hex;
const hash = (n: number) => `0x${n.toString(16).padStart(64, "0")}` as Hex;
const scope = { chainId: 11155111, feeStrip: address("a"), positionManager: address("b"), usdc: address("c") };
const terms: SellerListingTerms = { schemaVersion: 1, ...scope, seller: seller.address, tokenId: "39216", positionCommitment: hash(100), originalSupply: ORIGINAL_Q.toString(), buyerQuantity: (ORIGINAL_Q / 2n).toString(), proceedsMicros: "12000000", endBlock: "12001000", deadlineTimestamp: "1800000000", nonce: hash(1) };
async function signed(value = terms): Promise<SellerListing> {
  return { terms: value, listingId: listingId(value), signature: await seller.signTypedData(listingTypedData(value)), status: "available" };
}
function localStorageFixture({ dropWrites = false } = {}) {
  const old = Object.getOwnPropertyDescriptor(globalThis, "localStorage"), values = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { if (!dropWrites) values.set(key, value); } } });
  return () => { if (old) Object.defineProperty(globalThis, "localStorage", old); else Reflect.deleteProperty(globalThis, "localStorage"); };
}

test("browser reload preserves the exact draft nonce and then the exact signed bytes, scoped to the original seller and deployment", async ({ page }) => {
  const listing = await signed();
  await page.goto("/brand/index.html");
  await page.evaluate(async value => { const path = "/src/listingJournal.ts"; (await import(path)).savePendingListing(value); }, terms);
  await page.reload();
  const draft = await page.evaluate(async id => { const path = "/src/listingJournal.ts"; return (await import(path)).pendingListing(id); }, listing.listingId);
  expect(draft).toEqual({ terms });
  await page.evaluate(async row => { const path = "/src/listingJournal.ts"; (await import(path)).savePendingListing(row.terms, row.signature); }, listing);
  await page.reload();
  const retained = await page.evaluate(async row => {
    const path = "/src/listingJournal.ts", journal = await import(path);
    return { row: journal.pendingListing(row.listingId), matching: journal.pendingListingTerms(row.terms.chainId, row.terms.feeStrip.toUpperCase(), row.terms.seller.toUpperCase()), wrongSeller: journal.pendingListingTerms(row.terms.chainId, row.terms.feeStrip, "0x" + "9".repeat(40)), wrongChain: journal.pendingListingTerms(1, row.terms.feeStrip, row.terms.seller), wrongDeployment: journal.pendingListingTerms(row.terms.chainId, "0x" + "8".repeat(40), row.terms.seller) };
  }, listing);
  expect(retained.row).toEqual({ terms, signature: listing.signature });
  expect(retained.matching).toEqual([terms]);
  expect(retained.wrongSeller).toEqual([]); expect(retained.wrongChain).toEqual([]); expect(retained.wrongDeployment).toEqual([]);
});

test("a lost publish response recovers the exact signed listing by GET without issuing a second publication", async ({ page }) => {
  const listing = await signed(), posts: unknown[] = [], gets: string[] = [];
  await page.route("**/api/listings**", async route => {
    const request = route.request();
    if (request.method() === "POST") { posts.push(request.postDataJSON()); await route.abort("connectionreset"); }
    else { gets.push(new URL(request.url()).searchParams.get("listingId") ?? ""); await route.fulfill({ json: { listing } }); }
  });
  await page.goto("/brand/index.html");
  await page.evaluate(async row => { const path = "/src/listingJournal.ts"; (await import(path)).savePendingListing(row.terms, row.signature); }, listing);
  await page.reload();
  const result = await page.evaluate(async data => {
    const journalPath = "/src/listingJournal.ts", apiPath = "/src/listings.ts";
    const journal = await import(journalPath), api = await import(apiPath), saved = journal.pendingListing(data.id);
    const published = await api.publishSellerListing(saved.terms, saved.signature, data.scope);
    return { published, retained: journal.pendingListing(data.id) };
  }, { id: listing.listingId, scope });
  expect(result.published).toEqual(listing);
  expect(result.retained).toEqual({ terms, signature: listing.signature });
  expect(posts).toEqual([{ operation: "publish", listing: { listingId: listing.listingId, terms, signature: listing.signature } }]);
  expect(gets).toEqual([listing.listingId]);
});

test("an unconfirmed publication keeps its signed draft through reload and retries the same ID, nonce and signature", async ({ page }) => {
  const listing = await signed(), posts: unknown[] = []; let recoverable = false;
  await page.route("**/api/listings**", async route => {
    if (route.request().method() === "POST") { posts.push(route.request().postDataJSON()); await route.abort("connectionreset"); }
    else if (recoverable) await route.fulfill({ json: { listing } });
    else await route.fulfill({ status: 503, json: { error: "unavailable" } });
  });
  await page.goto("/brand/index.html");
  await page.evaluate(async row => { const path = "/src/listingJournal.ts"; (await import(path)).savePendingListing(row.terms, row.signature); }, listing);
  const attempt = () => page.evaluate(async data => {
    const journalPath = "/src/listingJournal.ts", apiPath = "/src/listings.ts", journal = await import(journalPath), api = await import(apiPath);
    const saved = journal.pendingListing(data.id);
    try { return { published: await api.publishSellerListing(saved.terms, saved.signature, data.scope) }; }
    catch (error) { return { error: String(error), retained: journal.pendingListing(data.id) }; }
  }, { id: listing.listingId, scope });
  const failed = await attempt();
  expect(failed).toMatchObject({ error: expect.stringContaining("listing directory is unavailable"), retained: { terms, signature: listing.signature } });
  await page.reload(); recoverable = true;
  expect(await attempt()).toMatchObject({ published: listing });
  expect(posts).toHaveLength(2); expect(posts[1]).toEqual(posts[0]);
});

test("journal capacity never evicts an unresolved signed draft and forgetting one ID preserves the others", async () => {
  const restore = localStorageFixture();
  try {
    const first = await signed(); savePendingListing(first.terms, first.signature);
    for (let i = 2; i <= 20; i++) savePendingListing({ ...terms, nonce: hash(i) });
    expect(() => savePendingListing({ ...terms, nonce: hash(21) })).toThrow("Too many unfinished");
    expect(pendingListing(first.listingId)).toEqual({ terms, signature: first.signature });
    expect(pendingListingTerms(scope.chainId, scope.feeStrip, seller.address)).toHaveLength(20);
    // Updating this existing draft must still work when capacity is full.
    savePendingListing(first.terms, first.signature);
    clearPendingListing(listingId({ ...terms, nonce: hash(2) }).toUpperCase());
    savePendingListing({ ...terms, nonce: hash(21) });
    expect(pendingListing(first.listingId)?.signature).toBe(first.signature);
    expect(pendingListing(listingId({ ...terms, nonce: hash(2) }))).toBeUndefined();
    expect(pendingListingTerms(scope.chainId, scope.feeStrip, seller.address)).toHaveLength(20);
  } finally { restore(); }
});

test("silent storage failure is detected before a draft can be considered durable", () => {
  const restore = localStorageFixture({ dropWrites: true });
  try { expect(() => savePendingListing(terms)).toThrow("Enable browser storage"); expect(pendingListing(listingId(terms))).toBeUndefined(); }
  finally { restore(); }
});

test("browser verification rejects changed signed economics, wrong seller, wrong domain and unsupported status", async () => {
  const original = await signed(); expect(await verifiedListing(original, scope)).toEqual(original);
  for (const change of [{ proceedsMicros: "13000000" }, { buyerQuantity: "1" }, { endBlock: "12001001" }, { deadlineTimestamp: "1800000001" }, { positionCommitment: hash(101) }, { nonce: hash(99) }]) {
    const changed = { ...terms, ...change };
    await expect(verifiedListing({ ...original, terms: changed, listingId: listingId(changed) }, scope)).rejects.toThrow();
  }
  await expect(verifiedListing({ ...original, signature: await other.signTypedData(listingTypedData(terms)) }, scope)).rejects.toThrow("signer");
  for (const change of [{ chainId: 1 }, { feeStrip: address("d") }, { positionManager: address("e") }, { usdc: address("f") }]) await expect(verifiedListing(original, { ...scope, ...change })).rejects.toThrow("WRONG_SCOPE");
  await expect(verifiedListing({ ...original, status: "funded" }, scope)).rejects.toThrow();
});

test("funding must preserve every reviewed listing term and available state", async () => {
  const listing = await signed();
  const action: Extract<Action, { type: "fundOffer" }> = { type: "fundOffer", listingId: listing.listingId, tokenId: terms.tokenId, seller: terms.seller, positionCommitment: terms.positionCommitment, claims: terms.buyerQuantity, paymentMicros: terms.proceedsMicros, endBlock: terms.endBlock, deadlineTimestamp: terms.deadlineTimestamp };
  expect(() => assertListingFunding(listing, action)).not.toThrow();
  for (const patch of [{ listingId: hash(2) }, { listingId: undefined }, { tokenId: "39217" }, { seller: other.address }, { seller: undefined }, { positionCommitment: hash(2) }, { claims: "1" }, { paymentMicros: "11999999" }, { endBlock: "12001001" }, { deadlineTimestamp: "1800000001" }]) expect(() => assertListingFunding(listing, { ...action, ...patch })).toThrow("exact terms");
  for (const status of ["cancelled", "expired", "stale", "unavailable"] as const) expect(() => assertListingFunding({ ...listing, status }, action)).toThrow("no longer available");
});

test("a directory cannot substitute another valid listing for the requested ID or expose partial forged results", async () => {
  const originalFetch = globalThis.fetch, first = await signed(), second = await signed({ ...terms, nonce: hash(2) });
  try {
    globalThis.fetch = async () => Response.json({ listing: second });
    await expect(readSellerListing(first.listingId, scope)).rejects.toThrow("different listing");
    globalThis.fetch = async () => Response.json({ listings: [first, { ...second, signature: first.signature }] });
    expect(await readListingDirectory(scope)).toMatchObject({ status: "unavailable", listings: [] });
  } finally { globalThis.fetch = originalFetch; }
});
