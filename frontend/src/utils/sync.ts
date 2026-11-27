import { storage } from "@/src/utils/storage";
import { AppState, TempLog } from "@/src/panificio-data";
import { supabase } from "@/src/utils/supabase";

// Stato condiviso del panificio su Supabase.
//  - app_state: un documento per panificio (note, lotti, scorte, ricette, ecc.).
//  - haccp_records: registri HACCP immutabili. Per ora i controlli di temperatura.
// La cache locale è separata per panificio, così su un tablet condiviso i dati
// di due clienti non si mescolano mai.
const CACHE_PREFIX = "panificio_state_cache";
const PENDING_PREFIX = "panificio_pending_records";
const TEMP_KIND = "temperatura";
const RECORD_LIMIT = 300;

type PendingRecord = {
  clientRef: string;
  kind: string;
  recordedAt: string;
  operator: string;
  payload: { area: string; value: number; min: number; max: number };
};

let tenantId: string | null = null;
let pendingRecords: PendingRecord[] = [];
let knownRefs = new Set<string>();
let flushingRecords = false;
let recordRetryTimer: ReturnType<typeof setTimeout> | null = null;

export function setSyncTenant(id: string | null): void {
  tenantId = id;
  pending = null;
  pendingRecords = [];
  knownRefs = new Set();
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
  if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
  if (recordRetryTimer) { clearTimeout(recordRetryTimer); recordRetryTimer = null; }
}

function cacheKey(): string {
  return `${CACHE_PREFIX}_${tenantId ?? "none"}`;
}

function pendingKey(): string {
  return `${PENDING_PREFIX}_${tenantId ?? "none"}`;
}

export type SyncStatus = "syncing" | "online" | "offline";

type Listener = (status: SyncStatus) => void;
const listeners = new Set<Listener>();
let currentStatus: SyncStatus = "syncing";

function setStatus(status: SyncStatus): void {
  if (currentStatus === status) return;
  currentStatus = status;
  listeners.forEach((listener) => listener(status));
}

export function subscribeSync(listener: Listener): () => void {
  listeners.add(listener);
  listener(currentStatus);
  return () => {
    listeners.delete(listener);
  };
}

export function getSyncStatus(): SyncStatus {
  return currentStatus;
}

async function withTimeout<T>(run: (signal: AbortSignal) => PromiseLike<T>): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    return await run(controller.signal);
  } finally {
    clearTimeout(timer);
  }
}

// ---------- Documento di stato (senza registri HACCP) ----------

// Nel documento condiviso i registri HACCP non vengono mai salvati: vivono solo in haccp_records.
function forBlob(state: AppState): AppState {
  return {
    mode: state.mode,
    notes: state.notes,
    batches: state.batches,
    stock: state.stock,
    returns: state.returns,
    recipes: state.recipes,
    feedings: state.feedings ?? [],
    tempLogs: [],
  };
}

function normalize(state: AppState): AppState {
  return {
    mode: state.mode,
    notes: state.notes,
    batches: state.batches,
    stock: state.stock,
    returns: state.returns,
    recipes: state.recipes,
    feedings: state.feedings ?? [],
    tempLogs: state.tempLogs ?? [],
  };
}

async function remoteGet(): Promise<AppState | null> {
  if (!tenantId) throw new Error("Nessun panificio selezionato");
  const id = tenantId;
  const { data, error } = await withTimeout((signal) =>
    supabase.from("app_state").select("state").eq("tenant_id", id).abortSignal(signal).maybeSingle(),
  );
  if (error) throw error;
  return (data?.state as AppState | undefined) ?? null;
}

async function remotePut(state: AppState): Promise<void> {
  if (!tenantId) throw new Error("Nessun panificio selezionato");
  const id = tenantId;
  const { error } = await withTimeout((signal) =>
    supabase.from("app_state").upsert({ tenant_id: id, state: forBlob(state) }, { onConflict: "tenant_id" }).abortSignal(signal),
  );
  if (error) throw error;
}

// ---------- Registri HACCP (haccp_records) ----------

async function fetchTempLogs(): Promise<TempLog[]> {
  if (!tenantId) throw new Error("Nessun panificio selezionato");
  const id = tenantId;
  const { data, error } = await withTimeout((signal) =>
    supabase
      .from("haccp_records")
      .select("client_ref, payload, recorded_at, declared_operator")
      .eq("tenant_id", id)
      .eq("kind", TEMP_KIND)
      .order("recorded_at", { ascending: false })
      .limit(RECORD_LIMIT)
      .abortSignal(signal),
  );
  if (error) throw error;
  return (data ?? []).map((row: any) => ({
    id: String(row.client_ref),
    area: String(row.payload?.area ?? ""),
    value: Number(row.payload?.value),
    min: Number(row.payload?.min),
    max: Number(row.payload?.max),
    at: new Date(row.recorded_at).toISOString(),
    operator: String(row.declared_operator ?? ""),
  }));
}

function pendingToTempLog(record: PendingRecord): TempLog {
  return {
    id: record.clientRef,
    area: record.payload.area,
    value: record.payload.value,
    min: record.payload.min,
    max: record.payload.max,
    at: record.recordedAt,
    operator: record.operator,
  };
}

// Registri già sul server + quelli registrati offline e non ancora inviati.
function withPending(server: TempLog[]): TempLog[] {
  const ids = new Set(server.map((log) => log.id));
  const extra = pendingRecords.filter((record) => record.kind === TEMP_KIND && !ids.has(record.clientRef)).map(pendingToTempLog);
  return [...extra, ...server].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
}

async function loadPending(): Promise<void> {
  const raw = (await storage.getItem(pendingKey(), [] as never)) as unknown as PendingRecord[];
  pendingRecords = Array.isArray(raw) ? raw : [];
}

function savePending(): void {
  void storage.setItem(pendingKey(), pendingRecords as never);
}

// Nuovi controlli inseriti dall'app: vengono messi in coda e inviati ai registri.
function collectNewRecords(state: AppState): void {
  let added = false;
  for (const log of state.tempLogs ?? []) {
    if (knownRefs.has(log.id)) continue;
    knownRefs.add(log.id);
    pendingRecords.push({
      clientRef: log.id,
      kind: TEMP_KIND,
      recordedAt: log.at,
      operator: log.operator,
      payload: { area: log.area, value: log.value, min: log.min, max: log.max },
    });
    added = true;
  }
  if (added) {
    savePending();
    void flushRecords();
  }
}

async function flushRecords(): Promise<void> {
  if (flushingRecords || pendingRecords.length === 0 || !tenantId) return;
  flushingRecords = true;
  if (recordRetryTimer) { clearTimeout(recordRetryTimer); recordRetryTimer = null; }
  const startedFor = tenantId;
  try {
    while (pendingRecords.length > 0 && tenantId === startedFor) {
      const next = pendingRecords[0];
      const { error } = await withTimeout((signal) =>
        supabase
          .rpc("add_haccp_record", {
            p_kind: next.kind,
            p_client_ref: next.clientRef,
            p_payload: next.payload,
            p_recorded_at: next.recordedAt,
            p_declared_operator: next.operator,
          })
          .abortSignal(signal),
      );
      if (error) {
        // Errore di validazione del server: il record non potrà mai essere accettato, non blocca gli altri.
        if (error.code === "P0001") {
          console.warn("Registrazione rifiutata dal server:", error.message);
        } else {
          throw error;
        }
      }
      if (tenantId !== startedFor) return;
      pendingRecords.shift();
      savePending();
    }
  } catch {
    setStatus("offline");
    recordRetryTimer = setTimeout(() => {
      recordRetryTimer = null;
      void flushRecords();
    }, 10000);
  } finally {
    flushingRecords = false;
  }
}

// ---------- Caricamento, salvataggio, aggiornamento ----------

export async function loadInitialState(seed: AppState): Promise<AppState> {
  // I dati dimostrativi non devono mai finire nei registri HACCP.
  const base: AppState = { ...seed, tempLogs: [] };
  await loadPending();
  const cached = (await storage.getItem(cacheKey(), null as never)) as unknown as AppState | null;
  try {
    const [remote, temps] = await Promise.all([remoteGet(), fetchTempLogs()]);
    knownRefs = new Set([...temps.map((log) => log.id), ...pendingRecords.map((record) => record.clientRef)]);
    void flushRecords();
    const logs = withPending(temps);
    const populated = !!remote && Array.isArray(remote.recipes);
    if (remote && populated) {
      if (!Array.isArray(remote.feedings)) remote.feedings = base.feedings;
      const clean: AppState = { ...normalize(remote), tempLogs: logs };
      await storage.setItem(cacheKey(), clean as never);
      setStatus("online");
      return clean;
    }
    await remotePut(base);
    const fresh: AppState = { ...base, tempLogs: logs };
    await storage.setItem(cacheKey(), fresh as never);
    setStatus("online");
    return fresh;
  } catch {
    setStatus("offline");
    if (cached && Array.isArray(cached.recipes)) {
      const offline = normalize(cached);
      knownRefs = new Set([...offline.tempLogs.map((log) => log.id), ...pendingRecords.map((record) => record.clientRef)]);
      return { ...offline, tempLogs: withPending(offline.tempLogs) };
    }
    knownRefs = new Set(pendingRecords.map((record) => record.clientRef));
    return { ...base, tempLogs: withPending([]) };
  }
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let pending: AppState | null = null;
let saving = false;
let localEditEpoch = 0;

async function flushPending(): Promise<void> {
  if (saving) return;
  if (!pending) return;
  if (retryTimer) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
  const payload = pending;
  saving = true;
  try {
    await remotePut(payload);
    saving = false;
    if (pending === payload) {
      pending = null;
      setStatus("online");
    } else {
      void flushPending();
    }
  } catch {
    saving = false;
    setStatus("offline");
    if (retryTimer) clearTimeout(retryTimer);
    retryTimer = setTimeout(() => {
      retryTimer = null;
      void flushPending();
    }, 10000);
  }
}

export function enqueueSave(state: AppState): void {
  collectNewRecords(state);
  pending = state;
  localEditEpoch += 1;
  void storage.setItem(cacheKey(), state as never);
  setStatus("syncing");
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    void flushPending();
  }, 500);
}

export async function pollRemote(current: AppState): Promise<AppState | null> {
  if (pending !== null || retryTimer !== null || saving) return null;
  const epoch = localEditEpoch;
  try {
    const [remote, temps] = await Promise.all([remoteGet(), fetchTempLogs()]);
    // Scarta la risposta se nel frattempo c'è stata una modifica locale.
    if (pending !== null || retryTimer !== null || saving || epoch !== localEditEpoch) return null;
    setStatus("online");
    void flushRecords();
    if (!remote) return null;
    const clean: AppState = { ...normalize(remote), tempLogs: withPending(temps) };
    if (JSON.stringify(clean) === JSON.stringify(normalize(current))) return null;
    await storage.setItem(cacheKey(), clean as never);
    return clean;
  } catch {
    setStatus("offline");
    return null;
  }
}

// Ripristina i dati dimostrativi del documento di stato. I registri HACCP non si toccano.
export async function resetRemote(demo: AppState): Promise<AppState> {
  pending = null;
  localEditEpoch += 1;
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
  if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
  let logs: TempLog[] = [];
  try {
    logs = withPending(await fetchTempLogs());
  } catch {
    logs = withPending([]);
  }
  const clean: AppState = { ...normalize(demo), tempLogs: logs };
  await storage.setItem(cacheKey(), clean as never);
  saving = true;
  try {
    await remotePut(clean);
    setStatus("online");
  } catch {
    setStatus("offline");
  } finally {
    saving = false;
    localEditEpoch += 1;
  }
  return clean;
}

export function remainingFromIso(iso?: string): { label: string; progress: number; expired: boolean } | null {
  if (!iso) return null;
  const end = new Date(iso).getTime();
  if (Number.isNaN(end)) return null;
  const now = Date.now();
  const diffMs = end - now;
  const expired = diffMs <= 0;
  const totalMin = Math.max(Math.ceil(Math.abs(diffMs) / 60000), 0);
  const hours = Math.floor(totalMin / 60);
  const minutes = totalMin % 60;
  const label = expired
    ? "Pronto"
    : `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
  const assumedWindowMin = 180;
  const elapsedMin = assumedWindowMin - Math.min(totalMin, assumedWindowMin);
  const progress = expired ? 1 : Math.min(Math.max(elapsedMin / assumedWindowMin, 0.05), 0.95);
  return { label, progress, expired };
}
