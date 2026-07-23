import { Platform } from 'react-native';

// The Android emulator can't reach the host machine via localhost - it
// needs the special 10.0.2.2 alias. iOS simulator can use localhost
// directly. A physical device needs your machine's LAN IP instead.
const DEV_HOST = Platform.OS === 'android' ? '10.0.2.2' : 'localhost';

export const API_BASE_URL = `http://${DEV_HOST}:3000`;
export const MQTT_WS_URL = `ws://${DEV_HOST}:8083/mqtt`;
