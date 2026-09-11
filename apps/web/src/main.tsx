import React from "react";
import { createRoot } from "react-dom/client";
import type { EIP1193Provider } from "viem";
import { App } from "./App";
import { FixtureAdapter } from "./fixtureAdapter";
import type { FeeStripAdapter } from "./types";
import "./styles.css";
import "./fonts.css";
const root = createRoot(document.getElementById("root")!);
async function start() {
  const mode = import.meta.env.VITE_DATA_MODE ?? "fixture";
  let adapter: FeeStripAdapter;
  if (mode === "fixture") adapter = new FixtureAdapter();
  else if (mode === "local" || mode === "testnet") {
    const { ChainAdapter } = await import("./chainAdapter");
    const provider = (window as Window & { ethereum?: EIP1193Provider })
      .ethereum;
    const testActor =
      new URLSearchParams(location.search).get("wallet") ?? undefined;
    adapter = await ChainAdapter.fromDeployment("/deployment.json", {
      provider,
      enableTestWallet: import.meta.env.VITE_ENABLE_TEST_WALLET === "true",
      testActor,
    });
    if (adapter.mode !== mode)
      throw new Error(
        "Deployment mode does not match the configured application mode.",
      );
  } else
    throw new Error(
      "Unknown VITE_DATA_MODE. Choose fixture, local or testnet.",
    );
  root.render(
    <React.StrictMode>
      <App adapter={adapter} />
    </React.StrictMode>,
  );
}
start().catch((error) =>
  root.render(
    <main className="loading">
      <h1>Chain connection unavailable</h1>
      <p role="alert">{(error as Error).message}</p>
      <p>
        Onchain mode never substitutes fixtures for a missing deployment or
        provider.
      </p>
      <button onClick={() => location.reload()}>Retry connection</button>
    </main>,
  ),
);
