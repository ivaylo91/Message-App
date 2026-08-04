/**
 * @format
 */

// Hermes has no global TextEncoder/TextDecoder, which @supabase/realtime-js
// needs to decode binary websocket frames (used for broadcast/presence
// payloads - typing indicators, online status). Without this, every
// broadcast/presence message received throws "Property 'TextDecoder'
// doesn't exist", silently degrading those features. Must load before
// anything that might receive a realtime message.
import 'fast-text-encoding';
import { AppRegistry } from 'react-native';
import messaging from '@react-native-firebase/messaging';
import notifee, { EventType } from '@notifee/react-native';
import {
  declineIncomingCallFromNotification,
  displayIncomingCallNotification,
} from './src/notifications';
import App from './App';
import { name as appName } from './app.json';

// Regular messages always include a `notification` payload, so Android
// displays them automatically while backgrounded/killed and this handler
// has nothing to do for them. Calls are the exception: their push is
// data-only (see supabase/functions/send-call-notification) specifically
// so the app can show its own full-screen ringing UI via notifee instead
// of a plain notification-shade entry.
messaging().setBackgroundMessageHandler(async (remoteMessage) => {
  if (remoteMessage.data?.type === 'call') {
    await displayIncomingCallNotification(remoteMessage);
  }
});

// Handles the notification's "Decline" action button being pressed while
// the app is backgrounded or fully killed - notifee runs this via a
// headless task in that case, so it can't touch CallContext/React state
// directly, only send the decline signal itself (see
// declineIncomingCallFromNotification).
notifee.onBackgroundEvent(async ({ type, detail }) => {
  if (type !== EventType.ACTION_PRESS || detail.pressAction?.id !== 'decline') return;
  const callerId = detail.notification?.data?.callerId;
  if (typeof callerId === 'string') {
    await declineIncomingCallFromNotification(callerId);
  }
  if (detail.notification?.id) {
    await notifee.cancelNotification(detail.notification.id);
  }
});

AppRegistry.registerComponent(appName, () => App);