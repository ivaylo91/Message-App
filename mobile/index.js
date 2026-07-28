/**
 * @format
 */

import { AppRegistry } from 'react-native';
import messaging from '@react-native-firebase/messaging';
import App from './App';
import { name as appName } from './app.json';

// Messages we send always include a `notification` payload, so Android
// displays them automatically while backgrounded/killed - this handler
// just needs to exist so react-native-firebase doesn't warn, and gives
// us a hook if we ever need silent/data-only messages later.
messaging().setBackgroundMessageHandler(async () => {});

AppRegistry.registerComponent(appName, () => App);