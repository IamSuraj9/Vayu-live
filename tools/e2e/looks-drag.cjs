// Do the wind lines stay on screen while the globe is held and dragged, and how smooth is a drag?
//   node tools/e2e/looks-drag.cjs http://localhost:4173/ OUT_DIR
// Counts bright thin-line pixels in the globe while dragging and at rest, and records frame times during the drag.
const { chromium } = require('playwright');
(async () => {
  const [url, out] = process.argv.slice(2);
  const b = await chromium.launch({ ignoreDefaultArgs: ['--hide-scrollbars'] });
  for (const [label, vp, dpr, slow, touch] of [['desktop', { width: 1440, height: 900 }, 1, 1, false], ['phone, CPU 4x slower', { width: 390, height: 800 }, 2, 4, true]]) {
    const ctx = await b.newContext({ viewport: vp, deviceScaleFactor: dpr, isMobile: touch, hasTouch: touch });
    const p = await ctx.newPage();
    if (slow > 1) await (await ctx.newCDPSession(p)).send('Emulation.setCPUThrottlingRate', { rate: slow });
    await p.addInitScript(() => { window.__ft = []; let last = 0; const f = t => { if (last) window.__ft.push(t - last); last = t; requestAnimationFrame(f) }; requestAnimationFrame(f); });
    await p.goto(url); await p.waitForTimeout(5000);
    await p.getByRole('button', { name: /^Customize the globe/ }).click(); await p.waitForTimeout(800);
    console.log(`\n== ${label}`);
    console.log('look      lines while dragging   lines at rest   drag frame time p50 / p95 (ms)   fps (median)');
    const cx = vp.width * 0.5, cy = touch ? vp.height * 0.45 : vp.height * 0.42;
    // the globe sits mid-screen: count pixels that are bright and unlike their neighbours
    const lines = async () => {
      const buf = await p.screenshot({ clip: { x: vp.width * 0.2, y: vp.height * 0.25, width: vp.width * 0.4, height: vp.height * 0.3 } });
      return buf;
    };
    for (const id of ['Heat', 'Ink', 'Night', 'Chart', 'Bands', 'Ribbons']) {
      if (id !== 'Heat') { await p.getByRole('button', { name: new RegExp(`^${id} look`) }).click(); await p.waitForTimeout(id === 'Ink' ? 4500 : 2500); }
      else { await p.getByRole('button', { name: /^Heat look/ }).click(); await p.waitForTimeout(2000); }
      if (touch) { await p.getByRole('button', { name: /^Customize the globe/ }).click(); await p.waitForTimeout(700); } // fold the card so it does not cover the globe
      await p.evaluate(() => { window.__ft = [] });
      await p.mouse.move(cx, cy); await p.mouse.down();
      for (let i = 0; i < 60; i++) { await p.mouse.move(cx + i * 2.5, cy + i * 0.8); await p.waitForTimeout(16); }
      const during = await p.evaluate(async () => {
        // count light, thin-line pixels in the middle of the page from the visible canvases
        const n = { v: 0 };
        for (const c of document.querySelectorAll('canvas')) {
          if (c.width < 200) continue;
          const g = c.getContext('2d'); const w = c.width, h = c.height;
          const x0 = Math.floor(w * 0.2), y0 = Math.floor(h * 0.25), ww = Math.floor(w * 0.4), hh = Math.floor(h * 0.3);
          const d = g.getImageData(x0, y0, ww, hh).data;
          for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 120 && Math.max(d[i], d[i + 1], d[i + 2]) > 200) n.v++;
        }
        return n.v;
      });
      const ft = await p.evaluate(() => window.__ft.slice(5));
      await p.mouse.up(); await p.waitForTimeout(2200);
      if (touch) { await p.getByRole('button', { name: /^Customize the globe/ }).click(); await p.waitForTimeout(700); }
      const rest = await p.evaluate(() => {
        const n = { v: 0 };
        for (const c of document.querySelectorAll('canvas')) {
          if (c.width < 200) continue;
          const g = c.getContext('2d'); const w = c.width, h = c.height;
          const x0 = Math.floor(w * 0.2), y0 = Math.floor(h * 0.25), ww = Math.floor(w * 0.4), hh = Math.floor(h * 0.3);
          const d = g.getImageData(x0, y0, ww, hh).data;
          for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 120 && Math.max(d[i], d[i + 1], d[i + 2]) > 200) n.v++;
        }
        return n.v;
      });
      ft.sort((a, b) => a - b);
      const q = f => ft.length ? ft[Math.min(ft.length - 1, Math.floor(ft.length * f))] : 0;
      console.log(`${id.padEnd(9)} ${String(during).padEnd(22)} ${String(rest).padEnd(15)} ${q(0.5).toFixed(1)} / ${q(0.95).toFixed(1)}`.padEnd(88) + (1000 / q(0.5)).toFixed(0));
      if (out && label === 'desktop') { await p.mouse.move(cx, cy); await p.mouse.down(); for (let i = 0; i < 30; i++) { await p.mouse.move(cx + i * 3, cy + i); await p.waitForTimeout(16) } await p.screenshot({ path: `${out}/drag-${id.toLowerCase()}.png` }); await p.mouse.up(); await p.waitForTimeout(600); }
    }
    await ctx.close();
  }
  await b.close();
})();
