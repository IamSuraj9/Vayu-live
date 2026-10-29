const { chromium } = require('playwright');
(async () => {
  const [file, out] = process.argv.slice(2);
  const b = await chromium.launch();
  const errs = [];
  const p = await b.newPage({ viewport: { width: 1440, height: 900 }, locale: 'en-IN', timezoneId: 'Asia/Kolkata' });
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text()) });
  p.on('pageerror', e => errs.push('PAGEERR ' + e.message));
  await p.goto('file://' + file); await p.waitForTimeout(2200);
  // zoom in via button: grab mid-animation frames, crop the rim on the right side of the globe
  await p.getByRole('button', { name: 'Zoom in' }).click();
  for (const t of [60, 140, 240]) { await p.waitForTimeout(t === 60 ? 60 : 90); await p.screenshot({ path: `${out}/zoom-${t}.png`, clip: { x: 980, y: 250, width: 340, height: 400 } }) }
  await p.waitForTimeout(700); await p.screenshot({ path: `${out}/zoom-end.png` });
  // mouse-wheel notches glide
  await p.mouse.move(720, 450); await p.mouse.wheel(0, 240); await p.waitForTimeout(80);
  await p.screenshot({ path: `${out}/wheel-mid.png` }); await p.waitForTimeout(600);
  // drag and flick: the globe should keep coasting after release
  await p.mouse.move(600, 450); await p.mouse.down();
  for (let i = 1; i <= 6; i++) { await p.mouse.move(600 + i * 40, 450); await p.waitForTimeout(12) }
  await p.mouse.up();
  const v0 = await p.evaluate(() => document.querySelector('[data-storm="io022026"]')?.getBoundingClientRect().left);
  await p.waitForTimeout(250);
  const v1 = await p.evaluate(() => document.querySelector('[data-storm="io022026"]')?.getBoundingClientRect().left);
  await p.waitForTimeout(900);
  const v2 = await p.evaluate(() => document.querySelector('[data-storm="io022026"]')?.getBoundingClientRect().left);
  console.log('fling marker x after release:', Math.round(v0), '-> +250ms', Math.round(v1), '-> +1150ms', Math.round(v2));
  // select a storm: panel enters, camera springs
  await p.locator('aside').getByRole('button', { name: /^In-fa/ }).click(); await p.waitForTimeout(120);
  await p.screenshot({ path: `${out}/select-mid.png` }); await p.waitForTimeout(1100);
  await p.screenshot({ path: `${out}/select-end.png` });
  await p.getByRole('tab', { name: /Past/ }).click(); await p.waitForTimeout(150);
  await p.screenshot({ path: `${out}/tabs-mid.png`, clip: { x: 16, y: 110, width: 340, height: 60 } });
  await p.getByRole('button', { name: /Fani/ }).first().click(); await p.waitForTimeout(2500);
  await p.screenshot({ path: `${out}/replay.png` });
  console.log('errors:', JSON.stringify(errs.slice(0, 10)));
  await b.close();
})().catch(e => { console.error('FAIL', e.message); process.exit(1) });
