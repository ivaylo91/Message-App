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
- Authorization is enforced entirely by **Row Level Security** — there is no backend to also check permissions, so the RLS policies *are* the authorization layer. Conversation creation goes through the `create_conversation` RPC (`SECURITY DEFINER`) since inserting participant rows for other users can't be validated by simple per-row RLS.
- Realtime is enabled on `messages`; `ChatScreen` subscribes to `postgres_changes` filtered by `conversation_id`.
- Config (`mobile/src/config/env.ts`) holds the project URL and the **publishable** key — safe to commit, it's the client-side key protected by RLS (not the service_role key).

**Email confirmation is on by default** for this project (Supabase's shared test SMTP has a very low send-rate limit, so bulk test signups will hit `over_email_send_rate_limit`). `RegisterScreen` handles this: if `signUp()` doesn't return a session, it shows a "check your email" message instead of assuming the user is logged in. To skip confirmation during development, disable "Confirm email" under Authentication → Providers → Email in the Supabase dashboard (there's no API/MCP toggle for it).

### Push notifications setup

Fully wired and verified: `push_tokens` table + RLS, an `on_message_created`
trigger that calls the `send-push-notification` Edge Function via `pg_net`,
and the mobile side (token registration, foreground/background/killed-state
handling, tap-to-open-chat).

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
npx react-native run-android   # or run-ios
```

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
