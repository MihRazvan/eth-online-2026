import { test, expect, type Page } from '@playwright/test';
async function mount(page: Page, available = true) {
 await page.goto('/');
 await page.evaluate(async available => {
  const [{ListingEstimate},{default:React},{default:{createRoot}}]=await Promise.all([import('/src/components/ListingEstimate.tsx'),import('/node_modules/.vite/deps/react.js'),import('/node_modules/.vite/deps/react-dom_client.js')]);
  const node=document.createElement('div');document.body.replaceChildren(node);(window as any).estimateUsed=null;
  const history=available?{status:'available',positionCommitment:'0x'+'1'.repeat(64),sampleUsdcMicros:3000000n,durationSeconds:3600n,source:{fromBlock:100n,toBlock:400n}}:{status:'unavailable',code:'HISTORY_UNAVAILABLE'};
  createRoot(node).render(React.createElement(ListingEstimate,{tokenId:'42',commitment:'0x'+'1'.repeat(64),endBlock:'1100',currentBlock:'1000',percentage:'25',estimateFees:async()=>history,onUse:(v:string)=>{(window as any).estimateUsed=v;}}));
 },available);
}
test('observed fee model prices only the offered share and requires explicit use',async({page})=>{
 await mount(page);const panel=page.getByRole('region',{name:'Window fee estimate'});
 await expect(panel.locator('.estval')).toHaveText('0.212500 USDC');
 expect(await page.evaluate(()=>(window as any).estimateUsed)).toBe(null);
 await panel.getByRole('button',{name:'Use estimate'}).click();
 expect(await page.evaluate(()=>(window as any).estimateUsed)).toBe('0.212500');
 await panel.locator('summary').click();
 await panel.getByLabel('Assumed whole-window fees (USDC)').fill('4');
 await expect(panel.locator('.estval')).toHaveText('0.850000 USDC');
 expect(await page.evaluate(()=>(window as any).estimateUsed)).toBe('0.212500');
 await panel.getByLabel('Asking discount (%)').fill('20');
 await expect(panel.locator('.estval')).toHaveText('0.800000 USDC');
 await panel.getByRole('button',{name:'Use estimate'}).click();
 expect(await page.evaluate(()=>(window as any).estimateUsed)).toBe('0.800000');
 await expect(panel).toContainText('Continuous liquidity history is unverified');
});
test('unavailable history has no zero forecast and accepts only explicit valid assumptions',async({page})=>{
 await mount(page,false);const panel=page.getByRole('region',{name:'Window fee estimate'});
 await expect(panel.locator('.estval')).toHaveText('— USDC');
 await expect(panel.getByRole('button',{name:'Use estimate'})).toBeDisabled();
 const field=panel.getByLabel('Assumed whole-window fees (USDC)');await field.fill('1');
 await expect(panel.locator('.estval')).toHaveText('0.212500 USDC');
 await field.fill('0');await expect(panel.locator('.estval')).toHaveText('0.000000 USDC');
 await expect(panel.getByRole('button',{name:'Use estimate'})).toBeDisabled();
 await field.fill('-1');await expect(panel.locator('.estval')).toHaveText('— USDC');
 await field.fill('1');await panel.getByLabel('Asking discount (%)').fill('99');
 await expect(panel.getByRole('button',{name:'Use estimate'})).toBeDisabled();
});
