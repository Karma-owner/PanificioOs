import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { Card, IconButton, MetricCard, SectionTitle, StatusPill } from "@/src/components/panificio-ui";
import { AppState, Batch, Feeding, HandoverNote, Priority, Recipe, Shift, StarterType, stages, starterOf, starterTypes, starterLabel, latestFeeding, demoState, makeDemoState, operators, currentShift, feedingPeak, formatClock, formatDateTime, formatRange, formatTemp } from "@/src/panificio-data";
import { enqueueSave, loadInitialState, pollRemote, remainingFromIso, resetRemote, subscribeSync, type SyncStatus } from "@/src/utils/sync";
import { PanificioForms, type FormKind } from "@/src/components/panificio-forms";
import { bakeSchedule, buildDailySheet, latestTempLogs, tempOk } from "@/src/utils/daily-sheet";
import { archiveDays, dateFromKey, dayKey, deductFlour, matchStockForIngredient, onDay, stageTimerFrom } from "@/src/utils/lab-automation";
import { exportDailyPdf } from "@/src/utils/daily-pdf";
import { storage } from "@/src/utils/storage";
import { useTheme } from "@/src/theme";

type Area = "oggi" | "ricettario" | "produzione" | "altro";
type MoreArea = "haccp" | "costi" | "report";

const modeOptions = ["Bottega Artigianale", "Reparto GDO", "Industriale"];
const shiftOptions: Shift[] = ["Notte", "Mattina", "Pomeriggio"];
const priorityOptions: Priority[] = ["Normale", "Urgente", "Manutenzione"];
const OPERATOR_KEY = "panificio_operator";

export default function Index() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const tablet = width >= 700;
  const [area, setArea] = useState<Area>("oggi");
  const [moreArea, setMoreArea] = useState<MoreArea>("haccp");
  const [state, setState] = useState<AppState>(demoState);
  const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null);
  const [traceBatch, setTraceBatch] = useState<Batch | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [sync, setSync] = useState<SyncStatus>("syncing");
  const [, setTick] = useState(0);
  const [operator, setOperatorState] = useState(operators[0]);
  const [form, setForm] = useState<FormKind | null>(null);
  const localEditRef = useRef(false);

  const setOperator = (value: string) => {
    setOperatorState(value);
    void storage.setItem(OPERATOR_KEY, value);
  };

  useEffect(() => {
    (async () => {
      const savedOperator = await storage.getItem(OPERATOR_KEY, operators[0]);
      if (typeof savedOperator === "string" && operators.includes(savedOperator)) setOperatorState(savedOperator);
      const initial = await loadInitialState(makeDemoState());
      setState(initial);
      setLoaded(true);
    })();
    const unsubscribe = subscribeSync(setSync);
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!loaded) return;
    if (!localEditRef.current) return;
    enqueueSave(state);
    localEditRef.current = false;
  }, [state, loaded]);

  useEffect(() => {
    if (!loaded) return;
    const id = setInterval(async () => {
      const remote = await pollRemote(state);
      if (remote) setState(remote);
    }, 12000);
    return () => clearInterval(id);
  }, [loaded, state]);

  useEffect(() => {
    const id = setInterval(() => setTick((value) => value + 1), 15000);
    return () => clearInterval(id);
  }, []);

  const updateState = (updater: SetStateAction<AppState>) => {
    localEditRef.current = true;
    setState(updater);
  };

  const resetDemo = () => {
    const run = async () => {
      const fresh = await resetRemote(makeDemoState());
      setState(fresh);
    };
    if (Platform.OS === "web") {
      if (typeof window !== "undefined" && window.confirm("Ripristinare tutti i dati demo?")) void run();
    } else {
      Alert.alert("Ripristina demo", "Tutti i dati inseriti verranno sostituiti dal dataset iniziale.", [
        { text: "Annulla", style: "cancel" },
        { text: "Ripristina", style: "destructive", onPress: () => void run() },
      ]);
    }
  };

  if (!loaded) return <View style={[styles.loading, { backgroundColor: colors.surface }]}><ActivityIndicator color={colors.brand} size="large" /><Text style={[styles.loadingText, { color: colors.muted }]}>Caricamento laboratorio...</Text></View>;

  return <View style={[styles.root, { backgroundColor: colors.surface }]}>
    <View style={[styles.appShell, { paddingTop: insets.top + 10, paddingBottom: insets.bottom, maxWidth: tablet ? 1240 : 760 }]}>
      <Header state={state} tablet={tablet} sync={sync} operator={operator} onOperator={setOperator} onMode={(mode) => updateState((current) => ({ ...current, mode }))} onReset={resetDemo} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[styles.scrollContent, { paddingHorizontal: tablet ? 32 : 20 }]}>
        {area === "oggi" ? <Dashboard state={state} tablet={tablet} setState={updateState} operator={operator} onOpenHaccp={() => { setArea("altro"); setMoreArea("haccp"); }} onOpenProduction={() => setArea("produzione")} /> : null}
        {area === "ricettario" ? <Recipes recipes={state.recipes} tablet={tablet} onSelectRecipe={setSelectedRecipe} /> : null}
        {area === "produzione" ? <Production state={state} tablet={tablet} setState={updateState} operator={operator} onTrace={setTraceBatch} onOpenForm={setForm} /> : null}
        {area === "altro" ? <More state={state} tablet={tablet} operator={operator} area={moreArea} setArea={setMoreArea} onTrace={setTraceBatch} onOpenForm={setForm} /> : null}
      </ScrollView>
      <BottomNav area={area} setArea={setArea} colors={colors} />
      <AllergenModal recipe={selectedRecipe} onClose={() => setSelectedRecipe(null)} />
      <TraceabilityModal batch={traceBatch} state={state} onClose={() => setTraceBatch(null)} />
      <PanificioForms kind={form} recipes={state.recipes} operator={operator} onClose={() => setForm(null)} onSubmit={updateState} />
    </View>
  </View>;
}

function SyncBadge({ status }: { status: SyncStatus }) {
  const { colors } = useTheme();
  const map = {
    online: { bg: colors.success, fg: colors.onSuccess, icon: "cloud-done-outline" as const, label: "Server sincronizzato" },
    syncing: { bg: colors.warning, fg: colors.onWarning, icon: "sync-outline" as const, label: "Salvataggio..." },
    offline: { bg: colors.error, fg: colors.onError, icon: "cloud-offline-outline" as const, label: "Non in linea · salvataggio locale" },
  }[status];
  return <View testID="sync-badge" style={[styles.syncBadge, { backgroundColor: map.bg }]}>
    <Ionicons name={map.icon} size={13} color={map.fg} />
    <Text style={[styles.syncBadgeText, { color: map.fg }]}>{map.label}</Text>
  </View>;
}

function Header({ state, tablet, sync, operator, onOperator, onMode, onReset }: { state: AppState; tablet: boolean; sync: SyncStatus; operator: string; onOperator: (value: string) => void; onMode: (mode: string) => void; onReset: () => void }) {
  const { colors } = useTheme();
  return <View style={styles.header}>
    <View style={styles.brandRow}>
      <View style={[styles.logo, { backgroundColor: colors.brand }]}><Ionicons name="flame" size={20} color={colors.onBrand} /></View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.appName, { color: colors.onSurface }]}>PanificioOS</Text>
        <View style={styles.captionRow}>
          <Text style={[styles.appCaption, { color: colors.muted }]} numberOfLines={1}>Laboratorio · {new Date().toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" })}</Text>
          <SyncBadge status={sync} />
        </View>
      </View>
      <View style={styles.headerActions}>
        <View style={[styles.modeSwitch, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}><Ionicons name="layers-outline" size={16} color={colors.brand} /><Text style={[styles.modeLabel, { color: colors.onSurface }]} numberOfLines={1}>{tablet ? state.mode : state.mode.split(" ")[0]}</Text></View>
        <IconButton testID="reset-demo" icon="refresh-outline" label="Ripristina dati demo" onPress={onReset} />
      </View>
    </View>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.modeOptions}>{modeOptions.map((mode) => <Pressable testID={`mode-${mode}`} key={mode} onPress={() => onMode(mode)} style={[styles.modeOption, { backgroundColor: state.mode === mode ? colors.brandTertiary : colors.surfaceTertiary }]}><Text style={[styles.modeOptionText, { color: state.mode === mode ? colors.onBrandTertiary : colors.onSurfaceTertiary }]}>{mode}</Text></Pressable>)}</ScrollView>
    <OperatorSelector operator={operator} onOperator={onOperator} />
  </View>;
}

/**
 * Selettore operatore: su tablet (≥ 768px) pulsanti affiancati,
 * su smartphone menu a tendina compatto per evitare lo scorrimento orizzontale.
 */
function OperatorSelector({ operator, onOperator }: { operator: string; onOperator: (value: string) => void }) {
  const { colors } = useTheme();
  const compact = useWindowDimensions().width < 768;
  const [open, setOpen] = useState(false);
  if (!compact) {
    return <View style={styles.operatorRow}>
      <View style={styles.operatorLabel}><Ionicons name="person-circle-outline" size={16} color={colors.muted} /><Text style={{ color: colors.muted, fontSize: 11, fontWeight: "800" }}>Seleziona operatore:</Text></View>
      {operators.map((name, index) => { const active = operator === name; return <Pressable testID={`operator-${index}`} key={name} onPress={() => onOperator(name)} style={[styles.operatorChip, { backgroundColor: active ? colors.surfaceInverse : colors.surfaceSecondary, borderColor: active ? colors.surfaceInverse : colors.border }]}>{active ? <Ionicons name="checkmark-circle" size={13} color={colors.brand} /> : null}<Text style={{ color: active ? colors.onSurfaceInverse : colors.onSurfaceTertiary, fontSize: 11, fontWeight: "800" }}>{name}</Text></Pressable>; })}
    </View>;
  }
  return <View style={styles.operatorDropdownWrap}>
    <Pressable testID="operator-dropdown" accessibilityLabel="Seleziona operatore" onPress={() => setOpen((value) => !value)} style={[styles.operatorDropdown, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
      <Ionicons name="person-circle-outline" size={18} color={colors.brand} />
      <Text style={{ color: colors.muted, fontSize: 11, fontWeight: "800" }}>Operatore:</Text>
      <Text style={{ color: colors.onSurface, fontSize: 12, fontWeight: "900", flex: 1 }} numberOfLines={1}>{operator}</Text>
      <Ionicons name={open ? "chevron-up" : "chevron-down"} size={16} color={colors.muted} />
    </Pressable>
    {open ? <View style={[styles.operatorMenu, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>{operators.map((name, index) => { const active = operator === name; return <Pressable testID={`operator-${index}`} key={name} onPress={() => { onOperator(name); setOpen(false); }} style={[styles.operatorMenuItem, { borderBottomColor: colors.divider, backgroundColor: active ? colors.brandTertiary : "transparent" }]}><Text style={{ color: active ? colors.onBrandTertiary : colors.onSurface, fontWeight: "800", fontSize: 13, flex: 1 }}>{name}</Text>{active ? <Ionicons name="checkmark" size={16} color={colors.onBrandTertiary} /> : null}</Pressable>; })}</View> : null}
  </View>;
}

/** Avvisi automatici: un lievito (Pasta Madre o Licoli) è nella finestra ottimale di maturazione. */
function StarterAlerts({ state, onOpen }: { state: AppState; onOpen: () => void }) {
  const { colors } = useTheme();
  const alerts = starterTypes.map((starter) => {
    const last = latestFeeding(state, starter);
    return last ? { starter, last, peak: feedingPeak(last) } : null;
  }).filter((item): item is NonNullable<typeof item> => item !== null && item.peak.tone !== "info");
  if (alerts.length === 0) return null;
  return <View style={{ gap: 10, marginBottom: 18 }}>{alerts.map(({ starter, peak }) => {
    const ready = peak.tone === "success";
    const windowEnd = formatClock(new Date(peak.readyAt.getTime() + 3600000).toISOString());
    return <Pressable testID={`starter-alert-${starter === "Licoli" ? "licoli" : "madre"}`} key={starter} onPress={onOpen} style={[styles.starterAlert, { backgroundColor: ready ? colors.success : colors.warning }]}>
      <Ionicons name={ready ? "flask" : "alert-circle"} size={24} color={ready ? colors.onSuccess : colors.onWarning} />
      <View style={{ flex: 1 }}>
        <Text style={{ color: ready ? colors.onSuccess : colors.onWarning, fontWeight: "900", fontSize: 14 }}>{ready ? `${starterLabel(starter)} pronto per l'impasto` : `${starterLabel(starter)} oltre il picco`}</Text>
        <Text style={{ color: ready ? colors.onSuccess : colors.onWarning, fontSize: 12, marginTop: 3 }}>{ready ? `Finestra ottimale fino alle ${windowEnd} · picco stimato ${formatClock(peak.readyAt.toISOString())}` : "Rinfrescare prima di usarlo negli impasti."}</Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color={ready ? colors.onSuccess : colors.onWarning} />
    </Pressable>;
  })}</View>;
}

function Dashboard({ state, tablet, setState, operator, onOpenHaccp, onOpenProduction }: { state: AppState; tablet: boolean; setState: Dispatch<SetStateAction<AppState>>; operator: string; onOpenHaccp: () => void; onOpenProduction: () => void }) {
  const { colors } = useTheme();
  const [shift, setShift] = useState<Shift | "Tutti">("Tutti");
  const [notePriority, setNotePriority] = useState<Priority>("Normale");
  const [noteShift, setNoteShift] = useState<Shift>(currentShift());
  const [noteText, setNoteText] = useState("");
  const [composer, setComposer] = useState(false);
  const notes = state.notes.filter((note) => shift === "Tutti" || note.shift === shift);
  const addNote = () => {
    if (!noteText.trim()) return;
    const note: HandoverNote = { id: `note-${Date.now()}`, shift: noteShift, priority: notePriority, text: noteText.trim(), time: formatClock(new Date().toISOString()), at: new Date().toISOString(), operator };
    setState((current) => ({ ...current, notes: [note, ...current.notes] })); setNoteText(""); setComposer(false);
  };
  const priorityTone = (value: Priority) => value === "Urgente" ? "error" : value === "Manutenzione" ? "warning" : "neutral";
  const activeInProofing = state.batches.filter((batch) => ["In Puntata", "In Cella", "Formatura"].includes(batch.stage)).length;
  const operationalAlerts = state.stock.filter((item) => item.qty < item.min).length;
  const haccpAlerts = latestTempLogs(state.tempLogs).filter((log) => !tempOk(log));
  const schedule = bakeSchedule(state).slice(0, 4);
  const stageTone = (stage: string) => stage === "In Forno" ? "brand" as const : stage === "In Cella" ? "success" as const : "info" as const;
  return <View>
    <View style={styles.welcomeRow}><View style={{ flex: 1 }}><Text style={[styles.eyebrowLarge, { color: colors.brand }]}>QUADRO GENERALE</Text><Text style={[styles.pageTitle, { color: colors.onSurface }]}>Buongiorno, laboratorio</Text><Text style={[styles.pageSubtitle, { color: colors.muted }]}>Turno {currentShift()} · Operatore {operator}</Text></View><View style={[styles.liveBadge, { backgroundColor: colors.success }]}><View style={styles.liveDot} /><Text style={{ color: colors.onSuccess, fontWeight: "800", fontSize: 12 }}>IN DIRETTA</Text></View></View>
    <StarterAlerts state={state} onOpen={onOpenProduction} />
    <Text style={[styles.groupLabel, { color: colors.muted }]}>INDICATORI CHIAVE DI PRESTAZIONE</Text>
    <View style={[styles.kpiGrid, tablet ? styles.kpiGridTablet : null]}><MetricCard icon="scale-outline" value="486 kg" label="Kg impastati oggi" detail="+8,4% rispetto a ieri" /><MetricCard icon="pie-chart-outline" value="91,8%" label="Resa media cottura" detail="Obiettivo 90%" tone="success" /><MetricCard icon="timer-outline" value={String(activeInProofing)} label="Impasti in lievitazione" detail={`${state.batches.length} lotti attivi`} tone="info" /><MetricCard icon="warning-outline" value={String(operationalAlerts + haccpAlerts.length)} label="Allerte operative" detail={`${operationalAlerts} scorte · ${haccpAlerts.length} HACCP`} tone="warning" /></View>
    <Card><SectionTitle testID="note-composer-toggle" eyebrow="Diario di bordo" title="Passaggio consegne" action={composer ? "Chiudi" : "+ Nota"} onAction={() => setComposer((visible) => !visible)} />
      <Text style={[styles.cardIntro, { color: colors.muted }]}>Lascia una traccia chiara al prossimo turno. Le priorità restano visibili su ogni tablet.</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}><FilterChip testID="shift-filter-tutti" label="Tutti" active={shift === "Tutti"} onPress={() => setShift("Tutti")} /><FilterChip testID="shift-filter-notte" label="Notte" active={shift === "Notte"} onPress={() => setShift("Notte")} /><FilterChip testID="shift-filter-mattina" label="Mattina" active={shift === "Mattina"} onPress={() => setShift("Mattina")} /><FilterChip testID="shift-filter-pomeriggio" label="Pomeriggio" active={shift === "Pomeriggio"} onPress={() => setShift("Pomeriggio")} /></ScrollView>
      {composer ? <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={[styles.composer, { backgroundColor: colors.surfaceTertiary }]}><TextInput testID="note-input" value={noteText} onChangeText={setNoteText} placeholder="Scrivi la consegna per il prossimo turno..." placeholderTextColor={colors.muted} multiline style={[styles.noteInput, { color: colors.onSurface, borderColor: colors.border, backgroundColor: colors.surfaceSecondary }]} /><View style={styles.composerOptions}><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.smallChips}>{shiftOptions.map((item) => <FilterChip key={item} label={item} active={noteShift === item} onPress={() => setNoteShift(item)} />)}</ScrollView><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.smallChips}>{priorityOptions.map((item) => <FilterChip key={item} label={item} active={notePriority === item} onPress={() => setNotePriority(item)} />)}</ScrollView><Pressable testID="note-publish" onPress={addNote} style={[styles.primaryButton, { backgroundColor: colors.brand }]}><Ionicons name="send" size={16} color={colors.onBrand} /><Text style={{ color: colors.onBrand, fontWeight: "800" }}>Pubblica</Text></Pressable></View></KeyboardAvoidingView> : null}
      {notes.map((note) => <View key={note.id} style={[styles.noteRow, { borderBottomColor: colors.divider }]}><View style={[styles.noteMarker, { backgroundColor: note.priority === "Urgente" ? colors.error : note.priority === "Manutenzione" ? colors.warning : colors.success }]} /><View style={styles.noteBody}><View style={styles.noteMeta}><Text style={[styles.noteShift, { color: colors.onSurface }]}>{note.shift}</Text><Text style={[styles.noteTime, { color: colors.muted }]}>{note.time}</Text><StatusPill label={note.priority} tone={priorityTone(note.priority)} /></View><Text style={[styles.noteText, { color: colors.onSurfaceTertiary }]}>{note.text}</Text>{note.operator ? <Text testID={`note-signature-${note.id}`} style={[styles.noteSign, { color: colors.muted }]}>Firmato: {note.operator}</Text> : null}</View><IconButton testID={`delete-note-${note.id}`} icon="trash-outline" label="Elimina nota" onPress={() => setState((current) => ({ ...current, notes: current.notes.filter((item) => item.id !== note.id) }))} /></View>)}
      {notes.length === 0 ? <Text style={[styles.empty, { color: colors.muted }]}>Nessuna nota per questo turno.</Text> : null}
    </Card>
    <Card><SectionTitle testID="dashboard-open-production" eyebrow="Produzione di oggi" title="Scaletta infornate" action="Vedi produzione" onAction={onOpenProduction} /><View style={styles.scheduleHeader}><Text style={[styles.tableLabel, { color: colors.muted }]}>INFORNATA / FORNO</Text><Text style={[styles.tableLabel, { color: colors.muted }]}>PRODOTTO</Text><Text style={[styles.tableLabel, { color: colors.muted }]}>STATO</Text></View>{schedule.length === 0 ? <Text style={[styles.empty, { color: colors.muted }]}>Nessuna infornata in programma.</Text> : null}{schedule.map((item) => <View key={item.id} style={[styles.scheduleRow, { borderTopColor: colors.divider }]}><View style={styles.scheduleTime}><Text style={[styles.timeText, { color: colors.onSurface }]}>{item.time}</Text><Text style={[styles.ovenText, { color: colors.muted }]}>{item.oven}</Text></View><Text style={[styles.scheduleProduct, { color: colors.onSurface }]}>{item.product}</Text><StatusPill label={item.stage} tone={stageTone(item.stage)} /></View>)}</Card>
    <Pressable testID="dashboard-haccp-banner" onPress={onOpenHaccp} style={[styles.alertBanner, { backgroundColor: haccpAlerts.length ? colors.brandTertiary : colors.surfaceTertiary }]}><Ionicons name="shield-checkmark-outline" size={23} color={colors.onBrandTertiary} /><View style={{ flex: 1 }}><Text style={[styles.alertTitle, { color: colors.onBrandTertiary }]}>{haccpAlerts.length ? `HACCP · ${haccpAlerts.length} ${haccpAlerts.length === 1 ? "temperatura fuori intervallo" : "temperature fuori intervallo"}` : "HACCP · tutte le aree conformi"}</Text><Text style={[styles.alertText, { color: colors.onBrandTertiary }]}>{haccpAlerts.length ? `${haccpAlerts.map((log) => `${log.area} ${formatTemp(log.value)}`).join(", ")}: ripetere il controllo e firmare.` : "Ultimi controlli registrati e firmati."}</Text></View><Ionicons name="chevron-forward" size={20} color={colors.onBrandTertiary} /></Pressable>
  </View>;
}

function FilterChip({ label, active, onPress, testID }: { label: string; active: boolean; onPress: () => void; testID?: string }) { const { colors } = useTheme(); return <Pressable testID={testID} onPress={onPress} style={[styles.filterChip, { backgroundColor: active ? colors.brand : colors.surfaceTertiary, borderColor: active ? colors.brand : colors.border }]}><Text style={{ color: active ? colors.onBrand : colors.onSurfaceTertiary, fontSize: 12, fontWeight: "800" }}>{label}</Text></Pressable>; }

function Recipes({ recipes, tablet, onSelectRecipe }: { recipes: Recipe[]; tablet: boolean; onSelectRecipe: (recipe: Recipe) => void }) {
  const { colors } = useTheme();
  const [activeRecipe, setActiveRecipe] = useState(recipes[0]);
  const [target, setTarget] = useState("15000");
  const [ambient, setAmbient] = useState("24"); const [flourTemp, setFlourTemp] = useState("22"); const [desired, setDesired] = useState("25"); const [mixer, setMixer] = useState("5");
  const total = activeRecipe.ingredients.reduce((sum, ingredient) => sum + ingredient.grams, 0);
  const scale = Math.max(Number(target) || 1, 1) / total;
  const waterTemp = (Number(desired) * 3 - Number(ambient) - Number(flourTemp) - Number(mixer)).toFixed(1);
  return <View><PageIntro eyebrow="RICETTARIO DINAMICO" title="Ricette e percentuali del panettiere" subtitle="Formula, resa e allergeni sempre pronti per il banco di lavoro." />
    <View style={styles.recipeGrid}>{recipes.map((recipe) => <Card key={recipe.id} style={tablet ? styles.recipeCardTablet : undefined}><View style={styles.recipeTop}><StatusPill label={recipe.category} tone={recipe.accent === "brand" ? "brand" : recipe.accent} /><Text style={[styles.recipeYield, { color: colors.muted }]}>{recipe.yield}</Text></View><Text style={[styles.recipeName, { color: colors.onSurface }]}>{recipe.name}</Text><View style={styles.recipeStats}><MiniStat label="Idratazione" value={`${recipe.hydration}%`} /><MiniStat label="Calo cottura" value={`${recipe.loss}%`} /><MiniStat label="Metodo" value={recipe.method.split(" · ")[0]} /></View><View style={styles.recipeActions}><Pressable testID={`calc-${recipe.id}`} onPress={() => setActiveRecipe(recipe)} style={[styles.outlineButton, { borderColor: colors.borderStrong }]}><Ionicons name="calculator-outline" size={16} color={colors.brand} /><Text style={[styles.outlineButtonText, { color: colors.onSurface }]}>Calcola</Text></Pressable><Pressable testID={`allergen-${recipe.id}`} onPress={() => onSelectRecipe(recipe)} style={[styles.primaryButton, { backgroundColor: colors.surfaceInverse }]}><Ionicons name="pricetag-outline" size={16} color={colors.onSurfaceInverse} /><Text style={{ color: colors.onSurfaceInverse, fontWeight: "800", fontSize: 12 }}>Etichetta allergeni</Text></Pressable></View></Card>)}</View>
    <Card><SectionTitle eyebrow="Percentuali del panettiere" title={activeRecipe.name} /><Text style={[styles.cardIntro, { color: colors.muted }]}>Scala l&apos;impasto per peso totale. Le quantità sono espresse in grammi e ordinate per formula.</Text><View style={styles.calculatorRow}><View style={styles.field}><Text style={[styles.fieldLabel, { color: colors.muted }]}>Impasto desiderato (g)</Text><TextInput testID="scale-input" value={target} onChangeText={setTarget} keyboardType="numeric" style={[styles.fieldInput, { backgroundColor: colors.surfaceTertiary, color: colors.onSurface, borderColor: colors.border }]} /></View><View style={[styles.resultBox, { backgroundColor: colors.brandTertiary }]}><Text style={[styles.resultLabel, { color: colors.onBrandTertiary }]}>Fattore scala</Text><Text style={[styles.resultValue, { color: colors.onBrandTertiary }]}>{scale.toFixed(2)}×</Text></View></View>{activeRecipe.ingredients.map((ingredient) => <View key={ingredient.name} style={[styles.ingredientRow, { borderBottomColor: colors.divider }]}><Text style={[styles.ingredientName, { color: colors.onSurface }]}>{ingredient.name}</Text><Text style={[styles.ingredientPercent, { color: colors.muted }]}>{ingredient.baker}%</Text><Text style={[styles.ingredientGrams, { color: colors.brand }]}>{Math.round(ingredient.grams * scale).toLocaleString("it-IT")} g</Text></View>)}<Text style={[styles.methodNote, { color: colors.muted }]}><Ionicons name="bulb-outline" size={15} color={colors.brand} /> {activeRecipe.method}</Text></Card>
    <Card><SectionTitle eyebrow="Regola dei 3" title="Calcolatore temperatura acqua" /><View style={styles.inputGrid}>{[["Ambiente", ambient, setAmbient], ["Farina", flourTemp, setFlourTemp], ["Impasto desiderato", desired, setDesired], ["Fattore impastatrice", mixer, setMixer]].map(([label, value, setter]) => <View key={String(label)} style={styles.field}><Text style={[styles.fieldLabel, { color: colors.muted }]}>{String(label)} °C</Text><TextInput value={String(value)} onChangeText={setter as (value: string) => void} keyboardType="numeric" style={[styles.fieldInput, { backgroundColor: colors.surfaceTertiary, color: colors.onSurface, borderColor: colors.border }]} /></View>)}</View><View style={[styles.tempResult, { backgroundColor: colors.surfaceInverse }]}><Ionicons name="water-outline" size={24} color={colors.brand} /><View style={{ flex: 1 }}><Text style={[styles.tempLabel, { color: colors.onSurfaceInverse }]}>Temperatura acqua consigliata</Text><Text style={[styles.tempFormula, { color: colors.muted }]}>({desired} × 3) − {ambient} − {flourTemp} − {mixer}</Text></View><Text style={[styles.tempValue, { color: colors.brand }]}>{waterTemp}°C</Text></View></Card>
  </View>;
}

function MiniStat({ label, value }: { label: string; value: string }) { const { colors } = useTheme(); return <View style={{ flex: 1 }}><Text style={{ color: colors.muted, fontSize: 11 }}>{label}</Text><Text numberOfLines={1} style={{ color: colors.onSurface, fontWeight: "800", fontSize: 12, marginTop: 3 }}>{value}</Text></View>; }

function AllergenModal({ recipe, onClose }: { recipe: Recipe | null; onClose: () => void }) {
  const { colors } = useTheme();
  if (!recipe) return null;
  const sorted = [...recipe.ingredients].sort((a, b) => b.grams - a.grams);
  const printLabel = () => { if (Platform.OS === "web" && typeof window !== "undefined") window.print(); else Alert.alert("Etichetta pronta", "La scheda è pronta per la stampa dal dispositivo del laboratorio."); };
  const content = <View style={[styles.modalBackdrop, Platform.OS === "web" ? { position: "absolute", top: 0, bottom: 0, left: 0, right: 0, zIndex: 100 } : null, { backgroundColor: colors.surfaceInverse + "CC" }]}><View style={[styles.labelSheet, { backgroundColor: colors.surface }]}><View style={styles.modalHeader}><View><Text style={[styles.eyebrowLarge, { color: colors.brand }]}>REG. UE 1169/2011</Text><Text style={[styles.modalTitle, { color: colors.onSurface }]}>Etichetta allergeni</Text></View><IconButton testID="close-allergen" icon="close" label="Chiudi etichetta" onPress={onClose} /></View><View style={[styles.labelPreview, { backgroundColor: colors.surfaceSecondary, borderColor: colors.borderStrong }]}><Text style={[styles.labelBrand, { color: colors.brand }]}>PANIFICIOOS</Text><Text style={[styles.labelProduct, { color: colors.onSurface }]}>{recipe.name}</Text><Text style={[styles.labelSmall, { color: colors.muted }]}>INGREDIENTI IN ORDINE DECRESCENTE DI PESO</Text><Text style={[styles.labelIngredients, { color: colors.onSurfaceTertiary }]}>{sorted.map((ingredient) => ingredient.allergen ? `${ingredient.name.toUpperCase()} (${ingredient.allergen})` : ingredient.name).join(", ")}</Text><View style={[styles.allergenLegend, { backgroundColor: colors.brandTertiary }]}><Ionicons name="alert-circle-outline" size={16} color={colors.onBrandTertiary} /><Text style={{ color: colors.onBrandTertiary, fontSize: 12, fontWeight: "700", flex: 1 }}>Allergeni evidenziati: {sorted.filter((item) => item.allergen).map((item) => item.allergen).join(", ") || "nessuno"}</Text></View><Text style={[styles.labelSmall, { color: colors.muted }]}>Conservare in luogo fresco e asciutto · Peso indicativo secondo lotto</Text></View><Pressable testID="print-label" onPress={printLabel} style={[styles.primaryButton, { backgroundColor: colors.brand, justifyContent: "center" }]}><Ionicons name="print-outline" size={18} color={colors.onBrand} /><Text style={{ color: colors.onBrand, fontWeight: "900" }}>Stampa etichetta</Text></Pressable></View></View>;
  return Platform.OS === "web" ? content : <Modal visible transparent animationType="slide" onRequestClose={onClose}>{content}</Modal>;
}

function TraceabilityModal({ batch, state, onClose }: { batch: Batch | null; state: AppState; onClose: () => void }) {
  const { colors } = useTheme();
  if (!batch) return null;
  const recipe = state.recipes.find((item) => item.id === batch.recipeId) ?? state.recipes.find((item) => item.name.startsWith(batch.product.split(" ")[0]));
  const ingredients = recipe?.ingredients ?? [];
  const allergens = Array.from(new Set(ingredients.map((item) => item.allergen).filter(Boolean))) as string[];
  const traceId = `TR-${batch.id.toUpperCase()}-${new Date().toISOString().slice(0, 10)}`;
  const lastCheck = [...state.tempLogs].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())[0];
  const print = () => { if (Platform.OS === "web" && typeof window !== "undefined") window.print(); else Alert.alert("Scheda pronta", "La scheda è pronta per la stampa dal laboratorio."); };
  const content = <View style={[styles.modalBackdrop, Platform.OS === "web" ? { position: "absolute", top: 0, bottom: 0, left: 0, right: 0, zIndex: 100 } : null, { backgroundColor: colors.surfaceInverse + "CC" }]}>
    <View style={[styles.labelSheet, { backgroundColor: colors.surface, maxHeight: "94%" }]}>
      <View style={styles.modalHeader}>
        <View><Text style={[styles.eyebrowLarge, { color: colors.brand }]}>SCHEDA HACCP · REG. CE 178/2002</Text><Text style={[styles.modalTitle, { color: colors.onSurface }]}>Tracciabilità lotto</Text></View>
        <IconButton testID="close-trace" icon="close" label="Chiudi scheda" onPress={onClose} />
      </View>
      <ScrollView style={{ maxHeight: 460 }} showsVerticalScrollIndicator={false}>
        <View style={[styles.labelPreview, { backgroundColor: colors.surfaceSecondary, borderColor: colors.borderStrong }]}>
          <View style={styles.traceHeader}>
            <View style={{ flex: 1 }}><Text style={[styles.labelBrand, { color: colors.brand }]}>PANIFICIOOS · LABORATORIO</Text><Text style={[styles.labelProduct, { color: colors.onSurface }]}>{batch.product}</Text></View>
            <StatusPill label={batch.stage} tone="brand" />
          </View>
          <View style={styles.traceRow}><Text style={[styles.traceLabel, { color: colors.muted }]}>ID TRACCIABILITÀ</Text><Text style={[styles.traceValue, { color: colors.onSurface }]}>{traceId}</Text></View>
          <View style={styles.traceRow}><Text style={[styles.traceLabel, { color: colors.muted }]}>QUANTITÀ</Text><Text style={[styles.traceValue, { color: colors.onSurface }]}>{batch.quantity}</Text></View>
          <View style={styles.traceRow}><Text style={[styles.traceLabel, { color: colors.muted }]}>DATA PRODUZIONE</Text><Text style={[styles.traceValue, { color: colors.onSurface }]}>{new Date().toLocaleDateString("it-IT")}</Text></View>
          <Text style={[styles.labelSmall, { color: colors.muted, marginTop: 14 }]}>MATERIE PRIME E LOTTI ATTIVI</Text>
          {ingredients.length === 0 ? <Text style={[styles.empty, { color: colors.muted }]}>Nessun ingrediente collegato.</Text> : null}
          {ingredients.map((ingredient) => {
            const match = matchStockForIngredient(ingredient.name, state.stock);
            return <View key={ingredient.name} style={[styles.traceIngredient, { borderBottomColor: colors.divider }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.traceIngName, { color: colors.onSurface }]}>{ingredient.name}{ingredient.allergen ? ` (${ingredient.allergen})` : ""}</Text>
                <Text style={[styles.traceIngLot, { color: colors.muted }]}>{match ? `Lotto ${match.lot} · scad. ${match.expiry}` : "Lotto non collegato — verificare registro cartaceo"}</Text>
              </View>
              <Text style={[styles.traceIngPct, { color: colors.brand }]}>{ingredient.baker}%</Text>
            </View>;
          })}
          {batch.flourUsage?.length ? <><Text style={[styles.labelSmall, { color: colors.muted, marginTop: 14 }]}>SCARICO MAGAZZINO (INGRESSO IN PUNTATA)</Text>{batch.flourUsage.map((use) => <View key={use.stockId} style={[styles.traceRow, { borderBottomColor: colors.divider }]}><Text style={[styles.traceIngName, { color: colors.onSurface, flex: 1 }]}>{use.name} · lotto {use.lot}</Text><Text style={[styles.traceIngPct, { color: colors.brand }]}>{use.kg.toLocaleString("it-IT")} kg</Text></View>)}</> : null}
          <View style={[styles.allergenLegend, { backgroundColor: colors.brandTertiary, marginTop: 12 }]}>
            <Ionicons name="alert-circle-outline" size={16} color={colors.onBrandTertiary} />
            <Text style={{ color: colors.onBrandTertiary, fontSize: 12, fontWeight: "700", flex: 1 }}>Allergeni presenti: {allergens.join(", ") || "nessuno dichiarato"}</Text>
          </View>
          <Text style={[styles.labelSmall, { color: colors.muted }]}>Conservare la scheda almeno 12 mesi · Firme digitali registrate dal sistema</Text>
          <View style={[styles.signatureRow, { borderTopColor: colors.borderStrong }]}>
            <View style={styles.signatureCell}><Text style={[styles.labelSmall, { color: colors.muted }]}>RESP. PRODUZIONE</Text><Text testID="trace-sign-production" style={[styles.traceValue, { color: colors.onSurface, marginTop: 6 }]}>{batch.operator ?? "—"}</Text><View style={[styles.signatureLine, { backgroundColor: colors.borderStrong, marginTop: 8 }]} /></View>
            <View style={styles.signatureCell}><Text style={[styles.labelSmall, { color: colors.muted }]}>RESP. HACCP</Text><Text testID="trace-sign-haccp" style={[styles.traceValue, { color: colors.onSurface, marginTop: 6 }]}>{lastCheck ? `${lastCheck.operator} · ${formatDateTime(lastCheck.at)}` : "—"}</Text><View style={[styles.signatureLine, { backgroundColor: colors.borderStrong, marginTop: 8 }]} /></View>
          </View>
        </View>
      </ScrollView>
      <Pressable testID="print-trace" onPress={print} style={[styles.primaryButton, { backgroundColor: colors.brand, justifyContent: "center" }]}><Ionicons name="print-outline" size={18} color={colors.onBrand} /><Text style={{ color: colors.onBrand, fontWeight: "900" }}>Stampa scheda tracciabilità</Text></Pressable>
    </View>
  </View>;
  return Platform.OS === "web" ? content : <Modal visible transparent animationType="slide" onRequestClose={onClose}>{content}</Modal>;
}

function Production({ state, tablet, setState, operator, onTrace, onOpenForm }: { state: AppState; tablet: boolean; setState: Dispatch<SetStateAction<AppState>>; operator: string; onTrace: (batch: Batch) => void; onOpenForm: (kind: FormKind) => void }) {
  const { colors } = useTheme();
  const [notice, setNotice] = useState<{ title: string; lines: string[]; warning: boolean } | null>(null);
  /**
   * Avanza il lotto alla fase successiva:
   * - riavvia il conto alla rovescia con la durata standard della nuova fase;
   * - all'ingresso "In Puntata" scala dal magazzino la farina della ricetta (una sola volta per lotto).
   */
  const advance = (batch: Batch) => {
    const index = stages.indexOf(batch.stage);
    if (index >= stages.length - 1) return;
    const nextStage = stages[index + 1];
    const deduction = nextStage === "In Puntata" && !batch.flourUsage ? deductFlour(batch, state.recipes.find((item) => item.id === batch.recipeId), state.stock) : null;
    setState((current) => ({
      ...current,
      stock: deduction ? current.stock.map((item) => deduction.stock.find((entry) => entry.id === item.id) ?? item) : current.stock,
      batches: current.batches.map((item) => item.id === batch.id ? { ...item, stage: nextStage, operator, timerEndsAt: stageTimerFrom(item.recipeId, nextStage), ...(deduction ? { flourUsage: deduction.usage } : {}) } : item),
    }));
    if (deduction) {
      setNotice({
        title: `Scarico automatico farine · ${batch.product}`,
        lines: [...deduction.usage.map((use) => `−${use.kg.toLocaleString("it-IT")} kg ${use.name} (lotto ${use.lot})`), ...deduction.warnings],
        warning: deduction.warnings.length > 0,
      });
    }
  };
  const activeTimers = state.batches.filter((batch) => batch.timerEndsAt && batch.stage !== "Sfornato").slice(0, 3);
  return <View>
    <PageIntro eyebrow="FLUSSO DI LABORATORIO" title="Produzione e fermentazione" subtitle="Una vista chiara dal primo impasto all'uscita dal forno." />
    {notice ? <View testID="flour-notice" style={[styles.flourNotice, { backgroundColor: notice.warning ? colors.brandTertiary : colors.surfaceTertiary, borderColor: notice.warning ? colors.warning : colors.border }]}>
      <Ionicons name={notice.warning ? "warning-outline" : "cube-outline"} size={22} color={notice.warning ? colors.onBrandTertiary : colors.brand} />
      <View style={{ flex: 1 }}>
        <Text style={{ color: notice.warning ? colors.onBrandTertiary : colors.onSurface, fontWeight: "900", fontSize: 13 }}>{notice.title}</Text>
        {notice.lines.map((line) => <Text key={line} style={{ color: notice.warning ? colors.onBrandTertiary : colors.onSurfaceTertiary, fontSize: 12, marginTop: 3 }}>{line}</Text>)}
      </View>
      <IconButton testID="flour-notice-close" icon="close" label="Chiudi avviso" onPress={() => setNotice(null)} />
    </View> : null}
    <Card><SectionTitle testID="new-batch-open" eyebrow="Lavagna di lavorazione · Stato avanzamento" title="Lotti attivi" action="+ Nuovo impasto" onAction={() => onOpenForm("batch")} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.kanbanRow}>{stages.map((stage) => { const items = state.batches.filter((batch) => batch.stage === stage); return <View key={stage} style={[styles.kanbanColumn, { backgroundColor: colors.surfaceTertiary, width: tablet ? 210 : 235 }]}><View style={styles.kanbanHeader}><Text style={[styles.kanbanTitle, { color: colors.onSurface }]}>{stage}</Text><View style={[styles.countBadge, { backgroundColor: colors.surfaceSecondary }]}><Text style={{ color: colors.muted, fontWeight: "900", fontSize: 11 }}>{items.length}</Text></View></View>{items.map((batch) => { const remaining = remainingFromIso(batch.timerEndsAt); const flour = (batch.flourUsage ?? []).reduce((sum, use) => sum + use.kg, 0); return <View testID={`batch-card-${batch.id}`} key={batch.id} style={[styles.batchCard, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}><Text style={[styles.batchName, { color: colors.onSurface }]}>{batch.product}</Text><Text style={[styles.batchQty, { color: colors.muted }]}>{batch.quantity}</Text>{flour > 0 ? <Text style={[styles.batchQty, { color: colors.muted }]}>Farina scaricata: {flour.toLocaleString("it-IT")} kg</Text> : null}{remaining ? <View style={styles.timerRow}><Ionicons name={remaining.expired ? "checkmark-circle" : "timer-outline"} size={14} color={remaining.expired ? colors.success : colors.brand} /><Text style={{ color: remaining.expired ? colors.success : colors.brand, fontWeight: "900", fontSize: 12 }}>{remaining.label}</Text></View> : null}<View style={styles.batchActions}>{stage !== "Sfornato" ? <Pressable testID={`advance-${batch.id}`} onPress={() => advance(batch)} style={[styles.advanceButton, { backgroundColor: colors.brandTertiary }]}><Text style={{ color: colors.onBrandTertiary, fontWeight: "800", fontSize: 11 }}>Avanza</Text><Ionicons name="arrow-forward" size={14} color={colors.onBrandTertiary} /></Pressable> : <StatusPill label="Completato" tone="success" />}<Pressable testID={`trace-${batch.id}`} onPress={() => onTrace(batch)} style={[styles.traceButton, { borderColor: colors.borderStrong }]}><Ionicons name="document-text-outline" size={13} color={colors.brand} /><Text style={{ color: colors.onSurface, fontWeight: "800", fontSize: 11 }}>Tracciabilità</Text></Pressable></View></View>; })}</View>; })}</ScrollView>
    </Card>
    <View style={tablet ? styles.twoColumns : undefined}>
      <FeedingCard starter="Pasta Madre" state={state} tablet={tablet} onOpen={() => onOpenForm("feeding-madre")} />
      <FeedingCard starter="Licoli" state={state} tablet={tablet} onOpen={() => onOpenForm("feeding-licoli")} />
    </View>
    <Card><SectionTitle eyebrow="Cronometri attivi" title="Controlli prossimi" />{activeTimers.length === 0 ? <Text style={[styles.empty, { color: colors.muted }]}>Nessun conto alla rovescia in corso.</Text> : null}{activeTimers.map((batch) => { const remaining = remainingFromIso(batch.timerEndsAt); if (!remaining) return null; const tone: "info" | "warning" | "success" = remaining.expired ? "success" : batch.stage === "In Forno" ? "warning" : batch.stage === "In Cella" ? "info" : "success"; return <TimerItem key={batch.id} label={`${batch.stage} · ${batch.product}`} remaining={remaining.label} progress={remaining.progress} tone={tone} />; })}</Card>
  </View>;
}

/**
 * Registro rinfreschi di un singolo lievito (Pasta Madre solida o Licoli).
 * Su tablet lo storico è una tabella a colonne; su smartphone ogni rinfresco è una scheda a due colonne.
 */
function FeedingCard({ starter, state, tablet, onOpen }: { starter: StarterType; state: AppState; tablet: boolean; onOpen: () => void }) {
  const { colors } = useTheme();
  const solid = starter === "Pasta Madre";
  const key = solid ? "madre" : "licoli";
  const history = state.feedings.filter((item) => starterOf(item) === starter).sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  const last = history[0];
  const peak = last ? feedingPeak(last) : null;
  const peakColor = peak ? colors[peak.tone] : colors.muted;
  const extraLabel = solid ? "CUORE / TRATT." : "pH";
  const extraValue = (item: Feeding) => solid ? `${item.coreTemp !== undefined ? `${item.coreTemp}°` : "—"} · ${item.binding ?? "—"}` : item.ph ? item.ph.toLocaleString("it-IT") : "—";
  return <Card style={tablet ? styles.columnCard : undefined}>
    <SectionTitle eyebrow={solid ? "Pasta Madre Solida · Lievito Madre" : "Licoli · Lievito Madre Liquido"} title={`Rinfreschi ${solid ? "pasta madre" : "licoli"}`} />
    <View style={styles.starterHero}>
      <View style={[styles.starterIcon, { backgroundColor: colors.brandTertiary }]}><Ionicons name={solid ? "ellipse" : "flask-outline"} size={24} color={colors.onBrandTertiary} /></View>
      <View style={{ flex: 1 }}>
        <Text testID={`starter-status-${key}`} style={[styles.starterTitle, { color: colors.onSurface }]}>{peak ? peak.label : "Nessun rinfresco"}</Text>
        <Text testID={`feeding-ready-at-${key}`} style={{ color: colors.muted, fontSize: 12 }}>{last && peak ? `Ultimo ${formatDateTime(last.at)} · picco ore ${formatClock(peak.readyAt.toISOString())}` : "Registra il primo rinfresco della giornata."}</Text>
      </View>
      <StatusPill label={solid ? "1:1:0,45" : "1:2:2"} tone="neutral" />
    </View>
    {peak ? <View style={{ marginTop: 14 }}><View style={styles.timerItemTop}><Text style={{ color: colors.muted, fontSize: 11, fontWeight: "800" }}>CRESCITA VERSO IL PICCO</Text><Text style={{ color: peakColor, fontWeight: "900", fontSize: 12 }}>{Math.round(peak.progress * 100)}%</Text></View><View style={[styles.progressTrack, { backgroundColor: colors.surfaceTertiary }]}><View style={[styles.progressFill, { backgroundColor: peakColor, width: `${Math.max(peak.progress * 100, 4)}%` }]} /></View></View> : null}
    {tablet ? <View style={[styles.feedTableHead, { borderBottomColor: colors.divider }]}>{["DATA/ORA", "RAPPORTO", "AMB.", extraLabel, "PICCO"].map((label, i) => <Text key={label} style={[styles.tableLabel, { color: colors.muted, flex: i === 3 && solid ? 1.6 : 1 }]}>{label}</Text>)}</View> : <View style={{ height: 12 }} />}
    {history.length === 0 ? <Text style={[styles.empty, { color: colors.muted }]}>Nessun rinfresco registrato.</Text> : null}
    {history.slice(0, 5).map((feeding) => {
      const p = feedingPeak(feeding);
      if (!tablet) {
        // Smartphone: scheda compatta con griglia etichetta/valore, nessuna colonna schiacciata.
        return <View testID={`feeding-row-${feeding.id}`} key={feeding.id} style={[styles.feedMobileCard, { backgroundColor: colors.surfaceTertiary }]}>
          <View style={styles.feedMobileTop}><Text style={{ color: colors.onSurface, fontWeight: "900", fontSize: 13 }}>{formatDateTime(feeding.at)}</Text><StatusPill label={`Picco ${formatClock(p.readyAt.toISOString())}`} tone={p.tone === "success" ? "success" : p.tone === "warning" ? "warning" : "info"} /></View>
          <View style={styles.feedMobileGrid}>
            {[["Rapporto", feeding.ratio], ["Ambiente", `${feeding.ambientTemp}°C`], [solid ? "Cuore" : "pH", solid ? (feeding.coreTemp !== undefined ? `${feeding.coreTemp}°C` : "—") : extraValue(feeding)], ...(solid ? [["Trattamento", feeding.binding ?? "—"]] : [])].map(([label, value]) => <View key={label} style={styles.feedMobileCell}><Text style={{ color: colors.muted, fontSize: 10, fontWeight: "800" }}>{label.toUpperCase()}</Text><Text style={{ color: colors.onSurface, fontSize: 13, fontWeight: "800", marginTop: 2 }}>{value}</Text></View>)}
          </View>
          <Text style={{ color: colors.muted, fontSize: 11, marginTop: 6 }} numberOfLines={2}>{feeding.notes} · {feeding.operator}</Text>
        </View>;
      }
      return <View testID={`feeding-row-${feeding.id}`} key={feeding.id} style={[styles.feedTableRow, { borderBottomColor: colors.divider }]}>
        <View style={styles.feedTableCells}>
          <Text style={[styles.feedCell, { color: colors.onSurface, fontWeight: "800" }]}>{formatDateTime(feeding.at)}</Text>
          <Text style={[styles.feedCell, { color: colors.onSurface }]}>{feeding.ratio}</Text>
          <Text style={[styles.feedCell, { color: colors.onSurface }]}>{feeding.ambientTemp}°</Text>
          <Text style={[styles.feedCell, { color: colors.onSurface, flex: solid ? 1.6 : 1 }]}>{extraValue(feeding)}</Text>
          <Text style={[styles.feedCell, { color: colors[p.tone], fontWeight: "900" }]}>{formatClock(p.readyAt.toISOString())}</Text>
        </View>
        <Text style={{ color: colors.muted, fontSize: 11, marginTop: 4 }} numberOfLines={2}>{feeding.notes} · {feeding.operator}</Text>
      </View>;
    })}
    <Pressable testID={`feeding-open-${key}`} onPress={onOpen} style={[styles.outlineButton, { borderColor: colors.borderStrong, justifyContent: "center", marginTop: 14 }]}><Ionicons name="add" size={17} color={colors.brand} /><Text style={[styles.outlineButtonText, { color: colors.onSurface }]}>Registra rinfresco</Text></Pressable>
  </Card>;
}

function TimerItem({ label, remaining, progress, tone }: { label: string; remaining: string; progress: number; tone: "info" | "warning" | "success" }) { const { colors } = useTheme(); const color = colors[tone]; return <View style={styles.timerItem}><View style={styles.timerItemTop}><Text style={{ color: colors.onSurface, fontWeight: "800", fontSize: 13, flex: 1 }} numberOfLines={1}>{label}</Text><Text style={{ color, fontWeight: "900" }}>{remaining}</Text></View><View style={[styles.progressTrack, { backgroundColor: colors.surfaceTertiary }]}><View style={[styles.progressFill, { backgroundColor: color, width: `${progress * 100}%` }]} /></View></View>; }

function More({ state, tablet, operator, area, setArea, onTrace, onOpenForm }: { state: AppState; tablet: boolean; operator: string; area: MoreArea; setArea: (area: MoreArea) => void; onTrace: (batch: Batch) => void; onOpenForm: (kind: FormKind) => void }) { const { colors } = useTheme(); return <View><PageIntro eyebrow="CENTRO CONTROLLI" title="Controlli e prestazioni" subtitle="HACCP, recupero invenduto e lettura dei numeri del laboratorio." /><View style={[styles.subnav, { backgroundColor: colors.surfaceTertiary }]}>{([["haccp", "HACCP"], ["costi", "Resi e costi"], ["report", "Resoconti"]] as [MoreArea, string][]).map(([key, label]) => <Pressable testID={`more-${key}`} key={key} onPress={() => setArea(key)} style={[styles.subnavItem, area === key ? { backgroundColor: colors.surfaceSecondary } : null]}><Text style={{ color: area === key ? colors.brand : colors.muted, fontWeight: "900", fontSize: 12 }}>{label}</Text></Pressable>)}</View>{area === "haccp" ? <Haccp state={state} tablet={tablet} onTrace={onTrace} onOpenForm={onOpenForm} /> : area === "costi" ? <Costs state={state} onOpenForm={onOpenForm} /> : <Reports state={state} operator={operator} />}</View>; }

function Haccp({ state, tablet, onTrace, onOpenForm }: { state: AppState; tablet: boolean; onTrace: (batch: Batch) => void; onOpenForm: (kind: FormKind) => void }) {
  const { colors } = useTheme();
  const latest = latestTempLogs(state.tempLogs);
  const failing = latest.filter((log) => !tempOk(log));
  const history = [...state.tempLogs].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()).slice(0, 8);
  const traceable = state.batches.filter((batch) => batch.stage !== "Sfornato").slice(0, 4);
  return <View>
    <View style={styles.kpiGrid}><MetricCard icon="cube-outline" value={String(state.stock.length)} label="Materie prime" detail={`${state.stock.filter((item) => item.qty < item.min).length} sotto scorta`} tone="info" /><MetricCard icon="barcode-outline" value={String(traceable.length)} label="Lotti attivi" detail="Tracciabilità pronta" tone="success" /><MetricCard icon="thermometer-outline" value={String(failing.length)} label="Allarmi HACCP" detail={failing.length ? failing.map((log) => log.area).join(", ") : "Tutte le aree conformi"} tone="warning" /></View>
    <View style={tablet ? styles.twoColumns : undefined}>
      <Card style={tablet ? styles.columnCard : undefined}><SectionTitle testID="lot-open" eyebrow="Scorte · Registro HACCP" title="Magazzino materie prime" action="+ Nuovo lotto" onAction={() => onOpenForm("lot")} />
        {state.stock.map((item) => <View testID={`stock-row-${item.id}`} key={item.id} style={[styles.stockRow, { borderBottomColor: colors.divider }]}><View style={[styles.stockIcon, { backgroundColor: item.qty < item.min ? colors.brandTertiary : colors.surfaceTertiary }]}><Ionicons name="cube-outline" size={18} color={item.qty < item.min ? colors.onBrandTertiary : colors.brand} /></View><View style={{ flex: 1 }}><Text style={[styles.stockName, { color: colors.onSurface }]}>{item.name}{item.allergen ? ` (${item.allergen})` : ""}</Text><Text style={{ color: colors.muted, fontSize: 11 }}>Lotto {item.lot} · scad. {item.expiry}</Text>{item.receivedAt ? <Text style={{ color: colors.muted, fontSize: 10, marginTop: 2 }}>Ricevuto {formatDateTime(item.receivedAt)} · {item.operator}</Text> : null}</View><View style={styles.stockQty}><Text style={{ color: item.qty < item.min ? colors.warning : colors.onSurface, fontWeight: "900" }}>{item.qty.toLocaleString("it-IT")} {item.unit}</Text>{item.qty < item.min ? <StatusPill label="Riordino" tone="warning" /> : <Text style={{ color: colors.success, fontSize: 10, fontWeight: "800", marginTop: 3 }}>Disponibile</Text>}</View></View>)}
      </Card>
      <Card style={tablet ? styles.columnCard : undefined}><SectionTitle testID="temp-open" eyebrow="Registro temperature" title="Controlli firmati" action="+ Controllo" onAction={() => onOpenForm("temp")} />
        {history.length === 0 ? <Text style={[styles.empty, { color: colors.muted }]}>Nessun controllo registrato.</Text> : null}
        {history.map((log) => { const ok = tempOk(log); return <View testID={`temp-row-${log.id}`} key={log.id} style={[styles.tempLog, { borderBottomColor: colors.divider }]}><View style={[styles.tempCheck, { backgroundColor: ok ? colors.success : colors.error }]}><Ionicons name={ok ? "checkmark" : "alert"} size={16} color={ok ? colors.onSuccess : colors.onError} /></View><View style={{ flex: 1 }}><Text style={{ color: colors.onSurface, fontWeight: "800" }}>{log.area}</Text><Text style={{ color: colors.muted, fontSize: 11 }}>Intervallo {formatRange(log.min, log.max)} · {formatDateTime(log.at)}</Text><Text style={{ color: colors.muted, fontSize: 10, marginTop: 2 }}>Firmato: {log.operator}</Text></View><Text style={{ color: ok ? colors.success : colors.error, fontWeight: "900" }}>{formatTemp(log.value)}</Text></View>; })}
        <View style={[styles.complianceFooter, { backgroundColor: colors.surfaceTertiary }]}><Ionicons name="shield-checkmark" size={18} color={failing.length ? colors.error : colors.success} /><Text style={{ color: colors.onSurfaceTertiary, fontSize: 12, fontWeight: "700", flex: 1 }}>{failing.length ? `Azione correttiva richiesta: ${failing.map((log) => log.area).join(", ")}.` : "Tutte le aree rientrano nei limiti di legge."}</Text></View>
      </Card>
    </View>
    <Card><SectionTitle eyebrow="Tracciabilità lotti" title="Schede stampabili per HACCP" /><Text style={[styles.cardIntro, { color: colors.muted }]}>Apri la scheda sintetica con ingredienti, lotti collegati, allergeni e firme.</Text>{traceable.map((batch) => <Pressable testID={`haccp-trace-${batch.id}`} key={batch.id} onPress={() => onTrace(batch)} style={[styles.traceCard, { borderBottomColor: colors.divider }]}><View style={[styles.stockIcon, { backgroundColor: colors.brandTertiary }]}><Ionicons name="document-text-outline" size={19} color={colors.onBrandTertiary} /></View><View style={{ flex: 1 }}><Text style={{ color: colors.onSurface, fontWeight: "900" }}>{batch.product}</Text><Text style={{ color: colors.muted, fontSize: 12 }}>{batch.quantity} · {batch.stage}</Text></View><Ionicons name="chevron-forward" size={20} color={colors.muted} /></Pressable>)}</Card>
  </View>;
}

function Costs({ state, onOpenForm }: { state: AppState; onOpenForm: (kind: FormKind) => void }) {
  const { colors } = useTheme();
  const todayReturns = state.returns.filter((item) => onDay(item.at, new Date()));
  const totalKg = todayReturns.reduce((sum, item) => sum + item.kg, 0);
  const recovered = todayReturns.filter((item) => item.destination !== "Scarto").reduce((sum, item) => sum + item.kg, 0);
  const recoveryRate = totalKg > 0 ? Math.round((recovered / totalKg) * 100) : 0;
  const recoveredValue = todayReturns.reduce((sum, item) => sum + (Number(item.value.replace(/[^\d,]/g, "").replace(",", ".")) || 0), 0);
  const biggestWaste = [...todayReturns].filter((item) => item.destination === "Scarto").sort((a, b) => b.kg - a.kg)[0];
  return <View>
    <View style={styles.kpiGrid}><MetricCard icon="cash-outline" value="€ 0,48" label="Costo medio / pezzo" detail="Materie + energia" tone="info" /><MetricCard icon="trending-up-outline" value={`€ ${recoveredValue.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} label="Valore recuperato" detail="Bilancio giornaliero" tone="success" /><MetricCard icon="refresh-outline" value={`${totalKg.toLocaleString("it-IT", { maximumFractionDigits: 1 })} kg`} label="Invenduto oggi" detail={`${recoveryRate}% recuperato`} tone="warning" /></View>
    <Card><SectionTitle testID="return-open" eyebrow="Chiusura giornata" title="Resi e recupero" action="+ Registra reso" onAction={() => onOpenForm("return")} />
      {state.returns.length === 0 ? <Text style={[styles.empty, { color: colors.muted }]}>Nessun reso registrato oggi.</Text> : null}
      {state.returns.map((item, index) => <View testID={`return-row-${item.id ?? index}`} key={item.id ?? `${item.product}-${index}`} style={[styles.returnRow, { borderBottomColor: colors.divider }]}><View style={[styles.returnIcon, { backgroundColor: item.destination === "Scarto" ? colors.surfaceTertiary : colors.brandTertiary }]}><Ionicons name={item.destination === "Scarto" ? "trash-outline" : "sync-outline"} size={19} color={item.destination === "Scarto" ? colors.muted : colors.onBrandTertiary} /></View><View style={{ flex: 1 }}><Text style={{ color: colors.onSurface, fontWeight: "800" }}>{item.product}</Text><Text style={{ color: colors.muted, fontSize: 12 }}>{item.kg.toLocaleString("it-IT")} kg · {item.destination}{item.operator ? ` · ${item.operator}` : ""}</Text></View><Text style={{ color: colors.onSurface, fontWeight: "900" }}>{item.value}</Text></View>)}
      <View style={[styles.suggestion, { backgroundColor: colors.surfaceTertiary }]}><Ionicons name="bulb-outline" size={20} color={colors.brand} /><Text style={{ color: colors.onSurfaceTertiary, fontSize: 12, lineHeight: 18, flex: 1 }}><Text style={{ fontWeight: "900", color: colors.onSurface }}>Suggerimento:</Text> {biggestWaste ? `${biggestWaste.kg.toLocaleString("it-IT")} kg di ${biggestWaste.product} destinati a scarto potrebbero diventare circa ${(biggestWaste.kg * 0.75).toLocaleString("it-IT", { maximumFractionDigits: 1 })} kg di pangrattato.` : "Nessuno scarto oggi: tutto l'invenduto è stato recuperato."}</Text></View>
    </Card>
    <Card><SectionTitle eyebrow="Costo materie prime" title="Margine per ricetta" />{[{ name: "Pane Comune Tipo 0", cost: "€ 0,42", price: "€ 2,80", margin: "85%" }, { name: "Ciabatta Alta Idratazione", cost: "€ 0,58", price: "€ 3,20", margin: "82%" }, { name: "Focaccia Pugliese", cost: "€ 1,15", price: "€ 6,00", margin: "81%" }].map((item) => <View key={item.name} style={[styles.marginRow, { borderBottomColor: colors.divider }]}><Text style={{ color: colors.onSurface, flex: 1, fontWeight: "800" }}>{item.name}</Text><Text style={{ color: colors.muted, width: 75 }}>{item.cost}</Text><Text style={{ color: colors.muted, width: 75 }}>{item.price}</Text><Text style={{ color: colors.success, fontWeight: "900", width: 50, textAlign: "right" }}>{item.margin}</Text></View>)}</Card>
  </View>;
}

function Reports({ state, operator }: { state: AppState; operator: string }) {
  const { colors } = useTheme();
  const planned = useMemo(() => {
    const seed = state.batches.length * 42 + state.recipes.length * 7;
    return Array.from({ length: 10 }, (_, i) => 55 + ((seed * (i + 3)) % 46));
  }, [state]);
  const actual = useMemo(() => planned.map((value, i) => Math.max(30, value - 8 - ((i * 3) % 12))), [planned]);
  const flourTotals = useMemo(() => {
    const map = new Map<string, number>();
    state.recipes.forEach((recipe) => recipe.ingredients.filter((ing) => ing.name.toLowerCase().includes("farina") || ing.name.toLowerCase().includes("semola")).forEach((ing) => {
      const key = ing.name.replace(/^Farina\s*/i, "").trim() || "Semola";
      map.set(key, (map.get(key) ?? 0) + ing.grams);
    }));
    const total = Array.from(map.values()).reduce((sum, value) => sum + value, 0);
    return Array.from(map.entries()).map(([type, grams]) => ({ type, pct: total > 0 ? Math.round((grams / total) * 100) : 0 })).sort((a, b) => b.pct - a.pct);
  }, [state.recipes]);
  const totalWaste = state.returns.reduce((sum, item) => sum + item.kg, 0);
  const wasteTrend = useMemo(() => Array.from({ length: 7 }, (_, i) => Number((Math.max(2, totalWaste - i * 0.6 + (i % 3))).toFixed(1))), [totalWaste]);
  const maxWaste = Math.max(...wasteTrend, 1);
  const [exporting, setExporting] = useState(false);
  const [exportMsg, setExportMsg] = useState("");
  // Archivio giornate per ispezioni ASL: oggi + ogni giorno con almeno un registro.
  const days = useMemo(() => archiveDays(state), [state]);
  const [selectedDay, setSelectedDay] = useState(dayKey(new Date()));
  const sheet = useMemo(() => buildDailySheet(state, operator, dateFromKey(selectedDay)), [state, operator, selectedDay]);
  const downloadPdf = async () => {
    setExporting(true); setExportMsg("");
    try {
      const file = await exportDailyPdf(sheet);
      setExportMsg(Platform.OS === "web" ? `PDF scaricato: ${file}` : "PDF generato e pronto per la condivisione.");
    } catch {
      setExportMsg("Errore durante la generazione del PDF. Riprova.");
    } finally {
      setExporting(false);
    }
  };
  return <View>
    <Card>
      <SectionTitle eyebrow="Ultimi 10 giorni" title="Pianificato e prodotto" />
      <View style={styles.chartLegend}><View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: colors.brand }]} /><Text style={{ color: colors.muted, fontSize: 11 }}>Pianificato</Text></View><View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: colors.info }]} /><Text style={{ color: colors.muted, fontSize: 11 }}>Effettivo</Text></View></View>
      <View style={[styles.chart, { borderColor: colors.border }]}>{planned.map((height, index) => <View key={index} style={styles.barGroup}><View style={[styles.bar, { height: `${height}%`, backgroundColor: colors.brand }]} /><View style={[styles.bar, { height: `${actual[index]}%`, backgroundColor: colors.info }]} /></View>)}</View>
      <View style={styles.chartLabels}><Text style={{ color: colors.muted, fontSize: 10 }}>-10g</Text><Text style={{ color: colors.muted, fontSize: 10 }}>-7g</Text><Text style={{ color: colors.muted, fontSize: 10 }}>-3g</Text><Text style={{ color: colors.muted, fontSize: 10 }}>OGGI</Text></View>
    </Card>
    <Card>
      <SectionTitle eyebrow="Andamento scarti" title="Invenduto ultimi 7 giorni" />
      <View style={[styles.chart, { borderColor: colors.border, height: 140 }]}>{wasteTrend.map((value, index) => <View key={index} style={styles.barGroup}><View testID={`waste-bar-${index}`} style={[styles.bar, { height: `${(value / maxWaste) * 100}%`, backgroundColor: colors.warning }]} /></View>)}</View>
      <View style={styles.chartLabels}>{wasteTrend.map((value, index) => <Text key={index} style={{ color: colors.muted, fontSize: 10, flex: 1, textAlign: "center" }}>{value} kg</Text>)}</View>
    </Card>
    <Card>
      <SectionTitle eyebrow="Consumo farine" title="Miscela farine per ricettario" />
      {flourTotals.length === 0 ? <Text style={[styles.empty, { color: colors.muted }]}>Nessuna farina registrata.</Text> : null}
      {flourTotals.map((item) => <View key={item.type} style={styles.flourRow}><Text style={{ color: colors.onSurface, fontWeight: "800", width: 150 }} numberOfLines={1}>{item.type}</Text><View style={[styles.flourTrack, { backgroundColor: colors.surfaceTertiary }]}><View style={[styles.flourFill, { backgroundColor: colors.brand, width: `${Math.max(item.pct, 4)}%` }]} /></View><Text style={{ color: colors.brand, fontWeight: "900", width: 42, textAlign: "right" }}>{item.pct}%</Text></View>)}
    </Card>
    <View style={styles.kpiGrid}><MetricCard icon="water-outline" value={`${(totalWaste * 0.7).toLocaleString("it-IT", { maximumFractionDigits: 1 })}%`} label="Scarto medio" detail="−1,2% rispetto al periodo precedente" tone="success" /><MetricCard icon="bar-chart-outline" value="1.240 kg" label="Farina consumata" detail={`${flourTotals[0]?.type ?? "—"}: ${flourTotals[0]?.pct ?? 0}%`} tone="info" /><MetricCard icon="download-outline" value="12" label="Resoconti esportati" detail="Questo mese" tone="brand" /></View>
    <Card>
      <SectionTitle eyebrow="Esportazione operativa · Archivio ispezioni ASL" title="Foglio di lavoro e registri HACCP" />
      <Text style={[styles.cardIntro, { color: colors.muted }]}>Seleziona la giornata: il PDF A4 include solo note di turno, controlli HACCP, rinfreschi e resi registrati in quella data.</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>{days.map((key, index) => { const active = key === selectedDay; const label = index === 0 && key === dayKey(new Date()) ? "Oggi" : dateFromKey(key).toLocaleDateString("it-IT", { weekday: "short", day: "2-digit", month: "2-digit" }); return <Pressable testID={`archive-day-${key}`} key={key} onPress={() => { setSelectedDay(key); setExportMsg(""); }} style={[styles.filterChip, { backgroundColor: active ? colors.brand : colors.surfaceTertiary, borderColor: active ? colors.brand : colors.border }]}><Text style={{ color: active ? colors.onBrand : colors.onSurfaceTertiary, fontSize: 12, fontWeight: "800" }}>{label}</Text></Pressable>; })}</ScrollView>
      <View testID="archive-preview" style={[styles.archivePreview, { backgroundColor: colors.surfaceTertiary }]}>
        <Text style={{ color: colors.onSurface, fontWeight: "900", fontSize: 14, textTransform: "capitalize" }}>{sheet.date}</Text>
        <View style={styles.archiveStats}>{[["Note turno", sheet.notes.length], ["Controlli HACCP", sheet.temps.length], ["Rinfreschi", sheet.feedings.length], ["Resi", sheet.returns.length]].map(([label, value]) => <View key={String(label)} style={styles.archiveStat}><Text testID={`archive-count-${String(label).split(" ")[0].toLowerCase()}`} style={{ color: colors.brand, fontWeight: "900", fontSize: 20 }}>{value}</Text><Text style={{ color: colors.muted, fontSize: 10, fontWeight: "800" }}>{String(label).toUpperCase()}</Text></View>)}</View>
        {sheet.temps.length === 0 ? <Text style={{ color: colors.muted, fontSize: 12 }}>Nessun controllo temperatura registrato in questa data.</Text> : null}
        {sheet.temps.slice(0, 6).map((t, i) => <View key={`${t.area}-${i}`} style={[styles.archiveRow, { borderBottomColor: colors.divider }]}><Text style={{ color: colors.onSurface, fontWeight: "800", fontSize: 12, flex: 1 }}>{t.area}</Text><Text style={{ color: t.ok ? colors.success : colors.error, fontWeight: "900", fontSize: 12, width: 70 }}>{t.value}</Text><Text style={{ color: colors.muted, fontSize: 11, width: 90, textAlign: "right" }}>{t.time}</Text></View>)}
      </View>
      <Pressable testID="download-daily-pdf" disabled={exporting} onPress={downloadPdf} style={[styles.primaryButton, { backgroundColor: colors.brand, justifyContent: "center", marginTop: 12, opacity: exporting ? 0.7 : 1 }]}>{exporting ? <ActivityIndicator color={colors.onBrand} /> : <Ionicons name="document-attach-outline" size={18} color={colors.onBrand} />}<Text style={{ color: colors.onBrand, fontWeight: "900" }}>{exporting ? "Generazione in corso..." : sheet.isToday ? "Scarica PDF Giornaliero" : "Scarica PDF della giornata"}</Text></Pressable>
      {exportMsg ? <Text testID="pdf-export-message" style={{ color: exportMsg.startsWith("Errore") ? colors.error : colors.success, fontWeight: "800", fontSize: 12, marginTop: 10 }}>{exportMsg}</Text> : null}
    </Card>
  </View>;
}

function PageIntro({ eyebrow, title, subtitle }: { eyebrow: string; title: string; subtitle: string }) { const { colors } = useTheme(); return <View style={styles.pageIntro}><Text style={[styles.eyebrowLarge, { color: colors.brand }]}>{eyebrow}</Text><Text style={[styles.pageTitle, { color: colors.onSurface }]}>{title}</Text><Text style={[styles.pageSubtitle, { color: colors.muted }]}>{subtitle}</Text></View>; }

function BottomNav({ area, setArea, colors }: { area: Area; setArea: (area: Area) => void; colors: ReturnType<typeof useTheme>["colors"] }) { const items: [Area, keyof typeof Ionicons.glyphMap, string][] = [["oggi", "grid-outline", "Oggi"], ["ricettario", "book-outline", "Ricette"], ["produzione", "git-branch-outline", "Produzione"], ["altro", "ellipsis-horizontal-circle-outline", "Altro"]]; return <View style={[styles.bottomNav, { backgroundColor: colors.surfaceSecondary, borderTopColor: colors.border }]}>{items.map(([key, icon, label]) => <Pressable testID={`nav-${key}`} key={key} onPress={() => setArea(key)} style={styles.navItem}><Ionicons name={icon} size={22} color={area === key ? colors.brand : colors.muted} /><Text style={{ color: area === key ? colors.brand : colors.muted, fontSize: 11, fontWeight: "900", marginTop: 4 }}>{label}</Text></Pressable>)}</View>; }

const styles = StyleSheet.create({
  root: { flex: 1 }, operatorDropdownWrap: { paddingTop: 8 }, operatorDropdown: { minHeight: 44, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", gap: 6 }, operatorMenu: { borderWidth: 1, borderRadius: 12, marginTop: 6, overflow: "hidden" }, operatorMenuItem: { minHeight: 46, paddingHorizontal: 14, borderBottomWidth: 1, flexDirection: "row", alignItems: "center" }, starterAlert: { borderRadius: 15, padding: 15, flexDirection: "row", gap: 11, alignItems: "center" }, flourNotice: { borderRadius: 14, borderWidth: 1, padding: 12, flexDirection: "row", gap: 10, alignItems: "flex-start", marginBottom: 16 }, feedMobileCard: { borderRadius: 12, padding: 12, marginBottom: 8 }, feedMobileTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 }, feedMobileGrid: { flexDirection: "row", flexWrap: "wrap", marginTop: 8, rowGap: 8 }, feedMobileCell: { width: "50%" }, archivePreview: { borderRadius: 12, padding: 12, gap: 6 }, archiveStats: { flexDirection: "row", gap: 6, marginVertical: 6 }, archiveStat: { flex: 1 }, archiveRow: { flexDirection: "row", alignItems: "center", paddingVertical: 6, borderBottomWidth: 1 }, groupLabel: { fontSize: 10, fontWeight: "900", letterSpacing: 1, marginBottom: 8 }, noteSign: { fontSize: 10, fontWeight: "700", marginTop: 4 }, operatorRow: { gap: 6, paddingTop: 8, alignItems: "center", flexDirection: "row", flexWrap: "wrap" }, operatorLabel: { flexDirection: "row", alignItems: "center", gap: 4, marginRight: 2 }, operatorChip: { minHeight: 34, paddingHorizontal: 10, borderRadius: 999, borderWidth: 1, flexDirection: "row", alignItems: "center", gap: 4 }, feedTableHead: { flexDirection: "row", marginTop: 16, paddingBottom: 6, borderBottomWidth: 1 }, feedTableRow: { paddingVertical: 9, borderBottomWidth: 1 }, feedTableCells: { flexDirection: "row", alignItems: "center" }, feedCell: { flex: 1, fontSize: 11 }, appShell: { flex: 1, width: "100%", alignSelf: "center" }, scrollContent: { paddingTop: 14, paddingBottom: 26 }, loading: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 }, loadingText: { fontSize: 14, fontWeight: "700" }, header: { paddingHorizontal: 20, paddingBottom: 12 }, brandRow: { flexDirection: "row", alignItems: "center", gap: 11 }, captionRow: { flexDirection: "row", alignItems: "center", gap: 7, marginTop: 3, flexWrap: "wrap" }, headerActions: { flexDirection: "row", alignItems: "center", gap: 6 }, logo: { width: 42, height: 42, borderRadius: 14, alignItems: "center", justifyContent: "center" }, appName: { fontSize: 18, fontWeight: "900", letterSpacing: -0.4 }, appCaption: { fontSize: 11 }, syncBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 999 }, syncBadgeText: { fontSize: 10, fontWeight: "900", letterSpacing: 0.2 }, modeSwitch: { minHeight: 36, maxWidth: 140, borderRadius: 11, paddingHorizontal: 8, flexDirection: "row", gap: 5, alignItems: "center", borderWidth: 1 }, modeLabel: { fontSize: 11, fontWeight: "800", flexShrink: 1 }, modeOptions: { gap: 7, paddingTop: 12 }, modeOption: { paddingHorizontal: 11, paddingVertical: 8, borderRadius: 999 }, modeOptionText: { fontSize: 11, fontWeight: "800" }, welcomeRow: { flexDirection: "row", alignItems: "flex-start", marginBottom: 22, gap: 10 }, eyebrowLarge: { fontSize: 11, fontWeight: "900", letterSpacing: 1.2, marginBottom: 5 }, pageTitle: { fontSize: 29, fontWeight: "900", letterSpacing: -1 }, pageSubtitle: { fontSize: 13, lineHeight: 19, marginTop: 5 }, liveBadge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 7, flexDirection: "row", alignItems: "center", gap: 5 }, liveDot: { width: 6, height: 6, borderRadius: 6, backgroundColor: "#FFFFFF" }, kpiGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 18 }, kpiGridTablet: { flexWrap: "nowrap" }, cardIntro: { fontSize: 13, lineHeight: 19, marginBottom: 14 }, chipsRow: { gap: 8, paddingBottom: 12 }, smallChips: { gap: 6 }, filterChip: { minHeight: 36, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, alignItems: "center", justifyContent: "center" }, composer: { borderRadius: 13, padding: 10, marginBottom: 10 }, noteInput: { minHeight: 68, borderWidth: 1, borderRadius: 10, padding: 11, textAlignVertical: "top", fontSize: 13 }, composerOptions: { gap: 8, marginTop: 8 }, primaryButton: { minHeight: 44, borderRadius: 11, paddingHorizontal: 13, flexDirection: "row", alignItems: "center", gap: 7, alignSelf: "flex-start" }, noteRow: { minHeight: 70, paddingVertical: 11, borderBottomWidth: 1, flexDirection: "row", alignItems: "center", gap: 9 }, noteMarker: { width: 5, height: 40, borderRadius: 4 }, noteBody: { flex: 1, minWidth: 0 }, noteMeta: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 5 }, noteShift: { fontSize: 12, fontWeight: "900" }, noteTime: { fontSize: 11 }, noteText: { fontSize: 13, lineHeight: 18 }, empty: { paddingVertical: 16, fontSize: 13 }, scheduleHeader: { flexDirection: "row", justifyContent: "space-between", paddingBottom: 7 }, tableLabel: { fontSize: 10, fontWeight: "900", letterSpacing: 0.7, flex: 1 }, scheduleRow: { flexDirection: "row", alignItems: "center", paddingVertical: 13, borderTopWidth: 1, gap: 8 }, scheduleTime: { flex: 1 }, timeText: { fontWeight: "900", fontSize: 13 }, ovenText: { fontSize: 10, marginTop: 3 }, scheduleProduct: { flex: 1.2, fontSize: 12, fontWeight: "800" }, alertBanner: { borderRadius: 15, padding: 15, flexDirection: "row", gap: 11, alignItems: "center", marginBottom: 16 }, alertTitle: { fontWeight: "900", fontSize: 13 }, alertText: { fontSize: 12, marginTop: 3, lineHeight: 17 }, pageIntro: { marginBottom: 22 }, recipeGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 }, recipeCardTablet: { width: "48.8%" }, recipeTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 7 }, recipeYield: { fontSize: 11, flexShrink: 1, textAlign: "right" }, recipeName: { fontSize: 17, fontWeight: "900", lineHeight: 22, marginTop: 13, minHeight: 44 }, recipeStats: { flexDirection: "row", gap: 10, marginTop: 18, paddingTop: 12, borderTopWidth: 1, borderTopColor: "#E2E8F0" }, recipeActions: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 16 }, outlineButton: { minHeight: 44, borderWidth: 1, borderRadius: 11, paddingHorizontal: 11, flexDirection: "row", alignItems: "center", gap: 6 }, outlineButtonText: { fontSize: 12, fontWeight: "800" }, calculatorRow: { flexDirection: "row", alignItems: "flex-end", gap: 10, marginBottom: 12 }, field: { flex: 1, minWidth: 110 }, fieldLabel: { fontSize: 11, fontWeight: "800", marginBottom: 6 }, fieldInput: { height: 44, borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, fontSize: 14, fontWeight: "800" }, resultBox: { minWidth: 106, borderRadius: 10, padding: 8, height: 64, justifyContent: "center" }, resultLabel: { fontSize: 10, fontWeight: "800" }, resultValue: { fontSize: 20, fontWeight: "900", marginTop: 2 }, ingredientRow: { flexDirection: "row", alignItems: "center", minHeight: 44, borderBottomWidth: 1, gap: 8 }, ingredientName: { flex: 1, fontSize: 13 }, ingredientPercent: { width: 42, fontSize: 11, textAlign: "right" }, ingredientGrams: { width: 84, fontSize: 13, fontWeight: "900", textAlign: "right" }, methodNote: { marginTop: 13, fontSize: 12, lineHeight: 18 }, inputGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 16 }, tempResult: { borderRadius: 14, minHeight: 76, padding: 15, flexDirection: "row", alignItems: "center", gap: 11 }, tempLabel: { fontSize: 13, fontWeight: "900" }, tempFormula: { fontSize: 11, marginTop: 4 }, tempValue: { fontSize: 28, fontWeight: "900" }, modalBackdrop: { flex: 1, justifyContent: "flex-end" }, labelSheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, maxHeight: "92%" }, modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }, modalTitle: { fontSize: 24, fontWeight: "900" }, labelPreview: { borderWidth: 1, borderRadius: 14, padding: 18, marginBottom: 13 }, labelBrand: { fontSize: 12, fontWeight: "900", letterSpacing: 1.5 }, labelProduct: { fontSize: 19, fontWeight: "900", marginTop: 10, lineHeight: 24 }, labelSmall: { fontSize: 10, fontWeight: "800", letterSpacing: 0.5, marginTop: 18, lineHeight: 14 }, labelIngredients: { fontSize: 14, lineHeight: 21, marginTop: 6 }, allergenLegend: { borderRadius: 9, padding: 10, flexDirection: "row", gap: 8, alignItems: "center", marginTop: 15 }, kanbanRow: { gap: 10, paddingBottom: 4 }, kanbanColumn: { borderRadius: 14, padding: 10, minHeight: 190 }, kanbanHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }, kanbanTitle: { fontSize: 12, fontWeight: "900" }, countBadge: { width: 24, height: 24, borderRadius: 8, alignItems: "center", justifyContent: "center" }, batchCard: { borderWidth: 1, borderRadius: 11, padding: 11, marginBottom: 8 }, batchName: { fontSize: 13, lineHeight: 17, fontWeight: "900" }, batchQty: { fontSize: 11, marginTop: 5 }, timerRow: { flexDirection: "row", gap: 5, alignItems: "center", marginTop: 11 }, batchActions: { flexDirection: "row", gap: 6, marginTop: 10, flexWrap: "wrap" }, advanceButton: { minHeight: 32, borderRadius: 8, paddingHorizontal: 9, flexDirection: "row", gap: 4, alignItems: "center" }, traceButton: { minHeight: 32, borderRadius: 8, paddingHorizontal: 8, flexDirection: "row", gap: 4, alignItems: "center", borderWidth: 1 }, twoColumns: { flexDirection: "row", gap: 10 }, columnCard: { flex: 1 }, starterHero: { flexDirection: "row", alignItems: "center", gap: 10 }, starterIcon: { width: 44, height: 44, borderRadius: 13, alignItems: "center", justifyContent: "center" }, starterTitle: { fontWeight: "900", fontSize: 15, marginBottom: 4 }, feedRow: { borderTopWidth: 1, marginTop: 15, paddingTop: 14, flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }, timerItem: { marginBottom: 18 }, timerItemTop: { flexDirection: "row", justifyContent: "space-between", marginBottom: 8, gap: 8 }, progressTrack: { height: 8, borderRadius: 8, overflow: "hidden" }, progressFill: { height: "100%", borderRadius: 8 }, subnav: { flexDirection: "row", borderRadius: 12, padding: 4, gap: 3, marginBottom: 16 }, subnavItem: { flex: 1, minHeight: 40, borderRadius: 9, alignItems: "center", justifyContent: "center" }, stockRow: { minHeight: 67, borderBottomWidth: 1, flexDirection: "row", alignItems: "center", gap: 9 }, stockIcon: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" }, stockName: { fontSize: 12, fontWeight: "800", marginBottom: 3 }, stockQty: { alignItems: "flex-end" }, tempLog: { minHeight: 63, borderBottomWidth: 1, flexDirection: "row", alignItems: "center", gap: 10 }, tempCheck: { width: 30, height: 30, borderRadius: 10, alignItems: "center", justifyContent: "center" }, complianceFooter: { borderRadius: 10, padding: 10, flexDirection: "row", gap: 8, marginTop: 13, alignItems: "center" }, returnRow: { minHeight: 65, borderBottomWidth: 1, flexDirection: "row", alignItems: "center", gap: 10 }, returnIcon: { width: 35, height: 35, borderRadius: 10, alignItems: "center", justifyContent: "center" }, suggestion: { borderRadius: 12, padding: 12, flexDirection: "row", gap: 9, marginTop: 14 }, marginRow: { minHeight: 48, borderBottomWidth: 1, flexDirection: "row", alignItems: "center", gap: 4, fontSize: 12 }, chartLegend: { flexDirection: "row", gap: 18, marginBottom: 12 }, legendItem: { flexDirection: "row", alignItems: "center", gap: 5 }, legendDot: { width: 8, height: 8, borderRadius: 8 }, chart: { height: 170, flexDirection: "row", alignItems: "flex-end", gap: 7, borderBottomWidth: 1, borderLeftWidth: 1, paddingHorizontal: 10 }, barGroup: { flex: 1, height: "100%", flexDirection: "row", alignItems: "flex-end", gap: 2 }, bar: { flex: 1, borderTopLeftRadius: 4, borderTopRightRadius: 4, minHeight: 5 }, chartLabels: { flexDirection: "row", justifyContent: "space-between", paddingTop: 8 }, flourRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10 }, flourTrack: { flex: 1, height: 10, borderRadius: 5, overflow: "hidden" }, flourFill: { height: "100%", borderRadius: 5 }, traceCard: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 12, borderBottomWidth: 1 }, traceHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }, traceRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 7 }, traceLabel: { fontSize: 10, fontWeight: "900", letterSpacing: 0.6 }, traceValue: { fontSize: 13, fontWeight: "800" }, traceIngredient: { paddingVertical: 10, borderBottomWidth: 1, flexDirection: "row", alignItems: "center", gap: 10 }, traceIngName: { fontSize: 13, fontWeight: "800" }, traceIngLot: { fontSize: 11, marginTop: 3 }, traceIngPct: { fontSize: 12, fontWeight: "900" }, signatureRow: { flexDirection: "row", borderTopWidth: 1, marginTop: 18, paddingTop: 15, gap: 20 }, signatureCell: { flex: 1 }, signatureLine: { height: 1, marginTop: 24 }, iconButton: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center" }, bottomNav: { borderTopWidth: 1, minHeight: 68, flexDirection: "row", paddingHorizontal: 8 }, navItem: { flex: 1, alignItems: "center", justifyContent: "center", minHeight: 64 },
});
