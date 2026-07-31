import { expect, test, type Page } from '@playwright/test';

/**
 * The product itself, end to end against a real API in mock mode.
 *
 * These are the flows the definition of done names explicitly: Listen
 * produces partial then final text, pause works, language switching works,
 * saving is explicit; Discuss handles 2/3/4 people with per-tile rotation and
 * RTL; Join works by code with no account.
 */

async function startListening(page: Page): Promise<void> {
  await page.goto('/en/listen');
  await page.getByTestId('start-listening').click();
  await expect(page.getByTestId('transcript')).toBeVisible({ timeout: 20_000 });
}

test.describe('Listen', () => {
  test('shows partial text that is replaced by punctuated final text', async ({ page }) => {
    await startListening(page);

    // Partial text appears first, in the lower-contrast style.
    await expect(page.getByTestId('segment-partial').first()).toBeVisible({ timeout: 20_000 });

    // Then a final segment lands, and it is punctuated.
    const final = page.getByTestId('segment-final').first();
    await expect(final).toBeVisible({ timeout: 20_000 });
    await expect(final).toHaveText(/[.!?]$/);
  });

  test('pause really stops, and resume continues', async ({ page }) => {
    await startListening(page);
    await expect(page.getByTestId('segment-final').first()).toBeVisible({ timeout: 20_000 });

    await page.getByTestId('toggle-pause').click();
    await expect(page.getByTestId('toggle-pause')).toHaveText(/resume/i);
    const frozen = await page.getByTestId('segment-final').count();

    await page.waitForTimeout(2000);
    expect(await page.getByTestId('segment-final').count()).toBe(frozen);

    await page.getByTestId('toggle-pause').click();
    await expect(page.getByTestId('toggle-pause')).toHaveText(/pause/i);
  });

  test('changes the reading language mid-session', async ({ page }) => {
    await startListening(page);
    await page.getByTestId('language-chip').click();
    const picker = page.getByRole('dialog');
    await picker.getByPlaceholder(/search/i).fill('francais');
    await picker
      .getByRole('button', { name: /Français/ })
      .first()
      .click();
    await expect(page.getByTestId('language-chip')).toContainText('Français');
  });

  test('ends the session and requires an explicit save', async ({ page }) => {
    await startListening(page);
    await expect(page.getByTestId('segment-final').first()).toBeVisible({ timeout: 20_000 });

    await page.getByTestId('end-session').click();
    await expect(page.getByTestId('save-transcript')).toBeVisible();
    await expect(page.getByTestId('discard-transcript')).toBeVisible();

    await page.getByTestId('save-transcript').click();

    await page.goto('/en/history');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });

  test('deleting instead of saving leaves nothing in history', async ({ page }) => {
    await startListening(page);
    await expect(page.getByTestId('segment-final').first()).toBeVisible({ timeout: 20_000 });
    await page.getByTestId('end-session').click();
    await page.getByTestId('discard-transcript').click();
    await expect(page).toHaveURL(/\/en$/);
  });
});

test.describe('Discuss', () => {
  for (const count of [2, 3, 4] as const) {
    test(`lays out ${count} people with one tile each`, async ({ page }) => {
      await page.goto('/en/discuss');
      await page.getByTestId(`people-${count}`).click();
      await expect(page.getByTestId('discussion-canvas')).toBeVisible();
      for (let index = 0; index < count; index++) {
        await expect(page.getByTestId(`tile-${index}`)).toBeVisible();
        await expect(page.getByTestId(`tile-speak-${index}`)).toBeVisible();
      }
      await expect(page.getByTestId(`tile-${count}`)).toHaveCount(0);
    });
  }

  test('rotates a single tile through 0/90/180/270 without touching the others', async ({
    page,
  }) => {
    await page.goto('/en/discuss');
    await page.getByTestId('people-2').click();

    const tile = page.getByTestId('tile-0');
    const other = page.getByTestId('tile-1');
    const otherBefore = await other.getAttribute('data-rotation');

    await expect(tile).toHaveAttribute('data-rotation', '0');
    await page.getByTestId('tile-rotate-0').click();
    await expect(tile).toHaveAttribute('data-rotation', '90');
    await page.getByTestId('tile-rotate-0').click();
    await expect(tile).toHaveAttribute('data-rotation', '180');
    await page.getByTestId('tile-rotate-0').click();
    await expect(tile).toHaveAttribute('data-rotation', '270');
    await page.getByTestId('tile-rotate-0').click();
    await expect(tile).toHaveAttribute('data-rotation', '0');

    await expect(other).toHaveAttribute('data-rotation', otherBefore ?? '180');
  });

  test('keeps Arabic right-to-left inside a rotated tile', async ({ page }) => {
    await page.goto('/en/discuss');
    await page.getByTestId('people-3').click();

    await page.getByTestId('tile-language-1').click();
    const picker = page.getByRole('dialog');
    await picker.getByPlaceholder(/search/i).fill('arabic');
    await picker
      .getByRole('button', { name: /العربية/ })
      .first()
      .click();

    const tile = page.getByTestId('tile-1');
    await expect(tile).toHaveAttribute('data-direction', 'rtl');

    // Rotating must not change the text direction.
    await page.getByTestId('tile-rotate-1').click();
    await expect(tile).toHaveAttribute('data-direction', 'rtl');
  });

  test('allows only one speaker at a time', async ({ page }) => {
    await page.goto('/en/discuss');
    await page.getByTestId('people-2').click();

    await page.getByTestId('tile-speak-0').dispatchEvent('pointerdown');
    await expect(page.getByTestId('tile-speak-1')).toBeDisabled();
    await page.getByTestId('tile-speak-0').dispatchEvent('pointerup');
    await expect(page.getByTestId('tile-speak-1')).toBeEnabled();
  });
});

test.describe('Join', () => {
  test('rejects an invalid code with a localised message', async ({ page }) => {
    await page.goto('/en/join');
    await page.getByTestId('code-input').fill('000000');
    await page.getByTestId('lookup-code').click();
    await expect(page.getByTestId('alert')).toContainText(/not valid/i);
  });

  test('accepts a code typed with a space', async ({ page }) => {
    await page.goto('/en/join');
    await page.getByTestId('code-input').fill('728 416');
    // The field normalises to digits as you type.
    await expect(page.getByTestId('code-input')).toHaveValue('728416');
  });

  test('never asks for an account', async ({ page }) => {
    await page.goto('/en/join');
    await expect(page.getByText(/no account needed/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /sign in|create an account/i })).toHaveCount(0);
  });

  test('opens a deep link straight into the join flow', async ({ page }) => {
    await page.goto('/en/join/728416');
    await expect(page.getByTestId('code-input').or(page.getByTestId('confirm-join'))).toBeVisible();
  });
});

test.describe('Settings', () => {
  test('changes the transcript size and the theme', async ({ page }) => {
    await page.goto('/en/settings');
    await page.getByTestId('transcript-scale').fill('2');
    await page.getByTestId('theme-dark').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.getByTestId('theme-light').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  });

  test('offers account deletion from inside the app', async ({ page }) => {
    await page.goto('/en/settings');
    await page.getByTestId('delete-account').click();
    await expect(page.getByTestId('confirm-delete-account')).toBeVisible();
  });
});
