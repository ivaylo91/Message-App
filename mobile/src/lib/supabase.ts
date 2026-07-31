import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from '../config/env';
import { keychainStorage } from './keychainStorage';

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    // Keychain/Keystore-backed instead of AsyncStorage: the session
    // (access + refresh token) is sensitive enough on its own to grant
    // full account access, so it shouldn't sit in plaintext SQLite/plist
    // the way AsyncStorage stores things.
    storage: keychainStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
