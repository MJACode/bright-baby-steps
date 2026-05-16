import { useEffect, useState, useCallback } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

interface AuthState {
  session: Session | null;
  loading: boolean;
  error: string | null;
  pendingConfirmationEmail: string | null;
}

export function useAuth() {
  const [state, setState] = useState<AuthState>({
    session: null,
    loading: true,
    error: null,
    pendingConfirmationEmail: null,
  });

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setState((s) => ({ ...s, session: data.session, loading: false }));
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setState((s) => ({ ...s, session, loading: false }));
    });
    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    setState((s) => ({ ...s, loading: true, error: null }));
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setState((s) => ({
      ...s,
      loading: false,
      error: error?.message ?? null,
      pendingConfirmationEmail: error ? s.pendingConfirmationEmail : null,
    }));
  }, []);

  const signUp = useCallback(async (email: string, password: string) => {
    setState((s) => ({ ...s, loading: true, error: null }));
    const { data, error } = await supabase.auth.signUp({ email, password });
    // When "Confirm email" is enabled in Supabase Auth (production setting),
    // signUp returns no session — the user has to click the email link first.
    setState((s) => ({
      ...s,
      loading: false,
      error: error?.message ?? null,
      pendingConfirmationEmail: !error && !data.session ? email : null,
    }));
  }, []);

  const resendConfirmation = useCallback(async (email: string) => {
    setState((s) => ({ ...s, loading: true, error: null }));
    const { error } = await supabase.auth.resend({ type: 'signup', email });
    setState((s) => ({ ...s, loading: false, error: error?.message ?? null }));
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setState((s) => ({ ...s, pendingConfirmationEmail: null }));
  }, []);

  const clearPending = useCallback(() => {
    setState((s) => ({ ...s, pendingConfirmationEmail: null }));
  }, []);

  return { ...state, signIn, signUp, resendConfirmation, signOut, clearPending };
}
