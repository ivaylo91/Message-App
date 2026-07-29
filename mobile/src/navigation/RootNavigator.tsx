import React, { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { DefaultTheme, NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuth } from '../auth/AuthContext';
import { colors } from '../theme/tokens';
import { navigationRef } from './navigationRef';
import {
  attachNotificationListeners,
  requestPermissionAndRegisterToken,
} from '../notifications';
import { WelcomeScreen } from '../screens/WelcomeScreen';
import { LoginScreen } from '../screens/LoginScreen';
import { RegisterScreen } from '../screens/RegisterScreen';
import { ConversationsScreen } from '../screens/ConversationsScreen';
import { NewChatScreen } from '../screens/NewChatScreen';
import { NewGroupScreen } from '../screens/NewGroupScreen';
import { ChatScreen } from '../screens/ChatScreen';
import { ProfileScreen } from '../screens/ProfileScreen';

export type AuthStackParamList = {
  Welcome: undefined;
  Login: undefined;
  Register: undefined;
};

export type AppStackParamList = {
  Conversations: undefined;
  NewChat: undefined;
  NewGroup: undefined;
  Profile: undefined;
  Chat: { conversationId: string; title: string };
};

const AuthStack = createNativeStackNavigator<AuthStackParamList>();
const AppStack = createNativeStackNavigator<AppStackParamList>();

const transparentScreenOptions = {
  headerShown: false,
  contentStyle: { backgroundColor: 'transparent' },
} as const;

function AuthNavigator() {
  return (
    <AuthStack.Navigator screenOptions={transparentScreenOptions}>
      <AuthStack.Screen name="Welcome" component={WelcomeScreen} />
      <AuthStack.Screen name="Login" component={LoginScreen} />
      <AuthStack.Screen name="Register" component={RegisterScreen} />
    </AuthStack.Navigator>
  );
}

function AppNavigator() {
  return (
    <AppStack.Navigator screenOptions={transparentScreenOptions}>
      <AppStack.Screen name="Conversations" component={ConversationsScreen} />
      <AppStack.Screen
        name="NewChat"
        component={NewChatScreen}
        options={{ presentation: 'modal' }}
      />
      <AppStack.Screen
        name="NewGroup"
        component={NewGroupScreen}
        options={{ presentation: 'modal' }}
      />
      <AppStack.Screen
        name="Profile"
        component={ProfileScreen}
        options={{ presentation: 'modal' }}
      />
      <AppStack.Screen name="Chat" component={ChatScreen} />
    </AppStack.Navigator>
  );
}

export function RootNavigator() {
  const { session, userId, isLoading } = useAuth();

  useEffect(() => attachNotificationListeners(), []);

  useEffect(() => {
    if (!userId) return;
    requestPermissionAndRegisterToken().catch(() => {
      // best-effort - a missed push registration isn't worth surfacing an error for
    });
  }, [userId]);

  if (isLoading) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        <ActivityIndicator color={colors.ember} />
      </View>
    );
  }

  return (
    <NavigationContainer
      ref={navigationRef}
      theme={{ ...DefaultTheme, colors: { ...DefaultTheme.colors, background: 'transparent' } }}
    >
      {session ? <AppNavigator /> : <AuthNavigator />}
    </NavigationContainer>
  );
}