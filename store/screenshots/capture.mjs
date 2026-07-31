#!/usr/bin/env node
/**
 * Store screenshot capture.
 *
 * Drives the running web app at device pixel sizes and writes one PNG per
 * scene per locale. Using the web app rather than a simulator is what makes
 * seven languages come out identically framed — and it uses the same
 * components the native app renders.
 *
 * Requires the API (AI_PROVIDER=mock) and the web app to be running.
 *
 *   node store/screenshots/capture.mjs
 *   node store/screenshots/capture.mjs --locale ar --scene discuss-4
 */
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.env.WEB_URL ?? 'http://localhost:3000';

const LOCALES = ['en', 'fr', 'ar', 'es', 'pt-br', 'it', 'de'];

/** Store-required device sizes, in CSS pixels with a device scale factor. */
const SIZES = [
  { id: 'iphone-6.9', width: 440, height: 956, scale: 3 }, // 1320 × 2868
  { id: 'iphone-6.5', width: 414, height: 896, scale: 3 }, // 1242 × 2688
  { id: 'android-phone', width: 360, height: 640, scale: 3 }, // 1080 × 1920
];

/**
 * Each scene is a path plus the actions needed to put the product in the state
 * worth showing. `settle` is generous on purpose: a screenshot of a
 * half-rendered transcript helps nobody.
 */
const SCENES = [
  { id: 'home', path: '/app', settle: 1200 },
  {
    id: 'listen',
    path: '/listen?simulate=1',
    settle: 6000,
    prepare: async (page) => {
      await page.getByTestId('start-session').click().catch(() => {});
    },
  },
  {
    id: 'discuss-4',
    path: '/discuss?people=4&simulate=1',
    settle: 6000,
    prepare: async (page) => {
      await page.getByTestId('start-session').click().catch(() => {});
    },
  },
  {
    id: 'discuss-arabic',
    path: '/discuss?people=2&simulate=1',
    settle: 6000,
    prepare: async (page) => {
      await page.getByTestId('start-session').click().catch(() => {});
    },
  },
  { id: 'join', path: '/join', settle: 1500 },
  { id: 'privacy', path: '/settings', settle: 1200 },
];

function parseArgs(argv) {
  const args = { locales: LOCALES, scenes: SCENES.map((scene) => scene.id) };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--locale') args.locales = [argv[++index]];
    else if (argv[index] === '--scene') args.scenes = [argv[++index]];
    else if (argv[index] === '--size') args.size = argv[++index];
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  let chromium;
  try {
    ({ chromium } = await import('playwright'));
  } catch {
    try {
      ({ chromium } = await import('@playwright/test'));
    } catch {
      console.error(
        'Playwright is not available. Run this from the repository root after\n' +
          '`pnpm install`, which installs it for apps/web.',
      );
      process.exit(1);
    }
  }

  try {
    const response = await fetch(BASE);
    if (!response.ok) throw new Error(String(response.status));
  } catch (error) {
    console.error(`The web app is not answering at ${BASE} (${error.message}).\nStart it with: pnpm dev:web`);
    process.exit(1);
  }

  const browser = await chromium.launch({
    ...(process.env.PLAYWRIGHT_CHROMIUM_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
      : {}),
  });

  const sizes = args.size ? SIZES.filter((size) => size.id === args.size) : SIZES;
  let written = 0;

  for (const locale of args.locales) {
    for (const size of sizes) {
      const context = await browser.newContext({
        viewport: { width: size.width, height: size.height },
        deviceScaleFactor: size.scale,
        isMobile: true,
        hasTouch: true,
        locale,
        colorScheme: 'light',
        // Animations mid-flight make a screenshot look broken.
        reducedMotion: 'reduce',
      });

      const page = await context.newPage();

      for (const scene of SCENES.filter((candidate) => args.scenes.includes(candidate.id))) {
        const url = `${BASE}/${locale}${scene.path}`;
        await page.goto(url, { waitUntil: 'networkidle' }).catch(() => {});
        if (scene.prepare) await scene.prepare(page);
        await page.waitForTimeout(scene.settle);

        const directory = path.join(HERE, 'out', locale, size.id);
        await mkdir(directory, { recursive: true });
        const file = path.join(directory, `${scene.id}.png`);
        await page.screenshot({ path: file });
        written += 1;
        console.log(`  ${locale}/${size.id}/${scene.id}.png`);
      }

      await context.close();
    }
  }

  await browser.close();
  console.log(`\n${written} screenshots written to store/screenshots/out/`);
  console.log('Add captions as a layer on top — never inside the product UI.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
