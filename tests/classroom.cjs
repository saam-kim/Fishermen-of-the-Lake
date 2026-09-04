// npm install --no-save playwright && npx playwright install chromium
// node tests/classroom.cjs
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    for (const dual of [false, true]) {
      const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
      await context.route('https://cdn.jsdelivr.net/**', route => route.abort());
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(pathToFileURL(path.resolve(__dirname, '../index.html')).href);
      for (let i = 0; i < 3; i++) await page.click('#btn-teams-plus');
      await page.selectOption('#input-display-mode', dual ? 'dual' : 'single');
      assert.equal(await page.locator('#input-lesson-mode').count(), 0);
      const popup = dual ? page.waitForEvent('popup') : null;
      await page.click('#btn-start-game');
      assert.equal(await page.evaluate(() => state.lessonMode), 'comparison');
      const student = dual ? await popup : page;
      if (dual) {
        student.on('pageerror', error => errors.push(error.message));
        await student.setViewportSize({ width: 1024, height: 768 });
        await student.waitForSelector('#lake-canvas');
      }
      for (let turn = 1; turn <= 9; turn++) {
        for (const id of ['#btn-close-agreement', '#btn-close-regulation']) {
          if (await page.locator(id).isVisible()) await page.click(id);
        }
        if ([4, 7].includes(turn)) {
          assert.equal(await page.evaluate(() => state.fishCount), 200);
        }
        await page.locator('.brand-title').click();
        for (let i = 0; i < 8; i++) await page.keyboard.press(turn <= 3 ? '3' : '1');
        assert.equal(await page.locator('.team-input-row.entered').count(), 8);
        if (!dual && turn === 1) {
          await page.locator('#team-row-1 .mask-overlay-layer').click();
          assert.equal(await page.locator('#team-row-1 .boat-selectors').isVisible(), false);
          await page.keyboard.press('h');
          assert.equal(await page.evaluate(() => state.isInputMasked), true);
          // Correct a selected team without exposing its value.
          await page.locator('#team-row-1 .team-name-badge').click();
          await page.keyboard.press('3');
        }
        await page.click('#btn-execute-turn');
        await page.waitForSelector('#result-modal.active');
        if (dual) {
          await student.waitForSelector('#projector-result-modal.active');
          await student.waitForTimeout(350);
          const visibleRows = () => student.locator('#modal-team-body tr:not(.hidden)');
          assert.equal(await visibleRows().count(), 4);
          const fits = await visibleRows().evaluateAll(rows => {
            const body = rows[0].closest('.modal-body').getBoundingClientRect();
            return rows.every(row => { const r = row.getBoundingClientRect(); return r.top >= body.top && r.bottom <= body.bottom; });
          });
          assert.equal(fits, true, `4:3 result must fit at turn ${turn}`);
          await page.click('#btn-projector-next');
          assert.match(await visibleRows().first().innerText(), /5모둠/);
          if (turn === 7) {
            const inspect = page.locator('#modal-team-body .btn-inspect').first();
            await inspect.click();
            assert.match(await visibleRows().first().innerText(), /5모둠/, 'investigation preserves student page');
          }
        }
        if (turn === 4) {
          assert.match(await page.locator('#modal-detail-repro').innerText(), /수용력.*실제/);
        }
        await page.click('#btn-next-turn');
        if (await page.locator('#btn-continue-depleted').isVisible()) await page.click('#btn-continue-depleted');
      }
      await page.waitForSelector('#result-screen.active');
      assert.equal(await page.evaluate(() => state.history.length), 9);
      assert.equal(await page.evaluate(() => state.fishCount), 200);
      assert.match(await page.locator('#phase-comparison').innerText(), /자유 방임/);
      if (dual) {
        await student.waitForSelector('#result-screen.active');
        await page.click('#btn-projector-next');
        assert.equal(await student.locator('.leaderboard-section').isVisible(), true);
        await page.click('#btn-projector-next');
        assert.equal(await student.locator('.discussion-section').isVisible(), true);
      }
      assert.deepEqual(errors, []);
      console.log(`PASS ${dual ? 'dual 4:3' : 'single laptop'} / policy comparison / 9 turns`);
      await context.close();
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
