import React, { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import {
  DarkTheme as NavDarkTheme,
  DefaultTheme as NavDefaultTheme,
  NavigationContainer,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuth } from '../auth/AuthContext';
import { useTheme } from '../theme/ThemeContext';
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
import { MediaGalleryScreen } from '../screens/MediaGalleryScreen';

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
  MediaGallery: { conversationId: string; title: string };
};

const AuthStack = createNativeStackNavigator<AuthStackParamList>();
const AppStack = createNativeStackNavigator<AppStackParamList>();

function AuthNavigator() {
  const { colors } = useTheme();
  // Each screen paints its own opaque background (with its own local
  // AppWallpaper layer) - previous screens stay mounted underneath in
  // the stack, so a transparent contentStyle here would let them show
  // through beneath whichever screen is on top.
  const screenOptions = {
    headerShown: false,
    contentStyle: { backgroundColor: colors.paper },
  } as const;

  return (
    <AuthStack.Navigator screenOptions={screenOptions}>
      <AuthStack.Screen name="Welcome" component={WelcomeScreen} />
      <AuthStack.Screen name="Login" component={LoginScreen} />
      <AuthStack.Screen name="Register" component={RegisterScreen} />
    </AuthStack.Navigator>
  );
}

function AppNavigator() {
  const { colors } = useTheme();
  const screenOptions = {
    headerShown: false,
    contentStyle: { backgroundColor: colors.paper },
  } as const;

  return (
    <AppStack.Navigator screenOptions={screenOptions}>
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
      <AppStack.Screen name="MediaGallery" component={MediaGalleryScreen} />
    </AppStack.Navigator>
  );
}

export function RootNavigator() {
  const { session, userId, isLoading } = useAuth();
  const { colors, scheme } = useTheme();

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
          backgroundColor: colors.paper,
        }}
      >
        <ActivityIndicator color={colors.ember} />
      </View>
    );
  }

  const navTheme = {
    ...(scheme === 'dark' ? NavDarkTheme : NavDefaultTheme),
    colors: {
      ...(scheme === 'dark' ? NavDarkTheme.colors : NavDefaultTheme.colors),
      background: colors.paper,
      card: colors.paper2,
      text: colors.ink,
      border: colors.line,
      primary: colors.ember,
    },
  };

  return (
    <NavigationContainer ref={navigationRef} theme={navTheme}>
      {session ? <AppNavigator /> : <AuthNavigator />}
    </NavigationContainer>
  );
}
