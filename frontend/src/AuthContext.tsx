import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { authApi, getSavedUser, getToken, removeToken, saveUser, setToken } from './api';
import type { User } from './types';

interface AuthCtx {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, name: string, password: string) => Promise<void>;
  logout: () => void;
  updateUser: (u: User) => void;
}

const AuthContext = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(getSavedUser);
  const [loading, setLoading] = useState(!!getToken() && !getSavedUser());

  // On mount: if we have a token but no cached user, fetch /auth/me
  useEffect(() => {
    if (!getToken()) return;
    if (user) return;
    setLoading(true);
    authApi
      .me()
      .then((u) => {
        setUser(u);
        saveUser(u);
      })
      .catch(() => {
        removeToken();
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const login = useCallback(async (email: string, password: string) => {
    const res = await authApi.login(email, password);
    setToken(res.access_token);
    saveUser(res.user);
    setUser(res.user);
  }, []);

  const register = useCallback(async (email: string, name: string, password: string) => {
    const res = await authApi.register(email, name, password);
    setToken(res.access_token);
    saveUser(res.user);
    setUser(res.user);
  }, []);

  const logout = useCallback(() => {
    removeToken();
    setUser(null);
  }, []);

  const updateUser = useCallback((u: User) => {
    setUser(u);
    saveUser(u);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthCtx {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
