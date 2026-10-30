import { assertEquals } from "jsr:@std/assert@1";
import { buildFcmMessage } from "./fcmPayload.ts";

const CONVERSATION = "7f3c2a10-9b1e-4c55-8a27-1d2e3f4a5b6c";

Deno.test("buildFcmMessage: Android stays data-only, with the text in data", () => {
  const message = buildFcmMessage("tok", "Maria", "Sent you a message", {
    conversationId: CONVERSATION,
    type: "message",
  });
  assertEquals(message.token, "tok");
  assertEquals("notification" in message, false);
  assertEquals(message.android, { priority: "high" });
  assertEquals(message.data, {
    conversationId: CONVERSATION,
    type: "message",
    title: "Maria",
    body: "Sent you a message",
  });
});

Deno.test("buildFcmMessage: iOS gets a visible alert, grouped by conversation", () => {
  const { apns } = buildFcmMessage("tok", "Maria", "Sent you a message", {
    conversationId: CONVERSATION,
    type: "message",
  });
  assertEquals(apns.headers["apns-push-type"], "alert");
  assertEquals(apns.headers["apns-priority"], "10");
  assertEquals(apns.payload.aps.alert, { title: "Maria", body: "Sent you a message" });
  assertEquals(apns.payload.aps["thread-id"], CONVERSATION);
});

Deno.test("buildFcmMessage: no content-available, which would draw the message twice", () => {
  const { apns } = buildFcmMessage("tok", "Maria", "Hi", {
    conversationId: CONVERSATION,
    type: "message",
  });
  assertEquals("content-available" in apns.payload.aps, false);
});

Deno.test("buildFcmMessage: a reaction can't replace the message it reacts to", () => {
  const message = buildFcmMessage("tok", "Maria", "Hi", {
    conversationId: CONVERSATION,
    type: "message",
  });
  const reaction = buildFcmMessage("tok", "Maria", "Reacted", {
    conversationId: CONVERSATION,
    type: "reaction",
  });
  assertEquals(message.apns.headers["apns-collapse-id"], CONVERSATION);
  assertEquals(reaction.apns.headers["apns-collapse-id"], `${CONVERSATION}:reaction`);
  // APNs rejects a collapse id over 64 bytes.
  assertEquals(reaction.apns.headers["apns-collapse-id"]!.length <= 64, true);
});

Deno.test("buildFcmMessage: no conversation means no collapse id or thread", () => {
  const { apns } = buildFcmMessage("tok", "Maria", "Hi", { type: "message" });
  assertEquals("apns-collapse-id" in apns.headers, false);
  assertEquals("thread-id" in apns.payload.aps, false);
});
