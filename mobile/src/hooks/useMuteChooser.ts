import { useCallback } from 'react';
import { Alert } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../auth/AuthContext';
import { useConfirm } from '../components/ConfirmSheet';
import { useToast } from '../components/Toast';
import * as conversationsData from '../data/conversations';
import { isMuted, mutedUntilFor, type MuteDuration } from '../utils/mute';

// The mute sheet, shared by every place a conversation can be muted from:
// long-pressing it in the list, the chat's menu, and the contact info
// screen. Durations when it's unmuted, a single Unmute when it's muted.
//
// Resolves with the new muted_until (null meaning unmuted) once it has
// saved, or undefined if the sheet was dismissed or the save failed - so
// callers update their own copy of the participant row only on a change
// that actually happened.
export function useMuteChooser() {
  const { t } = useTranslation();
  const { userId } = useAuth();
  const { confirm } = useConfirm();
  const { showToast } = useToast();

  return useCallback(
    async (
      conversationId: string,
      title: string,
      currentMutedUntil: string | null | undefined,
    ): Promise<string | null | undefined> => {
      if (!userId) return undefined;
      const currentlyMuted = isMuted(currentMutedUntil);

      const choice = await confirm({
        title,
        message: currentlyMuted ? undefined : t('conversations.mute'),
        cancelLabel: t('chat.cancel'),
        options: currentlyMuted
          ? [{ id: 'unmute', label: t('conversations.unmute') }]
          : [
              { id: 'eightHours', label: t('conversations.muteEightHours') },
              { id: 'oneWeek', label: t('conversations.muteOneWeek') },
              { id: 'always', label: t('conversations.muteAlways') },
            ],
      });
      if (!choice) return undefined;

      const mutedUntil = choice === 'unmute' ? null : mutedUntilFor(choice as MuteDuration);
      try {
        await conversationsData.setConversationMuted(conversationId, userId, mutedUntil);
      } catch {
        Alert.alert(t('conversations.muteFailedTitle'), t('conversations.muteFailedMessage'));
        return undefined;
      }
      showToast(mutedUntil ? t('conversations.mutedToast') : t('conversations.unmutedToast'));
      return mutedUntil;
    },
    [userId, confirm, t, showToast],
  );
}
