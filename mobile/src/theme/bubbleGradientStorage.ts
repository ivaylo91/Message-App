import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'bubbleGradient:v1';

export async function loadBubbleGradientId(): Promise<string | null> {
  return AsyncStorage.getItem(STORAGE_KEY);
}

export async function saveBubbleGradientId(id: string): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, id);
}
