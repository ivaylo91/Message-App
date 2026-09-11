import messaging, {
  FirebaseMessagingTypes,
} from '@react-native-firebase/messaging';
import notifee, {
  AndroidCategory,
  AndroidImportance,
  AuthorizationStatus,
  EventType,
} from '@notifee/react-native';
import type { NotificationSettings } from '@notifee/react-native';
import { supabase } from '../lib/supabase';
import * as pushTokensData from '../data/pushTokens';
import * as conversationsData from '../data/conversations';
import { navigateToChat } from '../navigation/navigationRef';
import { requestAutoAnswer } from '../calling/autoAnswerFlag';

const MESSAGE_CHANNEL_ID = 'messages';
// Hardcoded, like the call notification's actions: these can be rendered
// from a headless task where i18n has never been initialised.
const REPLY_ACTION_TITLE = 'Reply';
const REPLY_PLACEHOLDER = 'Message';
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
  if (!data) return;
  await ensureCallChannel();

  const conversationId = typeof data.conversationId === 'string' ? data.conversationId : undefined;
  const callerId = typeof data.callerId === 'string' ? data.callerId : undefined;
  const callerName = typeof data.callerName === 'string' ? data.callerName : 'Incoming call';

  await notifee.displayNotification({
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
        { title: 'Answer', pressAction: { id: 'answer', launchActivity: 'default' } },
      ],
    },
  });
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

// Message pushes are data-only (see supabase/functions/send-push-notification)
// so that this renders them rather than Firebase. That is what makes an
// inline reply action possible at all: an action can only be attached to a
// notification the app builds itself, and a payload carrying an FCM
// `notification` block is drawn by Android before any JS runs.
//
// The trade-off, stated plainly: a `notification` payload is displayed even
// when the app's JS cannot run, whereas this depends on the background
// handler executing. High-priority data messages do wake the app, and the
// call notifications have relied on exactly this since before the reply
// feature, so the precedent is established rather than new.
export async function displayMessageNotification(
  message: FirebaseMessagingTypes.RemoteMessage,
): Promise<void> {
  const data = message.data;
  const conversationId = typeof data?.conversationId === 'string' ? data.conversationId : undefined;
  // Title and body are still composed server-side, so they stay generic -
  // a push is commonly readable on a locked device (see genericBodyFor in
  // the Edge Function). They are not localised yet; that would mean
  // initialising i18n in a headless task.
  const title = typeof data?.title === 'string' ? data.title : 'New message';
  const body = typeof data?.body === 'string' ? data.body : 'Sent you a message';
  // A reaction notification gets no Reply action: replying to a thumbs up
  // would post a message into the conversation, which is not what the
  // action appears to offer.
  const isReaction = data?.type === 'reaction';

  await ensureAndroidChannel();

  await notifee.displayNotification({
    // Keyed by conversation, so a second message replaces the first rather
    // than stacking - and a reply dismisses the notification it came from.
    // Reactions get their own key, or reacting to a message would silently
    // replace the notification for the message itself.
    id: isReaction && conversationId ? `${conversationId}:reaction` : conversationId,
    title,
    body,
    data: conversationId ? { conversationId } : {},
    android: {
      channelId: MESSAGE_CHANNEL_ID,
      pressAction: { id: 'default', launchActivity: 'default' },
      actions: conversationId && !isReaction
        ? [
            {
              title: REPLY_ACTION_TITLE,
              pressAction: { id: 'reply' },
              input: { allowFreeFormInput: true, placeholder: REPLY_PLACEHOLDER },
            },
          ]
        : undefined,
    },
  });
}

// Sends a reply typed straight into the notification, with no React tree
// mounted - this can run from a headless background task. The session comes
// from the keychain-backed store the Supabase client already uses, so it
// works the same whether the app is running or was killed.
export async function sendReplyFromNotification(
  conversationId: string,
  body: string,
): Promise<void> {
  const trimmed = body.trim();
  if (!trimmed) return;

  const {
    data: { session },
  } = await supabase.auth.getSession();
  const userId = session?.user?.id;
  if (!userId) return;

  await conversationsData.sendMessage(conversationId, userId, trimmed, null);
  // Replying means you have read it; without this the unread badge would
  // still be counting the message you just answered.
  await conversationsData.markConversationRead(conversationId, userId).catch(() => {});
  await notifee.cancelNotification(conversationId);
}

// Shared by the foreground and background event handlers, which live in
// different files but must treat the reply action identically.
export async function handleReplyAction(detail: {
  notification?: { data?: Record<string, unknown> | undefined };
  input?: string;
}): Promise<void> {
  const conversationId = detail.notification?.data?.conversationId;
  if (typeof conversationId !== 'string' || typeof detail.input !== 'string') return;
  await sendReplyFromNotification(conversationId, detail.input);
}

export type NotificationPermission = 'granted' | 'denied';

function toPermission(settings: NotificationSettings): NotificationPermission {
  return settings.authorizationStatus === AuthorizationStatus.AUTHORIZED ||
    settings.authorizationStatus === AuthorizationStatus.PROVISIONAL
    ? 'granted'
    : 'denied';
}

// Reads the current state without prompting - used to show whether
// notifications are on, rather than to ask for them.
export async function getNotificationPermission(): Promise<NotificationPermission> {
  return toPermission(await notifee.getNotificationSettings());
}

// Android only lets an app ask twice; after that requestPermission()
// returns denied without showing anything, and the system settings
// screen is the only way back. This is that way back.
export async function openNotificationSettings(): Promise<void> {
  await notifee.openNotificationSettings();
}

// This used to call messaging().requestPermission(), which does nothing
// on Android: it's marked @platform ios upstream and returns
// `Promise.resolve(AuthorizationStatus.AUTHORIZED)` on Android without
// ever showing a prompt - the Android native module has no
// requestPermission method at all, only hasPermission (which just reads
// areNotificationsEnabled()).
//
// With targetSdkVersion 36, POST_NOTIFICATIONS is a runtime permission,
// so nothing was ever requested and Android dropped every notification
// silently. The token still registered and the server still reported
// {"sent":N}, so the whole pipeline looked healthy from the outside -
// which is exactly why this was hard to see.
//
// notifee's requestPermission does request POST_NOTIFICATIONS natively
// (NotifeeApiModule.java), and behaves correctly on both platforms.
// Safe to call repeatedly: when the answer is already known it returns
// that answer rather than prompting again.
export async function requestPermissionAndRegisterToken(): Promise<NotificationPermission> {
  const permission = toPermission(await notifee.requestPermission());
  if (permission === 'denied') return permission;

  await ensureAndroidChannel();

  const token = await messaging().getToken();
  await pushTokensData.registerPushToken(token);

  messaging().onTokenRefresh((refreshedToken) => {
    void pushTokensData.registerPushToken(refreshedToken);
  });

  return permission;
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
    await displayMessageNotification(message);
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
    if (type === EventType.ACTION_PRESS && detail.pressAction?.id === 'reply') {
      void handleReplyAction(detail);
      return;
    }
    if (type === EventType.ACTION_PRESS && detail.pressAction?.id === 'answer') {
      const callerId = detail.notification?.data?.callerId;
      if (typeof callerId === 'string') void requestAutoAnswer(callerId);
      return;
    }
    if (type === EventType.ACTION_PRESS && detail.pressAction?.id === 'decline') {
      const callerId = detail.notification?.data?.callerId;
      if (typeof callerId === 'string') void declineIncomingCallFromNotification(callerId);
      if (detail.notification?.id) void notifee.cancelNotification(detail.notification.id);
      return;
    }
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