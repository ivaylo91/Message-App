import AsyncStorage from '@react-native-async-storage/async-storage';
import { ThemePreference } from './tokens';

const STORAGE_KEY = 'themePreference:v1';

export async function loadThemePreference(): Promise<ThemePreference | null> {
  try {
    const saved = await AsyncStorage.getItem(STORAGE_KEY);
    return saved === 'light' || saved === 'dark' || saved === 'system' ? saved : null;
  } catch {
    return null;
  }
}

export async function saveThemePreference(preference: ThemePreference): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, preference);
  } catch {
    // Best-effort; the app still honours the choice for this session.
  }
}
