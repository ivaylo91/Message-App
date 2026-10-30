import remoteConfig from '@react-native-firebase/remote-config';
import DeviceInfo from 'react-native-device-info';

const MINIMUM_VERSION_KEY = 'minimum_supported_version';
// This is a safety gate, not a normal feature flag - a stale cached
// value here means a critical update notice could be missed for longer
// than intended, so the cache is kept much shorter than Remote Config's
// own (12h) default.
const MINIMUM_FETCH_INTERVAL_MS = 60 * 60 * 1000;

// Dotted-numeric only (e.g. "1.4.2") - good enough for comparing against
// versionName/CFBundleShortVersionString, which this app already keeps
// in that form. Missing/non-numeric segments count as 0, so "1.4" and
// "1.4.0" compare equal.
function compareVersions(a: string, b: string): number {
  const partsA = a.split('.').map((n) => parseInt(n, 10) || 0);
  const partsB = b.split('.').map((n) => parseInt(n, 10) || 0);
  const length = Math.max(partsA.length, partsB.length);
  for (let i = 0; i < length; i++) {
    const diff = (partsA[i] ?? 0) - (partsB[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

// True only if Remote Config genuinely says the installed version is
// below the configured minimum. The default ("0.0.0") never blocks
// anyone on its own - this only takes effect once a real value is set
// in the Firebase console - and any failure along the way also resolves
// to false, since a broken check should never itself lock users out of
// the app.
//
// Decided from the value saved by the last launch, because the whole app
// waits on this answer and a network call here had no upper limit on how
// long that took. The fresh value is fetched alongside for next time, so
// a newly raised minimum takes effect one launch later than it would
// have. That's also what keeps the gate's promise in useUpdateGate: it
// can't change its mind mid-session.
export async function checkForcedUpdate(): Promise<boolean> {
  try {
    const rc = remoteConfig();
    await rc.setDefaults({ [MINIMUM_VERSION_KEY]: '0.0.0' });
    await rc.setConfigSettings({ minimumFetchIntervalMillis: MINIMUM_FETCH_INTERVAL_MS });
    await rc.ensureInitialized();

    const minimumVersion = rc.getValue(MINIMUM_VERSION_KEY).asString();
    const currentVersion = DeviceInfo.getVersion();
    rc.fetchAndActivate().catch(() => {});
    return compareVersions(currentVersion, minimumVersion) < 0;
  } catch {
    return false;
  }
}
