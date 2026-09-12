# Independent proof replication

`OffhostReplica` copies authenticated retained proofs to a private S3-compatible bucket. It establishes an additional storage service dependency; two local directories alone do not establish an independent failure domain. This module does not deploy a bucket, sign transactions, establish chain canonicality, or authorize allocation.

## Integration

```js
const remote = new S3Remote({
  endpoint, bucket, region, accessKeyId, secretAccessKey,
  forcePathStyle: false,
});
const replica = new OffhostReplica({store, scope: worker.scope, remote});
await worker.tick();
await replica.tick();
const durability = replica.publicStatus();
```

Supply S3 credentials through the host's secret configuration. `S3Remote` uses the official AWS SDK, requires HTTPS, uses virtual-host addressing by default and performs signed requests. HTTP is permitted only for loopback endpoints with `allowHttpForTests: true`. Requests have a timeout and downloaded objects are limited to 2 MiB while streaming. Each replication tick checks at most four proofs by default (maximum eight), with separately leased tracking tables. Network waits do not hold SQLite transactions.

A write/read probe runs even when no sale exists. Each proof is authenticated from its actual bytes against `expectedFor(currentJob.terms)` and the independently observed endpoint hash. Publication writes the content-addressed object, reads back identical bytes, then writes and reads back its deterministic pointer. Only after both roundtrips does local tracking mark that job verified. Probe and proof observations expire after two minutes by default. Every process restart requires fresh roundtrips, since configured bucket access may have changed. Readiness requires a fresh successful probe and verified copies of all current due proofs; missing local proofs remain pending. This is durability status, separate from chain observation, checkpoint and keeper health.

Keys include chain, FeeStrip deployment, deployment identity hash, series, activation hash, endpoint hash and canonical job key. The immutable object suffix is the SHA256 of exact stored bytes. Separate endpoint or activation histories use separate pointers. Old objects are retained; there is no deletion or remote versioning requirement.

## Recovery after complete local loss

Recreate the local store and rediscover canonical series from the chain using the same deployment configuration. The worker's acquisition dependency can first call:

```js
const artifact = await replica.restore(currentJob, {
  endpointHash: independentlyObservedBlockNHash,
});
```

`restore` returns an authenticated public artifact and does not acquire a competing worker lease or write job state. It uses the newly rediscovered job to derive the pointer key, requires a fresh explicit canonical endpoint hash when the job has none, verifies object digest, and reruns the real witness validator using locally derived expected chain, manager code and slot pins. Remote `expected` or `validated` metadata has no authority. Pointer-only integrity or SHA256 alone is insufficient. A changed current job or retained endpoint during validation is rejected.

The acquisition wrapper must pass the restored artifact through the existing worker flow. The worker rechecks endpoint/activation canonicality against its coherent chain observation before staging and declaring retention. Only a caller with an independently anchored endpoint may use the explicit hash override; the remote pointer cannot supply that anchor. If restoration fails, the wrapper may try ordinary RPC acquisition. Neither restoration nor replication removes the need to save the onchain endpoint checkpoint inside its block window.

## Verification scope

`test/offhost.test.mjs` uses the genuine retained Sepolia witness and the existing Python MPT/ABI validator to exercise total database/filesystem loss, remote-only restoration, corrupted pointers and bytes, self-consistent malicious digests, replayed activation/endpoint data and in-flight orphaning. A separate loopback HTTP server exercises actual AWS SigV4 requests, byte readback and streaming size limits. These are local component tests, not proof of an operated external bucket or public sale recovery.

Run after installing the repository's witness Python requirements and selecting its interpreter:

```sh
FEESTRIP_PROOF_PYTHON=/path/to/venv/bin/python node --test packages/settlement/test/offhost.test.mjs
```

The bucket operator must separately verify actual signed write/read access, permissions and service independence. Remote availability is observed, not guaranteed. Object-store lifecycle deletion policies can invalidate later recovery; the module detects failed readbacks rather than claiming permanent retention.
