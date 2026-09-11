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
import { MessageStreamProvider } from './src/messages/MessageStreamContext';
import { UnreadProvider } from './src/unread/UnreadContext';
import { OutboxProvider } from './src/offline/OutboxContext';
import { TypingProvider } from './src/typing/TypingContext';
import { CallProvider } from './src/calling/CallContext';
import { CallOverlay } from './src/calling/CallOverlay';
import { ToastProvider } from './src/components/Toast';
import { ConfirmSheetProvider } from './src/components/ConfirmSheet';
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
          <ConfirmSheetProvider>
          <AuthProvider>
            <PresenceProvider>
              <MessageStreamProvider>
                <UnreadProvider>
                  <OutboxProvider>
                    <TypingProvider>
                      <CallProvider>
                        <RootNavigator />
                        <CallOverlay />
                      </CallProvider>
                    </TypingProvider>
                  </OutboxProvider>
                </UnreadProvider>
              </MessageStreamProvider>
            </PresenceProvider>
          </AuthProvider>
          </ConfirmSheetProvider>
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