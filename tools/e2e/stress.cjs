// Stress test against a URL: node tools/e2e/stress.cjs https://storm-globe.pages.dev/ OUT_DIR
// Load time, frame rate (idle, dragging, zooming), long tasks, memory growth, abuse and offline, per environment.
const { chromium } = require('playwright');
const [url, out] = process.argv.slice(2);
const ENVS = [
  { name: 'Desktop, fast connection', viewport: { width: 1440, height: 900 }, cpu: 1, net: null },
  { name: 'Mid-range phone, 4G', viewport: { width: 390, height: 844 }, mobile: true, cpu: 4, net: { latency: 150, down: 1.6e6 / 8, up: 750e3 / 8 } },
  { name: 'Low-end phone, slow 3G', viewport: { width: 360, height: 640 }, mobile: true, cpu: 6, net: { latency: 400, down: 400e3 / 8, up: 400e3 / 8 } },
];
const fpsDuring = (p, ms, action) => Promise.all([
  p.evaluate(ms => new Promise(r => { let n = 0, worst = 0, last = performance.now(); const t0 = last;
    const f = t => { n++; worst = Math.max(worst, t - last); last = t; if (t - t0 < ms) requestAnimationFrame(f); else r({ fps: Math.round(n * 1000 / (t - t0)), worstFrameMs: Math.round(worst) }) };
    requestAnimationFrame(f) }), ms),
  action ? action() : null,
]).then(([r]) => r);
const isMarker = () => [...document.querySelectorAll('button')].some(b => /^[^:]+: \d+ (km\/h|mph|kt|m\/s)/.test(b.getAttribute('aria-label') || ''));

(async () => {
  const b = await chromium.launch({ ignoreDefaultArgs: ['--hide-scrollbars'] });
  const report = [];
  for (const env of ENVS) {
    const ctx = await b.newContext({ viewport: env.viewport, deviceScaleFactor: env.mobile ? 3 : 1, isMobile: !!env.mobile, hasTouch: !!env.mobile, locale: 'en-IN', timezoneId: 'Asia/Kolkata' });
    const p = await ctx.newPage();
    const errs = [];
    p.on('pageerror', e => errs.push(e.message));
    await p.addInitScript(() => { window.__long = []; try { new PerformanceObserver(l => l.getEntries().forEach(e => window.__long.push(e.duration))).observe({ type: 'longtask', buffered: true }) } catch {} });
    const cdp = await ctx.newCDPSession(p);
    await cdp.send('Performance.enable');
    if (env.cpu > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: env.cpu });
    if (env.net) { await cdp.send('Network.enable'); await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: env.net.latency, downloadThroughput: env.net.down, uploadThroughput: env.net.up }) }
    const t0 = Date.now();
    const windDone = p.waitForResponse(r => r.url().includes('data/wind.json'), { timeout: 180e3 }).then(r => r.finished()).then(() => Date.now() - t0).catch(() => null);
    await p.goto(url, { waitUntil: 'commit', timeout: 180e3 });
    await p.waitForFunction(isMarker, null, { timeout: 180e3, polling: 100 });
    const stormsMs = Date.now() - t0;
    const windMs = await windDone;
    await p.waitForTimeout(1500);
    const fcp = await p.evaluate(() => Math.round(performance.getEntriesByName('first-contentful-paint')[0]?.startTime || 0));
    const bytes = await p.evaluate(() => Math.round([performance.getEntriesByType('navigation')[0], ...performance.getEntriesByType('resource')].reduce((s, e) => s + (e.transferSize || 0), 0) / 1024));
    await p.screenshot({ path: `${out}/${env.name.replace(/\W+/g, '-')}.png` });

    const idle = await fpsDuring(p, 3000);
    const { width: W, height: H } = env.viewport;
    const drag = await fpsDuring(p, 3000, async () => {
      await p.mouse.move(W * 0.5, H * 0.5); await p.mouse.down();
      for (let i = 0; i < 60; i++) await p.mouse.move(W * 0.5 + Math.sin(i / 6) * W * 0.25, H * 0.5 + Math.cos(i / 9) * H * 0.1);
      await p.mouse.up();
    });
    await p.waitForTimeout(1200);
    const zoom = await fpsDuring(p, 2500, async () => { for (let i = 0; i < 10; i++) { await p.mouse.move(W / 2, H / 2); await p.mouse.wheel(0, i < 5 ? -300 : 300); await p.waitForTimeout(120) } });
    await p.waitForTimeout(1200);

    // Memory: open and close storms 30 times
    const heap = async () => { await cdp.send('HeapProfiler.collectGarbage'); const m = await cdp.send('Performance.getMetrics'); return m.metrics.find(x => x.name === 'JSHeapUsedSize').value / 1048576 };
    const h0 = await heap();
    const names = await p.evaluate(() => [...document.querySelectorAll('button')].map(b => b.getAttribute('aria-label') || '').filter(l => /^[^:]+: \d+ /.test(l)).map(l => l.split(':')[0]));
    for (let i = 0; i < 30; i++) {
      const n = names[i % names.length];
      await p.evaluate(n => [...document.querySelectorAll('button')].find(b => (b.getAttribute('aria-label') || '').startsWith(n + ':'))?.click(), n);
      await p.waitForTimeout(60);
      await p.keyboard.press('Escape');
      await p.evaluate(() => document.querySelector('button[aria-label="Close storm details"]')?.click());
    }
    await p.waitForTimeout(800);
    const h1 = await heap();

    // Abuse: 40 instant zoom clicks, resize churn
    for (let i = 0; i < 40; i++) await p.evaluate(i => document.querySelector(`button[aria-label="${i % 2 ? 'Zoom out' : 'Zoom in'}"]`)?.click(), i);
    for (const [w, h] of [[W * 0.6, H], [W, H * 0.5], [H, W], [W, H]]) { await p.setViewportSize({ width: Math.round(w), height: Math.round(h) }); await p.waitForTimeout(250) }
    const longTasks = await p.evaluate(() => ({ count: window.__long.length, worst: Math.round(Math.max(0, ...window.__long)), total: Math.round(window.__long.reduce((a, b) => a + b, 0)) }));

    // Offline: cut the connection and wait for the next check (tab hidden then shown triggers a re-check)
    await ctx.setOffline(true);
    await p.evaluate(() => { Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true }); document.dispatchEvent(new Event('visibilitychange')) });
    await p.waitForTimeout(2500);
    const offline = await p.locator('[role=alert]').innerText().catch(() => 'no banner');
    await p.screenshot({ path: `${out}/${env.name.replace(/\W+/g, '-')}-offline.png` });
    await ctx.setOffline(false);

    report.push({ env: env.name, firstPaintMs: fcp, stormsOnGlobeMs: stormsMs, windLoadedMs: windMs, downloadedKB: bytes,
      fpsIdle: idle, fpsDrag: drag, fpsZoom: zoom, longTasks, heapMB: { start: +h0.toFixed(1), after30Panels: +h1.toFixed(1) },
      offlineBanner: offline.replace(/\s+/g, ' ').slice(0, 90), errors: errs });
    await ctx.close();
  }
  console.log(JSON.stringify(report, null, 1));
  await b.close();
})();
