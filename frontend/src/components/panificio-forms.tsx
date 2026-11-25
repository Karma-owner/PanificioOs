import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import type { SetStateAction } from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { IconButton } from "@/src/components/panificio-ui";
import { AppState, bindingOptions, feedRatios, Recipe, returnDestinations, solidRatios, StarterType, tempAreas } from "@/src/panificio-data";
import { useTheme } from "@/src/theme";

export type FormKind = "feeding-licoli" | "feeding-madre" | "lot" | "batch" | "return" | "temp";
type Submit = (updater: SetStateAction<AppState>) => void;

const uid = (prefix: string) => `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
const parseNum = (value: string) => (value.trim() === "" ? NaN : Number(value.replace(",", ".")));
const nowClock = () => new Date().toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
const euro = (value: number) => `€ ${value.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function parseItalianDate(value: string): Date | null {
  const match = value.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return null;
  const [, d, m, y] = match.map(Number);
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d ? date : null;
}

function FormSheet({ testID, eyebrow, title, error, submitLabel, onClose, onSubmit, children }: { testID: string; eyebrow: string; title: string; error: string; submitLabel: string; onClose: () => void; onSubmit: () => void; children: React.ReactNode }) {
  const { colors } = useTheme();
  const content = <View style={[styles.backdrop, Platform.OS === "web" ? styles.webOverlay : null, { backgroundColor: colors.surfaceInverse + "CC" }]}>
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.avoid}>
      <View testID={testID} style={[styles.sheet, { backgroundColor: colors.surface }]}>
        <View style={styles.head}>
          <View style={{ flex: 1 }}><Text style={[styles.eyebrow, { color: colors.brand }]}>{eyebrow}</Text><Text style={[styles.title, { color: colors.onSurface }]}>{title}</Text></View>
          <IconButton testID={`${testID}-close`} icon="close" label="Chiudi scheda" onPress={onClose} />
        </View>
        <ScrollView style={styles.body} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>{children}</ScrollView>
        {error ? <View testID={`${testID}-error`} style={[styles.error, { backgroundColor: colors.error }]}><Ionicons name="alert-circle" size={16} color={colors.onError} /><Text style={{ color: colors.onError, fontWeight: "800", fontSize: 12, flex: 1 }}>{error}</Text></View> : null}
        <View style={styles.actions}>
          <Pressable onPress={onClose} style={[styles.secondary, { borderColor: colors.borderStrong }]}><Text style={{ color: colors.onSurface, fontWeight: "800" }}>Annulla</Text></Pressable>
          <Pressable testID={`${testID}-submit`} onPress={onSubmit} style={[styles.primary, { backgroundColor: colors.brand }]}><Ionicons name="checkmark" size={18} color={colors.onBrand} /><Text style={{ color: colors.onBrand, fontWeight: "900" }}>{submitLabel}</Text></Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  </View>;
  return Platform.OS === "web" ? content : <Modal visible transparent animationType="slide" onRequestClose={onClose}>{content}</Modal>;
}

function Field({ label, value, onChangeText, placeholder, numeric, multiline, testID, hint }: { label: string; value: string; onChangeText: (value: string) => void; placeholder?: string; numeric?: boolean; multiline?: boolean; testID: string; hint?: string }) {
  const { colors } = useTheme();
  return <View style={styles.field}>
    <Text style={[styles.label, { color: colors.muted }]}>{label}</Text>
    <TextInput testID={testID} value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={colors.muted} keyboardType={numeric ? "decimal-pad" : "default"} multiline={multiline} style={[styles.input, multiline ? styles.multiline : null, { backgroundColor: colors.surfaceTertiary, color: colors.onSurface, borderColor: colors.border }]} />
    {hint ? <Text style={[styles.hint, { color: colors.muted }]}>{hint}</Text> : null}
  </View>;
}

function Chips({ label, options, value, onChange, testIDPrefix }: { label: string; options: string[]; value: string; onChange: (value: string) => void; testIDPrefix: string }) {
  const { colors } = useTheme();
  return <View style={styles.field}>
    <Text style={[styles.label, { color: colors.muted }]}>{label}</Text>
    <View style={styles.chips}>{options.map((option, index) => { const active = value === option; return <Pressable testID={`${testIDPrefix}-${index}`} key={option} onPress={() => onChange(option)} style={[styles.chip, { backgroundColor: active ? colors.brand : colors.surfaceTertiary, borderColor: active ? colors.brand : colors.border }]}><Text style={{ color: active ? colors.onBrand : colors.onSurfaceTertiary, fontWeight: "800", fontSize: 12 }}>{option}</Text></Pressable>; })}</View>
  </View>;
}

/**
 * Rinfresco lievito: gestisce sia il Licoli (liquido, rapporto 1:2:2, pH)
 * sia la Pasta Madre solida (rapporto 1:1:0.45, temperatura al cuore, bagnetto/legatura).
 */
function FeedingForm({ starter, operator, onClose, onSubmit }: { starter: StarterType; operator: string; onClose: () => void; onSubmit: Submit }) {
  const solid = starter === "Pasta Madre";
  const [time, setTime] = useState(nowClock());
  const [ratio, setRatio] = useState(solid ? "1:1:0.45" : "1:2:2");
  const [temp, setTemp] = useState("");
  const [core, setCore] = useState("");
  const [binding, setBinding] = useState(bindingOptions[0]);
  const [ph, setPh] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  useEffect(() => setError(""), [time, ratio, temp, core, binding, ph, notes]);
  const save = () => {
    const clock = time.trim().match(/^([01]?\d|2[0-3])[:.]([0-5]\d)$/);
    if (!clock) return setError("Inserisci l'orario nel formato HH:MM (es. 04:30).");
    if (!/^\d+(?:[.,]\d+)?(?::\d+(?:[.,]\d+)?){2}$/.test(ratio.trim())) return setError(`Rapporto di rinfresco non valido: usa il formato ${solid ? "1:1:0.45" : "1:2:2"}.`);
    const ambientTemp = parseNum(temp);
    if (Number.isNaN(ambientTemp) || ambientTemp < 5 || ambientTemp > 40) return setError("Temperatura ambiente obbligatoria, tra 5 e 40 °C.");
    const coreTemp = parseNum(core);
    if (solid && (Number.isNaN(coreTemp) || coreTemp < 5 || coreTemp > 40)) return setError("Temperatura al cuore della pasta madre obbligatoria, tra 5 e 40 °C.");
    const phValue = parseNum(ph);
    if (!solid && ph.trim() && (Number.isNaN(phValue) || phValue < 2.5 || phValue > 7.5)) return setError("pH non valido: deve essere compreso tra 2,5 e 7,5.");
    if (notes.trim().length < 3) return setError("Descrivi alveolatura e forza del lievito nelle note.");
    const at = new Date();
    at.setHours(Number(clock[1]), Number(clock[2]), 0, 0);
    // Un orario "futuro" indica un rinfresco fatto ieri sera (es. registrato dopo mezzanotte).
    if (at.getTime() - Date.now() > 5 * 60000) at.setDate(at.getDate() - 1);
    const record = solid
      ? { id: uid("f"), at: at.toISOString(), starter, ratio: ratio.trim(), ambientTemp, coreTemp, binding, notes: notes.trim(), operator }
      : { id: uid("f"), at: at.toISOString(), starter, ratio: ratio.trim(), ambientTemp, ph: ph.trim() ? phValue : undefined, notes: notes.trim(), operator };
    onSubmit((current) => ({ ...current, feedings: [record, ...current.feedings] }));
    onClose();
  };
  return <FormSheet testID="feeding-form" eyebrow={solid ? "PASTA MADRE SOLIDA · LIEVITO MADRE" : "LICOLI · LIEVITO MADRE LIQUIDO"} title="Registra rinfresco" error={error} submitLabel="Salva rinfresco" onClose={onClose} onSubmit={save}>
    <Field testID="feeding-time" label="Orario rinfresco *" value={time} onChangeText={setTime} placeholder="04:30" />
    <Chips testIDPrefix="feeding-ratio" label="Rapporto rapido" options={solid ? solidRatios : feedRatios} value={ratio} onChange={setRatio} />
    <Field testID="feeding-ratio-input" label="Rapporto di rinfresco (lievito : farina : acqua) *" value={ratio} onChangeText={setRatio} placeholder={solid ? "1:1:0.45" : "1:2:2"} />
    <View style={styles.row}>
      <View style={{ flex: 1 }}><Field testID="feeding-temp" label="Temp. ambiente (°C) *" value={temp} onChangeText={setTemp} placeholder="24" numeric /></View>
      {solid
        ? <View style={{ flex: 1 }}><Field testID="feeding-core" label="Temp. al cuore (°C) *" value={core} onChangeText={setCore} placeholder="26" numeric /></View>
        : <View style={{ flex: 1 }}><Field testID="feeding-ph" label="pH (facoltativo)" value={ph} onChangeText={setPh} placeholder="4,1" numeric /></View>}
    </View>
    {solid ? <Chips testIDPrefix="feeding-binding" label="Bagnetto / legatura" options={bindingOptions} value={binding} onChange={setBinding} /> : null}
    <Field testID="feeding-notes" label="Note su alveolatura e forza *" value={notes} onChangeText={setNotes} placeholder="Bolle regolari, cupola ben formata..." multiline />
    <SignedBy operator={operator} />
  </FormSheet>;
}

const allergenOptions = ["Nessuno", "GLUTINE", "SESAMO", "LATTE", "UOVA", "SOIA", "FRUTTA A GUSCIO"];

function LotForm({ operator, onClose, onSubmit }: { operator: string; onClose: () => void; onSubmit: Submit }) {
  const [name, setName] = useState("");
  const [lot, setLot] = useState("");
  const [expiry, setExpiry] = useState("");
  const [qty, setQty] = useState("");
  const [unit, setUnit] = useState("kg");
  const [min, setMin] = useState("");
  const [allergen, setAllergen] = useState("Nessuno");
  const [error, setError] = useState("");
  useEffect(() => setError(""), [name, lot, expiry, qty, unit, min, allergen]);
  const save = () => {
    if (name.trim().length < 3) return setError("Inserisci il nome della materia prima (es. Farina Tipo 0 W330).");
    if (lot.trim().length < 2) return setError("Il numero di lotto del fornitore è obbligatorio.");
    const date = parseItalianDate(expiry);
    if (!date) return setError("Data di scadenza non valida: usa il formato gg/mm/aaaa.");
    const today = new Date(); today.setHours(0, 0, 0, 0);
    if (date < today) return setError("Il lotto risulta già scaduto: non può essere accettato in magazzino.");
    const quantity = parseNum(qty);
    if (Number.isNaN(quantity) || quantity <= 0) return setError("La quantità iniziale deve essere maggiore di zero.");
    const minimum = min.trim() ? parseNum(min) : 0;
    if (Number.isNaN(minimum) || minimum < 0) return setError("La scorta minima deve essere un numero positivo.");
    const expiryLabel = date.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" });
    onSubmit((current) => ({ ...current, stock: [{ id: uid("s"), name: name.trim(), lot: lot.trim().toUpperCase(), expiry: expiryLabel, qty: quantity, unit, min: minimum, allergen: allergen === "Nessuno" ? undefined : allergen, receivedAt: new Date().toISOString(), operator }, ...current.stock] }));
    onClose();
  };
  return <FormSheet testID="lot-form" eyebrow="MAGAZZINO · REGISTRO HACCP" title="Nuovo lotto materia prima" error={error} submitLabel="Registra lotto" onClose={onClose} onSubmit={save}>
    <Field testID="lot-name" label="Nome materia prima *" value={name} onChangeText={setName} placeholder="Farina Tipo 0 W330" />
    <Field testID="lot-number" label="Numero lotto fornitore *" value={lot} onChangeText={setLot} placeholder="LOT-0W330-2606" />
    <Field testID="lot-expiry" label="Data di scadenza (gg/mm/aaaa) *" value={expiry} onChangeText={setExpiry} placeholder="30/09/2026" />
    <View style={styles.row}>
      <View style={{ flex: 1 }}><Field testID="lot-qty" label="Quantità iniziale *" value={qty} onChangeText={setQty} placeholder="250" numeric /></View>
      <View style={{ flex: 1 }}><Field testID="lot-min" label="Scorta minima" value={min} onChangeText={setMin} placeholder="50" numeric /></View>
    </View>
    <Chips testIDPrefix="lot-unit" label="Unità di misura" options={["kg", "L", "pz"]} value={unit} onChange={setUnit} />
    <Chips testIDPrefix="lot-allergen" label="Allergene (Reg. UE 1169/2011)" options={allergenOptions} value={allergen} onChange={setAllergen} />
    <SignedBy operator={operator} />
  </FormSheet>;
}

function BatchForm({ recipes, operator, onClose, onSubmit }: { recipes: Recipe[]; operator: string; onClose: () => void; onSubmit: Submit }) {
  const [recipeId, setRecipeId] = useState(recipes[0]?.id ?? "");
  const [quantity, setQuantity] = useState("");
  const [minutes, setMinutes] = useState("");
  const [error, setError] = useState("");
  useEffect(() => setError(""), [recipeId, quantity, minutes]);
  const recipe = recipes.find((item) => item.id === recipeId);
  const save = () => {
    if (!recipe) return setError("Seleziona una ricetta dal ricettario.");
    if (quantity.trim().length < 1) return setError("Indica la quantità da produrre (es. 30 × 500 g).");
    const mins = minutes.trim() ? parseNum(minutes) : NaN;
    if (minutes.trim() && (Number.isNaN(mins) || mins <= 0 || mins > 2880)) return setError("Tempo di fase non valido (1–2880 minuti).");
    const product = recipe.name.replace(/\s*\(.*\)$/, "");
    onSubmit((current) => ({ ...current, batches: [...current.batches, { id: uid("b"), product, recipeId: recipe.id, quantity: quantity.trim(), stage: "Da Impastare", createdAt: new Date().toISOString(), timerEndsAt: Number.isNaN(mins) ? undefined : new Date(Date.now() + mins * 60000).toISOString(), operator }] }));
    onClose();
  };
  return <FormSheet testID="batch-form" eyebrow="LAVAGNA DI LAVORAZIONE" title="Nuovo impasto" error={error} submitLabel="Aggiungi impasto" onClose={onClose} onSubmit={save}>
    <Chips testIDPrefix="batch-recipe" label="Ricetta *" options={recipes.map((item) => item.name)} value={recipe?.name ?? ""} onChange={(name) => setRecipeId(recipes.find((item) => item.name === name)?.id ?? "")} />
    <Field testID="batch-qty" label="Quantità *" value={quantity} onChangeText={setQuantity} placeholder={recipe?.yield ?? "30 × 500 g"} />
    <Field testID="batch-minutes" label="Durata della fase in corso (minuti)" value={minutes} onChangeText={setMinutes} placeholder="90" numeric hint="Facoltativo: avvia il conto alla rovescia condiviso tra i dispositivi." />
    <SignedBy operator={operator} />
  </FormSheet>;
}

function ReturnForm({ recipes, operator, onClose, onSubmit }: { recipes: Recipe[]; operator: string; onClose: () => void; onSubmit: Submit }) {
  const { colors } = useTheme();
  const products = recipes.map((item) => item.name.replace(/\s*\(.*\)$/, ""));
  const [product, setProduct] = useState(products[0] ?? "");
  const [kg, setKg] = useState("");
  const [destination, setDestination] = useState(returnDestinations[0].label);
  const [error, setError] = useState("");
  useEffect(() => setError(""), [product, kg, destination]);
  const kgValue = parseNum(kg);
  const price = returnDestinations.find((item) => item.label === destination)?.pricePerKg ?? 0;
  const save = () => {
    if (!product) return setError("Seleziona il prodotto invenduto.");
    if (Number.isNaN(kgValue) || kgValue <= 0 || kgValue > 500) return setError("Inserisci i chilogrammi totali (tra 0,1 e 500 kg).");
    onSubmit((current) => ({ ...current, returns: [{ id: uid("r"), product, kg: Math.round(kgValue * 10) / 10, destination, value: euro(kgValue * price), at: new Date().toISOString(), operator }, ...current.returns] }));
    onClose();
  };
  return <FormSheet testID="return-form" eyebrow="CHIUSURA GIORNATA · INVENDUTO" title="Registra reso" error={error} submitLabel="Registra reso" onClose={onClose} onSubmit={save}>
    <Chips testIDPrefix="return-product" label="Prodotto invenduto *" options={products} value={product} onChange={setProduct} />
    <Field testID="return-kg" label="Chilogrammi totali *" value={kg} onChangeText={setKg} placeholder="3,5" numeric />
    <Chips testIDPrefix="return-destination" label="Destinazione di recupero *" options={returnDestinations.map((item) => item.label)} value={destination} onChange={setDestination} />
    <Text testID="return-value-preview" style={[styles.hint, { marginBottom: 10, color: colors.onSurface, fontWeight: "800" }]}>Valore recuperato stimato: {Number.isNaN(kgValue) ? "—" : euro(kgValue * price)}</Text>
    <SignedBy operator={operator} />
  </FormSheet>;
}

function TempForm({ operator, onClose, onSubmit }: { operator: string; onClose: () => void; onSubmit: Submit }) {
  const [area, setArea] = useState(tempAreas[0].area);
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  useEffect(() => setError(""), [area, value]);
  const target = tempAreas.find((item) => item.area === area) ?? tempAreas[0];
  const save = () => {
    const reading = parseNum(value);
    if (Number.isNaN(reading) || reading < -40 || reading > 40) return setError("Inserisci la temperatura rilevata (tra −40 e 40 °C).");
    onSubmit((current) => ({ ...current, tempLogs: [{ id: uid("t"), area, value: reading, min: target.min, max: target.max, at: new Date().toISOString(), operator }, ...current.tempLogs] }));
    onClose();
  };
  return <FormSheet testID="temp-form" eyebrow="REGISTRO TEMPERATURE HACCP" title="Nuovo controllo" error={error} submitLabel="Firma e registra" onClose={onClose} onSubmit={save}>
    <Chips testIDPrefix="temp-area" label="Area di conservazione *" options={tempAreas.map((item) => item.area)} value={area} onChange={setArea} />
    <Field testID="temp-value" label="Temperatura rilevata (°C) *" value={value} onChangeText={setValue} placeholder={target.max < 0 ? "-18,5" : "4,0"} numeric hint={`Intervallo ammesso: ${target.min <= -40 ? `≤ ${target.max}` : `${target.min}–${target.max}`} °C`} />
    <SignedBy operator={operator} />
  </FormSheet>;
}

function SignedBy({ operator }: { operator: string }) {
  const { colors } = useTheme();
  return <View style={[styles.signed, { backgroundColor: colors.brandTertiary }]}><Ionicons name="create-outline" size={16} color={colors.onBrandTertiary} /><Text style={{ color: colors.onBrandTertiary, fontSize: 12, fontWeight: "800", flex: 1 }}>Firma automatica: {operator}</Text></View>;
}

export function PanificioForms({ kind, recipes, operator, onClose, onSubmit }: { kind: FormKind | null; recipes: Recipe[]; operator: string; onClose: () => void; onSubmit: Submit }) {
  if (kind === "feeding-licoli") return <FeedingForm starter="Licoli" operator={operator} onClose={onClose} onSubmit={onSubmit} />;
  if (kind === "feeding-madre") return <FeedingForm starter="Pasta Madre" operator={operator} onClose={onClose} onSubmit={onSubmit} />;
  if (kind === "lot") return <LotForm operator={operator} onClose={onClose} onSubmit={onSubmit} />;
  if (kind === "batch") return <BatchForm recipes={recipes} operator={operator} onClose={onClose} onSubmit={onSubmit} />;
  if (kind === "return") return <ReturnForm recipes={recipes} operator={operator} onClose={onClose} onSubmit={onSubmit} />;
  if (kind === "temp") return <TempForm operator={operator} onClose={onClose} onSubmit={onSubmit} />;
  return null;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: "flex-end" },
  webOverlay: { position: "absolute", top: 0, bottom: 0, left: 0, right: 0, zIndex: 120 },
  avoid: { width: "100%", maxHeight: "94%", alignSelf: "center", maxWidth: 720 },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 28 },
  head: { flexDirection: "row", alignItems: "flex-start", gap: 10, marginBottom: 12 },
  eyebrow: { fontSize: 11, fontWeight: "900", letterSpacing: 1.2, marginBottom: 4 },
  title: { fontSize: 22, fontWeight: "900" },
  body: { maxHeight: 440 },
  field: { marginBottom: 12 },
  label: { fontSize: 11, fontWeight: "800", marginBottom: 6 },
  input: { minHeight: 46, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, fontSize: 14, fontWeight: "700" },
  multiline: { minHeight: 80, paddingTop: 10, textAlignVertical: "top" },
  hint: { fontSize: 11, marginTop: 5 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  chip: { minHeight: 38, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, justifyContent: "center" },
  row: { flexDirection: "row", gap: 10 },
  signed: { borderRadius: 10, padding: 10, flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 },
  error: { borderRadius: 10, padding: 10, flexDirection: "row", alignItems: "center", gap: 8, marginTop: 10 },
  actions: { flexDirection: "row", gap: 10, marginTop: 14 },
  secondary: { flex: 1, minHeight: 48, borderWidth: 1, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  primary: { flex: 2, minHeight: 48, borderRadius: 12, flexDirection: "row", gap: 7, alignItems: "center", justifyContent: "center" },
});
