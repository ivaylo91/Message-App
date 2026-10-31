import { AccessibilityInfo } from 'react-native';

// Says something through the screen reader without moving its focus. For
// changes that appear away from where someone is reading: a toast, a new
// message, a form error. Does nothing when no screen reader is running.
export function announce(message: string): void {
  AccessibilityInfo.announceForAccessibility(message);
}
