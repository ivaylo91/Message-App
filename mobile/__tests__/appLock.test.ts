import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Keychain from 'react-native-keychain';
import {
  disableAppLock,
  enableAppLock,
  isAppLockEnabled,
  LOCK_AFTER_MS,
  shouldLockOnReturn,
  unlockApp,
} from '../src/appLock/appLock';

jest.mock('@react-native-async-storage/async-storage', () => {
  const store = new Map<string, string>();
  return {
    __esModule: true,
    default: {
      setItem: async (key: string, value: string) => void store.set(key, value),
      getItem: async (key: string) => store.get(key) ?? null,
      removeItem: async (key: string) => void store.delete(key),
    },
  };
});

jest.mock('react-native-keychain', () => ({
  ACCESS_CONTROL: { BIOMETRY_ANY_OR_DEVICE_PASSCODE: 'any' },
  ACCESSIBLE: { WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'this-device' },
  STORAGE_TYPE: { AES_GCM: 'gcm' },
  setGenericPassword: jest.fn(),
  getGenericPassword: jest.fn(),
  resetGenericPassword: jest.fn(async () => true),
}));

const setItem = Keychain.setGenericPassword as jest.Mock;
const getItem = Keychain.getGenericPassword as jest.Mock;

describe('shouldLockOnReturn', () => {
  it('stays open for a quick trip out, like picking a photo', () => {
    expect(shouldLockOnReturn(1000, 1000 + LOCK_AFTER_MS - 1)).toBe(false);
  });

  it('locks after being away', () => {
    expect(shouldLockOnReturn(1000, 1000 + LOCK_AFTER_MS)).toBe(true);
  });

  it('does not lock when the app never left the foreground', () => {
    expect(shouldLockOnReturn(null, 999_999)).toBe(false);
  });
});

describe('turning app lock on', () => {
  beforeEach(async () => {
    setItem.mockReset();
    getItem.mockReset();
    await disableAppLock();
  });

  it('turns on once the system prompt has passed', async () => {
    setItem.mockResolvedValue({ service: 'x' });
    getItem.mockResolvedValue({ password: 'locked' });
    await expect(enableAppLock('Unlock')).resolves.toBe(true);
    await expect(isAppLockEnabled()).resolves.toBe(true);
  });

  it('stays off on a phone with no screen lock', async () => {
    setItem.mockRejectedValue(new Error('no screen lock'));
    await expect(enableAppLock('Unlock')).resolves.toBe(false);
    await expect(isAppLockEnabled()).resolves.toBe(false);
  });

  it('stays off when the prompt is cancelled', async () => {
    setItem.mockResolvedValue({ service: 'x' });
    getItem.mockRejectedValue(new Error('cancelled'));
    await expect(enableAppLock('Unlock')).resolves.toBe(false);
    await expect(isAppLockEnabled()).resolves.toBe(false);
  });
});

describe('unlockApp', () => {
  it('fails closed when the system refuses', async () => {
    getItem.mockRejectedValue(new Error('wrong finger'));
    await expect(unlockApp('Unlock')).resolves.toBe(false);
  });

  it('fails closed when the item is missing', async () => {
    getItem.mockResolvedValue(false);
    await expect(unlockApp('Unlock')).resolves.toBe(false);
  });
});

describe('disableAppLock', () => {
  it('clears the setting and the keychain item', async () => {
    await AsyncStorage.setItem('appLock:v1', 'on');
    await disableAppLock();
    await expect(isAppLockEnabled()).resolves.toBe(false);
    expect(Keychain.resetGenericPassword).toHaveBeenCalled();
  });
});
