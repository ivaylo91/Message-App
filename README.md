# Message App

Mobile messaging app.

## Stack

- **Mobile:** React Native, bare workflow ([mobile/](mobile/))
- **Backend:** Supabase — managed Postgres, Auth, and Realtime (Postgres Changes). No custom API server; the app talks to Supabase directly via `@supabase/supabase-js`.
- **Build/distribution:** EAS Build (`mobile/eas.json`)
- **Push notifications:** FCM (Android only for now) — Firebase project `message-app-240f7`, fully set up and verified (see below)
- **E2EE:** Signal Protocol (libsignal), if/when required

## Supabase project

- Project: `Message-App` (`ejtskxnoyuvmzhpwkvsu`, `eu-west-3`)
- Schema: `profiles` (mirrors `auth.users`, auto-created via trigger on signup), `conversations`, `conversation_participants`, `messages`
- Authorization is enforced entirely by **Row Level Security** — there is no backend to also check permissions, so the RLS policies *are* the authorization layer. Anything whose legality depends on a *different* row (may this user add that user? is either side blocked?) can't be expressed as per-row RLS and goes through a `SECURITY DEFINER` RPC instead: `create_conversation`, `rename_conversation`, `add_conversation_participants`, `remove_conversation_participant`.
- Realtime is enabled on `messages`; `ChatScreen` subscribes to `postgres_changes` filtered by `conversation_id`.
- `conversations.updated_at` is what the chat list orders by, and it is maintained by the `on_message_touches_conversation` trigger. Nothing wrote to it before that trigger existed, so the list was really sorted by when each conversation was *created*.

### The `private` schema

Helper functions that exist only to be called from inside RLS policies live in `private`, not `public`. PostgREST exposes every `SECURITY DEFINER` function in `public` at `/rest/v1/rpc/<name>`, and `not_blocked_in_conversation` being reachable that way let any signed-in user read back a block relationship — including a blocked user confirming they had been blocked, which `OutboxContext` deliberately hides by dropping rejected sends silently.

**Do not "fix" this by revoking `EXECUTE` from `authenticated`.** Postgres checks `EXECUTE` against the *calling* role even for `SECURITY DEFINER` functions, and these are called from 11 policies across `public`, `realtime` and `storage` — revoking would break reading messages, joining typing channels, and loading attachments for everyone. Relocation works because policies bind functions by OID; `private` simply isn't in PostgREST's exposed schema list. `authenticated` needs `USAGE` on the schema, which is not what exposes it.

Trigger bodies (`unhide_conversation_for_participants`, `touch_conversation_on_message`) have `EXECUTE` revoked instead — a trigger function's privilege is checked when the trigger is created, not each time it fires.

### Group management

`conversation_participants.role` is `'MEMBER' | 'ADMIN'`. Admin is required to rename a group or add/remove others; anyone may remove themselves (leaving). If the last admin leaves, the remaining members are promoted — otherwise the group would be permanently unmanageable.

`create_conversation` originally never set a role, so every participant row was `MEMBER` and no group had an admin. It now makes the creator one. There is no `created_by` column and participant rows carry no timestamp, so the original creator of a pre-existing group is genuinely unrecoverable; the migration promoted all existing group members rather than picking arbitrarily. That backfill matched zero rows — there were no groups yet.
- Config (`mobile/src/config/env.ts`) holds the project URL and the **publishable** key — safe to commit, it's the client-side key protected by RLS (not the service_role key).

**Email confirmation is on by default** for this project (Supabase's shared test SMTP has a very low send-rate limit, so bulk test signups will hit `over_email_send_rate_limit`). `RegisterScreen` handles this: if `signUp()` doesn't return a session, it shows a "check your email" message instead of assuming the user is logged in. To skip confirmation during development, disable "Confirm email" under Authentication → Providers → Email in the Supabase dashboard (there's no API/MCP toggle for it).

### Push notifications setup

Server side fully wired and verified: `push_tokens` table + RLS, an
`on_message_created` trigger that calls the `send-push-notification` Edge
Function via `pg_net`, and the mobile side (token registration,
foreground/background/killed-state handling, tap-to-open-chat).

**The Android permission is the part that was broken, and it is worth
knowing why it hid so well.** Registration called
`messaging().requestPermission()`, which does nothing on Android: upstream
it is marked `@platform ios` and returns
`Promise.resolve(AuthorizationStatus.AUTHORIZED)` without showing a prompt,
and the Android native module has no `requestPermission` method at all —
only `hasPermission`, which reads `areNotificationsEnabled()`. With
`targetSdkVersion 36`, `POST_NOTIFICATIONS` is a runtime permission, so
nothing was ever asked for and Android dropped every notification. The
permission check always passed, so the token still registered and the
function still reported `{"sent":N}` — the pipeline looked healthy from the
server while nothing arrived. It now uses `notifee.requestPermission()`,
which requests `POST_NOTIFICATIONS` natively.

Android only prompts twice; after that requesting returns denied silently
and system settings is the only way back. Profile has a Notifications row
that shows the state and offers a route into settings for exactly that
case.

`google-services.json` belongs at `mobile/android/app/google-services.json`
— the Gradle plugin reads it from there, and it is gitignored. For EAS
builds it arrives instead via the `eas-build-pre-install` hook, which
copies `$GOOGLE_SERVICES_JSON`; that hook is conditional, so if the
variable is not configured as a file-type EAS environment variable the copy
silently does nothing and you get a confusing Gradle error rather than a
clear cause.

Firebase project: `message-app-240f7`, Android app `com.ivaylopenev.messageapp`
(display name "Hearth"). Two Edge Function secrets are required on
`send-push-notification` (Supabase dashboard → Project Settings → Edge
Functions → secrets — no MCP/API access to set these, has to be done there
or via `supabase secrets set`):

- `FIREBASE_SERVICE_ACCOUNT` — the **service account key** JSON (Firebase
  Console → Project settings → **Service accounts** tab → Generate new
  private key). Don't confuse this with `google-services.json` (the Android
  client config) — they're both JSON files from the same project but serve
  different purposes, and pasting the wrong one is a mistake that's easy to
  make (it happened once already) and easy to miss, since the function still
  returns 200 either way. If push stops working, check this first.
- `WEBHOOK_SECRET` — shared secret the Postgres trigger sends so the function
  can reject unauthorized calls. The value lives in Supabase Vault
  (`select decrypted_secret from vault.decrypted_secrets where name =
  'webhook_secret'`) - both sides must have the exact same value.

`mobile/android/app/google-services.json` is in place (gitignored, not
committed) - pulled directly from the Firebase project via the Firebase MCP
server.

Verified live: calling the function directly with a real conversation/sender
and a fake device token returned `{"sent":1}` after ~775ms (vs ~200-500ms for
early-exit responses), confirming it parsed the real service account key,
signed a JWT, exchanged it for a Google OAuth2 access token, and called FCM's
v1 API — the parts that are actually hard to get wrong. A fake token gets
silently rejected by FCM itself (logged, not surfaced), so the remaining
unknown is only real-device delivery, not the pipeline.

## Mobile app

```
cd mobile
npm install
npm test                       # 82 tests, all pure logic - no native modules needed
npx react-native run-android   # or run-ios
```

### Architecture

Providers wrap the app in `App.tsx`, outermost first: `ThemeProvider`, `ToastProvider`, `ConfirmSheetProvider`, `AuthProvider`, `PresenceProvider`, `MessageStreamProvider`, `UnreadProvider`, `OutboxProvider`, `TypingProvider`, `CallProvider`.

Two of those exist specifically because **`supabase.channel()` returns the existing channel object for a topic rather than a new one**, so two components asking for the same topic get the same already-subscribed channel — and calling `.on()` on it throws. One owner per topic:

- `MessageStreamProvider` owns the single global `messages` INSERT subscription. Both `UnreadProvider` (badge counts) and `ConversationsScreen` (live previews and ordering) consume it, so a message crosses the wire once rather than once per feature.
- `TypingProvider` owns the per-conversation typing channels, ref-counted, on topic `messages:<id>:typing`. `ChatScreen` and `ConversationsScreen` are both mounted at once — the list stays in the stack beneath the open chat — and previously fought over `messages:<id>`, so opening a chat tore down the list's subscription every time.

### UI conventions

Follow these rather than reaching for the raw primitive:

- **`Touchable`** (`components/Touchable.tsx`) instead of `TouchableOpacity` — ripple on Android, opacity on iOS. Pass `iconButton` for icon-only buttons: borderless ripple plus a larger hit area.
- **`fontSizes`** (`theme/tokens.ts`) instead of a literal `fontSize`. Seven steps; there were 19 sizes across 107 declarations before it.
- **`elevation`** for surfaces that float, in preference to a hairline border. Needs an opaque background — Android won't cast a shadow without one.
- **`useConfirm()`** (`components/ConfirmSheet.tsx`) for anything with more than one outcome. Android's `Alert` does `buttons.slice(0, 3)` and silently drops the rest, which is how the report dialog lost both "Other" and "Cancel". Single-button error acknowledgements can stay on `Alert`.
- **`Skeleton` / `SkeletonGroup`** for content that is loading, not a spinner. Spinners are for actions the user just triggered.
- **`haptic()`** (`utils/haptics.ts`) for tap feedback. Built on core `Vibration`, so it needs `android.permission.VIBRATE` and is a buzz rather than a true tick; swap in a haptics library there if that stops being good enough.
- Both locales must stay in sync — every string needs an `en` and a `bg` entry.

### Releasing

`docs/play-store/RELEASE_CHECKLIST.md` covers the steps that live in the Play
Console and the Supabase dashboard rather than in this repo - notably the
`USE_FULL_SCREEN_INTENT` declaration, without which Android 14+ silently
revokes the permission and full-screen incoming calls stop working in
production.

### EAS Build

Bare workflow — `android/` and `ios/` are the source of truth, not an Expo config. `eas.json` defines `development`/`preview`/`production` profiles. One-time setup (needs an Expo account, interactive login — not something that can be scripted here):

```
npm install -g eas-cli
eas login
eas init          # links this repo to a project on expo.dev
eas build --platform android --profile development
```

### Icons

All app icons are FontAwesome 6 Free, via `@react-native-vector-icons/fontawesome6` (the current per-family package - the old monolithic `react-native-vector-icons` is deprecated). Icons are imported from the `/static` subpath (`import { FontAwesome6 } from '@react-native-vector-icons/fontawesome6/static'`), which needs no native module linking - just the font files themselves.

- **Android**: the three `FontAwesome6_*.ttf` files are copied into `android/app/src/main/assets/fonts/`. Nothing else to do; Gradle picks them up automatically.
- **iOS**: the fonts are copied into `ios/MobileApp/Fonts/` and declared in `Info.plist` (`UIAppFonts`), but **still need to be added to the Xcode target's "Copy Bundle Resources" build phase** - that's an Xcode-only step (editing `project.pbxproj` by hand is too risky to do blind) and hasn't been done, since this project doesn't currently build for iOS. Do this in Xcode before an iOS build if that ever changes.

### Files and voice messages

Generic file attachments use `@react-native-documents/picker` (any file type, no native mime restriction on the `message-media` bucket anymore - just a 25 MB cap). Voice messages use `react-native-nitro-sound` (the actively maintained successor to the now-deprecated `react-native-audio-recorder-player`, built on Nitro Modules - this app already runs the New Architecture, so no extra setup needed there) for in-app recording and playback.

- **Android**: needs `RECORD_AUDIO` (declared in `AndroidManifest.xml`) plus the runtime permission prompt, both already wired into `ChatScreen`'s recording flow.
- **iOS**: needs `NSMicrophoneUsageDescription` (declared in `Info.plist`) and, per the library's install steps, `pod install` - not run here since this project doesn't currently build for iOS (see the Icons section above); EAS Build's cloud iOS builds run `pod install` automatically, so this only matters for a local Xcode build.
- Both attachment kinds reuse the same `message-media` storage bucket and RLS policies as photos (conversation-scoped folder, no changes needed there) - only the bucket's mime-type restriction and size cap changed.
