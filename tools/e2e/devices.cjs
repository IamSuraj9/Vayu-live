// Layout sweep across screen sizes against a served build: node tools/e2e/devices.cjs http://localhost:4173/ OUT_DIR
const { chromium } = require('playwright');
(async () => {
  const [url, out] = process.argv.slice(2);
  const b = await chromium.launch({ ignoreDefaultArgs: ['--hide-scrollbars'] });
  const errs = [], notes = [];
  const sizes = [
    ['phone-small', 360, 640, true], ['phone', 390, 844, true], ['phone-landscape', 844, 390, true],
    ['tablet', 820, 1180, true], ['laptop', 1280, 720, false], ['desktop-wide', 1920, 1080, false],
  ];
  for (const [name, w, h, touch] of sizes) {
    const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: touch ? 2 : 1, isMobile: touch && w < 900, hasTouch: touch, locale: 'en-GB', timezoneId: 'Europe/London' });
    p.on('pageerror', e => errs.push(`${name}: ${e.message}`));
    await p.goto(url); await p.waitForTimeout(2500);
    const r = await p.evaluate(() => {
      const de = document.documentElement, off = [];
      for (const el of document.querySelectorAll('button, a, [role=tab]')) {
        const b = el.getBoundingClientRect(), cs = getComputedStyle(el);
        if (!b.width || cs.visibility === 'hidden' || el.closest('[aria-hidden=true]')) continue;
        if (b.right > innerWidth + 1 || b.bottom > innerHeight + 1 || b.left < -1 || b.top < -1) off.push((el.getAttribute('aria-label') || el.textContent).trim().slice(0, 30));
      }
      return { hscroll: de.scrollWidth > innerWidth, off };
    });
    notes.push(`${name} ${w}x${h}: page scrolls sideways=${r.hscroll}; controls off screen=${r.off.length ? r.off.join(' | ') : 'none'}`);
    await p.screenshot({ path: `${out}/s-${name}.png` });
    await p.close();
  }

  // Firefox/Safari look: no refraction lens
  const f = await b.newPage({ viewport: { width: 1440, height: 900 } });
  await f.goto(url); await f.evaluate(() => delete document.documentElement.dataset.lens); await f.waitForTimeout(2000);
  await f.locator('aside').getByRole('button', { name: /^In-fa/ }).click(); await f.waitForTimeout(1500);
  await f.screenshot({ path: `${out}/s-no-lens.png` }); await f.close();

  // Keyboard only, with reduced motion
  const k = await b.newPage({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });
  k.on('pageerror', e => errs.push(`keyboard: ${e.message}`));
  await k.goto(url); await k.waitForTimeout(2000);
  const seen = [];
  for (let i = 0; i < 14; i++) {
    await k.keyboard.press('Tab');
    seen.push(await k.evaluate(() => { const a = document.activeElement; const s = getComputedStyle(a);
      return `${(a.getAttribute('aria-label') || a.textContent || a.tagName).trim().slice(0, 22)}${s.outlineStyle !== 'none' || s.boxShadow !== 'none' ? '' : ' (NO RING)'}` }));
  }
  notes.push('tab order: ' + seen.join(' → '));
  await k.keyboard.press('Control+k'); await k.waitForTimeout(300); await k.keyboard.type('Vance'); await k.keyboard.press('Enter'); await k.waitForTimeout(800);
  notes.push('search → storm panel open: ' + await k.locator('section[aria-label="Storm details"]').isVisible());
  await k.keyboard.press('Escape');
  await k.getByRole('button', { name: 'About and sources' }).focus(); await k.keyboard.press('Enter'); await k.waitForTimeout(300);
  const open = await k.getByRole('dialog').isVisible(); await k.keyboard.press('Escape'); await k.waitForTimeout(300);
  notes.push(`about opens with Enter=${open}, closes with Escape=${!(await k.getByRole('dialog').isVisible())}, focus returns to=${await k.evaluate(() => document.activeElement.getAttribute('aria-label'))}`);
  await k.close();
  console.log(notes.join('\n')); console.log('errors:', errs.length ? errs : 'none');
  await b.close();
})();
