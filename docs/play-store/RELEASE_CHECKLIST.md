# Play Store release checklist

Things that are **not** in the codebase and so cannot be checked by tests,
lint, or a build. Most of them fail quietly — after review, in production —
rather than blocking the upload, which is what makes them easy to miss.

## Before every upload

- [ ] **Build from a commit that contains everything you tested.** EAS builds
      from committed git state, so anything still in the working tree is not
      in the artifact. This has already bitten once: a build went out without
      the bottom-sheet scrim fix because the commit landed after the build
      started.
- [ ] **Check the build's commit hash** matches what you expect —
      `eas build:list` shows `gitCommitHash` per build.
- [ ] **Exercise the destructive flows on a device**: delete account, leave
      group, remove member, delete conversation, delete message, block. These
      go through the bottom sheet, and a sheet that fails to resolve does
      nothing at all rather than erroring — nothing in the logs, nothing on
      screen.

## One-time Play Console setup

- [ ] **Declare `USE_FULL_SCREEN_INTENT`.** Since Android 14, Play grants this
      only to calling and alarm apps and requires a declaration in the console.
      This app qualifies — it is the incoming-call UI — but without the
      declaration the permission is revoked and full-screen incoming calls stop
      working on Android 14+. It fails in production, not at review.
- [ ] **Complete the Data safety form.** The app collects email, phone number,
      profile photos, message content and a device push token (`push_tokens`).
      Message bodies are stored server-side and are not end-to-end encrypted —
      the form must say so.
- [ ] **Account deletion URL / in-app path.** Required for any app with sign-up.
      Already implemented in Profile, password-gated; the console still needs
      to be told where it is.
- [ ] **Privacy policy URL**: https://ivaylo91.github.io/Message-App/privacy-policy.html
      (served from `docs/` via GitHub Pages — keep Pages enabled, the link is
      also used in the app).

## Supabase, before going wide

- [x] **Leaked-password protection** — enabled 2026-09-11. Lives under
      Authentication → Sign In / Providers → Email:
      https://supabase.com/dashboard/project/ejtskxnoyuvmzhpwkvsu/auth/providers?provider=Email
      (the same page holds minimum length and required characters). Note it is
      a **Pro plan and above** feature - on Free the toggle is simply absent.

      Existing users with a now-non-compliant password can still sign in, but
      `signInWithPassword` returns a `WeakPasswordError`, which LoginScreen
      surfaces as-is. Worth checking how that reads to someone whose password
      worked yesterday.
- [ ] **Confirm `FIREBASE_SERVICE_ACCOUNT`** holds the *service account key*
      JSON, not `google-services.json`. Both are JSON from the same Firebase
      project and the function returns 200 either way — see the push section in
      the root README.
- [ ] **Email confirmation and SMTP.** The project currently uses Supabase's
      shared test SMTP, which has a very low rate limit. Real signups at any
      volume need a custom SMTP provider configured.

## Version numbers

`eas.json` uses `appVersionSource: "remote"` with `autoIncrement` on the
production profile, so EAS owns the `versionCode` counter and bumps it per
production build. `versionCode` in `android/app/build.gradle` is no longer the
source of truth — don't hand-edit it expecting an effect.

Before this was set up, every build came out as `versionCode 1`. The first
upload would have succeeded and the second would have been rejected.
