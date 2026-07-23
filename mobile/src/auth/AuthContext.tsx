import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { setAuthToken } from '../api/client';
import * as authApi from '../api/auth';
import { User } from '../types';

const TOKEN_STORAGE_KEY = 'message-app/access-token';
const USER_STORAGE_KEY = 'message-app/user';

interface AuthContextValue {
  user: User | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (
    email: string,
    password: string,
    displayName: string,
  ) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      const [storedToken, storedUser] = await Promise.all([
        AsyncStorage.getItem(TOKEN_STORAGE_KEY),
        AsyncStorage.getItem(USER_STORAGE_KEY),
      ]);
      if (storedToken && storedUser) {
        setAuthToken(storedToken);
        setUser(JSON.parse(storedUser) as User);
      }
      setIsLoading(false);
    })();
  }, []);

  const persistSession = useCallback(async (token: string, sessionUser: User) => {
    setAuthToken(token);
    setUser(sessionUser);
    await Promise.all([
      AsyncStorage.setItem(TOKEN_STORAGE_KEY, token),
      AsyncStorage.setItem(USER_STORAGE_KEY, JSON.stringify(sessionUser)),
    ]);
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      const { accessToken, user: sessionUser } = await authApi.login(
        email,
        password,
      );
      await persistSession(accessToken, sessionUser);
    },
    [persistSession],
  );

  const register = useCallback(
    async (email: string, password: string, displayName: string) => {
      const { accessToken, user: sessionUser } = await authApi.register(
        email,
        password,
        displayName,
      );
      await persistSession(accessToken, sessionUser);
    },
    [persistSession],
  );

  const logout = useCallback(async () => {
    setAuthToken(null);
    setUser(null);
    await Promise.all([
      AsyncStorage.removeItem(TOKEN_STORAGE_KEY),
      AsyncStorage.removeItem(USER_STORAGE_KEY),
    ]);
  }, []);

  const value = useMemo(
    () => ({ user, isLoading, login, register, logout }),
    [user, isLoading, login, register, logout],
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
