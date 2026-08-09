import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import AsyncStorage from '@react-native-async-storage/async-storage';
import en from './locales/en.json';
import lo from './locales/lo.json';
import zh from './locales/zh.json';

export const LANGUAGE_STORAGE_KEY = 'app_language';

export const SUPPORTED_LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'lo', label: 'ລາວ' },
  { code: 'zh', label: '中文' },
] as const;

export type LanguageCode = (typeof SUPPORTED_LANGUAGES)[number]['code'];

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    lo: { translation: lo },
    zh: { translation: zh },
  },
  lng: 'en', // default per product decision — no device-locale auto-detect
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

/** Call once at app startup to restore the user's saved language choice. */
export async function restoreSavedLanguage() {
  try {
    const saved = await AsyncStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (saved && SUPPORTED_LANGUAGES.some((l) => l.code === saved)) {
      await i18n.changeLanguage(saved);
    }
  } catch {
    // Ignore — falls back to default English.
  }
}

export async function setLanguage(code: LanguageCode) {
  await i18n.changeLanguage(code);
  await AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, code);
}

export default i18n;
