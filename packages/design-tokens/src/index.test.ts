import { describe, expect, it } from 'vitest';
import {
  clampTranscriptScale,
  contrastRatio,
  conversation,
  conversationColorFor,
  cssVariables,
  darkTheme,
  duration,
  lightTheme,
  meetsContrastAA,
  MIN_TOUCH_TARGET,
  motionDuration,
  radius,
  transcriptFontSize,
} from './index.js';

describe('colour contrast (WCAG 2.2 AA)', () => {
  const cases: Array<[string, string, string, 'normal' | 'large']> = [
    ['body text on background', lightTheme.text, lightTheme.background, 'normal'],
    ['body text on surface', lightTheme.text, lightTheme.surface, 'normal'],
    ['secondary text on surface', lightTheme.textSecondary, lightTheme.surface, 'normal'],
    ['final transcript on background', lightTheme.transcriptFinal, lightTheme.background, 'normal'],
    // Partial transcript is intentionally lower contrast, but must stay legible.
    [
      'partial transcript on background',
      lightTheme.transcriptPartial,
      lightTheme.background,
      'normal',
    ],
    ['text on primary button', lightTheme.textOnPrimary, lightTheme.primary, 'large'],
    ['dark body text', darkTheme.text, darkTheme.background, 'normal'],
    ['dark secondary text', darkTheme.textSecondary, darkTheme.surface, 'normal'],
    ['dark final transcript', darkTheme.transcriptFinal, darkTheme.background, 'normal'],
    ['dark partial transcript', darkTheme.transcriptPartial, darkTheme.background, 'normal'],
  ];

  for (const [label, fg, bg, size] of cases) {
    it(`${label} meets AA`, () => {
      const ratio = contrastRatio(fg, bg);
      expect(
        meetsContrastAA(fg, bg, size),
        `${label}: ratio ${ratio.toFixed(2)} below AA threshold`,
      ).toBe(true);
    });
  }

  it('computes the canonical black-on-white ratio', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 1);
    expect(contrastRatio('#FFFFFF', '#FFFFFF')).toBeCloseTo(1, 5);
  });
});

describe('touch targets', () => {
  it('never drops below 48 logical pixels', () => {
    expect(MIN_TOUCH_TARGET).toBeGreaterThanOrEqual(48);
  });
});

describe('motion', () => {
  it('keeps functional animations short', () => {
    for (const key of ['fast', 'base', 'slow'] as const) {
      expect(duration[key]).toBeGreaterThanOrEqual(150);
      expect(duration[key]).toBeLessThanOrEqual(220);
    }
  });

  it('collapses to zero when Reduce Motion is on', () => {
    expect(motionDuration(duration.base, true)).toBe(0);
    expect(motionDuration(duration.base, false)).toBe(duration.base);
  });
});

describe('transcript scale', () => {
  it('clamps out-of-range and invalid values', () => {
    expect(clampTranscriptScale(0.1)).toBe(0.75);
    expect(clampTranscriptScale(9)).toBe(2.5);
    expect(clampTranscriptScale(Number.NaN)).toBe(1);
    expect(clampTranscriptScale(1.5)).toBe(1.5);
  });

  it('scales the transcript font size', () => {
    expect(transcriptFontSize(1)).toBe(24);
    expect(transcriptFontSize(2)).toBe(48);
  });
});

describe('css bridge', () => {
  it('exposes every theme colour as a custom property', () => {
    const vars = cssVariables('light');
    expect(vars['--ll-color-primary']).toBe(lightTheme.primary);
    expect(vars['--ll-color-transcript-partial']).toBe(lightTheme.transcriptPartial);
    expect(vars['--ll-radius-xl']).toBe(`${radius.xl}px`);
    expect(vars['--ll-min-touch-target']).toBe('48px');
  });

  it('produces a different palette for dark mode', () => {
    expect(cssVariables('dark')['--ll-color-background']).not.toBe(
      cssVariables('light')['--ll-color-background'],
    );
  });
});

describe('conversation colours', () => {
  /**
   * Seven hues, each with a surface and a text colour. The raw hues reach
   * 1.7–3.7:1 on white, so the obvious thing to do with a colour — write in it
   * — fails AA for every one of them. These assert that the derived pairs do
   * not, because a participant's identity colour is worthless if their words
   * become unreadable in it.
   */
  for (const [name, color] of Object.entries(conversation)) {
    it(`${name}: text on its own light surface meets AA`, () => {
      const ratio = contrastRatio(color.text, color.soft);
      expect(meetsContrastAA(color.text, color.soft, 'normal'), `${ratio.toFixed(2)}`).toBe(true);
    });

    it(`${name}: text on its own dark surface meets AA`, () => {
      const ratio = contrastRatio(color.textDark, color.softDark);
      expect(meetsContrastAA(color.textDark, color.softDark, 'normal'), `${ratio.toFixed(2)}`).toBe(
        true,
      );
    });
  }

  it('gives each seat at the table a different colour', () => {
    // Four people is the maximum a Discuss session supports, and all four must
    // be distinguishable — the same colour twice is worse than no colour.
    const seats = [0, 1, 2, 3].map((position) => conversationColorFor(position).base);
    expect(new Set(seats).size).toBe(4);
  });

  it('gives the same seat the same colour every time', () => {
    // An identity that changes between sessions is not an identity.
    expect(conversationColorFor(1).base).toBe(conversationColorFor(1).base);
    expect(conversationColorFor(1).base).toBe(conversation.coral.base);
  });
});

describe('muted text', () => {
  it('is legible, not merely quiet', () => {
    // A muted grey wants to be around #98A2B3, which reaches 2.58:1 on white —
    // below AA for any text. Muted is a hierarchy signal, not permission to
    // become unreadable.
    expect(meetsContrastAA(lightTheme.textMuted, lightTheme.surface, 'normal')).toBe(true);
    expect(meetsContrastAA(darkTheme.textMuted, darkTheme.surface, 'normal')).toBe(true);
  });
});
