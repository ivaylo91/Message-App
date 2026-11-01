import AsyncStorage from '@react-native-async-storage/async-storage';
import { NativeModules } from 'react-native';
import * as Keychain from 'react-native-keychain';

// App lock is enforced by the operating system rather than by a flag in the
// app: a small keychain item is stored so that only fingerprint, face or the
// device PIN can read it, and unlocking is reading it. There's no app-level
// PIN to forget, leak or brute-force.
const ENABLED_KEY = 'appLock:v1';
const SERVICE = 'hearth-app-lock';

const KEYCHAIN_OPTIONS = {
  service: SERVICE,
  accessControl: Keychain.ACCESS_CONTROL.BIOMETRY_ANY_OR_DEVICE_PASSCODE,
  accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  storage: Keychain.STORAGE_TYPE.AES_GCM,
};

// Long enough to pick a photo, approve a permission or answer the system's own
// unlock prompt, all of which send the app to the background, without being
// asked to unlock on the way back.
export const LOCK_AFTER_MS = 60_000;

export function shouldLockOnReturn(backgroundedAt: number | null, now: number): boolean {
  return backgroundedAt !== null && now - backgroundedAt >= LOCK_AFTER_MS;
}

// Android only, so absent on iOS. See AppLockWindowPackage.kt.
export function hideFromRecents(hidden: boolean): void {
  NativeModules.AppLockWindow?.setHiddenFromRecents(hidden);
}

export async function isAppLockEnabled(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(ENABLED_KEY)) === 'on';
  } catch {
    return false;
  }
}

// False when it can't be turned on: no screen lock on the phone, or the person
// cancelled. Reading the item back proves the prompt works before relying on it.
export async function enableAppLock(promptTitle: string): Promise<boolean> {
  try {
    const authenticationPrompt = { title: promptTitle };
    const stored = await Keychain.setGenericPassword('hearth', 'locked', {
      ...KEYCHAIN_OPTIONS,
      authenticationPrompt,
    });
    if (!stored || !(await unlockApp(promptTitle))) return false;
    await AsyncStorage.setItem(ENABLED_KEY, 'on');
    return true;
  } catch {
    return false;
  }
}

export async function unlockApp(promptTitle: string): Promise<boolean> {
  try {
    const result = await Keychain.getGenericPassword({
      ...KEYCHAIN_OPTIONS,
      authenticationPrompt: { title: promptTitle },
    });
    return Boolean(result);
  } catch {
    return false;
  }
}

export async function disableAppLock(): Promise<void> {
  await AsyncStorage.removeItem(ENABLED_KEY);
  await Keychain.resetGenericPassword({ service: SERVICE }).catch(() => {});
}
