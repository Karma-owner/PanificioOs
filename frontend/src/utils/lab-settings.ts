// Impostazioni del laboratorio, salvate nella colonna tenants.settings (JSON).

export type TempArea = { area: string; min: number; max: number };
export type LabSettings = { operators: string[]; tempAreas: TempArea[] };

export const emptySettings = (): LabSettings => ({ operators: [], tempAreas: [] });

export function parseSettings(raw: unknown): LabSettings {
  const data = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const operators = Array.isArray(data.operators)
    ? data.operators.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
  const tempAreas = Array.isArray(data.tempAreas)
    ? data.tempAreas
        .map((item) => item as Record<string, unknown>)
        .filter((item) => item && typeof item.area === "string" && typeof item.min === "number" && typeof item.max === "number")
        .map((item) => ({ area: String(item.area), min: Number(item.min), max: Number(item.max) }))
    : [];
  return { operators, tempAreas };
}
