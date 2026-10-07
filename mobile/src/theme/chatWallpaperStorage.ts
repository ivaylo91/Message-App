import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'chatWallpaper:v1';

// null when never chosen, so the default can live in one place
// (ThemeProvider) rather than here.
export async function loadChatWallpaper(): Promise<boolean | null> {
  const saved = await AsyncStorage.getItem(STORAGE_KEY);
  return saved === null ? null : saved === 'on';
}

export async function saveChatWallpaper(enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, enabled ? 'on' : 'off');
}
