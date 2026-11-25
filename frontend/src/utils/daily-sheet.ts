import { AppState, currentShift, feedingPeak, formatClock, formatDateTime, formatRange, formatTemp, ProductionStage, starterOf, StarterType, TempLog } from "@/src/panificio-data";
import { dayKey, estimateBakeTime, onDay } from "@/src/utils/lab-automation";

export type ScheduleRow = { id: string; time: string; oven: string; product: string; quantity: string; stage: ProductionStage; inOven: boolean };

const ovenTemps: Record<string, number> = { "pane-0": 220, ciabatta: 240, integrale: 230, focaccia: 230 };

/**
 * Scaletta infornate: lotti non ancora sfornati, ordinati per ORARIO REALE stimato di infornata
 * (fine fase attuale + tempi standard delle fasi residue fino al forno).
 */
export function bakeSchedule(state: AppState): ScheduleRow[] {
  return state.batches
    .filter((batch) => batch.stage !== "Sfornato")
    .map((batch) => ({ batch, bake: estimateBakeTime(batch) }))
    .sort((a, b) => (a.bake?.at.getTime() ?? Infinity) - (b.bake?.at.getTime() ?? Infinity))
    .map(({ batch, bake }, index) => ({
      id: batch.id,
      time: bake ? `${bake.inOven ? "In forno dalle" : "Infornata ~"} ${formatClock(bake.at.toISOString())}` : "Da pianificare",
      oven: `Forno ${(index % 2) + 1} · ${ovenTemps[batch.recipeId ?? ""] ?? 220}°C`,
      product: batch.product,
      quantity: batch.quantity,
      stage: batch.stage,
      inOven: Boolean(bake?.inOven),
    }));
}

/** Ultima rilevazione per ciascuna area di conservazione. */
export function latestTempLogs(logs: TempLog[]): TempLog[] {
  const map = new Map<string, TempLog>();
  [...logs].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()).forEach((log) => { if (!map.has(log.area)) map.set(log.area, log); });
  return Array.from(map.values());
}

export const tempOk = (log: TempLog) => log.value >= log.min && log.value <= log.max;

const byNewest = <T extends { at?: string }>(a: T, b: T) => new Date(b.at ?? 0).getTime() - new Date(a.at ?? 0).getTime();

/**
 * Foglio di lavoro di una giornata (oggi o archivio ASL).
 * Note, controlli HACCP, rinfreschi e resi sono filtrati ESCLUSIVAMENTE sul giorno richiesto.
 * Scaletta e impasti in corso sono mostrati solo per la giornata odierna; per i giorni passati
 * si riportano i lotti creati in quella data.
 */
export function buildDailySheet(state: AppState, operator: string, day: Date = new Date()) {
  const now = new Date();
  const isToday = dayKey(day) === dayKey(now);
  const temps = state.tempLogs.filter((log) => onDay(log.at, day)).sort(byNewest);
  const feedings = state.feedings.filter((item) => onDay(item.at, day)).sort(byNewest);
  const batches = state.batches.filter((batch) => onDay(batch.createdAt, day));
  return {
    date: day.toLocaleDateString("it-IT", { weekday: "long", day: "2-digit", month: "long", year: "numeric" }),
    fileDate: dayKey(day),
    isToday,
    printedAt: now.toLocaleString("it-IT"),
    shift: isToday ? currentShift(now) : "Archivio giornata",
    operator,
    mode: state.mode,
    schedule: isToday ? bakeSchedule(state) : [],
    doughs: batches.map((batch) => {
      const recipe = state.recipes.find((item) => item.id === batch.recipeId);
      const flour = (batch.flourUsage ?? []).reduce((sum, item) => sum + item.kg, 0);
      return { product: batch.product, quantity: batch.quantity, stage: batch.stage, hydration: recipe ? `${recipe.hydration}%` : "—", flour: flour > 0 ? `${flour.toLocaleString("it-IT")} kg` : "—", operator: batch.operator ?? "—" };
    }),
    temps: temps.map((log) => ({ area: log.area, value: formatTemp(log.value), range: formatRange(log.min, log.max), ok: tempOk(log), time: formatDateTime(log.at), operator: log.operator })),
    feedings: feedings.map((item) => ({ starter: starterOf(item) as StarterType, time: formatDateTime(item.at), ratio: item.ratio, temp: `${item.ambientTemp}°C${item.coreTemp !== undefined ? ` (cuore ${item.coreTemp}°C)` : ""}`, extra: starterOf(item) === "Licoli" ? (item.ph ? `pH ${item.ph.toLocaleString("it-IT")}` : "—") : item.binding ?? "—", peak: formatClock(feedingPeak(item).readyAt.toISOString()), operator: item.operator })),
    notes: state.notes.filter((note) => onDay(note.at, day)).sort(byNewest),
    returns: state.returns.filter((item) => onDay(item.at, day)),
  };
}

export type DailySheet = ReturnType<typeof buildDailySheet>;
