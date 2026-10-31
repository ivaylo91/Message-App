import { inviteUrl, parseInviteUrl } from '../src/invites/inviteLinks';

const TOKEN = '0123456789abcdef0123456789abcdef';

describe('parseInviteUrl', () => {
  it('reads a token from an app link', () => {
    expect(parseInviteUrl(`hearth://join/${TOKEN}`)).toBe(TOKEN);
  });

  it.each([
    null,
    undefined,
    '',
    'hearth://join/',
    'hearth://join/short',
    `hearth://join/${TOKEN}0`,
    `hearth://join/${TOKEN.toUpperCase()}`,
    `hearth://join/${TOKEN}?next=evil`,
    `hearth://join/${TOKEN}/extra`,
    `hearth://other/${TOKEN}`,
    `https://example.com/join/${TOKEN}`,
    'hearth://join/../../etc',
  ])('ignores %s', (url) => {
    expect(parseInviteUrl(url)).toBeNull();
  });
});

describe('inviteUrl', () => {
  it('keeps the token after the #, out of web server logs', () => {
    const url = inviteUrl(TOKEN);
    expect(url.startsWith('https://')).toBe(true);
    expect(url.split('#')[1]).toBe(TOKEN);
  });
});
