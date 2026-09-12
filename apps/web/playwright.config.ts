import { defineConfig } from "@playwright/test";
const webPort = Number(process.env.FEESTRIP_TEST_WEB_PORT ?? 4174);
if (!Number.isInteger(webPort) || webPort < 1024 || webPort > 65535) throw new Error("Invalid browser test port");
export default defineConfig({
  testDir: "./tests",
  outputDir: "./test-results/fixtures",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: `http://127.0.0.1:${webPort}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command:
      `node ../../node_modules/vite/bin/vite.js --host 127.0.0.1 --port ${webPort} --strictPort`,
    url: `http://127.0.0.1:${webPort}`,
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    {
      name: "chromium",
      use: { browserName: "chromium", viewport: { width: 1440, height: 1000 } },
    },
  ],
});
