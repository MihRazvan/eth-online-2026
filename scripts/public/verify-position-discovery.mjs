import { chromium } from '@playwright/test';
import { writeFile, mkdir } from 'node:fs/promises';
// Read-only public-data browser regression; never a participant signing test.
await mkdir('.scratch/discovery', { recursive: true });
const base = process.env.DISCOVERY_BASE_URL ?? 'http://127.0.0.1:4198';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
await page.addInitScript(() => {
  const owner = '0x746bb7beFD31D9052BB8EbA7D5dD74C9aCf54C6d';
  window.__walletMethods = [];
  window.ethereum = {
    request: async ({ method }) => {
      window.__walletMethods.push(method);
      if (method === 'eth_requestAccounts' || method === 'eth_accounts') return [owner];
      if (method === 'eth_chainId') return '0xaa36a7';
      throw new Error('Read-only verification wallet rejects ' + method);
    },
    on: () => {}, removeListener: () => {},
  };
});
await page.goto(base + '/#pin');
await page.getByRole('button', { name: 'Connect wallet', exact: true }).first().click({ timeout: 30000 });
for (const id of ['39220', '39221', '39222']) await page.locator('.tree-options').getByText('#' + id, { exact: true }).waitFor({ timeout: 60000 });
await page.getByLabel('Missing a tree? NFT ID or Uniswap link').fill('https://app.uniswap.org/positions/v4/ethereum_sepolia/39221');
await page.getByRole('button', { name: 'Find position', exact: true }).click();
await page.getByText('Found position #39221.', { exact: false }).waitFor({ timeout: 60000 });
await page.screenshot({ path: '.scratch/discovery/desktop.png', fullPage: true });
await page.getByLabel('Missing a tree? NFT ID or Uniswap link').fill('39218');
await page.getByRole('button', { name: 'Find position', exact: true }).click();
await page.getByText('This position must contain the supported Sepolia USDC token.', { exact: true }).waitFor({ timeout: 30000 });
await page.setViewportSize({ width: 390, height: 844 });
await page.screenshot({ path: '.scratch/discovery/mobile.png', fullPage: true });
const result = await page.evaluate(() => ({
  tokenIds: [...document.querySelectorAll('.tree-option small')].map(el => el.textContent),
  horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
  walletMethods: window.__walletMethods,
  unsupportedPoolRejected: document.body.innerText.includes('This position must contain the supported Sepolia USDC token.'),
}));
await writeFile('.scratch/discovery/browser-result.json', JSON.stringify({ base, scope: 'Public RPC data with read-only account stub; no participant signing or transaction execution', errors, ...result }, null, 2));
console.log(JSON.stringify({ base, errors, ...result }));
await browser.close();
if (errors.length || result.horizontalOverflow) process.exitCode = 1;
