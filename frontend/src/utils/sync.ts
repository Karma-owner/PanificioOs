import { storage } from "@/src/utils/storage";
import { AppState } from "@/src/panificio-data";

const BACKEND = process.env.EXPO_PUBLIC_BACKEND_URL ?? "";
const ENDPOINT = `${BACKEND}/api/panificio/state`;
const CACHE_KEY = "panificio_state_cache";

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

async function fetchJson(url: string, init?: RequestInit): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

function sanitize(state: AppState): AppState {
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

export async function loadInitialState(seed: AppState): Promise<AppState> {
  const cached = (await storage.getItem(CACHE_KEY, null as never)) as unknown as AppState | null;
  try {
    const remote = await fetchJson(ENDPOINT);
    const populated = remote && Array.isArray(remote.recipes) && remote.recipes.length > 0;
    if (populated) {
      if (!Array.isArray(remote.feedings)) remote.feedings = seed.feedings;
      if (!Array.isArray(remote.tempLogs)) remote.tempLogs = seed.tempLogs;
      const clean = sanitize(remote);
      await storage.setItem(CACHE_KEY, clean as never);
      setStatus("online");
      return clean;
    }
    await fetchJson(ENDPOINT, { method: "PUT", body: JSON.stringify(sanitize(seed)) });
    await storage.setItem(CACHE_KEY, seed as never);
    setStatus("online");
    return seed;
  } catch {
    setStatus("offline");
    return cached && Array.isArray(cached.recipes) && cached.recipes.length > 0 ? sanitize(cached) : seed;
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
    await fetchJson(ENDPOINT, { method: "PUT", body: JSON.stringify(sanitize(payload)) });
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
  pending = state;
  localEditEpoch += 1;
  void storage.setItem(CACHE_KEY, state as never);
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
    const remote = await fetchJson(ENDPOINT);
    // Drop stale response if any local edit landed while we waited.
    if (pending !== null || retryTimer !== null || saving || epoch !== localEditEpoch) return null;
    setStatus("online");
    const clean = sanitize(remote);
    if (JSON.stringify(clean) === JSON.stringify(sanitize(current))) return null;
    await storage.setItem(CACHE_KEY, clean as never);
    return clean;
  } catch {
    setStatus("offline");
    return null;
  }
}

export async function resetRemote(demo: AppState): Promise<AppState> {
  pending = null;
  localEditEpoch += 1;
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
  if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
  const clean = sanitize(demo);
  await storage.setItem(CACHE_KEY, clean as never);
  saving = true;
  try {
    await fetchJson(ENDPOINT, { method: "PUT", body: JSON.stringify(clean) });
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
