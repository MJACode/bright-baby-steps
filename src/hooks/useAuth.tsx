import { useState, useEffect, createContext, useContext } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { unregisterPush } from "@/lib/pushNotifications";
import { queryClient } from "@/lib/queryClient";
import { clearDeviceStore, isOfflinePersistenceEnabled, readStoredSession, removeStoredAuth } from "@/lib/offlineCache";

interface AuthContextType {
  session: Session | null;
  user: User | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  loading: true,
  signOut: async () => {},
});

const withOfflineFallback = (session: Session | null) =>
  session ?? (isOfflinePersistenceEnabled() ? readStoredSession() : null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(event === "SIGNED_OUT" ? null : event === "INITIAL_SESSION" ? withOfflineFallback(session) : session);
        setLoading(false);
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(withOfflineFallback(session));
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    // Clear this device's copy of the family's data and any queued writes
    // before the session goes, so nothing outlives the sign-out even if the
    // network call below fails.
    await clearDeviceStore(queryClient);
    await unregisterPush();
    const { error } = await supabase.auth.signOut();
    if (error) {
      // Offline, the global sign-out can't reach the server; end it on this
      // device instead, and if supabase-js still refuses (an expired token it
      // can't refresh), remove its stored session ourselves.
      const { error: localError } = await supabase.auth.signOut({ scope: "local" });
      if (localError) removeStoredAuth();
    }
    // No SIGNED_OUT event fires when supabase-js bailed, so don't wait for one.
    setSession(null);
  };

  return (
    <AuthContext.Provider value={{ session, user: session?.user ?? null, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
