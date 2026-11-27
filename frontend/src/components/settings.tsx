import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { Card, SectionTitle } from "@/src/components/panificio-ui";
import { useTheme } from "@/src/theme";
import { useAuth, type Role } from "@/src/utils/auth";
import { confirmAsync } from "@/src/utils/confirm";
import { useLab } from "@/src/utils/lab";
import { supabase } from "@/src/utils/supabase";

const roleLabels: Record<Role, string> = { admin: "Amministratore", capoturno: "Capoturno", operatore: "Operatore" };
const roles: Role[] = ["admin", "capoturno", "operatore"];
const parseNum = (value: string) => (value.trim() === "" ? NaN : Number(value.replace(",", ".")));
const formatCode = (code: string) => (code.length === 10 ? `${code.slice(0, 5)}-${code.slice(5)}` : code);

type Feedback = { text: string; error: boolean } | null;

function Note({ feedback }: { feedback: Feedback }) {
  const { colors } = useTheme();
  if (!feedback) return null;
  return <Text style={{ marginTop: 10, fontSize: 12, fontWeight: "800", color: feedback.error ? colors.error : colors.success }}>{feedback.text}</Text>;
}

function Hint({ children }: { children: ReactNode }) {
  const { colors } = useTheme();
  return <Text style={{ color: colors.muted, fontSize: 12, lineHeight: 18, marginBottom: 12 }}>{children}</Text>;
}

function Input({ value, onChangeText, placeholder, numeric, flex, testID }: { value: string; onChangeText: (v: string) => void; placeholder?: string; numeric?: boolean; flex?: number; testID?: string }) {
  const { colors } = useTheme();
  return (
    <TextInput
      testID={testID}
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={colors.muted}
      keyboardType={numeric ? "numbers-and-punctuation" : "default"}
      autoCorrect={false}
      style={[styles.input, { flex: flex ?? 1, backgroundColor: colors.surfaceTertiary, color: colors.onSurface, borderColor: colors.border }]}
    />
  );
}

function Button({ label, onPress, icon, busy, kind = "primary", testID }: { label: string; onPress: () => void; icon?: keyof typeof Ionicons.glyphMap; busy?: boolean; kind?: "primary" | "outline" | "danger"; testID?: string }) {
  const { colors } = useTheme();
  const bg = kind === "primary" ? colors.brand : kind === "danger" ? colors.error : "transparent";
  const fg = kind === "outline" ? colors.onSurface : colors.onBrand;
  return (
    <Pressable testID={testID} disabled={busy} onPress={onPress} style={({ pressed }) => [styles.button, { backgroundColor: bg, borderColor: kind === "outline" ? colors.borderStrong : bg, opacity: busy || pressed ? 0.7 : 1 }]}>
      {busy ? <ActivityIndicator color={fg} /> : (<>{icon ? <Ionicons name={icon} size={16} color={fg} /> : null}<Text style={{ color: fg, fontWeight: "900", fontSize: 13 }}>{label}</Text></>)}
    </Pressable>
  );
}

function ListRow({ title, subtitle, onRemove, testID }: { title: string; subtitle?: string; onRemove?: () => void; testID?: string }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.row, { borderBottomColor: colors.divider }]}>
      <View style={{ flex: 1 }}>
        <Text style={{ color: colors.onSurface, fontWeight: "800", fontSize: 14 }}>{title}</Text>
        {subtitle ? <Text style={{ color: colors.muted, fontSize: 12, marginTop: 2 }}>{subtitle}</Text> : null}
      </View>
      {onRemove ? (
        <Pressable testID={testID} accessibilityLabel={`Rimuovi ${title}`} onPress={onRemove} hitSlop={8} style={styles.iconBtn}>
          <Ionicons name="trash-outline" size={19} color={colors.error} />
        </Pressable>
      ) : null}
    </View>
  );
}

function LabNameSection() {
  const { updateLab } = useAuth();
  const lab = useLab();
  const [name, setName] = useState(lab.labName);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);

  const save = async () => {
    if (name.trim().length < 2) return setFeedback({ text: "Il nome deve avere almeno 2 caratteri.", error: true });
    setBusy(true);
    const result = await updateLab({ name });
    setBusy(false);
    setFeedback(result.error ? { text: result.error, error: true } : { text: "Nome salvato.", error: false });
  };

  return (
    <Card>
      <SectionTitle eyebrow="Laboratorio" title="Nome del laboratorio" />
      <Hint>Compare in alto nell&apos;app, nel saluto e nei fogli stampati per l&apos;ASL.</Hint>
      <View style={styles.inline}><Input testID="settings-lab-name" value={name} onChangeText={setName} placeholder="Es. Panificio Rossi" /><Button label="Salva" onPress={() => void save()} busy={busy} /></View>
      <Note feedback={feedback} />
    </Card>
  );
}

function OperatorsSection() {
  const { updateLab } = useAuth();
  const lab = useLab();
  const operators = lab.settings.operators;
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);

  const persist = async (next: string[], okText: string) => {
    setBusy(true);
    const result = await updateLab({ settings: { operators: next } });
    setBusy(false);
    setFeedback(result.error ? { text: result.error, error: true } : { text: okText, error: false });
    return !result.error;
  };

  const add = async () => {
    const clean = name.trim().replace(/\s+/g, " ");
    if (clean.length < 2 || clean.length > 60) return setFeedback({ text: "Il nome deve avere tra 2 e 60 caratteri.", error: true });
    if (operators.some((item) => item.toLowerCase() === clean.toLowerCase())) return setFeedback({ text: "Questo operatore esiste già.", error: true });
    if (await persist([...operators, clean], "Operatore aggiunto.")) setName("");
  };

  const remove = async (item: string) => {
    const ok = await confirmAsync("Rimuovere l'operatore?", `${item} non comparirà più tra le firme. Le registrazioni già fatte restano invariate.`, "Rimuovi");
    if (ok) await persist(operators.filter((value) => value !== item), "Operatore rimosso.");
  };

  return (
    <Card>
      <SectionTitle eyebrow="Firme" title="Operatori" />
      <Hint>I nomi che compaiono nel selettore operatore sul tablet e sulle registrazioni. Non servono account: chi lavora al banco sceglie il proprio nome.</Hint>
      {operators.length === 0 ? <Text style={{ color: lab.isAdmin ? "#B45309" : "#64748B", fontSize: 13, marginBottom: 10 }}>Nessun operatore inserito: per ora si firma con il nome dell&apos;account ({lab.accountName}).</Text> : null}
      {operators.map((item) => <ListRow key={item} testID={`operator-remove-${item}`} title={item} onRemove={() => void remove(item)} />)}
      <View style={[styles.inline, { marginTop: 12 }]}><Input testID="settings-operator-name" value={name} onChangeText={setName} placeholder="Nome e ruolo, es. Mario – Capoturno" /><Button label="Aggiungi" icon="add" onPress={() => void add()} busy={busy} /></View>
      <Note feedback={feedback} />
    </Card>
  );
}

function AreasSection() {
  const { updateLab } = useAuth();
  const lab = useLab();
  const areas = lab.settings.tempAreas;
  const [name, setName] = useState("");
  const [min, setMin] = useState("");
  const [max, setMax] = useState("");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);

  const persist = async (next: typeof areas, okText: string) => {
    setBusy(true);
    const result = await updateLab({ settings: { tempAreas: next } });
    setBusy(false);
    setFeedback(result.error ? { text: result.error, error: true } : { text: okText, error: false });
    return !result.error;
  };

  const add = async () => {
    const clean = name.trim().replace(/\s+/g, " ");
    const low = parseNum(min);
    const high = parseNum(max);
    if (clean.length < 2 || clean.length > 40) return setFeedback({ text: "Il nome della cella deve avere tra 2 e 40 caratteri.", error: true });
    if (Number.isNaN(low) || Number.isNaN(high)) return setFeedback({ text: "Inserisci la temperatura minima e massima.", error: true });
    if (low >= high) return setFeedback({ text: "La minima deve essere inferiore alla massima.", error: true });
    if (low < -60 || high > 60) return setFeedback({ text: "Le temperature devono essere comprese tra −60 e 60 °C.", error: true });
    if (areas.some((item) => item.area.toLowerCase() === clean.toLowerCase())) return setFeedback({ text: "Esiste già una cella con questo nome.", error: true });
    if (await persist([...areas, { area: clean, min: low, max: high }], "Cella aggiunta.")) { setName(""); setMin(""); setMax(""); }
  };

  const remove = async (item: string) => {
    const ok = await confirmAsync("Rimuovere la cella?", `${item} non sarà più selezionabile nei nuovi controlli. Lo storico dei controlli resta nei registri.`, "Rimuovi");
    if (ok) await persist(areas.filter((value) => value.area !== item), "Cella rimossa.");
  };

  return (
    <Card>
      <SectionTitle eyebrow="HACCP" title="Celle, frigoriferi e soglie" />
      <Hint>Le soglie sono quelle del piano di autocontrollo del tuo laboratorio: PanificioOS non ne propone di predefinite. Per cambiare una soglia, rimuovi la cella e aggiungila di nuovo.</Hint>
      {areas.length === 0 ? <Text style={{ color: "#B45309", fontSize: 13, marginBottom: 10 }}>Nessuna cella impostata: finché non ne aggiungi una, gli operatori non possono registrare temperature.</Text> : null}
      {areas.map((item) => <ListRow key={item.area} testID={`area-remove-${item.area}`} title={item.area} subtitle={`Intervallo ammesso ${item.min} / ${item.max} °C`} onRemove={() => void remove(item.area)} />)}
      <View style={[styles.inline, { marginTop: 12 }]}>
        <Input testID="settings-area-name" flex={2} value={name} onChangeText={setName} placeholder="Nome, es. Cella 1" />
        <Input testID="settings-area-min" value={min} onChangeText={setMin} placeholder="Min °C" numeric />
        <Input testID="settings-area-max" value={max} onChangeText={setMax} placeholder="Max °C" numeric />
      </View>
      <View style={{ marginTop: 10 }}><Button label="Aggiungi cella" icon="add" onPress={() => void add()} busy={busy} /></View>
      <Note feedback={feedback} />
    </Card>
  );
}

type Member = { user_id: string; role: Role; display_name: string };
type Invite = { code: string; role: Role; expires_at: string };

function TeamSection() {
  const { session, membership } = useAuth();
  const { colors } = useTheme();
  const tenantId = membership?.tenantId;
  const myId = session?.user.id;
  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [loading, setLoading] = useState(true);
  const [newRole, setNewRole] = useState<Role>("operatore");
  const [lastCode, setLastCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);

  const load = useCallback(async () => {
    if (!tenantId) return;
    const [m, i] = await Promise.all([
      supabase.from("members").select("user_id, role, display_name").eq("tenant_id", tenantId).order("created_at", { ascending: true }),
      supabase.from("invites").select("code, role, expires_at").eq("tenant_id", tenantId).is("used_by", null).gt("expires_at", new Date().toISOString()).order("created_at", { ascending: false }),
    ]);
    const failure = m.error ?? i.error;
    if (failure) setFeedback({ text: failure.message, error: true });
    setMembers((m.data ?? []) as Member[]);
    setInvites((i.data ?? []) as Invite[]);
    setLoading(false);
  }, [tenantId]);

  useEffect(() => { void load(); }, [load]);

  const changeRole = async (member: Member, role: Role) => {
    if (!tenantId || member.role === role) return;
    setBusy(true);
    const { error } = await supabase.from("members").update({ role }).eq("tenant_id", tenantId).eq("user_id", member.user_id);
    setBusy(false);
    setFeedback(error ? { text: error.message, error: true } : { text: "Ruolo aggiornato.", error: false });
    await load();
  };

  const removeMember = async (member: Member) => {
    if (!tenantId) return;
    const ok = await confirmAsync("Rimuovere dal laboratorio?", `${member.display_name} non potrà più accedere. Le sue registrazioni restano nei registri.`, "Rimuovi");
    if (!ok) return;
    setBusy(true);
    const { error } = await supabase.from("members").delete().eq("tenant_id", tenantId).eq("user_id", member.user_id);
    setBusy(false);
    setFeedback(error ? { text: error.message, error: true } : { text: "Persona rimossa.", error: false });
    await load();
  };

  const createInvite = async () => {
    setBusy(true);
    const { data, error } = await supabase.rpc("create_invite", { p_role: newRole });
    setBusy(false);
    if (error) return setFeedback({ text: error.message, error: true });
    setLastCode(String(data));
    setFeedback(null);
    await load();
  };

  const revokeInvite = async (code: string) => {
    if (!tenantId) return;
    const { error } = await supabase.from("invites").delete().eq("tenant_id", tenantId).eq("code", code);
    if (error) setFeedback({ text: error.message, error: true });
    if (lastCode === code) setLastCode(null);
    await load();
  };

  return (
    <Card>
      <SectionTitle eyebrow="Accessi" title="Team e inviti" />
      <Hint>Chi ha un account può entrare con la propria email. Per ora capoturno e operatore hanno gli stessi permessi; solo l&apos;amministratore configura il laboratorio.</Hint>
      {loading ? <ActivityIndicator color={colors.brand} /> : null}
      {members.map((member) => {
        const mine = member.user_id === myId;
        return (
          <View key={member.user_id} style={[styles.memberBlock, { borderBottomColor: colors.divider }]}>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <Text style={{ flex: 1, color: colors.onSurface, fontWeight: "800", fontSize: 14 }}>{member.display_name}{mine ? " (tu)" : ""}</Text>
              {!mine ? <Pressable testID={`member-remove-${member.display_name}`} accessibilityLabel={`Rimuovi ${member.display_name}`} onPress={() => void removeMember(member)} hitSlop={8} style={styles.iconBtn}><Ionicons name="person-remove-outline" size={19} color={colors.error} /></Pressable> : null}
            </View>
            <View style={styles.chips}>
              {roles.map((role) => {
                const active = member.role === role;
                return (
                  <Pressable key={role} disabled={mine || busy} onPress={() => void changeRole(member, role)} style={[styles.chip, { backgroundColor: active ? colors.brand : colors.surfaceTertiary, borderColor: active ? colors.brand : colors.border, opacity: mine && !active ? 0.4 : 1 }]}>
                    <Text style={{ color: active ? colors.onBrand : colors.onSurfaceTertiary, fontSize: 12, fontWeight: "800" }}>{roleLabels[role]}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        );
      })}

      <Text style={[styles.subTitle, { color: colors.muted }]}>INVITA UN COLLEGA</Text>
      <View style={styles.chips}>
        {roles.map((role) => {
          const active = newRole === role;
          return (
            <Pressable key={role} testID={`invite-role-${role}`} onPress={() => setNewRole(role)} style={[styles.chip, { backgroundColor: active ? colors.brand : colors.surfaceTertiary, borderColor: active ? colors.brand : colors.border }]}>
              <Text style={{ color: active ? colors.onBrand : colors.onSurfaceTertiary, fontSize: 12, fontWeight: "800" }}>{roleLabels[role]}</Text>
            </Pressable>
          );
        })}
      </View>
      <View style={{ marginTop: 10 }}><Button testID="invite-create" label="Crea codice di invito" icon="key-outline" onPress={() => void createInvite()} busy={busy} /></View>
      {lastCode ? (
        <View style={[styles.codeBox, { backgroundColor: colors.brandTertiary }]}>
          <Text selectable testID="invite-code-value" style={{ color: colors.onBrandTertiary, fontSize: 24, fontWeight: "900", letterSpacing: 2 }}>{formatCode(lastCode)}</Text>
          <Text style={{ color: colors.onBrandTertiary, fontSize: 12, marginTop: 6, lineHeight: 17 }}>Valido 7 giorni, utilizzabile una volta sola. Il collega apre l&apos;app, si registra e sceglie «Ho un codice di invito».</Text>
        </View>
      ) : null}
      {invites.filter((invite) => invite.code !== lastCode).map((invite) => (
        <ListRow key={invite.code} testID={`invite-revoke-${invite.code}`} title={formatCode(invite.code)} subtitle={`${roleLabels[invite.role]} · scade il ${new Date(invite.expires_at).toLocaleDateString("it-IT")}`} onRemove={() => void revokeInvite(invite.code)} />
      ))}
      <Note feedback={feedback} />
    </Card>
  );
}

function DemoSection({ onLoadDemo }: { onLoadDemo: () => void }) {
  return (
    <Card>
      <SectionTitle eyebrow="Prove" title="Dati di esempio" />
      <Hint>Sostituisce ricette, scorte, lotti e note con un laboratorio di esempio, utile per fare pratica. I registri HACCP già salvati non vengono toccati.</Hint>
      <Button testID="load-demo" label="Carica dati di esempio" icon="refresh-outline" kind="outline" onPress={onLoadDemo} />
    </Card>
  );
}

export function SettingsScreen({ onLoadDemo }: { onLoadDemo: () => void }) {
  const { colors } = useTheme();
  return (
    <View>
      <View style={{ marginBottom: 22 }}>
        <Text style={{ color: colors.brand, fontSize: 11, fontWeight: "900", letterSpacing: 1.2, marginBottom: 5 }}>IMPOSTAZIONI</Text>
        <Text style={{ color: colors.onSurface, fontSize: 29, fontWeight: "900", letterSpacing: -1 }}>Configura il laboratorio</Text>
        <Text style={{ color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: 5 }}>Visibile solo agli amministratori. Le ricette si gestiscono dalla scheda Ricette.</Text>
      </View>
      <LabNameSection />
      <OperatorsSection />
      <AreasSection />
      <TeamSection />
      <DemoSection onLoadDemo={onLoadDemo} />
    </View>
  );
}

const styles = StyleSheet.create({
  input: { minHeight: 46, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, fontSize: 14, minWidth: 80 },
  inline: { flexDirection: "row", gap: 8, alignItems: "center" },
  button: { minHeight: 46, borderRadius: 11, borderWidth: 1, paddingHorizontal: 14, flexDirection: "row", gap: 6, alignItems: "center", justifyContent: "center", alignSelf: "flex-start" },
  row: { minHeight: 52, borderBottomWidth: 1, flexDirection: "row", alignItems: "center", gap: 8 },
  iconBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  memberBlock: { paddingVertical: 10, borderBottomWidth: 1 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 },
  chip: { minHeight: 36, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  subTitle: { fontSize: 11, fontWeight: "900", letterSpacing: 1, marginTop: 20 },
  codeBox: { borderRadius: 12, padding: 14, marginTop: 12 },
});

export function SetupChecklist({ recipesCount, onOpenSettings, onOpenRecipes }: { recipesCount: number; onOpenSettings: () => void; onOpenRecipes: () => void }) {
  const { colors } = useTheme();
  const lab = useLab();
  const items = [
    { key: "operators", label: "Aggiungi gli operatori che firmano le registrazioni", done: lab.settings.operators.length > 0, action: onOpenSettings },
    { key: "areas", label: "Imposta celle e soglie di temperatura", done: lab.settings.tempAreas.length > 0, action: onOpenSettings },
    { key: "recipes", label: "Inserisci la prima ricetta", done: recipesCount > 0, action: onOpenRecipes },
  ];
  if (!lab.isAdmin || items.every((item) => item.done)) return null;
  const doneCount = items.filter((item) => item.done).length;
  return (
    <Card>
      <SectionTitle eyebrow="Primo avvio" title="Configura il tuo laboratorio" />
      <Hint>{doneCount} passaggi su {items.length} completati. Quando sono tutti fatti, questo riquadro scompare.</Hint>
      {items.map((item) => (
        <Pressable key={item.key} testID={`setup-${item.key}`} disabled={item.done} onPress={item.action} style={[styles.row, { borderBottomColor: colors.divider }]}>
          <Ionicons name={item.done ? "checkmark-circle" : "ellipse-outline"} size={22} color={item.done ? colors.success : colors.muted} />
          <Text style={{ flex: 1, color: item.done ? colors.muted : colors.onSurface, fontWeight: "800", fontSize: 14, textDecorationLine: item.done ? "line-through" : "none" }}>{item.label}</Text>
          {!item.done ? <Ionicons name="chevron-forward" size={18} color={colors.muted} /> : null}
        </Pressable>
      ))}
    </Card>
  );
}
