import { INVITE_PAGE_URL } from '../config/env';

// A token is 32 hex characters (see 20261031_add_group_invites_pins_and_saved.sql).
// Checked here so nothing else in a link opened from outside reaches the
// server or the screen.
const TOKEN = /^[0-9a-f]{32}$/;
const APP_LINK = /^hearth:\/\/join\/([^/?#]+)$/;

// What gets shared. An https page rather than the hearth:// link itself, since
// other apps only make https links tappable; that page hands over to the app.
// The token is after the #, so it never reaches the web server's logs.
export function inviteUrl(token: string): string {
  return `${INVITE_PAGE_URL}#${token}`;
}

export function parseInviteUrl(url: string | null | undefined): string | null {
  const token = url?.match(APP_LINK)?.[1];
  return token && TOKEN.test(token) ? token : null;
}
