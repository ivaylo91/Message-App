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
  displayMessageNotification,
  handleReplyAction,
} from './src/notifications';
import { requestAutoAnswer } from './src/calling/autoAnswerFlag';
import App from './App';
import { name as appName } from './app.json';

// Both kinds of push are now data-only, so this handler renders both.
// Calls need it so the app can show its own full-screen ringing UI; messages
// need it so the notification can carry an inline Reply action, which is
// only possible on a notification the app builds itself.
messaging().setBackgroundMessageHandler(async (remoteMessage) => {
  if (remoteMessage.data?.type === 'call') {
    await displayIncomingCallNotification(remoteMessage);
  } else {
    await displayMessageNotification(remoteMessage);
  }
});

// Handles the notification's "Decline"/"Answer" action buttons being
// pressed while the app is backgrounded or fully killed - notifee runs
// this via a headless task in that case, so it can't touch
// CallContext/React state directly. Decline can be fully handled here
// (just send the decline signal). Answer can't - actually answering
// needs the real WebRTC offer and a live PeerConnection, which only
// exist once the app's own CallContext is running - so this just leaves
// a flag (see autoAnswerFlag.ts) for CallContext to pick up the moment
// it receives the real call-offer after the tap launches the app.
notifee.onBackgroundEvent(async ({ type, detail }) => {
  if (type !== EventType.ACTION_PRESS) return;
  // Replying from the shade without opening the app - the whole point of
  // the action. Runs headless, so it must not touch React state.
  if (detail.pressAction?.id === 'reply') {
    await handleReplyAction(detail);
    return;
  }
  const callerId = detail.notification?.data?.callerId;
  if (detail.pressAction?.id === 'decline') {
    if (typeof callerId === 'string') {
      await declineIncomingCallFromNotification(callerId);
    }
  } else if (detail.pressAction?.id === 'answer') {
    if (typeof callerId === 'string') {
      await requestAutoAnswer(callerId);
    }
  } else {
    return;
  }
  if (detail.notification?.id) {
    await notifee.cancelNotification(detail.notification.id);
  }
});

AppRegistry.registerComponent(appName, () => App);