import { defineConfig } from "@playwright/test";
const webPort = Number(process.env.FEESTRIP_TEST_WEB_PORT ?? 4175);
const recoveryPort = Number(process.env.FEESTRIP_TEST_RECOVERY_PORT ?? 8788);
for (const port of [webPort, recoveryPort]) {
  if (!Number.isInteger(port) || port < 1024 || port > 65535)
    throw new Error("Browser test ports must be integers between 1024 and 65535.");
}
export default defineConfig({
  testDir: "./chain-tests",
  outputDir: "./test-results/chain",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  timeout: 180000,
  reporter: [["list"]],
  use: {
    baseURL: `http://127.0.0.1:${webPort}`,
    browserName: "chromium",
    viewport: { width: 1440, height: 1100 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command:
      `node ../../node_modules/vite/bin/vite.js --host 127.0.0.1 --port ${webPort} --strictPort`,
    url: `http://127.0.0.1:${webPort}`,
    reuseExistingServer: !process.env.CI,
    env: {
      VITE_DATA_MODE: "local", VITE_ENABLE_TEST_WALLET: "true",
      FEESTRIP_RECOVERY_ORIGIN: `http://127.0.0.1:${recoveryPort}`,
    },
  },
});
