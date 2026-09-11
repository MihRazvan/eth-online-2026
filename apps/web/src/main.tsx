import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { FixtureAdapter } from "./fixtureAdapter";
import "./styles.css";
// The integration owner supplies a viem-backed FeeStripAdapter here once deployment
// addresses and canonical chain evidence are available. The default is explicitly a fixture.
const adapter = new FixtureAdapter();
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App adapter={adapter} />
  </React.StrictMode>,
);
