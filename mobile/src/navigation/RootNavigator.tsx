import React, { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import {
  DarkTheme as NavDarkTheme,
  DefaultTheme as NavDefaultTheme,
  NavigationContainer,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuth } from '../auth/AuthContext';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { useTheme } from '../theme/ThemeContext';
import { navigationRef } from './navigationRef';
import {
  attachNotificationListeners,
  requestPermissionAndRegisterToken,
} from '../notifications';
import { useInviteLinkHandler } from '../invites/useInviteLinkHandler';
import { useUpdateGate } from '../updateGate/useUpdateGate';
import { UpdateRequiredScreen } from '../screens/UpdateRequiredScreen';
import { WelcomeScreen } from '../screens/WelcomeScreen';
import { ConversationsScreen } from '../screens/ConversationsScreen';

export type AuthStackParamList = {
  Welcome: undefined;
  Login: undefined;
  Register: undefined;
  ForgotPassword: undefined;
};

export type AppStackParamList = {
  Conversations: undefined;
  NewChat: undefined;
  NewGroup: undefined;
  Profile: undefined;
  Calls: undefined;
  SavedMessages: undefined;
  NewPoll: { conversationId: string };
  // highlightMessageId jumps straight to a message - used by global
  // search, which can land on a message far outside the newest page.
  Chat: { conversationId: string; title: string; highlightMessageId?: string };
  MediaGallery: { conversationId: string; title: string };
  GroupInfo: { conversationId: string };
  ContactInfo: { conversationId: string };
};

const AuthStack = createNativeStackNavigator<AuthStackParamList>();
const AppStack = createNativeStackNavigator<AppStackParamList>();

// Each screen gets its own boundary, so one that breaks takes nothing else
// with it. A plain function rather than inline, so a navigator's re-render
// doesn't remount every screen.
const screenLayout = ({ children }: { children: React.ReactElement }) => (
  <ErrorBoundary showBack>{children}</ErrorBoundary>
);

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
    <AuthStack.Navigator screenOptions={screenOptions} screenLayout={screenLayout}>
      <AuthStack.Screen name="Welcome" component={WelcomeScreen} />
      <AuthStack.Screen name="Login" getComponent={() => require('../screens/LoginScreen').LoginScreen} />
      <AuthStack.Screen
        name="Register"
        getComponent={() => require('../screens/RegisterScreen').RegisterScreen}
      />
      <AuthStack.Screen
        name="ForgotPassword"
        getComponent={() => require('../screens/ForgotPasswordScreen').ForgotPasswordScreen}
      />
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
    <AppStack.Navigator screenOptions={screenOptions} screenLayout={screenLayout}>
      {/* Only the first screen a launch shows is imported up front. The
          rest load the first time they're opened, so launching doesn't pay
          to initialise screens it may never reach. */}
      <AppStack.Screen name="Conversations" component={ConversationsScreen} />
      <AppStack.Screen
        name="NewChat"
        getComponent={() => require('../screens/NewChatScreen').NewChatScreen}
        options={{ presentation: 'modal' }}
      />
      <AppStack.Screen
        name="NewGroup"
        getComponent={() => require('../screens/NewGroupScreen').NewGroupScreen}
        options={{ presentation: 'modal' }}
      />
      {/* Tabs, not a step deeper - they swap in place rather than pushing. */}
      <AppStack.Screen
        name="Profile"
        getComponent={() => require('../screens/ProfileScreen').ProfileScreen}
        options={{ animation: 'none' }}
      />
      <AppStack.Screen
        name="Calls"
        getComponent={() => require('../screens/CallsScreen').CallsScreen}
        options={{ animation: 'none' }}
      />
      <AppStack.Screen name="Chat" getComponent={() => require('../screens/ChatScreen').ChatScreen} />
      <AppStack.Screen
        name="NewPoll"
        getComponent={() => require('../screens/NewPollScreen').NewPollScreen}
      />
      <AppStack.Screen
        name="SavedMessages"
        getComponent={() => require('../screens/SavedMessagesScreen').SavedMessagesScreen}
      />
      <AppStack.Screen
        name="MediaGallery"
        getComponent={() => require('../screens/MediaGalleryScreen').MediaGalleryScreen}
      />
      <AppStack.Screen
        name="GroupInfo"
        getComponent={() => require('../screens/GroupInfoScreen').GroupInfoScreen}
      />
      <AppStack.Screen
        name="ContactInfo"
        getComponent={() => require('../screens/ContactInfoScreen').ContactInfoScreen}
      />
    </AppStack.Navigator>
  );
}

export function RootNavigator() {
  const { session, userId, isLoading } = useAuth();
  const { colors, scheme } = useTheme();
  const { isChecking: isCheckingUpdate, updateRequired } = useUpdateGate();
  useInviteLinkHandler();

  useEffect(() => attachNotificationListeners(), []);

  useEffect(() => {
    if (!userId) return;
    requestPermissionAndRegisterToken().catch(() => {
      // best-effort - a missed push registration isn't worth surfacing an error for
    });
  }, [userId]);

  if (isLoading || isCheckingUpdate) {
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

  // Blocks the entire app, auth stack included - there's no session to
  // check yet at this point, and even a signed-out person on a version
  // this old shouldn't be let into Login/Register.
  if (updateRequired) {
    return <UpdateRequiredScreen />;
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
