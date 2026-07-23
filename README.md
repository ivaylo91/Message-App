# Message App

Mobile messaging app.

## Stack

- **Mobile:** React Native, bare workflow ([mobile/](mobile/))
- **Backend:** Supabase — managed Postgres, Auth, and Realtime (Postgres Changes). No custom API server; the app talks to Supabase directly via `@supabase/supabase-js`.
- **Build/distribution:** EAS Build (`mobile/eas.json`)
- **Push notifications:** FCM (Android) / APNs (iOS) — not yet wired up
- **E2EE:** Signal Protocol (libsignal), if/when required

## Supabase project

- Project: `Message-App` (`ejtskxnoyuvmzhpwkvsu`, `eu-west-3`)
- Schema: `profiles` (mirrors `auth.users`, auto-created via trigger on signup), `conversations`, `conversation_participants`, `messages`
- Authorization is enforced entirely by **Row Level Security** — there is no backend to also check permissions, so the RLS policies *are* the authorization layer. Conversation creation goes through the `create_conversation` RPC (`SECURITY DEFINER`) since inserting participant rows for other users can't be validated by simple per-row RLS.
- Realtime is enabled on `messages`; `ChatScreen` subscribes to `postgres_changes` filtered by `conversation_id`.
- Config (`mobile/src/config/env.ts`) holds the project URL and the **publishable** key — safe to commit, it's the client-side key protected by RLS (not the service_role key).

**Email confirmation is on by default** for this project (Supabase's shared test SMTP has a very low send-rate limit, so bulk test signups will hit `over_email_send_rate_limit`). `RegisterScreen` handles this: if `signUp()` doesn't return a session, it shows a "check your email" message instead of assuming the user is logged in. To skip confirmation during development, disable "Confirm email" under Authentication → Providers → Email in the Supabase dashboard (there's no API/MCP toggle for it).

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
