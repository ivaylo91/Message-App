import AsyncStorage from '@react-native-async-storage/async-storage';

interface CacheEntry {
  url: string;
  expiresAt: number;
}

const STORAGE_PREFIX = 'signedUrl:';
const memoryCache = new Map<string, CacheEntry>();

function storageKey(bucket: string, path: string): string {
  return `${STORAGE_PREFIX}${bucket}:${path}`;
}

// Signed URLs are cached by storage path (not just held in memory) so
// the *same* URL string survives an app restart. That matters beyond
// avoiding a re-sign round trip: FastImage's disk cache is keyed on the
// URI string it's given, so handing it a stable URL is what lets a
// previously-downloaded avatar or attachment actually load from disk
// instead of re-downloading every cold start. A cache miss (expired or
// first request) mints a fresh signed URL via `sign` and both layers of
// caching restart together from that new URL.
export async function getCachedSignedUrl(
  bucket: string,
  path: string,
  sign: () => Promise<{ url: string; expirySeconds: number }>,
): Promise<string> {
  const key = storageKey(bucket, path);
  const now = Date.now();

  const inMemory = memoryCache.get(key);
  if (inMemory && inMemory.expiresAt > now) return inMemory.url;

  const stored = await AsyncStorage.getItem(key);
  if (stored) {
    try {
      const entry = JSON.parse(stored) as CacheEntry;
      if (entry.expiresAt > now) {
        memoryCache.set(key, entry);
        return entry.url;
      }
    } catch {
      // corrupt entry - fall through and re-sign
    }
  }

  const { url, expirySeconds } = await sign();
  // Expire a minute early so a render never hands out a URL that's
  // about to be rejected mid-flight.
  const entry: CacheEntry = { url, expiresAt: now + expirySeconds * 1000 - 60_000 };
  memoryCache.set(key, entry);
  void AsyncStorage.setItem(key, JSON.stringify(entry));
  return url;
}