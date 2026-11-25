import { AppState, Batch, FlourUsage, ProductionStage, Recipe, StockItem, stages } from "@/src/panificio-data";

/* ------------------------------------------------------------------ */
/* Date: confronto per giorno locale (non UTC) e chiavi d'archivio      */
/* ------------------------------------------------------------------ */

/** Chiave AAAA-MM-GG nel fuso orario locale del laboratorio. */
export const dayKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

/** Converte una chiave AAAA-MM-GG in Date locale (mezzanotte). */
export const dateFromKey = (key: string) => { const [y, m, d] = key.split("-").map(Number); return new Date(y, m - 1, d); };

/**
 * Vero se il record cade nel giorno indicato.
 * I record demo/storici senza data vengono attribuiti alla giornata odierna.
 */
export function onDay(iso: string | undefined, day: Date): boolean {
  if (!iso) return dayKey(day) === dayKey(new Date());
  return dayKey(new Date(iso)) === dayKey(day);
}

/** Giornate con almeno un registro (note, HACCP, rinfreschi, resi, lotti), dalla più recente. Oggi è sempre incluso. */
export function archiveDays(state: AppState): string[] {
  const keys = new Set<string>([dayKey(new Date())]);
  const add = (iso?: string) => { if (iso) keys.add(dayKey(new Date(iso))); };
  state.notes.forEach((item) => add(item.at));
  state.tempLogs.forEach((item) => add(item.at));
  state.feedings.forEach((item) => add(item.at));
  state.returns.forEach((item) => add(item.at));
  state.batches.forEach((item) => add(item.createdAt));
  return Array.from(keys).sort().reverse();
}

/* ------------------------------------------------------------------ */
/* Tempi standard delle fasi e stima dell'orario reale di infornata    */
/* ------------------------------------------------------------------ */

type Durations = Record<ProductionStage, number>;
const defaultDurations: Durations = { "Da Impastare": 20, "In Puntata": 90, "In Cella": 60, Formatura: 30, "In Forno": 40, Sfornato: 0 };

/** Minuti standard per fase, specifici per ricetta (es. integrale con lunga maturazione in cella). */
const recipeDurations: Record<string, Partial<Durations>> = {
  "pane-0": { "In Puntata": 90, "In Cella": 60, Formatura: 30, "In Forno": 40 },
  ciabatta: { "In Puntata": 60, "In Cella": 45, Formatura: 20, "In Forno": 25 },
  integrale: { "In Puntata": 120, "In Cella": 720, Formatura: 30, "In Forno": 50 },
  focaccia: { "In Puntata": 120, "In Cella": 0, Formatura: 30, "In Forno": 25 },
};

export const stageDuration = (recipeId: string | undefined, stage: ProductionStage) => recipeDurations[recipeId ?? ""]?.[stage] ?? defaultDurations[stage];

/** Fine della fase appena iniziata: usata per riavviare il conto alla rovescia all'avanzamento. */
export function stageTimerFrom(recipeId: string | undefined, stage: ProductionStage, now = Date.now()): string | undefined {
  const minutes = stageDuration(recipeId, stage);
  return minutes > 0 ? new Date(now + minutes * 60000).toISOString() : undefined;
}

/**
 * Orario reale stimato di infornata:
 * fine della fase attuale (dal timer o dalla durata standard) + durata standard di tutte le fasi
 * intermedie fino a "In Forno". Per i lotti già in forno restituisce l'inizio cottura stimato.
 */
export function estimateBakeTime(batch: Batch, now = Date.now()): { at: Date; inOven: boolean } | null {
  const index = stages.indexOf(batch.stage);
  const ovenIndex = stages.indexOf("In Forno");
  if (index < 0 || index > ovenIndex) return null;
  const currentEnd = batch.timerEndsAt ? Math.max(new Date(batch.timerEndsAt).getTime(), now) : now + stageDuration(batch.recipeId, batch.stage) * 60000;
  if (index === ovenIndex) {
    // In forno: inizio cottura = fine cottura − durata standard di cottura.
    return { at: new Date(currentEnd - stageDuration(batch.recipeId, "In Forno") * 60000), inOven: true };
  }
  let minutes = 0;
  for (let i = index + 1; i < ovenIndex; i += 1) minutes += stageDuration(batch.recipeId, stages[i]);
  return { at: new Date(currentEnd + minutes * 60000), inOven: false };
}

/* ------------------------------------------------------------------ */
/* Magazzino: abbinamento ingrediente ↔ lotto e scarico farine         */
/* ------------------------------------------------------------------ */

/** Abbina un ingrediente di ricetta al lotto di magazzino corrispondente (prima i lotti con scadenza più vicina). */
export function matchStockForIngredient(ingredientName: string, stock: StockItem[]): StockItem | undefined {
  const normalized = ingredientName.toLowerCase();
  const rules: [string, string][] = [["integrale", "integrale"], ["semola", "semola"], ["forte", "forte"], ["olio", "olio"], ["lievito", "lievito"], ["sesamo", "sesamo"], ["farina tipo 0", "tipo 0"]];
  for (const [ingredientKey, stockKey] of rules) {
    if (!normalized.includes(ingredientKey)) continue;
    const match = stock.find((item) => item.name.toLowerCase().includes(stockKey) && item.qty > 0) ?? stock.find((item) => item.name.toLowerCase().includes(stockKey));
    if (match) return match;
  }
  return undefined;
}

const isFlour = (name: string) => /farina|semola/i.test(name);

/** Grammi totali di impasto indicati nella quantità del lotto ("30 × 500 g", "8 kg"), se interpretabili. */
function doughGrams(quantity: string): number | null {
  const pieces = quantity.match(/(\d+(?:[.,]\d+)?)\s*[×x]\s*(\d+(?:[.,]\d+)?)\s*(kg|g)/i);
  if (pieces) return Number(pieces[1].replace(",", ".")) * Number(pieces[2].replace(",", ".")) * (pieces[3].toLowerCase() === "kg" ? 1000 : 1);
  const total = quantity.match(/^\s*(\d+(?:[.,]\d+)?)\s*(kg|g)\b/i);
  if (total) return Number(total[1].replace(",", ".")) * (total[2].toLowerCase() === "kg" ? 1000 : 1);
  return null;
}

export type FlourDeduction = { stock: StockItem[]; usage: FlourUsage[]; warnings: string[] };

/**
 * Calcola lo scarico farine per un lotto che entra "In Puntata".
 * La formula della ricetta è scalata sul peso d'impasto del lotto (se indicato), altrimenti si usa una ricetta intera.
 * La giacenza non scende mai sotto zero; gli avvisi segnalano scorte sotto soglia o materie prime mancanti.
 */
export function deductFlour(batch: Batch, recipe: Recipe | undefined, stock: StockItem[]): FlourDeduction {
  if (!recipe) return { stock, usage: [], warnings: [`${batch.product}: ricetta non collegata, scarico farine non eseguito.`] };
  const recipeTotal = recipe.ingredients.reduce((sum, item) => sum + item.grams, 0);
  const grams = doughGrams(batch.quantity);
  const scale = grams && recipeTotal > 0 ? grams / recipeTotal : 1;
  const next = stock.map((item) => ({ ...item }));
  const usage: FlourUsage[] = [];
  const warnings: string[] = [];
  recipe.ingredients.filter((item) => isFlour(item.name)).forEach((ingredient) => {
    const kg = Math.round((ingredient.grams * scale) / 100) / 10;
    const match = matchStockForIngredient(ingredient.name, next);
    if (!match) { warnings.push(`${ingredient.name}: materia prima non presente in magazzino (${kg.toLocaleString("it-IT")} kg non scaricati).`); return; }
    const item = next.find((entry) => entry.id === match.id)!;
    const taken = Math.min(kg, item.qty);
    item.qty = Math.round((item.qty - taken) * 10) / 10;
    usage.push({ stockId: item.id, name: item.name, lot: item.lot, kg: taken });
    if (taken < kg) warnings.push(`${item.name}: giacenza insufficiente, mancano ${(Math.round((kg - taken) * 10) / 10).toLocaleString("it-IT")} kg.`);
    if (item.qty < item.min) warnings.push(`${item.name}: scorta sotto soglia (${item.qty.toLocaleString("it-IT")} ${item.unit} su minimo ${item.min} ${item.unit}). Riordinare.`);
  });
  return { stock: next, usage, warnings };
}
