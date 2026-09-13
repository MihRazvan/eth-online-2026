# Repository banner

`banner.png` is a 1920 × 400 Chromium render of [banner.html](banner.html), using the app’s local Anton and Space Mono fonts, dark/blue palette and deterministic code-native citrus geometry. The illustration is ornamental, not a chart or token balance. No generated raster artwork or third-party image is used.

Font provenance and licenses remain in [the application font directory](../../apps/web/public/fonts). To regenerate after installing repository dependencies and Playwright Chromium, run from the repository root:

```sh
node --input-type=module <<'JS'
import {chromium} from '@playwright/test';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
const browser = await chromium.launch();
const page = await browser.newPage({viewport: {width: 1920, height: 400}});
await page.goto(pathToFileURL(resolve('docs/assets/banner.html')).href);
await page.evaluate(() => document.fonts.ready);
await page.screenshot({path: 'docs/assets/banner.png'});
await browser.close();
JS
```
