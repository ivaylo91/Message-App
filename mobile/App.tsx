/**
 * Message App
 *
 * @format
 */

import { useEffect, useState } from 'react';
import { ActivityIndicator, StatusBar, useColorScheme, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from './src/auth/AuthContext';
import { RootNavigator } from './src/navigation/RootNavigator';
import { AppBackground } from './src/components/AppBackground';
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
      <View style={{ flex: 1, backgroundColor: colors.paper }}>
        <AppBackground />
        <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
        {isI18nReady ? (
          <AuthProvider>
            <RootNavigator />
          </AuthProvider>
        ) : (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
            <ActivityIndicator />
          </View>
        )}
      </View>
    </SafeAreaProvider>
  );
}

export default App;