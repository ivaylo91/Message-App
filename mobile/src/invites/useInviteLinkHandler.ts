import { useCallback, useEffect, useState } from 'react';
import { Linking } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../auth/AuthContext';
import { useConfirm } from '../components/ConfirmSheet';
import { useToast } from '../components/Toast';
import * as invitesData from '../data/invites';
import { navigationRef } from '../navigation/navigationRef';
import { parseInviteUrl } from './inviteLinks';

// Handles a group invite link, however the app was reached. A link waits for
// sign-in if need be, and joining always takes a tap on a sheet naming the
// group: a link can come from anyone, so opening one must never join by itself.
export function useInviteLinkHandler(): void {
  const { t } = useTranslation();
  const { userId } = useAuth();
  const { confirm } = useConfirm();
  const { showToast } = useToast();
  const [pendingToken, setPendingToken] = useState<string | null>(null);

  useEffect(() => {
    void Linking.getInitialURL()
      .then((url) => setPendingToken(parseInviteUrl(url)))
      .catch(() => {});
    const subscription = Linking.addEventListener('url', ({ url }) => {
      const token = parseInviteUrl(url);
      if (token) setPendingToken(token);
    });
    return () => subscription.remove();
  }, []);

  const openChat = useCallback((conversationId: string, title: string) => {
    if (navigationRef.isReady()) navigationRef.navigate('Chat', { conversationId, title });
  }, []);

  const handleInvite = useCallback(
    async (token: string) => {
      const preview = await invitesData.previewInvite(token).catch(() => null);
      if (!preview) {
        showToast(t('invite.invalidToast'), 'error');
        return;
      }
      if (preview.is_member) {
        openChat(preview.conversation_id, preview.name ?? '');
        return;
      }
      const choice = await confirm({
        title: t('invite.joinTitle', { name: preview.name ?? t('conversations.groupChat') }),
        message: t('groupInfo.membersLabel', { count: preview.member_count }),
        cancelLabel: t('chat.cancel'),
        options: [{ id: 'join', label: t('invite.join') }],
      });
      if (choice !== 'join') return;
      try {
        openChat(await invitesData.joinByInvite(token), preview.name ?? '');
      } catch {
        showToast(t('invite.joinFailedToast'), 'error');
      }
    },
    [confirm, openChat, showToast, t],
  );

  useEffect(() => {
    if (!userId || !pendingToken) return;
    setPendingToken(null);
    void handleInvite(pendingToken);
  }, [userId, pendingToken, handleInvite]);
}
