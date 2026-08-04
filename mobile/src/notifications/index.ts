import messaging, {
  FirebaseMessagingTypes,
} from '@react-native-firebase/messaging';
import notifee, { AndroidCategory, AndroidImportance, EventType } from '@notifee/react-native';
import { supabase } from '../lib/supabase';
import * as pushTokensData from '../data/pushTokens';
import { navigateToChat } from '../navigation/navigationRef';

const MESSAGE_CHANNEL_ID = 'messages';
const CALL_CHANNEL_ID = 'calls';

let listenersAttached = false;

async function ensureAndroidChannel(): Promise<void> {
  await notifee.createChannel({
    id: MESSAGE_CHANNEL_ID,
    name: 'Messages',
    importance: AndroidImportance.HIGH,
  });
}

async function ensureCallChannel(): Promise<void> {
  await notifee.createChannel({
    id: CALL_CHANNEL_ID,
    name: 'Calls',
    importance: AndroidImportance.HIGH,
    sound: 'default',
  });
}

// Called from index.js's background message handler - this is the one
// path that can reach a device that's backgrounded or fully killed,
// since the app can't rely on its normal realtime connection existing in
// either of those states. A full-screen-intent notification is what lets
// Android show this over the lock screen and ring, the way a real
// incoming call does; see AndroidManifest.xml for the permission this
// requires.
export async function displayIncomingCallNotification(
  message: FirebaseMessagingTypes.RemoteMessage,
): Promise<void> {
  const data = message.data;
  console.log('[CallDebug] displayIncomingCallNotification data', JSON.stringify(data));
  if (!data) return;
  await ensureCallChannel();
  console.log('[CallDebug] call channel ensured');

  const conversationId = typeof data.conversationId === 'string' ? data.conversationId : undefined;
  const callerId = typeof data.callerId === 'string' ? data.callerId : undefined;
  const callerName = typeof data.callerName === 'string' ? data.callerName : 'Incoming call';

  const notificationId = await notifee.displayNotification({
    title: callerName,
    body: 'Incoming video call',
    data: { ...(conversationId ? { conversationId } : {}), ...(callerId ? { callerId } : {}) },
    android: {
      channelId: CALL_CHANNEL_ID,
      category: AndroidCategory.CALL,
      importance: AndroidImportance.HIGH,
      autoCancel: true,
      pressAction: { id: 'default', launchActivity: 'default' },
      fullScreenAction: { id: 'default', launchActivity: 'default' },
      actions: [
        { title: 'Decline', pressAction: { id: 'decline' } },
        { title: 'Answer', pressAction: { id: 'default', launchActivity: 'default' } },
      ],
    },
  });
  console.log('[CallDebug] notifee.displayNotification returned id', notificationId);
}

// Lets the callee reject a call straight from the notification without
// opening the app - mirrors the "busy" broadcast CallContext sends when
// it's already on a call, using a one-off channel rather than the app's
// long-lived inbox channel, which may not exist in this context (this can
// run from a headless background event with no React tree mounted).
export async function declineIncomingCallFromNotification(callerId: string): Promise<void> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const userId = session?.user?.id;
  if (!userId) return;

  const channel = supabase.channel(`calls:${callerId}`, { config: { private: true } });
  await new Promise<void>((resolve) => {
    channel.subscribe((subStatus) => {
      if (subStatus === 'SUBSCRIBED') {
        channel.send({ type: 'broadcast', event: 'call-decline', payload: { from: userId } });
        resolve();
      }
    });
  });
  setTimeout(() => void supabase.removeChannel(channel), 1000);
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

export async function requestPermissionAndRegisterToken(): Promise<void> {
  const settings = await messaging().requestPermission();
  const granted =
    settings === messaging.AuthorizationStatus.AUTHORIZED ||
    settings === messaging.AuthorizationStatus.PROVISIONAL;
  if (!granted) return;

  await ensureAndroidChannel();

  const token = await messaging().getToken();
  await pushTokensData.registerPushToken(token);

  messaging().onTokenRefresh((refreshedToken) => {
    void pushTokensData.registerPushToken(refreshedToken);
  });
}

// Call before signing out - otherwise this device keeps receiving
// pushes for an account that's no longer signed in on it, and if a
// different account signs in on the same device afterwards, both
// would get notified for each other's messages.
export async function unregisterCurrentDeviceToken(): Promise<void> {
  const token = await messaging().getToken();
  await pushTokensData.unregisterPushToken(token);
}

export function attachNotificationListeners(): () => void {
  if (listenersAttached) return () => {};
  listenersAttached = true;

  const unsubscribeForeground = messaging().onMessage(async (message) => {
    // A foregrounded app already has its permanent realtime inbox channel
    // subscribed (see CallContext), so it gets the call-offer directly
    // and shows CallOverlay itself - a banner here would just duplicate
    // that. This push's job is only to wake a backgrounded/killed app
    // (see index.js's background handler).
    if (message.data?.type === 'call') return;
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