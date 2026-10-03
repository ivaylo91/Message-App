/**
 * Message App
 *
 * @format
 */

import { useEffect, useState } from 'react';
import { ActivityIndicator, StatusBar, StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
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
    // Outermost: gestures (swipe-to-reply, the message menu) only work
    // inside it, including in modals and sheets rendered from below.
    <GestureHandlerRootView style={styles.root}>
      {/* Drives keyboard animations frame by frame on the UI thread. The
          translucent flags tell it the app already pads for the status and
          navigation bars itself (safe-area insets, everywhere), so it
          mustn't add its own padding on top. It runs the window edge to
          edge to do this - which Android 15+ already enforces for this
          app - and preserveEdgeToEdge keeps that consistent everywhere. */}
      <KeyboardProvider statusBarTranslucent navigationBarTranslucent preserveEdgeToEdge>
        <SafeAreaProvider>
          <ThemeProvider>
            <AppContent />
          </ThemeProvider>
        </SafeAreaProvider>
      </KeyboardProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});

export default App;