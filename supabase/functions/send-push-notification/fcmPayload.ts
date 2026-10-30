// The FCM v1 message for one device. Pure, so what each platform is told to
// do can be tested without sending anything.
export function buildFcmMessage(
  token: string,
  title: string,
  body: string,
  data: Record<string, string>,
) {
  // Data-only for Android: no `notification` block. A payload carrying one
  // is rendered by Android before any JS runs, which is simpler and more
  // robust, but it cannot carry an inline Reply action - only a
  // notification the app builds itself can. So the title and body ride
  // along as data and the client renders them (displayMessageNotification
  // in mobile/src/notifications/index.ts), which is also what the call
  // notifications have always done.
  //
  // The trade-off is real: this now depends on the app's background
  // handler running. High-priority data messages wake it, and calls have
  // relied on that all along.
  //
  // This also supersedes the android.notification.channel_id set here
  // previously - with no notification block for Firebase to render, the
  // channel is chosen by notifee on the client instead.
  //
  // iOS can't work that way: it doesn't wake a closed app for a data-only
  // message, so the `apns` block has the system draw the alert itself.
  // Android ignores it, as iOS ignores `android`. Deliberately no
  // content-available: that would also run the background handler, which
  // would draw the same message a second time. With the app open, iOS
  // shows nothing for this and onMessage renders it, as on Android.
  return {
    token,
    data: { ...data, title, body } as Record<string, string>,
    android: { priority: "high" },
    apns: {
      headers: {
        "apns-priority": "10",
        "apns-push-type": "alert",
        // Android's notification id: a new message replaces the last one
        // from that chat instead of stacking, and a reaction keeps its own
        // slot so it can't replace the message.
        ...(data.conversationId
          ? {
            "apns-collapse-id": data.type === "reaction"
              ? `${data.conversationId}:reaction`
              : data.conversationId,
          }
          : {}),
      },
      payload: {
        aps: {
          alert: { title, body },
          sound: "default",
          ...(data.conversationId ? { "thread-id": data.conversationId } : {}),
        },
      },
    },
  };
}
