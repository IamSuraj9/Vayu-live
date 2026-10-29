// Interaction and accessibility checks for the style lab: node tools/e2e/lab-check.cjs URL AXE_PATH
const { chromium } = require('playwright');
(async () => {
  const [url, axePath] = process.argv.slice(2);
  const axe = require(axePath);
  const b = await chromium.launch({ ignoreDefaultArgs: ['--hide-scrollbars'] });
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } }); const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.goto(url + '#night'); await p.waitForTimeout(2500);
  const name = () => p.locator('#d-name').innerText();
  console.log('opens on the direction in the link:', await name());
  await p.locator('#strip button').nth(4).click(); await p.waitForTimeout(500);
  console.log('thumbnail picks a direction:', await name(), '| link now', await p.evaluate(() => location.hash));
  await p.getByRole('radio', { name: 'Paper' }).click(); await p.waitForTimeout(400);
  console.log('mix changes it to:', await name(), '| notes:', (await p.locator('#notes').innerText()).slice(0, 60).replace(/\n/g, ' '));
  // drag the globe and check the view moved
  const before = await p.evaluate(() => JSON.stringify(window.__lab.scene.view));
  await p.mouse.move(500, 400); await p.mouse.down(); await p.mouse.move(380, 400, { steps: 8 }); await p.mouse.up(); await p.waitForTimeout(400);
  const after = await p.evaluate(() => JSON.stringify(window.__lab.scene.view));
  console.log('drag rotates the globe:', before !== after);
  await p.getByRole('button', { name: 'Arnab' }).click(); await p.waitForTimeout(1500);
  console.log('fly to Arnab -> zoom', await p.evaluate(() => window.__lab.scene.view.zoom.toFixed(2)));
  await p.locator('#strip button').first().click(); await p.waitForTimeout(600);
  await p.addScriptTag({ content: axe.source });
  const r = await p.evaluate(() => axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21aa', 'best-practice'] }));
  console.log('axe violations:', r.violations.length ? r.violations.map(v => `${v.id}(${v.impact}, ${v.nodes.length}): ${v.nodes[0].target.join(' ')}`) : 'none');
  // keyboard
  await p.keyboard.press('Tab'); const seen = [];
  for (let i = 0; i < 6; i++) { seen.push(await p.evaluate(() => { const a = document.activeElement; return (a.getAttribute('aria-label') || a.textContent || a.tagName).trim().slice(0, 18) })); await p.keyboard.press('Tab') }
  console.log('tab order starts:', seen.join(' > '));
  console.log('errors:', errs.length ? errs : 'none');
  await b.close();
})();
