import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./chain-tests",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  timeout: 180000,
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:4175",
    browserName: "chromium",
    viewport: { width: 1440, height: 1100 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command:
      "node ../../node_modules/vite/bin/vite.js --host 127.0.0.1 --port 4175",
    url: "http://127.0.0.1:4175",
    reuseExistingServer: !process.env.CI,
    env: { VITE_DATA_MODE: "local", VITE_ENABLE_TEST_WALLET: "true" },
  },
});
