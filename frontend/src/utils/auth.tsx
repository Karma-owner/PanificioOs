import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";

import { emptySettings, parseSettings, type LabSettings } from "@/src/utils/lab-settings";
import { supabase, supabaseConfigured } from "@/src/utils/supabase";
import { setSyncTenant } from "@/src/utils/sync";

export type Role = "admin" | "capoturno" | "operatore";
export type Membership = { tenantId: string; tenantName: string; role: Role; displayName: string; settings: LabSettings };
export type AuthStatus = "loading" | "signedOut" | "needsTenant" | "ready";

type AuthResult = { error: string | null; info?: string };

type AuthContextValue = {
  status: AuthStatus;
  session: Session | null;
  membership: Membership | null;
  configured: boolean;
  signIn: (email: string, password: string) => Promise<AuthResult>;
  signUp: (email: string, password: string) => Promise<AuthResult>;
  signOut: () => Promise<void>;
  createTenant: (name: string, displayName: string) => Promise<AuthResult>;
  acceptInvite: (code: string, displayName: string) => Promise<AuthResult>;
  updateLab: (patch: { name?: string; settings?: Partial<LabSettings> }) => Promise<AuthResult>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function friendlyError(message: string): string {
  const text = message.toLowerCase();
  if (text.includes("invalid login credentials")) return "Email o password non corrette.";
  if (text.includes("email not confirmed")) return "Conferma prima l'indirizzo email dal messaggio che ti abbiamo inviato.";
  if (text.includes("already registered")) return "Esiste già un account con questa email: prova ad accedere.";
  if (text.includes("password should be at least")) return "La password deve avere almeno 6 caratteri.";
  if (text.includes("rate limit")) return "Troppi tentativi ravvicinati: riprova tra qualche minuto.";
  if (text.includes("failed to fetch") || text.includes("network")) return "Connessione assente o server non raggiungibile.";
  return message;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [session, setSession] = useState<Session | null>(null);
  const [membership, setMembership] = useState<Membership | null>(null);

  const loadMembership = useCallback(async (current: Session | null) => {
    if (!current) {
      setSyncTenant(null);
      setMembership(null);
      setStatus("signedOut");
      return;
    }
    const { data, error } = await supabase
      .from("members")
      .select("tenant_id, role, display_name, tenants(name, settings)")
      .eq("user_id", current.user.id)
      .limit(1);
    if (error) {
      setSyncTenant(null);
      setMembership(null);
      setStatus("signedOut");
      return;
    }
    const row = (data?.[0] ?? null) as any;
    if (!row) {
      setSyncTenant(null);
      setMembership(null);
      setStatus("needsTenant");
      return;
    }
    const tenantRel = Array.isArray(row.tenants) ? row.tenants[0] : row.tenants;
    const next: Membership = {
      tenantId: row.tenant_id,
      tenantName: tenantRel?.name ?? "Panificio",
      role: row.role,
      displayName: row.display_name,
      settings: tenantRel ? parseSettings(tenantRel.settings) : emptySettings(),
    };
    setSyncTenant(next.tenantId); // prima di "ready": l'app parte già con il panificio giusto
    setMembership(next);
    setStatus("ready");
  }, []);

  useEffect(() => {
    if (!supabaseConfigured) {
      setStatus("signedOut");
      return;
    }
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      void loadMembership(data.session);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((event, next) => {
      if (event === "TOKEN_REFRESHED") return;
      setSession(next);
      // Rinviato: dentro il callback non si devono attendere altre chiamate a supabase.
      setTimeout(() => { if (active) void loadMembership(next); }, 0);
    });
    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, [loadMembership]);

  const signIn = useCallback(async (email: string, password: string): Promise<AuthResult> => {
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    return { error: error ? friendlyError(error.message) : null };
  }, []);

  const signUp = useCallback(async (email: string, password: string): Promise<AuthResult> => {
    const { data, error } = await supabase.auth.signUp({ email: email.trim(), password });
    if (error) return { error: friendlyError(error.message) };
    if (!data.session) return { error: null, info: "Account creato. Controlla la posta per confermare l'indirizzo, poi accedi." };
    return { error: null };
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const reloadCurrent = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    await loadMembership(data.session);
  }, [loadMembership]);

  const createTenant = useCallback(async (name: string, displayName: string): Promise<AuthResult> => {
    const { error } = await supabase.rpc("create_tenant", { p_name: name, p_display_name: displayName });
    if (error) return { error: friendlyError(error.message) };
    await reloadCurrent();
    return { error: null };
  }, [reloadCurrent]);

  const acceptInvite = useCallback(async (code: string, displayName: string): Promise<AuthResult> => {
    const { error } = await supabase.rpc("accept_invite", { p_code: code, p_display_name: displayName });
    if (error) return { error: friendlyError(error.message) };
    await reloadCurrent();
    return { error: null };
  }, [reloadCurrent]);

  const updateLab = useCallback(async (patch: { name?: string; settings?: Partial<LabSettings> }): Promise<AuthResult> => {
    if (!membership) return { error: "Nessun panificio selezionato." };
    const nextSettings: LabSettings = { ...membership.settings, ...(patch.settings ?? {}) };
    const nextName = patch.name !== undefined ? patch.name.trim() : membership.tenantName;
    const { error } = await supabase
      .from("tenants")
      .update({ name: nextName, settings: nextSettings })
      .eq("id", membership.tenantId);
    if (error) return { error: friendlyError(error.message) };
    setMembership({ ...membership, tenantName: nextName, settings: nextSettings });
    return { error: null };
  }, [membership]);

  const value = useMemo<AuthContextValue>(
    () => ({ status, session, membership, configured: supabaseConfigured, signIn, signUp, signOut, createTenant, acceptInvite, updateLab }),
    [status, session, membership, signIn, signUp, signOut, createTenant, acceptInvite, updateLab],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth va usato dentro AuthProvider");
  return ctx;
}
