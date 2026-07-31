import * as Keychain from 'react-native-keychain';

// Supabase's SupportedStorage interface (getItem/setItem/removeItem, same
// shape as web's Storage) backed by the OS keychain/keystore instead of
// AsyncStorage, so the session's access/refresh tokens are encrypted at
// rest and tied to the device's secure hardware rather than sitting in
// plaintext SQLite (Android) / plist (iOS). Supabase normally only ever
// uses one storage key (the session blob), but this supports any number
// of keys - each gets its own keychain "service" entry. The username
// field is unused by Supabase's storage contract, so a fixed placeholder
// is stored there.
const USERNAME_PLACEHOLDER = 'supabase-session';

export const keychainStorage = {
  async getItem(key: string): Promise<string | null> {
    const result = await Keychain.getGenericPassword({ service: key });
    return result ? result.password : null;
  },

  async setItem(key: string, value: string): Promise<void> {
    await Keychain.setGenericPassword(USERNAME_PLACEHOLDER, value, { service: key });
  },

  async removeItem(key: string): Promise<void> {
    await Keychain.resetGenericPassword({ service: key });
  },
};
