import { Share } from 'react-native';
import { inviteUrl } from './inviteLinks';

export async function shareGroupInvite(token: string, message: (url: string) => string) {
  await Share.share({ message: message(inviteUrl(token)) });
}
