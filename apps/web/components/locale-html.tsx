'use client';

import { useEffect } from 'react';

/**
 * Applies `lang` and `dir` to the document element.
 *
 * The App Router renders one `<html>` element for the whole application, so
 * per-locale attributes are set here. Doing it in `useEffect` alone would ship
 * `lang="en"` to crawlers, so the same values are also written by an inline
 * script that runs before hydration.
 */
export function LocaleHtmlAttributes({ lang, dir }: { lang: string; dir: 'ltr' | 'rtl' }) {
  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = dir;
  }, [lang, dir]);

  return (
    <script
      // Values come from a closed locale enum, never from user input.
      dangerouslySetInnerHTML={{
        __html: `document.documentElement.lang=${JSON.stringify(lang)};document.documentElement.dir=${JSON.stringify(dir)};`,
      }}
    />
  );
}
