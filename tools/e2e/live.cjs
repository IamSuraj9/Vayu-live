// Checks the live-data states against a served build: node tools/e2e/live.cjs http://localhost:4173/ OUT_DIR
const { chromium } = require('playwright');
const fs = require('fs');
(async () => {
  const [url, out] = process.argv.slice(2);
  const b = await chromium.launch({ ignoreDefaultArgs: ['--hide-scrollbars'] });
  const errs = [];
  const real = await (await fetch(url + 'data/storms.json')).json();
  const page = async (name, edit, opts = {}) => {
    const p = await b.newPage({ viewport: opts.phone ? { width: 390, height: 844 } : { width: 1440, height: 900 }, deviceScaleFactor: opts.phone ? 2 : 1,
      isMobile: !!opts.phone, hasTouch: !!opts.phone, locale: 'en-IN', timezoneId: 'Asia/Kolkata' });
    p.on('pageerror', e => errs.push(`${name}: ${e.message}`));
    p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(`${name}: ${m.text()}`) });
    if (edit === 'offline') await p.route('**/data/storms.json', r => r.abort());
    else if (edit) await p.route('**/data/storms.json', r => r.fulfill({ json: edit(JSON.parse(JSON.stringify(real))) }));
    await p.goto(url); await p.waitForTimeout(3000);
    await p.screenshot({ path: `${out}/${name}.png` });
    return p;
  };
  const ago = h => new Date(Date.now() - h * 3.6e6).toISOString().replace(/\.\d+Z$/, 'Z');
  const shift = (d, h) => { // move every time in the file back by h hours relative to now
    const dt = Date.now() - h * 3.6e6 - new Date(d.fetchedAt).getTime();
    const mv = t => new Date(new Date(t).getTime() + dt).toISOString().replace(/\.\d+Z$/, 'Z');
    d.fetchedAt = ago(h); d.snapshot = mv(d.snapshot);
    for (const s of d.storms) { s.updated = mv(s.updated); s.track.forEach(p => { p.t = mv(p.t) }); if (s.forecastIssued) s.forecastIssued = mv(s.forecastIssued); if (s.forecastBase) s.forecastBase = mv(s.forecastBase) }
    return d;
  };

  const live = await page('l1-live', d => shift(d, 1));
  console.log('live banner:', await live.getByRole('alert').count(), '| footer:', await live.locator('aside').innerText().then(t => t.split('\n').slice(-3).join(' / ')));
  await live.getByRole('button', { name: 'About and sources' }).click(); await live.waitForTimeout(500);
  await live.screenshot({ path: `${out}/l2-about.png` });
  console.log('model run:', await live.getByText(/Model run/).innerText());
  await live.close();

  const stale = await page('l3-stale', d => shift(d, 9)); await stale.close();
  const off = await page('l4-offline', 'offline'); console.log('offline title:', await off.getByRole('alert').innerText().catch(() => 'none')); await off.close();
  const ended = await page('l5-ended', d => { shift(d, 1); const a = d.storms.find(s => s.id === 'io022026'); a.status = 'ended'; return d });
  await ended.locator('aside').getByRole('button', { name: /^Arnab/ }).click(); await ended.waitForTimeout(1500);
  await ended.screenshot({ path: `${out}/l6-ended-panel.png` }); await ended.close();
  const empty = await page('l7-empty', d => { shift(d, 1); d.storms = []; return d }); await empty.close();
  const phone = await page('l8-phone', d => shift(d, 1), { phone: true });
  await phone.getByRole('button', { name: /storms?/ }).last().click(); await phone.waitForTimeout(700);
  await phone.screenshot({ path: `${out}/l9-phone-sheet.png` }); await phone.close();
  console.log('errors:', errs.length ? errs : 'none');
  await b.close();
})();
