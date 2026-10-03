import { assertEquals } from "jsr:@std/assert@1";
import { notMuted, selectRecipients } from "./recipients.ts";

const NOW = Date.parse("2026-10-03T12:00:00.000Z");
const FUTURE = "2026-10-03T20:00:00.000Z";
const PAST = "2026-10-03T08:00:00.000Z";

Deno.test("notMuted: no mute, an expired mute, and garbage all count as not muted", () => {
  assertEquals(notMuted(null, NOW), true);
  assertEquals(notMuted(PAST, NOW), true);
  assertEquals(notMuted("not a date", NOW), true);
});

Deno.test("notMuted: a mute that hasn't expired is muted", () => {
  assertEquals(notMuted(FUTURE, NOW), false);
  assertEquals(notMuted("9999-12-31T23:59:59.000Z", NOW), false);
});

Deno.test("selectRecipients: muted participants are skipped, the rest get the usual push", () => {
  const result = selectRecipients(
    [
      { user_id: "a", muted_until: null },
      { user_id: "b", muted_until: FUTURE },
      { user_id: "c", muted_until: PAST },
    ],
    [],
    NOW,
  );
  assertEquals(result, { regular: ["a", "c"], mentioned: [] });
});

Deno.test("selectRecipients: a mention gets through mute", () => {
  const result = selectRecipients(
    [
      { user_id: "a", muted_until: FUTURE },
      { user_id: "b", muted_until: FUTURE },
    ],
    ["a"],
    NOW,
  );
  assertEquals(result, { regular: [], mentioned: ["a"] });
});

Deno.test("selectRecipients: a mentioned person gets one push, not two", () => {
  const result = selectRecipients([{ user_id: "a", muted_until: null }], ["a"], NOW);
  assertEquals(result, { regular: [], mentioned: ["a"] });
});

Deno.test("selectRecipients: an id that isn't a participant reaches no one", () => {
  const result = selectRecipients([{ user_id: "a", muted_until: null }], ["outsider"], NOW);
  assertEquals(result, { regular: ["a"], mentioned: [] });
});

Deno.test("selectRecipients: a malformed mentions value is treated as none", () => {
  for (const mentions of [null, undefined, "a", { a: true }]) {
    assertEquals(
      selectRecipients([{ user_id: "a", muted_until: FUTURE }], mentions, NOW),
      { regular: [], mentioned: [] },
    );
  }
});
