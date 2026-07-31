import { cssVariableBlock } from '@lingolive/design-tokens';

/**
 * Emits the design tokens as CSS custom properties, once, in the document
 * head — before any paint, so there is no flash of the wrong theme.
 *
 * Dark mode follows the system by default and can be pinned by the user; the
 * `data-theme` attribute set by the toggle wins over the media query in both
 * directions, which is what makes an explicit choice actually stick.
 */
export function themeStyleSheet(): string {
  return [
    cssVariableBlock('light', ':root'),
    `@media (prefers-color-scheme: dark) {\n${cssVariableBlock('dark', '  :root:not([data-theme="light"])')}\n}`,
    cssVariableBlock('dark', ':root[data-theme="dark"]'),
    cssVariableBlock('light', ':root[data-theme="light"]'),
  ].join('\n');
}

/**
 * Applies the stored theme before first paint.
 *
 * Inlined deliberately: doing this in an effect means the user sees a light
 * flash on every load, which is exactly the thing someone using a dark theme
 * in a dark room does not want.
 */
export const THEME_BOOTSTRAP_SCRIPT = `
(function () {
  try {
    var stored = localStorage.getItem('lingolive.theme');
    if (stored === 'dark' || stored === 'light') {
      document.documentElement.setAttribute('data-theme', stored);
    }
    var scale = localStorage.getItem('lingolive.transcriptScale');
    if (scale) {
      document.documentElement.style.setProperty('--ll-transcript-scale', scale);
    }
  } catch (e) {
    /* Storage can be unavailable (private mode, blocked cookies). Not fatal. */
  }
})();
`.trim();
