#!/usr/bin/env node
/**
 * NEW-17d — Mobile device E2E test for profile edit flow.
 *
 * Usage: node scripts/qa/mobile-e2e.mjs
 *
 * Tests each device (iPhone 13, Pixel 5) against localhost:3000:
 *  1. /profile/edit direct access without session → /en redirect
 *  2. /chat with consent → OnboardingChips → Skip → Profile icon appears (no reload)
 *  3. Navigate to Profile → Edit → verify form fits viewport
 *  4. Capture mobile screenshot
 */
import { chromium, devices } from 'playwright';

async function runTest(deviceName) {
  const device = devices[deviceName];
  const browser = await chromium.launch();
  const context = await browser.newContext({ ...device });
  const page = await context.newPage();

  const out = {
    device: deviceName,
    viewport: device.viewport,
  };

  // Test 1: /profile/edit without session → redirect
  await page.goto('http://localhost:3000/en/profile/edit', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  out.directEditUrl = page.url();

  // Test 2: /chat consent → skip onboarding
  await page.goto('http://localhost:3000/en/chat', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  const continueBtn = page.getByRole('button', { name: 'Continue' });
  if (await continueBtn.count()) {
    await continueBtn.click();
    await page.waitForTimeout(2500);
  }

  const skinChipsBefore = await page.getByRole('button', { name: /^Dry$/i }).count();
  out.onboardingChipsRendered = skinChipsBefore > 0;
  out.profileIconBeforeSkip = await page.getByRole('link', { name: 'My Profile' }).count();

  const skipBtn = page.getByRole('button', { name: /Skip — I.ll just chat/i });
  if (await skipBtn.count()) {
    await skipBtn.click();
    await page.waitForTimeout(3000);
  }
  out.profileIconAfterSkip = await page.getByRole('link', { name: 'My Profile' }).count();

  // Test 3: Navigate to profile edit
  if (out.profileIconAfterSkip > 0) {
    await page.getByRole('link', { name: 'My Profile' }).click();
    await page.waitForURL(/\/profile$/);
    out.profileUrl = page.url();

    await page.getByRole('link', { name: 'Edit profile' }).click();
    await page.waitForURL(/\/profile\/edit$/);
    await page.waitForTimeout(1500);
    out.editUrl = page.url();

    const saveBtn = page.getByRole('button', { name: 'Save' });
    const saveBox = await saveBtn.boundingBox();
    const viewport = page.viewportSize();
    out.saveFits = saveBox && saveBox.x + saveBox.width <= viewport.width;
    out.viewport = viewport;

    const hint = await page.getByText(/at least one skin type/i).count();
    out.skinTypeHintVisible = hint > 0;

    const path = `/tmp/mobile-${deviceName.replace(/ /g, '-').toLowerCase()}.png`;
    await page.screenshot({ path, fullPage: false });
    out.screenshot = path;
  }

  await browser.close();
  return out;
}

for (const name of ['iPhone 13', 'Pixel 5']) {
  console.log(`\n=== ${name} ===`);
  const r = await runTest(name);
  console.log(JSON.stringify(r, null, 2));
}
console.log('\nDONE');
