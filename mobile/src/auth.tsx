import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged, signOut as fbSignOut } from 'firebase/auth';
import { auth } from './firebase/app';
import { api, User, ApiError } from './firebase/data';
import { getDevice } from './device';

type AuthState = {
  ready: boolean;
  user: User | null;
  device: { id: string; name: string } | null;
  signIn: (email: string, password: string) => Promise<void>;
  register: (b: { name: string; email: string; password: string; studentCode?: string }) => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
};

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [device, setDevice] = useState<{ id: string; name: string } | null>(null);

  useEffect(() => {
    let dev: { id: string; name: string } | null = null;
    const unsub = onAuthStateChanged(auth, async (fb) => {
      if (!dev) { dev = await getDevice(); setDevice(dev); }
      if (!fb) { setUser(null); setReady(true); return; }
      try {
        const { user: u } = await api.me();
        // A student whose binding moved to another phone is signed out here too.
        if (u.role === 'student' && u.deviceId && u.deviceId !== dev.id) {
          await fbSignOut(auth);
          setUser(null);
        } else {
          setUser(u);
        }
      } catch (e) {
        // Keep the session through network blips; drop it if the profile is gone.
        if (e instanceof ApiError && (e.code === 'NO_PROFILE' || e.code === 'FORBIDDEN')) { await fbSignOut(auth); setUser(null); }
      } finally {
        setReady(true);
      }
    });
    return unsub;
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const dev = device ?? (await getDevice());
    const res = await api.login({ email, password, deviceId: dev.id, deviceName: dev.name });
    setUser(res.user);
  }, [device]);

  const register = useCallback<AuthState['register']>(async (b) => {
    const dev = device ?? (await getDevice());
    const res = await api.register({ ...b, deviceId: dev.id, deviceName: dev.name });
    setUser(res.user);
  }, [device]);

  const signOut = useCallback(async () => {
    await api.signOut();
    setUser(null);
  }, []);

  const refresh = useCallback(async () => {
    const { user: u } = await api.me();
    setUser(u);
  }, []);

  const value = useMemo(() => ({ ready, user, device, signIn, register, signOut, refresh }), [ready, user, device, signIn, register, signOut, refresh]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth outside AuthProvider');
  return v;
}
