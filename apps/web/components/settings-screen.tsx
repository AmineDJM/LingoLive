'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  findLanguage,
  UI_LOCALE_DEFINITIONS,
  type MeResponse,
  type UiLocale,
} from '@lingolive/contracts';
import { TRANSCRIPT_SCALE_MAX, TRANSCRIPT_SCALE_MIN } from '@lingolive/design-tokens';
import { createTranslator } from '@lingolive/i18n';
import { createApiClient, readTranscriptScale, writeTranscriptScale } from '@/lib/client';
import { localizedPath } from '@/lib/site';
import { Alert, Button, Card } from './ui';
import { LanguagePicker } from './language-picker';

/**
 * Settings.
 *
 * Deliberately short. Every technical knob the product needs lives in
 * configuration, not in front of the user; what is here is what someone would
 * actually want to change about how they read.
 */
export function SettingsScreen({ locale }: { locale: UiLocale }) {
  const t = createTranslator(locale);
  const router = useRouter();

  const [me, setMe] = useState<MeResponse | null>(null);
  const [scale, setScale] = useState(1);
  const [theme, setTheme] = useState<'system' | 'light' | 'dark'>('system');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    setScale(readTranscriptScale());
    const stored = window.localStorage.getItem('lingolive.theme');
    if (stored === 'dark' || stored === 'light') setTheme(stored);
    void createApiClient()
      .me()
      .then(setMe)
      .catch(() => undefined);
  }, []);

  const applyTheme = (next: 'system' | 'light' | 'dark'): void => {
    setTheme(next);
    if (next === 'system') {
      document.documentElement.removeAttribute('data-theme');
      window.localStorage.removeItem('lingolive.theme');
    } else {
      document.documentElement.setAttribute('data-theme', next);
      window.localStorage.setItem('lingolive.theme', next);
    }
  };

  const applyScale = (next: number): void => {
    setScale(next);
    writeTranscriptScale(next);
  };

  const updateReadingLanguage = (language: string): void => {
    setMe((current) => (current ? { ...current, preferredReadingLanguage: language } : current));
    void createApiClient().updateMe({ preferredReadingLanguage: language });
  };

  const deleteAccount = async (): Promise<void> => {
    setDeleting(true);
    try {
      await createApiClient().deleteMe();
      window.localStorage.clear();
      router.push(localizedPath(locale));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-md px-4 py-8">
      <h1 className="text-2xl font-bold text-ink">{t.t('settings.title')}</h1>

      <section className="mt-6">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-ink-muted">
          {t.t('settings.sectionGeneral')}
        </h2>
        <Card className="space-y-4">
          <div>
            <p className="mb-2 text-[15px] font-medium text-ink">
              {t.t('settings.interfaceLanguage')}
            </p>
            <ul className="flex flex-wrap gap-2">
              {UI_LOCALE_DEFINITIONS.map((definition) => (
                <li key={definition.locale}>
                  <Link
                    href={localizedPath(definition.locale, 'settings')}
                    hrefLang={definition.htmlLang}
                    className={
                      definition.locale === locale
                        ? 'inline-flex rounded-[var(--radius-full)] bg-primary px-4 py-2 text-[14px] font-semibold text-on-primary'
                        : 'inline-flex rounded-[var(--radius-full)] border border-border px-4 py-2 text-[14px] text-ink'
                    }
                  >
                    {definition.nativeName}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="mb-2 text-[15px] font-medium text-ink">
              {t.t('settings.readingLanguage')}
            </p>
            <Button
              variant="secondary"
              onClick={() => setPickerOpen(true)}
              data-testid="reading-language"
            >
              {findLanguage(me?.preferredReadingLanguage ?? locale)?.nativeName ??
                me?.preferredReadingLanguage ??
                locale}
            </Button>
          </div>

          <div>
            <p className="mb-2 text-[15px] font-medium text-ink">{t.t('settings.appearance')}</p>
            <div className="flex gap-2">
              {(['system', 'light', 'dark'] as const).map((option) => (
                <Button
                  key={option}
                  variant={theme === option ? 'primary' : 'secondary'}
                  onClick={() => applyTheme(option)}
                  data-testid={`theme-${option}`}
                >
                  {t.t(
                    `settings.appearance${option[0]!.toUpperCase()}${option.slice(1)}` as 'settings.appearanceSystem',
                  )}
                </Button>
              ))}
            </div>
          </div>
        </Card>
      </section>

      <section className="mt-6">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-ink-muted">
          {t.t('settings.sectionAccessibility')}
        </h2>
        <Card>
          <label className="block">
            <span className="text-[15px] font-medium text-ink">
              {t.t('settings.transcriptSize')}
            </span>
            <input
              type="range"
              min={TRANSCRIPT_SCALE_MIN}
              max={TRANSCRIPT_SCALE_MAX}
              step={0.25}
              value={scale}
              onChange={(event) => applyScale(Number(event.target.value))}
              data-testid="transcript-scale"
              className="mt-3 w-full"
            />
          </label>
          <p
            className="ll-transcript mt-3 rounded-[var(--radius-md)] bg-background p-3 text-transcript-final"
            aria-hidden="true"
          >
            {t.t('marketing.heroTitle')}
          </p>
        </Card>
      </section>

      <section className="mt-6">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-ink-muted">
          {t.t('settings.sectionPrivacy')}
        </h2>
        <Card className="space-y-3">
          <p className="text-[15px] text-ink-secondary">{t.t('settings.autoSaveHint')}</p>
          {me ? (
            <p className="text-[15px] text-ink">
              {t.t('settings.usageValue', {
                used: Math.round(me.quota.minutesUsedThisPeriod),
                total: me.quota.minutesPerMonth,
              })}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Link
              href={localizedPath(locale, 'privacy')}
              className="text-[15px] font-medium text-primary-text underline"
            >
              {t.t('settings.privacy')}
            </Link>
            <Link
              href={localizedPath(locale, 'terms')}
              className="text-[15px] font-medium text-primary-text underline"
            >
              {t.t('settings.terms')}
            </Link>
          </div>
        </Card>
      </section>

      <section className="mt-6">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-ink-muted">
          {t.t('settings.sectionAccount')}
        </h2>
        <Card>
          {confirmDelete ? (
            <>
              <Alert tone="danger" title={t.t('settings.deleteAccountConfirmTitle')}>
                {t.t('settings.deleteAccountConfirmBody')}
              </Alert>
              <div className="mt-3 flex gap-2">
                <Button
                  variant="secondary"
                  className="flex-1"
                  onClick={() => setConfirmDelete(false)}
                >
                  {t.t('common.cancel')}
                </Button>
                <Button
                  variant="danger"
                  className="flex-1"
                  disabled={deleting}
                  onClick={() => void deleteAccount()}
                  data-testid="confirm-delete-account"
                >
                  {t.t('common.delete')}
                </Button>
              </div>
            </>
          ) : (
            <Button
              variant="danger"
              onClick={() => setConfirmDelete(true)}
              data-testid="delete-account"
            >
              {t.t('settings.deleteAccount')}
            </Button>
          )}
        </Card>
      </section>

      <p className="mt-8 text-center text-[13px] text-ink-muted">
        {t.t('settings.version', { version: '1.0.0' })}
      </p>

      {pickerOpen ? (
        <LanguagePicker
          value={me?.preferredReadingLanguage ?? locale}
          onChange={updateReadingLanguage}
          onClose={() => setPickerOpen(false)}
          title={t.t('settings.readingLanguage')}
          searchPlaceholder={t.t('languagePicker.searchPlaceholder')}
          originalLabel={t.t('languagePicker.original')}
          originalHint={t.t('languagePicker.originalHint')}
          noResultsLabel={t.t('languagePicker.noResults')}
        />
      ) : null}
    </div>
  );
}
