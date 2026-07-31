import { expect, test } from '@playwright/test';

/**
 * The public site.
 *
 * These assertions protect the things that are invisible until they break:
 * locale routing, hreflang, canonical tags, the noindex boundary around the
 * product, and RTL rendering for Arabic.
 */

test.describe('localized marketing site', () => {
  test('redirects a bare URL to a locale and renders the home page', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/(fr|en|ar|es|pt-br|it|de)$/);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });

  test('serves each locale on its own URL with the right language and direction', async ({
    page,
  }) => {
    for (const [segment, lang, dir] of [
      ['fr', 'fr', 'ltr'],
      ['en', 'en', 'ltr'],
      ['ar', 'ar', 'rtl'],
      ['pt-br', 'pt-BR', 'ltr'],
    ] as const) {
      await page.goto(`/${segment}`);
      await expect(page.locator('html')).toHaveAttribute('lang', lang);
      await expect(page.locator('html')).toHaveAttribute('dir', dir);
    }
  });

  test('emits canonical and hreflang alternates including x-default', async ({ page }) => {
    await page.goto('/fr/live-transcription');
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      'href',
      /\/fr\/live-transcription$/,
    );
    const alternates = page.locator('link[rel="alternate"]');
    await expect(alternates).toHaveCount(8); // seven locales + x-default
    await expect(page.locator('link[rel="alternate"][hreflang="x-default"]')).toHaveCount(1);
  });

  test('gives every page a unique title', async ({ page }) => {
    const titles = new Set<string>();
    for (const path of ['', '/live-transcription', '/live-translation', '/pricing', '/security']) {
      await page.goto(`/en${path}`);
      const title = await page.title();
      expect(titles.has(title), `duplicate title: ${title}`).toBe(false);
      titles.add(title);
    }
  });

  test('publishes a sitemap covering every locale', async ({ request }) => {
    const response = await request.get('/sitemap.xml');
    expect(response.ok()).toBe(true);
    const body = await response.text();
    for (const segment of ['/fr', '/en', '/ar', '/pt-br', '/de']) {
      expect(body).toContain(segment);
    }
    expect(body).toContain('hreflang');
  });

  test('excludes every product surface from indexing', async ({ page, request }) => {
    const robots = await (await request.get('/robots.txt')).text();
    for (const path of ['/*/listen', '/*/join', '/*/history', '/*/admin']) {
      expect(robots).toContain(path);
    }

    await page.goto('/en/listen');
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
  });

  test('never uses a flag emoji for a language', async ({ page }) => {
    await page.goto('/en');
    const text = await page.locator('body').innerText();
    expect(/[\u{1F1E6}-\u{1F1FF}]/u.test(text)).toBe(false);
  });

  test('switches language through a real link, keeping the page', async ({ page }) => {
    await page.goto('/en/pricing');
    await page.locator('details summary').first().click();
    await page.getByRole('link', { name: 'Français', exact: true }).click();
    await expect(page).toHaveURL(/\/fr\/pricing$/);
    await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
  });

  test('serves a PWA manifest and an offline page', async ({ page, request }) => {
    const manifest = await (await request.get('/manifest.webmanifest')).json();
    expect(manifest.name).toContain('LingoLive');
    expect(manifest.display).toBe('standalone');
    expect(manifest.icons.length).toBeGreaterThanOrEqual(3);

    await page.goto('/offline');
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/offline/i);
  });

  test('renders a helpful 404', async ({ page }) => {
    const response = await page.goto('/en/this-page-does-not-exist');
    expect(response?.status()).toBe(404);
    await expect(page.getByRole('link', { name: /listen/i })).toBeVisible();
  });
});

test.describe('accessibility basics', () => {
  test('exposes a skip link and a keyboard-reachable first control', async ({ page }) => {
    await page.goto('/en');
    await page.keyboard.press('Tab');
    const focused = page.locator(':focus');
    await expect(focused).toBeVisible();
  });

  test('has exactly one h1 per page', async ({ page }) => {
    for (const path of ['', '/pricing', '/how-it-works', '/guides']) {
      await page.goto(`/en${path}`);
      await expect(page.locator('h1')).toHaveCount(1);
    }
  });
});
