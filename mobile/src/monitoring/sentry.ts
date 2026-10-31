import * as Sentry from '@sentry/react-native';
import { SENTRY_DSN } from '../config/env';
import { scrubBreadcrumb, scrubEvent } from './scrub';

// Started on import, so it's the first thing index.js loads and a crash while
// the rest of the app is loading still gets reported. Off in development and
// until a DSN is set. Crashes and sessions only: no tracing, and nothing that
// captures what's on screen.
if (!__DEV__ && SENTRY_DSN) {
  Sentry.init({
    dsn: SENTRY_DSN,
    sendDefaultPii: false,
    attachScreenshot: false,
    attachViewHierarchy: false,
    enableCaptureFailedRequests: false,
    enableAutoPerformanceTracing: false,
    beforeBreadcrumb: scrubBreadcrumb,
    beforeSend: scrubEvent,
  });
}
