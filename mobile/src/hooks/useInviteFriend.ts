import { useCallback } from 'react';
import { Platform, Share } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../auth/AuthContext';
import { ANDROID_STORE_URL, IOS_STORE_URL } from '../config/env';
import * as profilesData from '../data/profiles';

const STORE_URL = Platform.OS === 'ios' ? IOS_STORE_URL : ANDROID_STORE_URL;

// IOS_STORE_URL holds a placeholder until there's an App Store listing.
const HAS_STORE_LISTING = !STORE_URL.endsWith('id0000000000');

// Opens the system share sheet with a link to the app. A new user can only
// reach people who are already here, so this is how the app stops being
// empty. The username goes along because that's how the friend then finds
// them. Null where there's nothing to link to yet.
export function useInviteFriend(): (() => void) | null {
  const { t } = useTranslation();
  const { userId } = useAuth();

  const invite = useCallback(() => {
    void (async () => {
      const profile = userId ? await profilesData.fetchProfile(userId).catch(() => null) : null;
      const message = profile?.username
        ? t('invite.messageWithUsername', { url: STORE_URL, username: profile.username })
        : t('invite.message', { url: STORE_URL });
      // Rejects if the sheet can't open, which leaves nothing to do.
      await Share.share({ message }).catch(() => {});
    })();
  }, [t, userId]);

  return HAS_STORE_LISTING ? invite : null;
}
