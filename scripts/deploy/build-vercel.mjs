import { build } from "vite";
import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const root = fileURLToPath(new URL("../../", import.meta.url));
const app = resolve(root, "apps/web");
const output = resolve(root, "dist/vercel");
const manifest = JSON.parse(await readFile(resolve(root, "deployments/sepolia.json"), "utf8"));
if (manifest.mode !== "testnet" || manifest.chainId !== 11155111 || manifest.actors)
  throw new Error("The public build requires the committed Sepolia manifest without test actors.");
const rpc = new URL(manifest.rpcUrl);
if (rpc.href !== "https://ethereum-sepolia-rpc.publicnode.com/")
  throw new Error("The public build requires its credential-free Sepolia RPC.");

await build({
  root: app,
  envDir: false,
  publicDir: false,
  define: {
    "import.meta.env.VITE_DATA_MODE": JSON.stringify("testnet"),
    "import.meta.env.VITE_ENABLE_TEST_WALLET": JSON.stringify("false"),
  },
  build: { outDir: output, emptyOutDir: true, sourcemap: false },
});

// Only reviewed static assets are published. Local manifests, witnesses and
// environment files never participate in this build, even in a seeded checkout.
for (const directory of ["brand", "fonts"])
  await cp(resolve(app, "public", directory), resolve(output, directory), { recursive: true });
await mkdir(output, { recursive: true });
await writeFile(resolve(output, "deployment.json"), JSON.stringify(manifest, null, 2) + "\n");
console.log("Public Sepolia build ready in dist/vercel; fixture wallets disabled.");
