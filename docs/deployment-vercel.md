# Vercel deployment

Project: **usufruct**, workspace: **mihrazvans-projects**. The repository root is the Vercel root. Node 24 and pnpm 12.3.4 are used; build settings live in `vercel.json`.

Live frontend: **https://usufruct-mu.vercel.app**. GitHub repository `MihRazvan/eth-online-2026` is connected for automatic deployment from `main`. Initial production deployment: `dpl_FgLUKkoSa7LVTryiJaDZ83cKaxhn`, source commit `0d5398e`. [Public browser evidence](evidence/vercel/browser-smoke.json) records unauthenticated desktop/mobile checks, all three routes, brand assets, the authentic Sepolia manifest, and rejected test-wallet injection.

`pnpm build:vercel` type-checks the application and produces `dist/vercel`. It always builds the Sepolia application with unlocked test wallets disabled, reads the committed `deployments/sepolia.json`, and copies only the brand/font directories as public assets. Local Vite environment files, generated development manifests and witness files are excluded. The existing `apps/web/dist` preview is unaffected.

The browser reads Sepolia through the credential-free public RPC in the manifest. No private key, deployer key, Alchemy credential or wallet seed belongs in Vercel environment variables. Users sign with their own injected Ethereum wallet.

## Publish

With an authenticated Vercel CLI:

```sh
vercel link --yes --project usufruct --scope mihrazvans-projects
vercel deploy --dry --json --scope mihrazvans-projects
vercel deploy --prod --yes --scope mihrazvans-projects
```

Inspect the dry-run file list before publishing from a new checkout. `.vercelignore` excludes environment files, local state, chain artifacts and research/evidence directories from source uploads. Local Vercel linking may create an ignored `.env.local` containing a short-lived Vercel token; the public build does not read it.

## Service boundary

This deployment hosts the frontend and its public contract manifest. The durable historical-proof retention worker and Graph analysis service remain separate processes. Their loopback development proxies are not production endpoints. Without a separately hosted service, the application reports recovery/analysis as unavailable; it must not substitute fixture data or trusted-server fee allocation. Verified onchain cache recovery remains an independent contract path.

Public sale/settlement and participant-wallet acceptance remain separate validation gates. The disconnected public orchard is currently empty until an actual funded offer is accepted. The identity folio is available at `/brand/index.html`.

Configuration references: [Vercel project configuration](https://vercel.com/docs/project-configuration/vercel-json), [CLI deployments](https://vercel.com/docs/cli/deploy), [package managers](https://vercel.com/docs/package-managers).
