import { useQuery, useQueryClient } from "@tanstack/react-query";
import React, { createContext, useContext, useEffect, useState } from "react";
import * as api from "./api";
import type { UserProfile } from "./types";

interface AuthCtx {
  token: string | null;
  user: UserProfile | null;
  loading: boolean;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthCtx>({
  token: null,
  user: null,
  loading: true,
  refresh: async () => {},
  signOut: async () => {},
});

export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setTokenState] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const queryClient = useQueryClient();

  useEffect(() => {
    api.getToken().then((t) => {
      setTokenState(t);
      setReady(true);
    });
  }, []);

  const userQuery = useQuery({
    queryKey: ["me"],
    queryFn: api.me,
    enabled: !!token && ready,
    retry: 1,
    staleTime: 60_000,
  });

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["me"] });
  };

  const signOut = async () => {
    await api.logout();
    setTokenState(null);
    queryClient.clear();
  };

  return (
    <Ctx.Provider
      value={{
        token,
        user: token ? (userQuery.data ?? null) : null,
        loading: !ready,
        refresh,
        signOut,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}
