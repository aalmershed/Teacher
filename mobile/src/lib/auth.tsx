import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, loadToken, saveToken, setUnauthorizedHandler, type User } from './api';
import { loadSchedule, resetSchedule } from './schedule';

type AuthState = {
  user: User | null;
  ready: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (data: { name: string; email: string; phone: string; password: string }) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  const clear = useCallback(async () => {
    await saveToken(null);
    setUser(null);
    resetSchedule(); // يلغي تنبيهات الحصص عند الخروج
  }, []);

  // بعد الدخول نحمّل جدولي ونرتب تنبيهاته، لأن المعلم ممكن سوّى جدوله من الموقع
  const userId = user?.id;
  useEffect(() => { if (userId) loadSchedule(); }, [userId]);

  useEffect(() => {
    setUnauthorizedHandler(() => { clear(); });
    (async () => {
      try {
        if (await loadToken()) setUser((await api<{ user: User }>('GET', '/api/me')).user);
      } catch {
        // بدون إنترنت أو انتهت الجلسة: يرجع لشاشة الدخول
      } finally {
        setReady(true);
      }
    })();
    return () => setUnauthorizedHandler(null);
  }, [clear]);

  const signIn = async (path: string, body: object) => {
    const r = await api<{ user: User; token: string }>('POST', path, body);
    await saveToken(r.token);
    setUser(r.user);
  };

  const value: AuthState = {
    user,
    ready,
    login: (email, password) => signIn('/api/auth/login', { email, password }),
    register: (data) => signIn('/api/auth/register', data),
    logout: async () => {
      try { await api('POST', '/api/auth/logout'); } catch { /* نكمل الخروج حتى لو فشل الطلب */ }
      await clear();
    },
    refresh: async () => setUser((await api<{ user: User }>('GET', '/api/me')).user),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
