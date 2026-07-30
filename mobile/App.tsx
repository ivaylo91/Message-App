/**
 * Message App
 *
 * @format
 */

import { useEffect, useState } from 'react';
import { ActivityIndicator, StatusBar, useColorScheme, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from './src/auth/AuthContext';
import { PresenceProvider } from './src/presence/PresenceContext';
import { ToastProvider } from './src/components/Toast';
import { RootNavigator } from './src/navigation/RootNavigator';
import { initI18n } from './src/i18n';
import { colors } from './src/theme/tokens';

function App() {
  const isDarkMode = useColorScheme() === 'dark';
  const [isI18nReady, setIsI18nReady] = useState(false);

  useEffect(() => {
    void initI18n().then(() => setIsI18nReady(true));
  }, []);

  return (
    <SafeAreaProvider>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      {isI18nReady ? (
        <ToastProvider>
          <AuthProvider>
            <PresenceProvider>
              <RootNavigator />
            </PresenceProvider>
          </AuthProvider>
        </ToastProvider>
      ) : (
        <View
          style={{
            flex: 1,
            justifyContent: 'center',
            alignItems: 'center',
            backgroundColor: colors.paper,
          }}
        >
          <ActivityIndicator />
        </View>
      )}
    </SafeAreaProvider>
  );
}

export default App;