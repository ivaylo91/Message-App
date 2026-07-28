import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import * as RNLocalize from 'react-native-localize';
import AsyncStorage from '@react-native-async-storage/async-storage';
import en from './locales/en.json';
import bg from './locales/bg.json';

export const SUPPORTED_LANGUAGES = ['en', 'bg'] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

const LANGUAGE_STORAGE_KEY = 'message-app/language';

function detectDeviceLanguage(): SupportedLanguage {
  const best = RNLocalize.findBestLanguageTag([...SUPPORTED_LANGUAGES]);
  return (best?.languageTag as SupportedLanguage | undefined) ?? 'en';
}

export async function initI18n(): Promise<void> {
  const stored = await AsyncStorage.getItem(LANGUAGE_STORAGE_KEY);
  const language =
    (stored as SupportedLanguage | null) ?? detectDeviceLanguage();

  await i18n.use(initReactI18next).init({
    resources: {
      en: { translation: en },
      bg: { translation: bg },
    },
    lng: language,
    fallbackLng: 'en',
    interpolation: { escapeValue: false },
  });
}

export async function setLanguage(language: SupportedLanguage): Promise<void> {
  await AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, language);
  await i18n.changeLanguage(language);
}

export default i18n;