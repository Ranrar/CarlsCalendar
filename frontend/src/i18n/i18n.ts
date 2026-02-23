import i18next from 'i18next';
import en from './en.json';
import da from './da.json';

/**
 * Initialise i18next.
 *
 * Priority order:
 *  1. `preferredLang` — language stored in the user's server-side profile
 *  2. `localStorage['lang']` — last language chosen on this device
 *  3. `'en'` — fallback
 *
 * When `preferredLang` is supplied we also write it to localStorage so the
 * next cold load (before the session is fetched) still uses the right locale.
 */
export async function initI18n(preferredLang?: string): Promise<void> {
  const lang = preferredLang ?? localStorage.getItem('lang') ?? 'en';
  if (preferredLang) localStorage.setItem('lang', preferredLang);

  await i18next.init({
    lng: lang,
    fallbackLng: 'en',
    interpolation: { escapeValue: false },
    resources: {
      en: { translation: en },
      da: { translation: da },
    },
  });
}

export const t = (key: string, opts?: Record<string, unknown>): string =>
  i18next.t(key, opts);

export function setLanguage(lang: 'en' | 'da'): Promise<unknown> {
  localStorage.setItem('lang', lang);
  return i18next.changeLanguage(lang);
}
