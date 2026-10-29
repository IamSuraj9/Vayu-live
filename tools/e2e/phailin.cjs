const { chromium } = require('playwright');
(async () => {
  const [out, ...files] = process.argv.slice(2);
  const b = await chromium.launch(); const errs = [];
  for (const [i, file] of files.entries()) {
    const p = await b.newPage({ viewport: { width: 1440, height: 900 }, locale: 'en-IN', timezoneId: 'Asia/Kolkata' });
    p.on('pageerror', e => errs.push(`v${i + 1} ` + e.message));
    await p.goto('file://' + file); await p.waitForTimeout(2000);
    const tab = p.getByRole('tab', { name: /Past/ }); if (await tab.count()) await tab.click();
    await p.getByRole('button', { name: /Phailin/ }).first().click(); await p.waitForTimeout(5200);
    await p.screenshot({ path: `${out}/v${i + 1}-phailin.png` });
  }
  console.log('errors:', JSON.stringify(errs)); await b.close();
})().catch(e => { console.error('FAIL', e.message); process.exit(1) });
