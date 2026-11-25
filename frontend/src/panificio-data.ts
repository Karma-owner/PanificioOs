export type Shift = "Notte" | "Mattina" | "Pomeriggio";
export type Priority = "Normale" | "Urgente" | "Manutenzione";
export type ProductionStage = "Da Impastare" | "In Puntata" | "In Cella" | "Formatura" | "In Forno" | "Sfornato";

export type Ingredient = { name: string; grams: number; baker: number; allergen?: string };
export type Recipe = {
  id: string;
  name: string;
  category: string;
  yield: string;
  hydration: number;
  loss: number;
  ingredients: Ingredient[];
  method: string;
  accent: "brand" | "success" | "info" | "warning";
};

export type HandoverNote = { id: string; shift: Shift; priority: Priority; text: string; time: string; operator?: string; at?: string };
/** Consumo farina scaricato dal magazzino al passaggio "In Puntata". */
export type FlourUsage = { stockId: string; name: string; lot: string; kg: number };
export type Batch = { id: string; product: string; recipeId?: string; quantity: string; stage: ProductionStage; timerEndsAt?: string; operator?: string; createdAt?: string; flourUsage?: FlourUsage[] };
export type StockItem = { id: string; name: string; qty: number; unit: string; min: number; lot: string; expiry: string; allergen?: string; receivedAt?: string; operator?: string };
export type ReturnItem = { id?: string; product: string; kg: number; destination: string; value: string; at?: string; operator?: string };
export type StarterType = "Pasta Madre" | "Licoli";
/** Rinfresco: per la Pasta Madre solida si registrano anche temperatura al cuore e bagnetto/legatura. */
export type Feeding = { id: string; at: string; starter?: StarterType; ratio: string; ambientTemp: number; coreTemp?: number; binding?: string; ph?: number; notes: string; operator: string };
export type TempLog = { id: string; area: string; value: number; min: number; max: number; at: string; operator: string };

export type AppState = {
  mode: string;
  notes: HandoverNote[];
  batches: Batch[];
  stock: StockItem[];
  returns: ReturnItem[];
  recipes: Recipe[];
  feedings: Feeding[];
  tempLogs: TempLog[];
};

export const operators = ["Mario – Capoturno", "Luca – Notte", "Amministratore"];
export const tempAreas = [
  { area: "Cella 1", min: 0, max: 5 },
  { area: "Cella 2", min: 0, max: 5 },
  { area: "Frigo lieviti", min: 2, max: 6 },
  { area: "Abbattitore", min: -40, max: -18 },
];
export const returnDestinations = [
  { label: "Pangrattato", pricePerKg: 2 },
  { label: "Grissini", pricePerKg: 3 },
  { label: "Crostini", pricePerKg: 2.5 },
  { label: "Scarto", pricePerKg: 0 },
];
export const feedRatios = ["1:1:1", "1:2:2", "1:3:3", "1:5:5"];
export const solidRatios = ["1:1:0.45", "1:1:0.5", "1:2:0.9"];
export const bindingOptions = ["Nessuno", "Bagnetto", "Legatura", "Bagnetto + legatura"];

export const formatRange = (min: number, max: number) => (min <= -40 ? `≤ ${max}°C` : `${min}–${max}°C`);
export const formatTemp = (value: number) => `${value > 0 ? "+" : ""}${value.toLocaleString("it-IT", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}°C`;
export const formatClock = (iso: string) => new Date(iso).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
export const formatDateTime = (iso: string) => new Date(iso).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

/** Tipo di lievito: i record storici senza `starter` sono considerati Licoli. */
export const starterOf = (feeding: Feeding): StarterType => feeding.starter ?? "Licoli";
export const starterTypes: StarterType[] = ["Pasta Madre", "Licoli"];
export const starterLabel = (starter: StarterType) => (starter === "Pasta Madre" ? "Pasta Madre Solida" : "Licoli");
/** Ultimo rinfresco registrato per il tipo di lievito indicato. */
export const latestFeeding = (state: AppState, starter: StarterType): Feeding | undefined =>
  state.feedings.filter((item) => starterOf(item) === starter).sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())[0];

/**
 * Stima del picco di maturazione del lievito.
 * - Licoli (liquido, 100% idratazione): base 2h + 2h per ogni parte di farina rispetto al lievito.
 * - Pasta Madre solida (~45% idratazione): più lenta a partire ma con rapporto basso (1:1) → base 3h + 1h per parte.
 * Temperature sotto i 26°C allungano i tempi dell'8% per grado (per la solida si usa la temperatura al cuore se rilevata).
 */
export function feedingPeak(feeding: Feeding): { readyAt: Date; label: string; tone: "info" | "success" | "warning"; progress: number } {
  const parts = feeding.ratio.split(":").map((part) => Number(part.replace(",", ".")));
  const factor = parts.length >= 2 && parts[0] > 0 ? parts[1] / parts[0] : 1;
  const solid = starterOf(feeding) === "Pasta Madre";
  const baseHours = solid ? 3 + factor : 2 + 2 * factor;
  const refTemp = solid && feeding.coreTemp !== undefined ? feeding.coreTemp : feeding.ambientTemp;
  const tempFactor = Math.min(Math.max(1 + (26 - refTemp) * 0.08, 0.6), 2.2);
  const hours = baseHours * tempFactor;
  const start = new Date(feeding.at).getTime();
  const readyAt = new Date(start + hours * 3600000);
  const now = Date.now();
  const progress = Math.min(Math.max((now - start) / (hours * 3600000), 0), 1);
  if (now < readyAt.getTime() - 3600000) return { readyAt, label: "In crescita", tone: "info", progress };
  if (now <= readyAt.getTime() + 3600000) return { readyAt, label: "Al picco · pronto", tone: "success", progress };
  return { readyAt, label: "Oltre il picco · rinfrescare", tone: "warning", progress };
}

export function currentShift(date = new Date()): Shift {
  const hour = date.getHours();
  if (hour >= 22 || hour < 6) return "Notte";
  return hour < 14 ? "Mattina" : "Pomeriggio";
}

export const recipes: Recipe[] = [
  {
    id: "pane-0", name: "Pane Comune Tipo 0 (Metodo Diretto)", category: "Pane quotidiano", yield: "30 filoni da 500 g", hydration: 62, loss: 12, accent: "brand", method: "Impasto diretto · 24°C · Puntata 90 min",
    ingredients: [
      { name: "Farina tipo 0", grams: 10000, baker: 100, allergen: "GLUTINE" }, { name: "Acqua", grams: 6200, baker: 62 }, { name: "Sale marino", grams: 200, baker: 2 }, { name: "Lievito di birra", grams: 150, baker: 1.5 },
    ],
  },
  {
    id: "ciabatta", name: "Ciabatta Alta Idratazione (con Biga 40%)", category: "Speciale", yield: "24 pezzi da 350 g", hydration: 78, loss: 15, accent: "info", method: "Biga 40% · 18h a 18°C · Puntata 60 min",
    ingredients: [
      { name: "Farina tipo 0 forte", grams: 10000, baker: 100, allergen: "GLUTINE" }, { name: "Acqua", grams: 7800, baker: 78 }, { name: "Sale", grams: 220, baker: 2.2 }, { name: "Lievito di birra", grams: 80, baker: 0.8 }, { name: "Olio extravergine", grams: 300, baker: 3 },
    ],
  },
  {
    id: "integrale", name: "Pane Integrale 100% Lievito Madre (Licoli)", category: "Lievito madre", yield: "20 pagnotte da 600 g", hydration: 75, loss: 13, accent: "success", method: "Licoli 100% · Autolisi 60 min · Cella 12h",
    ingredients: [
      { name: "Farina integrale", grams: 10000, baker: 100, allergen: "GLUTINE" }, { name: "Acqua", grams: 7500, baker: 75 }, { name: "Licoli maturo", grams: 2000, baker: 20, allergen: "GLUTINE" }, { name: "Sale", grams: 220, baker: 2.2 },
    ],
  },
  {
    id: "focaccia", name: "Focaccia Pugliese", category: "Focacce", yield: "18 teglie 30×40", hydration: 72, loss: 10, accent: "warning", method: "Patata lessa · Puntata 120 min · Cottura 230°C",
    ingredients: [
      { name: "Farina tipo 0", grams: 7000, baker: 70, allergen: "GLUTINE" }, { name: "Semola rimacinata", grams: 3000, baker: 30, allergen: "GLUTINE" }, { name: "Acqua", grams: 7200, baker: 72 }, { name: "Patate lesse", grams: 1500, baker: 15 }, { name: "Olio EVO", grams: 600, baker: 6 }, { name: "Sale", grams: 220, baker: 2.2 }, { name: "Pomodoro", grams: 1800, baker: 18 },
    ],
  },
];

const inMinutes = (minutes: number) => new Date(Date.now() + minutes * 60000).toISOString();
const hoursAgo = (hours: number) => new Date(Date.now() - hours * 3600000).toISOString();
/** Data ISO di `days` giorni fa all'ora locale indicata. */
const daysAgo = (days: number, hour: number) => { const date = new Date(); date.setDate(date.getDate() - days); date.setHours(hour, 0, 0, 0); return date.toISOString(); };
const clock = (iso: string) => new Date(iso).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });

export function makeDemoState(): AppState {
  return {
    mode: "Bottega Artigianale",
    recipes,
    // Note di passaggio turno: oggi + giorni precedenti (per l'archivio ispezioni ASL).
    notes: [
      { id: "n1", shift: "Notte", priority: "Urgente", text: "Biga per domani pronta in cella 2 a 18°C", time: clock(hoursAgo(3)), at: hoursAgo(3), operator: "Luca – Notte" },
      { id: "n2", shift: "Mattina", priority: "Manutenzione", text: "Forno 1: verificare platea bassa prima delle 14:00", time: clock(hoursAgo(2)), at: hoursAgo(2), operator: "Mario – Capoturno" },
      { id: "n3", shift: "Mattina", priority: "Normale", text: "Licoli rinfrescato · rapporto 1:2:2", time: clock(hoursAgo(1)), at: hoursAgo(1), operator: "Mario – Capoturno" },
      { id: "n4", shift: "Pomeriggio", priority: "Normale", text: "Prenotazione GDO: aggiungere 12 ciabatte al carico", time: clock(daysAgo(1, 13)), at: daysAgo(1, 13), operator: "Amministratore" },
      { id: "n5", shift: "Mattina", priority: "Manutenzione", text: "Sostituita guarnizione cella 2", time: clock(daysAgo(2, 9)), at: daysAgo(2, 9), operator: "Mario – Capoturno" },
    ],
    // Rinfreschi di Licoli (liquido) e Pasta Madre solida.
    feedings: [
      { id: "f1", at: daysAgo(1, 20), starter: "Licoli", ratio: "1:1:1", ambientTemp: 22, ph: 4.0, notes: "Alveolatura fitta, buona forza", operator: "Luca – Notte" },
      { id: "f2", at: hoursAgo(5), starter: "Licoli", ratio: "1:2:2", ambientTemp: 24, ph: 4.1, notes: "Bolle regolari, raddoppio in corso", operator: "Luca – Notte" },
      { id: "f3", at: daysAgo(1, 18), starter: "Pasta Madre", ratio: "1:1:0.45", ambientTemp: 23, coreTemp: 25, binding: "Legatura", notes: "Legata in tela, buona tenacità", operator: "Mario – Capoturno" },
      { id: "f4", at: hoursAgo(3.5), starter: "Pasta Madre", ratio: "1:1:0.45", ambientTemp: 26, coreTemp: 27, binding: "Bagnetto", notes: "Bagnetto a 38°C prima del rinfresco, cupola ben tesa", operator: "Mario – Capoturno" },
    ],
    tempLogs: [
      { id: "t1", area: "Cella 1", value: 4.2, min: 0, max: 5, at: hoursAgo(1), operator: "Mario – Capoturno" },
      { id: "t2", area: "Cella 2", value: 7.8, min: 0, max: 5, at: hoursAgo(2), operator: "Luca – Notte" },
      { id: "t3", area: "Frigo lieviti", value: 5.1, min: 2, max: 6, at: hoursAgo(1), operator: "Mario – Capoturno" },
      { id: "t4", area: "Abbattitore", value: -18.4, min: -40, max: -18, at: hoursAgo(1), operator: "Mario – Capoturno" },
      { id: "t5", area: "Cella 1", value: 3.9, min: 0, max: 5, at: daysAgo(1, 8), operator: "Mario – Capoturno" },
      { id: "t6", area: "Cella 2", value: 4.4, min: 0, max: 5, at: daysAgo(1, 8), operator: "Mario – Capoturno" },
      { id: "t7", area: "Abbattitore", value: -19.1, min: -40, max: -18, at: daysAgo(2, 8), operator: "Luca – Notte" },
      { id: "t8", area: "Cella 2", value: 6.2, min: 0, max: 5, at: daysAgo(2, 18), operator: "Luca – Notte" },
    ],
    batches: [
      { id: "b1", product: "Pane Comune Tipo 0", recipeId: "pane-0", quantity: "30 × 500 g", stage: "In Cella", timerEndsAt: inMinutes(102) },
      { id: "b2", product: "Ciabatta Alta Idratazione", recipeId: "ciabatta", quantity: "24 × 350 g", stage: "Formatura", timerEndsAt: inMinutes(28) },
      { id: "b3", product: "Focaccia Pugliese", recipeId: "focaccia", quantity: "18 teglie", stage: "In Forno", timerEndsAt: inMinutes(11) },
      { id: "b4", product: "Pane Integrale Licoli", recipeId: "integrale", quantity: "20 × 600 g", stage: "Da Impastare" },
      { id: "b5", product: "Grissini recuperati", quantity: "8 kg", stage: "Sfornato" },
    ],
    stock: [
      { id: "s1", name: "Farina Tipo 0 Forte W 300", qty: 182, unit: "kg", min: 80, lot: "LOT-0F-2406", expiry: "18/09/2026", allergen: "GLUTINE" },
      { id: "s2", name: "Farina Integrale W 220", qty: 42, unit: "kg", min: 50, lot: "LOT-INT-118", expiry: "02/08/2026", allergen: "GLUTINE" },
      { id: "s3", name: "Lievito di birra fresco", qty: 7.5, unit: "kg", min: 5, lot: "LDB-0626", expiry: "14/07/2026" },
      { id: "s4", name: "Olio EVO 100% italiano", qty: 38, unit: "L", min: 12, lot: "EVO-PUG-55", expiry: "12/12/2026" },
      { id: "s6", name: "Semola rimacinata di grano duro", qty: 35, unit: "kg", min: 20, lot: "SEM-RIM-2205", expiry: "15/10/2026", allergen: "GLUTINE" },
      { id: "s5", name: "Semi di sesamo", qty: 2.4, unit: "kg", min: 4, lot: "SES-8841", expiry: "30/11/2026", allergen: "SESAMO" },
    ],
    returns: [
      { id: "r1", product: "Pane Comune", kg: 4.2, destination: "Pangrattato", value: "€ 8,40" },
      { id: "r2", product: "Focaccia Pugliese", kg: 1.8, destination: "Grissini", value: "€ 5,40" },
      { id: "r3", product: "Ciabatta", kg: 0.9, destination: "Scarto", value: "€ 0,00" },
      { id: "r4", product: "Pane Comune", kg: 3.1, destination: "Crostini", value: "€ 7,75", at: daysAgo(1, 19), operator: "Amministratore" },
    ],
  };
}

export const demoState: AppState = makeDemoState();

export const stages: ProductionStage[] = ["Da Impastare", "In Puntata", "In Cella", "Formatura", "In Forno", "Sfornato"];
