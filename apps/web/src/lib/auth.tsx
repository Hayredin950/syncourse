"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api, get, getToken, setToken } from "./api";
import type { UserProfile } from "./types";

interface AuthContextValue {
  user: UserProfile | null;
  token: string | null;
  loading: boolean;
  isPremium: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, username: string, email: string, password: string) => Promise<void>;
  logout: () => void;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [token, setTokenState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!getToken()) {
      setLoading(false);
      return;
    }
    try {
      const profile = await get<UserProfile>("/users/me");
      setUser(profile);
    } catch (e) {
      // Only treat a definitive 401 as "logged out". A transient network /
      // server error right after login should NOT clear the stored token —
      // otherwise a moment of flakiness logs the user straight back out.
      const status = (e as { status?: number })?.status;
      if (status === 401) {
        setToken(null);
        setUser(null);
      } else {
        setUser(null);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setTokenState(getToken());
    void refresh();
  }, [refresh]);

  const login = useCallback(
    async (email: string, password: string) => {
      const res = await api<{ accessToken: string }>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      setToken(res.accessToken);
      setTokenState(res.accessToken);
      await refresh();
    },
    [refresh],
  );

  const register = useCallback(
    async (name: string, username: string, email: string, password: string) => {
      const res = await api<{ accessToken: string }>("/auth/register", {
        method: "POST",
        body: JSON.stringify({ name, username, email, password }),
      });
      setToken(res.accessToken);
      setTokenState(res.accessToken);
      await refresh();
    },
    [refresh],
  );

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
  }, []);

  const isPremium =
    !!user &&
    user.planType === "premium" &&
    (!user.planExpiresAt || new Date(user.planExpiresAt) > new Date());

  return (
    <AuthContext.Provider value={{ user, token, loading, isPremium, login, register, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
