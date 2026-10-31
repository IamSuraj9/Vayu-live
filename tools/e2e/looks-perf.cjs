// How heavy is each look? Long tasks after switching, and frame rate at rest and while dragging.
//   node tools/e2e/looks-perf.cjs http://localhost:4173/   (CPU slowed 4x to stand in for a mid-range phone)
const { chromium } = require('playwright');
(async () => {
  const url = process.argv[2];
  const b = await chromium.launch({ ignoreDefaultArgs: ['--hide-scrollbars'] });
  for (const [label, vp, dpr, slow, touch] of [['desktop', { width: 1440, height: 900 }, 1, 1, false], ['phone, CPU 4x slower', { width: 390, height: 800 }, 2, 4, true]]) {
    const ctx = await b.newContext({ viewport: vp, deviceScaleFactor: dpr, isMobile: touch, hasTouch: touch });
    const p = await ctx.newPage();
    const cdp = await ctx.newCDPSession(p);
    if (slow > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: slow });
    await p.addInitScript(() => {
      window.__long = 0; window.__frames = 0;
      new PerformanceObserver(l => { for (const e of l.getEntries()) window.__long += e.duration }).observe({ entryTypes: ['longtask'] });
      const f = () => { window.__frames++; requestAnimationFrame(f) }; requestAnimationFrame(f);
    });
    await p.goto(url); await p.waitForTimeout(5000);
    await p.getByRole('button', { name: /^Customize the globe/ }).click(); await p.waitForTimeout(900);
    console.log(`\n== ${label}`);
    console.log('look      long-tasks after switching   fps at rest   fps while dragging');
    for (const id of ['Ink', 'Night', 'Dots', 'Chart', 'Relief', 'Bands', 'Ribbons', 'Heat']) {
      await p.evaluate(() => { window.__long = 0 });
      await p.getByRole('button', { name: new RegExp(`^${id} look`) }).click();
      await p.waitForTimeout(3500);
      const long = await p.evaluate(() => Math.round(window.__long));
      await p.evaluate(() => { window.__frames = 0 }); await p.waitForTimeout(2000);
      const rest = (await p.evaluate(() => window.__frames)) / 2;
      // drag the globe
      const box = { x: vp.width * 0.5, y: vp.height * 0.45 };
      await p.mouse.move(box.x, box.y); await p.mouse.down();
      await p.evaluate(() => { window.__frames = 0 });
      for (let i = 0; i < 40; i++) { await p.mouse.move(box.x + i * 4, box.y + i, { steps: 1 }); await p.waitForTimeout(25) }
      const drag = (await p.evaluate(() => window.__frames)) / 1.0;
      await p.mouse.up(); await p.waitForTimeout(600);
      console.log(`${id.padEnd(9)} ${String(long + ' ms').padEnd(28)} ${String(rest.toFixed(0)).padEnd(13)} ${(drag).toFixed(0)}`);
    }
    await ctx.close();
  }
  await b.close();
})();
