import React from "react";
import { createRoot } from "react-dom/client";
import type { EIP1193Provider } from "viem";
import { App } from "./App";
import { IntroGate } from "./components/IntroGate";
import { FixtureAdapter } from "./fixtureAdapter";
import type { FeeStripAdapter } from "./types";
import "./styles.css";
import "./fonts.css";
const root = createRoot(document.getElementById("root")!);
function Bootstrap({ error }: { error?: string }) {
  return (
    <div className="app">
      <div className="titlebar">
        <span className="path">usufruct.exe — /</span>
      </div>
      <main id="main-content">
        <section className="loading-state" aria-busy={!error}>
          <p className="tele">usufruct · network configuration</p>
          <h1 className="display">
            {error ? "Chain connection unavailable" : "USUFRUCT"}
          </h1>
          {error ? (
            <>
              <p role="alert">{error}</p>
              <p>
                Your position data will appear once the connection is restored.
              </p>
              <button onClick={() => location.reload()}>
                Retry connection
              </button>
            </>
          ) : (
            <p role="status">Loading network configuration…</p>
          )}
        </section>
      </main>
    </div>
  );
}
// Render before loading the adapter, manifest or any RPC state.
root.render(
  <IntroGate>
    <Bootstrap />
  </IntroGate>,
);

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
    <IntroGate>
      <React.StrictMode>
        <App adapter={adapter} />
      </React.StrictMode>
    </IntroGate>,
  );
}
start().catch((error) =>
  root.render(
    <IntroGate>
      <Bootstrap error={(error as Error).message} />
    </IntroGate>,
  ),
);
