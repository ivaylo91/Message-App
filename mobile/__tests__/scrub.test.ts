import type { ErrorEvent } from '@sentry/react-native';
import { redact, scrubBreadcrumb, scrubEvent } from '../src/monitoring/scrub';

const SIGNED_URL =
  'https://x.supabase.co/storage/v1/object/sign/message-media/c1/photo.jpg?token=SECRET_TOKEN';

describe('redact', () => {
  it('drops the query from URLs, which is what opens a private file', () => {
    expect(redact(`Failed to fetch ${SIGNED_URL}`)).not.toContain('SECRET_TOKEN');
  });

  it('keeps enough of the URL to know which call failed', () => {
    expect(redact(`Failed to fetch ${SIGNED_URL}`)).toContain('/storage/v1/object/sign/');
  });

  it('removes values a database error quotes back', () => {
    const text = redact(
      'duplicate key: Key (email)=(ivan@example.com) phone +359 88 123 4567 user 3f2a1b4c-9d8e-4f7a-b6c5-1a2b3c4d5e6f',
    );
    expect(text).not.toContain('ivan@example.com');
    expect(text).not.toContain('123 4567');
    expect(text).not.toContain('3f2a1b4c');
  });

  it('leaves ordinary error text alone', () => {
    expect(redact("Cannot read property 'map' of undefined")).toBe(
      "Cannot read property 'map' of undefined",
    );
  });
});

describe('scrubBreadcrumb', () => {
  it.each(['console', 'xhr', 'fetch', 'http', 'touch', 'ui.click', 'something.new'])(
    'drops %s breadcrumbs',
    (category) => {
      expect(scrubBreadcrumb({ category, message: 'meet me at the old pier' })).toBeNull();
    },
  );

  it('drops one with no category', () => {
    expect(scrubBreadcrumb({ message: 'meet me at the old pier' })).toBeNull();
  });

  it('keeps navigation, without its route params', () => {
    const crumb = scrubBreadcrumb({
      category: 'navigation',
      message: 'to Chat',
      data: { params: { title: 'Maya Georgieva' } },
    });
    expect(crumb?.message).toBe('to Chat');
    expect(crumb?.data).toBeUndefined();
  });
});

describe('scrubEvent', () => {
  const event = {
    type: undefined,
    message: `failed ${SIGNED_URL}`,
    server_name: "Ivan's phone",
    user: { id: 'u1', email: 'ivan@example.com' },
    request: { url: SIGNED_URL },
    extra: { draft: 'meet me at the old pier' },
    contexts: { device: { name: "Ivan's phone", model: 'Pixel 9' } },
    exception: { values: [{ type: 'Error', value: 'bad value ivan@example.com' }] },
  } as unknown as ErrorEvent;

  it('removes everything that could identify someone or hold their words', () => {
    const json = JSON.stringify(scrubEvent(event));
    for (const secret of ['SECRET_TOKEN', 'ivan@example.com', "Ivan's phone", 'old pier', 'u1']) {
      expect(json).not.toContain(secret);
    }
  });

  it('keeps what a crash report is for', () => {
    const safe = scrubEvent(event);
    expect(safe.exception?.values?.[0].type).toBe('Error');
    expect(safe.contexts?.device?.model).toBe('Pixel 9');
  });

  it('does not change the event it was given', () => {
    scrubEvent(event);
    expect(event.user).toBeDefined();
  });
});
