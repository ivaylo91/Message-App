import { createNavigationContainerRef } from '@react-navigation/native';
import type { AppStackParamList } from './RootNavigator';

export const navigationRef = createNavigationContainerRef<AppStackParamList>();

export function navigateToChat(conversationId: string) {
  if (!navigationRef.isReady()) return;
  navigationRef.navigate('Chat', { conversationId, title: '' });
}