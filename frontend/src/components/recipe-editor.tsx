import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { IconButton } from "@/src/components/panificio-ui";
import { Ingredient, Recipe } from "@/src/panificio-data";
import { useTheme } from "@/src/theme";

// I 14 allergeni dell'Allegato II del Reg. UE 1169/2011.
export const allergenOptions = ["GLUTINE", "CROSTACEI", "UOVA", "PESCE", "ARACHIDI", "SOIA", "LATTE", "FRUTTA A GUSCIO", "SEDANO", "SENAPE", "SESAMO", "SOLFITI", "LUPINI", "MOLLUSCHI"];
const categoryOptions = ["Pane quotidiano", "Speciale", "Lievito madre", "Focacce", "Pasticceria", "Altro"];
const accents: Recipe["accent"][] = ["brand", "info", "success", "warning"];

type Row = { name: string; pct: string; allergen: string };

const parseNum = (value: string) => (value.trim() === "" ? NaN : Number(value.replace(",", ".")));
const newId = () => `r-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
const toRow = (item: Ingredient): Row => ({ name: item.name, pct: String(item.baker).replace(".", ","), allergen: item.allergen ?? "" });

export function RecipeEditor({ visible, recipe, onClose, onSave, onDelete }: { visible: boolean; recipe: Recipe | null; onClose: () => void; onSave: (recipe: Recipe) => void; onDelete?: () => void }) {
  if (!visible) return null;
  return <EditorSheet key={recipe?.id ?? "new"} recipe={recipe} onClose={onClose} onSave={onSave} onDelete={onDelete} />;
}

function EditorSheet({ recipe, onClose, onSave, onDelete }: { recipe: Recipe | null; onClose: () => void; onSave: (recipe: Recipe) => void; onDelete?: () => void }) {
  const { colors } = useTheme();
  const [name, setName] = useState(recipe?.name ?? "");
  const [category, setCategory] = useState(recipe?.category ?? categoryOptions[0]);
  const [yieldText, setYieldText] = useState(recipe?.yield ?? "");
  const [loss, setLoss] = useState(recipe ? String(recipe.loss) : "");
  const [method, setMethod] = useState(recipe?.method ?? "");
  const [rows, setRows] = useState<Row[]>(recipe ? recipe.ingredients.map(toRow) : [{ name: "Farina", pct: "100", allergen: "GLUTINE" }, { name: "Acqua", pct: "", allergen: "" }, { name: "Sale", pct: "", allergen: "" }]);
  const [openRow, setOpenRow] = useState<number | null>(null);
  const [error, setError] = useState("");

  const setRow = (index: number, patch: Partial<Row>) => setRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  const hydration = Math.round(rows.filter((row) => /acqua/i.test(row.name)).reduce((sum, row) => sum + (Number.isNaN(parseNum(row.pct)) ? 0 : parseNum(row.pct)), 0));

  const save = () => {
    if (name.trim().length < 2) return setError("Inserisci il nome della ricetta.");
    const filled = rows.filter((row) => row.name.trim() !== "" || row.pct.trim() !== "");
    if (filled.length === 0) return setError("Aggiungi almeno un ingrediente.");
    if (filled.length > 30) return setError("Massimo 30 ingredienti.");
    const ingredients: Ingredient[] = [];
    for (const row of filled) {
      const pct = parseNum(row.pct);
      if (row.name.trim() === "") return setError("Ogni ingrediente ha bisogno di un nome.");
      if (Number.isNaN(pct) || pct <= 0 || pct > 1000) return setError(`Percentuale non valida per «${row.name.trim()}».`);
      const baker = Math.round(pct * 100) / 100;
      ingredients.push({ name: row.name.trim(), grams: Math.round(baker * 100), baker, ...(row.allergen ? { allergen: row.allergen } : {}) });
    }
    const lossValue = loss.trim() === "" ? 0 : parseNum(loss);
    if (Number.isNaN(lossValue) || lossValue < 0 || lossValue > 60) return setError("Il calo di cottura deve essere tra 0 e 60 %.");
    onSave({
      id: recipe?.id ?? newId(),
      name: name.trim(),
      category: category.trim() || "Altro",
      yield: yieldText.trim() || "—",
      hydration,
      loss: lossValue,
      ingredients,
      method: method.trim() || "—",
      accent: recipe?.accent ?? accents[Math.max(categoryOptions.indexOf(category), 0) % accents.length],
    });
  };

  const field = (label: string, value: string, onChange: (v: string) => void, opts?: { placeholder?: string; numeric?: boolean; testID?: string }) => (
    <View style={{ marginBottom: 12 }}>
      <Text style={[styles.label, { color: colors.muted }]}>{label}</Text>
      <TextInput testID={opts?.testID} value={value} onChangeText={onChange} placeholder={opts?.placeholder} placeholderTextColor={colors.muted} keyboardType={opts?.numeric ? "numbers-and-punctuation" : "default"} style={[styles.input, { backgroundColor: colors.surfaceTertiary, color: colors.onSurface, borderColor: colors.border }]} />
    </View>
  );

  const content = (
    <View style={[styles.backdrop, Platform.OS === "web" ? styles.webOverlay : null, { backgroundColor: colors.surfaceInverse + "CC" }]}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.avoid}>
        <View testID="recipe-editor" style={[styles.sheet, { backgroundColor: colors.surface }]}>
          <View style={styles.head}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.brand, fontSize: 11, fontWeight: "900", letterSpacing: 1.1 }}>RICETTARIO</Text>
              <Text style={{ color: colors.onSurface, fontSize: 22, fontWeight: "900" }}>{recipe ? "Modifica ricetta" : "Nuova ricetta"}</Text>
            </View>
            <IconButton testID="recipe-editor-close" icon="close" label="Chiudi" onPress={onClose} />
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} style={{ flexGrow: 0 }}>
            {field("NOME DELLA RICETTA *", name, setName, { placeholder: "Es. Pane di grano duro", testID: "recipe-name" })}
            <Text style={[styles.label, { color: colors.muted }]}>CATEGORIA</Text>
            <View style={[styles.chips, { marginBottom: 12 }]}>
              {categoryOptions.map((option) => { const active = category === option; return <Pressable key={option} onPress={() => setCategory(option)} style={[styles.chip, { backgroundColor: active ? colors.brand : colors.surfaceTertiary, borderColor: active ? colors.brand : colors.border }]}><Text style={{ color: active ? colors.onBrand : colors.onSurfaceTertiary, fontSize: 12, fontWeight: "800" }}>{option}</Text></Pressable>; })}
            </View>
            {field("RESA", yieldText, setYieldText, { placeholder: "Es. 30 filoni da 500 g" })}
            {field("CALO DI COTTURA (%)", loss, setLoss, { placeholder: "Es. 12", numeric: true })}
            {field("METODO", method, setMethod, { placeholder: "Es. Impasto diretto · 24°C · Puntata 90 min" })}

            <Text style={[styles.label, { color: colors.muted, marginTop: 4 }]}>INGREDIENTI · percentuale rispetto alla farina</Text>
            <Text style={{ color: colors.muted, fontSize: 12, lineHeight: 17, marginBottom: 8 }}>La farina vale 100. Se usi più farine, ripartisci il 100 tra loro. Le quantità in grammi si calcolano da sole dal ricettario.</Text>
            {rows.map((row, index) => (
              <View key={index} style={[styles.rowBox, { borderColor: colors.border, backgroundColor: colors.surfaceSecondary }]}>
                <View style={styles.rowTop}>
                  <TextInput testID={`ingredient-name-${index}`} value={row.name} onChangeText={(v) => setRow(index, { name: v })} placeholder="Ingrediente" placeholderTextColor={colors.muted} style={[styles.input, { flex: 2, backgroundColor: colors.surfaceTertiary, color: colors.onSurface, borderColor: colors.border }]} />
                  <TextInput testID={`ingredient-pct-${index}`} value={row.pct} onChangeText={(v) => setRow(index, { pct: v })} placeholder="%" placeholderTextColor={colors.muted} keyboardType="numbers-and-punctuation" style={[styles.input, { flex: 1, backgroundColor: colors.surfaceTertiary, color: colors.onSurface, borderColor: colors.border }]} />
                  <Pressable accessibilityLabel="Rimuovi ingrediente" onPress={() => { setRows((current) => current.filter((_, i) => i !== index)); setOpenRow(null); }} hitSlop={8} style={styles.iconBtn}><Ionicons name="trash-outline" size={19} color={colors.error} /></Pressable>
                </View>
                <Pressable testID={`ingredient-allergen-${index}`} onPress={() => setOpenRow(openRow === index ? null : index)} style={styles.allergenToggle}>
                  <Ionicons name="alert-circle-outline" size={15} color={row.allergen ? colors.error : colors.muted} />
                  <Text style={{ color: row.allergen ? colors.error : colors.muted, fontSize: 12, fontWeight: "800" }}>{row.allergen ? `Allergene: ${row.allergen}` : "Nessun allergene dichiarato"}</Text>
                  <Ionicons name={openRow === index ? "chevron-up" : "chevron-down"} size={14} color={colors.muted} />
                </Pressable>
                {openRow === index ? (
                  <View style={styles.chips}>
                    <Pressable onPress={() => { setRow(index, { allergen: "" }); setOpenRow(null); }} style={[styles.chip, { backgroundColor: row.allergen === "" ? colors.brand : colors.surfaceTertiary, borderColor: colors.border }]}><Text style={{ color: row.allergen === "" ? colors.onBrand : colors.onSurfaceTertiary, fontSize: 11, fontWeight: "800" }}>Nessuno</Text></Pressable>
                    {allergenOptions.map((option) => { const active = row.allergen === option; return <Pressable key={option} onPress={() => { setRow(index, { allergen: option }); setOpenRow(null); }} style={[styles.chip, { backgroundColor: active ? colors.error : colors.surfaceTertiary, borderColor: active ? colors.error : colors.border }]}><Text style={{ color: active ? colors.onError : colors.onSurfaceTertiary, fontSize: 11, fontWeight: "800" }}>{option}</Text></Pressable>; })}
                  </View>
                ) : null}
              </View>
            ))}
            <Pressable testID="ingredient-add" onPress={() => setRows((current) => [...current, { name: "", pct: "", allergen: "" }])} style={[styles.addRow, { borderColor: colors.borderStrong }]}><Ionicons name="add" size={16} color={colors.brand} /><Text style={{ color: colors.onSurface, fontWeight: "800", fontSize: 12 }}>Aggiungi ingrediente</Text></Pressable>
            <Text style={{ color: colors.muted, fontSize: 12, marginTop: 10 }}>Idratazione calcolata dagli ingredienti «Acqua»: {hydration}%</Text>
          </ScrollView>
          {error ? <View testID="recipe-editor-error" style={[styles.error, { backgroundColor: colors.error }]}><Ionicons name="alert-circle" size={16} color={colors.onError} /><Text style={{ color: colors.onError, fontWeight: "800", fontSize: 12, flex: 1 }}>{error}</Text></View> : null}
          <View style={styles.actions}>
            {onDelete ? <Pressable testID="recipe-delete" onPress={onDelete} style={[styles.secondary, { borderColor: colors.error }]}><Ionicons name="trash-outline" size={16} color={colors.error} /></Pressable> : null}
            <Pressable onPress={onClose} style={[styles.secondary, { borderColor: colors.borderStrong }]}><Text style={{ color: colors.onSurface, fontWeight: "800" }}>Annulla</Text></Pressable>
            <Pressable testID="recipe-save" onPress={save} style={[styles.primary, { backgroundColor: colors.brand }]}><Ionicons name="checkmark" size={18} color={colors.onBrand} /><Text style={{ color: colors.onBrand, fontWeight: "900" }}>Salva ricetta</Text></Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </View>
  );

  return Platform.OS === "web" ? content : <Modal visible transparent animationType="slide" onRequestClose={onClose}>{content}</Modal>;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: "flex-end" },
  webOverlay: { position: "absolute", top: 0, bottom: 0, left: 0, right: 0, zIndex: 100 },
  avoid: { width: "100%", maxWidth: 720, alignSelf: "center", flex: 1, justifyContent: "flex-end" },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, maxHeight: "94%" },
  head: { flexDirection: "row", alignItems: "flex-start", marginBottom: 14, gap: 10 },
  label: { fontSize: 11, fontWeight: "800", marginBottom: 6 },
  input: { minHeight: 46, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, fontSize: 14 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 },
  chip: { minHeight: 34, paddingHorizontal: 11, borderRadius: 999, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  rowBox: { borderWidth: 1, borderRadius: 12, padding: 10, marginBottom: 8 },
  rowTop: { flexDirection: "row", gap: 8, alignItems: "center" },
  iconBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  allergenToggle: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 36, marginTop: 4 },
  addRow: { minHeight: 44, borderWidth: 1, borderStyle: "dashed", borderRadius: 11, flexDirection: "row", gap: 6, alignItems: "center", justifyContent: "center" },
  error: { borderRadius: 10, padding: 10, flexDirection: "row", gap: 8, alignItems: "center", marginTop: 10 },
  actions: { flexDirection: "row", gap: 10, marginTop: 14, justifyContent: "flex-end", alignItems: "center" },
  secondary: { minHeight: 46, borderWidth: 1, borderRadius: 12, paddingHorizontal: 16, alignItems: "center", justifyContent: "center", flexDirection: "row" },
  primary: { minHeight: 46, borderRadius: 12, paddingHorizontal: 16, flexDirection: "row", gap: 6, alignItems: "center", justifyContent: "center" },
});
