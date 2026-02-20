import i18next from 'i18next';
import en from './en.json';
import da from './da.json';

export async function initI18n(): Promise<void> {
  await i18next.init({
    lng: localStorage.getItem('lang') ?? 'en',
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
