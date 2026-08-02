/**
 * Message App
 *
 * @format
 */

import { useEffect, useState } from 'react';
import { ActivityIndicator, StatusBar, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from './src/auth/AuthContext';
import { PresenceProvider } from './src/presence/PresenceContext';
import { CallProvider } from './src/calling/CallContext';
import { CallOverlay } from './src/calling/CallOverlay';
import { ToastProvider } from './src/components/Toast';
import { RootNavigator } from './src/navigation/RootNavigator';
import { initI18n } from './src/i18n';
import { ThemeProvider, useTheme } from './src/theme/ThemeContext';

function AppContent() {
  const { colors, scheme } = useTheme();
  const [isI18nReady, setIsI18nReady] = useState(false);

  useEffect(() => {
    void initI18n().then(() => setIsI18nReady(true));
  }, []);

  return (
    <>
      <StatusBar barStyle={scheme === 'dark' ? 'light-content' : 'dark-content'} />
      {isI18nReady ? (
        <ToastProvider>
          <AuthProvider>
            <PresenceProvider>
              <CallProvider>
                <RootNavigator />
                <CallOverlay />
              </CallProvider>
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
    </>
  );
}

function App() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <AppContent />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

export default App;