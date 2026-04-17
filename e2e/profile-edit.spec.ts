import { test, expect } from '@playwright/test';

// ============================================================
// NEW-17d Profile Edit — E2E scenarios
//
// 상태 (2026-04-17):
//   - MVP 소프트 런칭 단계에서는 수동 QA 시나리오 문서 역할.
//   - 자동 실행은 인증 세션 bootstrap 헬퍼 개발 후 활성화 (NEW-17g follow-up).
//   - 현재는 `npm run test:e2e -- profile-edit` 로 dev server 가동된 상태에서
//     수동 개발자 로그인 쿠키 + 온보딩 완료 상태에서 실행 가능.
//
// Test list:
//   T24 — happy path: /profile → Edit → change skin_types → Save → /profile
//   T25 — dirty cancel: change → Cancel → AlertDialog → Leave/Stay 분기
//   T26 — beforeunload: change → tab close 시도 → 브라우저 경고 (listener 등록 확인)
// ============================================================

const LOCALE = 'en';

test.describe('NEW-17d profile edit (E2E)', () => {
  test.skip(
    !process.env.E2E_AUTH_TOKEN,
    'Requires authenticated session; set E2E_AUTH_TOKEN env for auto-run. Manual QA otherwise.',
  );

  test.beforeEach(async ({ page }) => {
    // MVP: manual session setup (authenticated + onboarded user).
    // Future (NEW-17g): inject session cookie via `context.addCookies()`.
    await page.goto(`/${LOCALE}/profile`);
  });

  test('T24: Edit happy path (/profile → Edit → change → Save → /profile)', async ({ page }) => {
    // 1. Profile page shows Edit button
    const editLink = page.getByRole('link', { name: /edit profile/i });
    await expect(editLink).toBeVisible();

    // 2. Click → navigate to /profile/edit
    await editLink.click();
    await expect(page).toHaveURL(/\/profile\/edit$/);

    // 3. Form pre-fills (wait for skeleton to clear)
    await expect(page.getByRole('heading', { name: /edit your profile/i })).toBeVisible();

    // 4. Toggle skin_type "Oily" chip
    const oilyChip = page.getByRole('button', { name: /^oily$/i }).first();
    await oilyChip.click();

    // 5. Save becomes enabled (dirty + skin_types ≥ 1)
    const saveButton = page.getByRole('button', { name: /^save$/i });
    await expect(saveButton).toBeEnabled();
    await saveButton.click();

    // 6. Redirect back to /profile + updated value visible
    await expect(page).toHaveURL(/\/profile$/);
  });

  test('T25: Dirty cancel shows AlertDialog (Stay vs Leave)', async ({ page }) => {
    await page.goto(`/${LOCALE}/profile/edit`);
    await page.getByRole('button', { name: /^oily$/i }).first().click();

    // Click Cancel → AlertDialog appears
    const cancelBtn = page.getByRole('button', { name: /^cancel$/i });
    await cancelBtn.click();
    await expect(page.getByText(/unsaved changes/i)).toBeVisible();

    // Stay → dialog closes, form intact
    await page.getByRole('button', { name: /^stay$/i }).click();
    await expect(page).toHaveURL(/\/profile\/edit$/);

    // Cancel 다시 → Leave → /profile 복귀
    await cancelBtn.click();
    await page.getByRole('button', { name: /^leave$/i }).click();
    await expect(page).toHaveURL(/\/profile$/);
  });

  test('T26: beforeunload warning listener registered on dirty', async ({ page }) => {
    await page.goto(`/${LOCALE}/profile/edit`);
    await page.getByRole('button', { name: /^oily$/i }).first().click();

    // Playwright 의 beforeunload 는 native dialog — accept/dismiss 만 가능.
    // 실제 listener 등록 여부를 client 에서 evaluate 로 확인.
    const hasDirtyListener = await page.evaluate(() => {
      // dirty 상태에서 window 에 beforeunload handler 가 있어야 함.
      // 직접 내부 state 에 접근 불가 — 대신 dispatch 로 preventDefault 호출 여부 간접 확인.
      const ev = new Event('beforeunload', { cancelable: true });
      const canceled = !window.dispatchEvent(ev);
      return canceled;
    });
    expect(hasDirtyListener).toBe(true);
  });
});
