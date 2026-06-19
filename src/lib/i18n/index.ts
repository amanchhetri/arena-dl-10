import * as Localization from 'expo-localization';
import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';

import en from './locales/en.json';

const deviceLocale = Localization.getLocales()[0]?.languageCode ?? 'en';

void i18next.use(initReactI18next).init({
  resources: { en: { translation: en } },
  lng: deviceLocale === 'en' ? 'en' : 'en', // English only in Slice 1
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
  returnNull: false,
});

export const t = (key: string, options?: Record<string, unknown>): string =>
  i18next.t(key, options) as string;

export default i18next;
