import messaging, {
  FirebaseMessagingTypes,
} from '@react-native-firebase/messaging';
import notifee, { AndroidImportance, EventType } from '@notifee/react-native';
import * as pushTokensData from '../data/pushTokens';
import { navigateToChat } from '../navigation/navigationRef';

const MESSAGE_CHANNEL_ID = 'messages';

let listenersAttached = false;

async function ensureAndroidChannel(): Promise<void> {
  await notifee.createChannel({
    id: MESSAGE_CHANNEL_ID,
    name: 'Messages',
    importance: AndroidImportance.HIGH,
  });
}

function conversationIdFrom(
  message: FirebaseMessagingTypes.RemoteMessage,
): string | undefined {
  const data = message.data;
  if (!data) return undefined;
  const value = data.conversationId;
  return typeof value === 'string' ? value : undefined;
}

async function displayForegroundNotification(
  message: FirebaseMessagingTypes.RemoteMessage,
): Promise<void> {
  const conversationId = conversationIdFrom(message);
  await notifee.displayNotification({
    title: message.notification?.title,
    body: message.notification?.body,
    data: conversationId ? { conversationId } : undefined,
    android: { channelId: MESSAGE_CHANNEL_ID, pressAction: { id: 'default' } },
  });
}

export async function requestPermissionAndRegisterToken(
  userId: string,
): Promise<void> {
  const settings = await messaging().requestPermission();
  const granted =
    settings === messaging.AuthorizationStatus.AUTHORIZED ||
    settings === messaging.AuthorizationStatus.PROVISIONAL;
  if (!granted) return;

  await ensureAndroidChannel();

  const token = await messaging().getToken();
  await pushTokensData.registerPushToken(userId, token);

  messaging().onTokenRefresh((refreshedToken) => {
    void pushTokensData.registerPushToken(userId, refreshedToken);
  });
}

export function attachNotificationListeners(): () => void {
  if (listenersAttached) return () => {};
  listenersAttached = true;

  const unsubscribeForeground = messaging().onMessage(async (message) => {
    await displayForegroundNotification(message);
  });

  const unsubscribeOpened = messaging().onNotificationOpenedApp((message) => {
    const conversationId = conversationIdFrom(message);
    if (conversationId) navigateToChat(conversationId);
  });

  messaging()
    .getInitialNotification()
    .then((message) => {
      const conversationId = message && conversationIdFrom(message);
      if (conversationId) navigateToChat(conversationId);
    });

  const unsubscribeNotifeeForeground = notifee.onForegroundEvent(({ type, detail }) => {
    if (type !== EventType.PRESS) return;
    const conversationId = detail.notification?.data?.conversationId;
    if (typeof conversationId === 'string') navigateToChat(conversationId);
  });

  return () => {
    unsubscribeForeground();
    unsubscribeOpened();
    unsubscribeNotifeeForeground();
    listenersAttached = false;
  };
}