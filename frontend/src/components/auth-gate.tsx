import { useState, type ReactNode } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { useAuth } from "@/src/utils/auth";
import { useTheme } from "@/src/theme";

export function AuthGate({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const { colors } = useTheme();

  if (status === "loading") {
    return <View style={[styles.center, { backgroundColor: colors.surface }]}><ActivityIndicator color={colors.brand} size="large" /></View>;
  }
  if (status === "signedOut") return <LoginScreen />;
  if (status === "needsTenant") return <CreateTenantScreen />;
  return <View style={{ flex: 1 }}>{children}</View>;
}

function Shell({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  const { colors } = useTheme();
  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, backgroundColor: colors.surface }}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={[styles.card, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
          <Text style={[styles.brand, { color: colors.brand }]}>PANIFICIOOS</Text>
          <Text style={[styles.title, { color: colors.onSurface }]}>{title}</Text>
          <Text style={[styles.subtitle, { color: colors.muted }]}>{subtitle}</Text>
          {children}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Field({ label, value, onChangeText, secure, keyboard, testID, autoComplete }: { label: string; value: string; onChangeText: (v: string) => void; secure?: boolean; keyboard?: "email-address" | "default"; testID: string; autoComplete?: "email" | "password" | "new-password" | "name" | "off" }) {
  const { colors } = useTheme();
  return (
    <View style={{ marginTop: 14 }}>
      <Text style={[styles.label, { color: colors.muted }]}>{label}</Text>
      <TextInput
        testID={testID}
        value={value}
        onChangeText={onChangeText}
        secureTextEntry={secure}
        keyboardType={keyboard ?? "default"}
        autoCapitalize={keyboard === "email-address" || secure ? "none" : "sentences"}
        autoCorrect={false}
        autoComplete={autoComplete}
        style={[styles.input, { borderColor: colors.borderStrong, color: colors.onSurface, backgroundColor: colors.surface }]}
      />
    </View>
  );
}

function PrimaryButton({ label, onPress, busy, testID }: { label: string; onPress: () => void; busy: boolean; testID: string }) {
  const { colors } = useTheme();
  return (
    <Pressable testID={testID} disabled={busy} onPress={onPress} style={({ pressed }) => [styles.button, { backgroundColor: colors.brand, opacity: busy || pressed ? 0.7 : 1 }]}>
      {busy ? <ActivityIndicator color={colors.onBrand} /> : <Text style={[styles.buttonText, { color: colors.onBrand }]}>{label}</Text>}
    </Pressable>
  );
}

function Message({ error, info }: { error: string | null; info: string | null }) {
  const { colors } = useTheme();
  if (!error && !info) return null;
  return <Text testID="auth-message" style={{ marginTop: 14, fontSize: 13, lineHeight: 19, fontWeight: "700", color: error ? colors.error : colors.success }}>{error ?? info}</Text>;
}

function LoginScreen() {
  const { signIn, signUp, configured } = useAuth();
  const { colors } = useTheme();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    setInfo(null);
    if (!email.includes("@") || password.length < 6) {
      setError("Inserisci un'email valida e una password di almeno 6 caratteri.");
      return;
    }
    setBusy(true);
    const result = mode === "login" ? await signIn(email, password) : await signUp(email, password);
    setBusy(false);
    if (result.error) setError(result.error);
    else if (result.info) { setInfo(result.info); setMode("login"); }
  };

  return (
    <Shell title={mode === "login" ? "Accedi al laboratorio" : "Crea il tuo account"} subtitle={mode === "login" ? "Entra con le credenziali del tuo panificio." : "Poi potrai registrare il tuo panificio."}>
      {!configured ? <Text style={{ marginTop: 14, color: colors.error, fontWeight: "700" }}>Configurazione mancante: imposta EXPO_PUBLIC_SUPABASE_URL ed EXPO_PUBLIC_SUPABASE_KEY.</Text> : null}
      <Field testID="auth-email" label="EMAIL" value={email} onChangeText={setEmail} keyboard="email-address" autoComplete="email" />
      <Field testID="auth-password" label="PASSWORD" value={password} onChangeText={setPassword} secure autoComplete={mode === "login" ? "password" : "new-password"} />
      <Message error={error} info={info} />
      <PrimaryButton testID="auth-submit" label={mode === "login" ? "Accedi" : "Registrati"} onPress={() => void submit()} busy={busy} />
      <Pressable testID="auth-toggle" onPress={() => { setMode(mode === "login" ? "signup" : "login"); setError(null); setInfo(null); }} style={styles.link}>
        <Text style={{ color: colors.brand, fontWeight: "800", fontSize: 13 }}>{mode === "login" ? "Non hai un account? Registrati" : "Hai già un account? Accedi"}</Text>
      </Pressable>
    </Shell>
  );
}

function CreateTenantScreen() {
  const { createTenant, acceptInvite, signOut } = useAuth();
  const { colors } = useTheme();
  const [mode, setMode] = useState<"create" | "join">("create");
  const [name, setName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    if (displayName.trim().length < 2) {
      setError("Inserisci il tuo nome: comparirà nelle firme.");
      return;
    }
    if (mode === "create" && name.trim().length < 2) {
      setError("Inserisci il nome del tuo laboratorio.");
      return;
    }
    if (mode === "join" && code.replace(/[^A-Za-z0-9]/g, "").length < 8) {
      setError("Inserisci il codice di invito che ti ha dato l'amministratore.");
      return;
    }
    setBusy(true);
    const result = mode === "create" ? await createTenant(name, displayName) : await acceptInvite(code, displayName);
    setBusy(false);
    if (result.error) setError(result.error);
  };

  return (
    <Shell
      title={mode === "create" ? "Registra il tuo laboratorio" : "Entra nel laboratorio"}
      subtitle={mode === "create" ? "Sarai l'amministratore: potrai poi invitare colleghi e impostare operatori, celle e ricette." : "Usa il codice che ti ha dato l'amministratore del laboratorio."}
    >
      {mode === "create" ? (
        <Field testID="tenant-name" label="NOME DEL LABORATORIO" value={name} onChangeText={setName} autoComplete="off" />
      ) : (
        <Field testID="invite-code" label="CODICE DI INVITO" value={code} onChangeText={setCode} autoComplete="off" />
      )}
      <Field testID="tenant-display-name" label="IL TUO NOME" value={displayName} onChangeText={setDisplayName} autoComplete="name" />
      <Message error={error} info={null} />
      <PrimaryButton testID="tenant-submit" label={mode === "create" ? "Crea laboratorio" : "Entra"} onPress={() => void submit()} busy={busy} />
      <Pressable testID="tenant-toggle" onPress={() => { setMode(mode === "create" ? "join" : "create"); setError(null); }} style={styles.link}>
        <Text style={{ color: colors.brand, fontWeight: "800", fontSize: 13 }}>{mode === "create" ? "Ho un codice di invito" : "Voglio registrare un nuovo laboratorio"}</Text>
      </Pressable>
      <Pressable onPress={() => void signOut()} style={styles.link}><Text style={{ color: colors.muted, fontWeight: "800", fontSize: 13 }}>Esci</Text></Pressable>
    </Shell>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  scroll: { flexGrow: 1, alignItems: "center", justifyContent: "center", padding: 20 },
  card: { width: "100%", maxWidth: 440, borderRadius: 18, borderWidth: 1, padding: 22 },
  brand: { fontSize: 11, fontWeight: "900", letterSpacing: 1.4 },
  title: { fontSize: 24, fontWeight: "900", letterSpacing: -0.6, marginTop: 6 },
  subtitle: { fontSize: 13, lineHeight: 19, marginTop: 6 },
  label: { fontSize: 11, fontWeight: "800", marginBottom: 6 },
  input: { minHeight: 46, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, fontSize: 15 },
  button: { minHeight: 48, borderRadius: 12, alignItems: "center", justifyContent: "center", marginTop: 20 },
  buttonText: { fontSize: 15, fontWeight: "900" },
  link: { minHeight: 44, alignItems: "center", justifyContent: "center", marginTop: 8 },
});
