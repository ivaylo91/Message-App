export const SUPABASE_URL = 'https://ejtskxnoyuvmzhpwkvsu.supabase.co';
export const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_lact5tR5C9LzuR2y29Vc7g_k42J9BOH';

// A hosted web page (not a deep link back into the app - see
// docs/reset-password.html) that finishes a password reset. Supabase
// emails this as the recovery link; it must also be added to the
// project's Auth > URL Configuration > Redirect URLs allowlist, or
// resetPasswordForEmail's redirectTo below is silently ignored.
export const RESET_PASSWORD_URL = 'https://ivaylo91.github.io/Message-App/reset-password.html';

export const ANDROID_STORE_URL =
  'https://play.google.com/store/apps/details?id=com.ivaylopenev.messageapp';
// Placeholder - there's no App Store listing yet. Replace the numeric id
// with the real one once Hearth is published on iOS
// (https://apps.apple.com/app/idXXXXXXXXXX), or the update-required
// screen's button will 404 there.
export const IOS_STORE_URL = 'https://apps.apple.com/app/id0000000000';
