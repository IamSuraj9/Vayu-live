// Customize, looks and zoom pill against a served build:
//   node tools/e2e/looks.cjs http://localhost:4173/ OUT_DIR [AXE_PATH]
const { chromium } = require('playwright');
(async () => {
  const [url, out, axePath] = process.argv.slice(2);
  const b = await chromium.launch({ ignoreDefaultArgs: ['--hide-scrollbars'] });
  const errs = [], log = (...a) => console.log(...a);
  const name = p => p.locator('section[aria-label="Customize the globe"] button[aria-expanded]').first();
  // how many pixels of the look engine's canvases are drawn (0 on Heat, which the app's own layers draw)
  const drawn = p => p.evaluate(() => {
    let n = 0;
    for (const c of document.querySelectorAll('canvas')) {
      if (!c.className.includes('pointer-events-none')) continue;
      const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      for (let i = 3; i < d.length; i += 4 * 97) if (d[i] > 0) n++;
    }
    return n;
  });

  for (const [label, w, h, phone] of [['desktop', 1440, 900, false], ['phone', 390, 800, true]]) {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, hasTouch: phone, isMobile: phone, deviceScaleFactor: phone ? 2 : 1 });
    const p = await ctx.newPage();
    p.on('pageerror', e => errs.push(`${label}: ${e.message}`)); p.on('console', m => m.type() === 'error' && errs.push(`${label} console: ${m.text()}`));
    await p.goto(url); await p.waitForTimeout(3500);
    log(`\n== ${label} ${w}x${h}`);
    log('first visit opens on:', (await name(p).getAttribute('aria-label')));
    log('engine pixels on Heat:', await drawn(p));
    await p.screenshot({ path: `${out}/${label}-1-heat.png` });

    await name(p).click(); await p.waitForTimeout(900);
    const looks = await p.locator('section[aria-label="Customize the globe"] [aria-pressed]').count();
    log('looks in the card once open:', looks, '| expanded:', await name(p).getAttribute('aria-expanded'));
    await p.screenshot({ path: `${out}/${label}-2-open.png` });

    for (const id of ['Ink', 'Night', 'Dots', 'Chart', 'Relief', 'Bands', 'Ribbons', 'Heat']) {
      const t0 = Date.now();
      await p.getByRole('button', { name: new RegExp(`^${id} look`) }).click();
      await p.waitForFunction(() => document.querySelectorAll('canvas').length > 0);
      await p.waitForTimeout(id === 'Ink' ? 3500 : 1800);
      log(`${id.padEnd(8)} engine pixels: ${await drawn(p)}`);
      if (['Ink', 'Night', 'Chart', 'Bands'].includes(id)) await p.screenshot({ path: `${out}/${label}-3-${id.toLowerCase()}.png` });
      void t0;
    }

    // a single layer turns it into a custom mix, and the choice survives a reload
    await p.getByRole('radio', { name: 'Barbs' }).click(); await p.waitForTimeout(1500);
    log('after choosing Barbs:', await name(p).getAttribute('aria-label'));
    await p.reload(); await p.waitForTimeout(3500);
    log('after reload:', await name(p).getAttribute('aria-label'));
    await name(p).click(); await p.waitForTimeout(800);
    await p.getByRole('button', { name: 'Back to Heat' }).click(); await p.waitForTimeout(800);
    log('Back to Heat:', await name(p).getAttribute('aria-label'));
    await name(p).click(); await p.waitForTimeout(700); // close again

    // zoom pill
    const reset = p.getByRole('button', { name: 'Back to the start view' });
    log('reset disabled at the start:', await reset.getAttribute('aria-disabled'));
    await p.getByRole('button', { name: 'Zoom in' }).click(); await p.waitForTimeout(900);
    log('reset after zooming in:', await reset.getAttribute('aria-disabled'));
    await reset.click(); await p.waitForTimeout(1500);
    log('reset after pressing it:', await reset.getAttribute('aria-disabled'));

    // a storm open next to Customize
    await p.getByRole('button', { name: /^In-fa/ }).first().click().catch(() => {}); await p.waitForTimeout(1500);
    await p.screenshot({ path: `${out}/${label}-4-storm.png` });
    log('sideways scroll:', await p.evaluate(() => document.documentElement.scrollWidth > innerWidth));

    if (axePath) {
      await p.addScriptTag({ content: require('fs').readFileSync(axePath, 'utf8') });
      const r = await p.evaluate(() => axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa', 'best-practice'] }));
      log('axe violations:', r.violations.length ? r.violations.map(v => `${v.id}(${v.impact}, ${v.nodes.length}): ${v.nodes[0].target.join(' ')}`) : 'none');
    }
    await ctx.close();
  }
  log('\nerrors:', errs.length ? errs : 'none');
  await b.close();
})();
