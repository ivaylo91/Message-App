import type { Breadcrumb, ErrorEvent } from '@sentry/react-native';

// What's allowed to leave the phone in a crash report. Hearth's promise is that
// message content never reaches a third party, so this works by allowance: a
// breadcrumb or field stays only because it's been judged safe, and anything
// new stays out until someone decides otherwise.

// Where the app was and whether it was in the foreground. Not console output
// or network calls, which carry signed URLs and message text, or touches,
// which carry whatever text was under the finger.
const ALLOWED_BREADCRUMB_CATEGORIES = new Set(['navigation', 'app.lifecycle']);

export function scrubBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb | null {
  if (!breadcrumb.category || !ALLOWED_BREADCRUMB_CATEGORIES.has(breadcrumb.category)) return null;
  return {
    category: breadcrumb.category,
    level: breadcrumb.level,
    timestamp: breadcrumb.timestamp,
    type: breadcrumb.type,
    // Route params hold names and conversation ids.
    message: breadcrumb.message ? redact(breadcrumb.message) : undefined,
  };
}

const URL_QUERY = /(https?:\/\/[^\s?#"'<>]+)[?#][^\s"'<>]*/gi;
const EMAIL = /[^\s@"'<>]+@[^\s@"'<>]+\.[^\s@"'<>]+/g;
const PHONE = /\+?\d[\d\s()-]{7,}\d/g;
const UUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;

// Error text is the one place user data can arrive unasked: a database
// error quotes the value it refused, and a failed fetch quotes its URL, whose
// query holds the token that opens a private file.
export function redact(text: string): string {
  return text
    .replace(URL_QUERY, '$1')
    .replace(EMAIL, '[email]')
    .replace(UUID, '[id]')
    .replace(PHONE, '[number]');
}

export function scrubEvent(event: ErrorEvent): ErrorEvent {
  const safe = { ...event };

  delete safe.request;
  delete safe.user;
  delete safe.extra;
  delete safe.server_name;

  if (safe.message) safe.message = redact(safe.message);

  if (safe.exception?.values) {
    safe.exception = {
      ...safe.exception,
      values: safe.exception.values.map((value) => ({
        ...value,
        value: value.value ? redact(value.value) : value.value,
      })),
    };
  }

  // Phones are often named after their owner.
  if (safe.contexts?.device) {
    const device = { ...safe.contexts.device };
    delete device.name;
    safe.contexts = { ...safe.contexts, device };
  }

  return safe;
}
