import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';
import lo from './locales/lo.json';
import zh from './locales/zh.json';

const STORAGE_KEY = 'admin_language';

export const SUPPORTED_LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'lo', label: 'ລາວ' },
  { code: 'zh', label: '中文' },
] as const;

export type LanguageCode = (typeof SUPPORTED_LANGUAGES)[number]['code'];

const saved = typeof window !== 'undefined' ? window.localStorage.getItem(STORAGE_KEY) : null;

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    lo: { translation: lo },
    zh: { translation: zh },
  },
  lng: saved && SUPPORTED_LANGUAGES.some((l) => l.code === saved) ? saved : 'en',
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

export function setLanguage(code: LanguageCode) {
  i18n.changeLanguage(code);
  window.localStorage.setItem(STORAGE_KEY, code);
}

export default i18n;
