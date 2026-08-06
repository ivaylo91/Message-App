import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { RESET_PASSWORD_URL } from '../config/env';
import { unregisterCurrentDeviceToken } from '../notifications';

interface AuthContextValue {
  session: Session | null;
  userId: string | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (
    email: string,
    password: string,
    displayName: string,
  ) => Promise<{ needsEmailConfirmation: boolean }>;
  requestPasswordReset: (email: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setIsLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });

    return () => subscription.unsubscribe();
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw error;
  }, []);

  const register = useCallback(
    async (email: string, password: string, displayName: string) => {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { display_name: displayName } },
      });
      if (error) throw error;
      // If email confirmation is required, signUp succeeds but returns no
      // session - the caller needs to prompt the user to check their inbox
      // instead of assuming they're now signed in.
      return { needsEmailConfirmation: data.session === null };
    },
    [],
  );

  // Deliberately doesn't reveal whether the email actually matches an
  // account - Supabase itself returns success either way for this
  // endpoint, which avoids letting this screen be used to check which
  // emails are registered.
  const requestPasswordReset = useCallback(async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: RESET_PASSWORD_URL,
    });
    if (error) throw error;
  }, []);

  const logout = useCallback(async () => {
    // Best-effort, and must happen before signOut() - once the session
    // is gone, this device is no longer authenticated as this user and
    // can't touch its own push_tokens row anymore.
    await unregisterCurrentDeviceToken().catch(() => {});
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  }, []);

  const value = useMemo(
    () => ({
      session,
      userId: session?.user.id ?? null,
      isLoading,
      login,
      register,
      requestPasswordReset,
      logout,
    }),
    [session, isLoading, login, register, requestPasswordReset, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
