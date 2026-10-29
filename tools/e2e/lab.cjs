// Screenshots of every direction in the style lab: node tools/e2e/lab.cjs URL OUT_DIR [phone]
const { chromium } = require('playwright');
(async () => {
  const [url, out, mode] = process.argv.slice(2);
  const b = await chromium.launch({ ignoreDefaultArgs: ['--hide-scrollbars'] });
  const phone = mode === 'phone';
  const ctx = await b.newContext(phone ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage(); const errs = [];
  p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errs.push(m.text()));
  const ids = ['heat', 'ink', 'night', 'dots', 'chart', 'relief', 'bands', 'ribbons'];
  await p.goto(url + '#heat'); await p.waitForTimeout(2500);
  for (const id of ids) {
    await p.evaluate(id => { const L = window.__lab; L.select(L.PRESETS.find(x => x.id === id)) }, id);
    await p.waitForTimeout(1800);
    await p.screenshot({ path: `${out}/${phone ? 'm-' : ''}${id}.png` });
  }
  console.log('errors:', errs.length ? errs : 'none');
  await b.close();
})();
