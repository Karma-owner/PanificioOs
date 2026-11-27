import "@/src/utils/url-polyfill";

import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";
import { AppState, Platform } from "react-native";

// Le variabili EXPO_PUBLIC_* vengono incorporate nella build: vanno lette
// con l'accesso diretto a process.env.EXPO_PUBLIC_NOME.
const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
const key = process.env.EXPO_PUBLIC_SUPABASE_KEY ?? "";

export const supabaseConfigured = Boolean(url && key);

export const supabase = createClient(url || "https://placeholder.supabase.co", key || "placeholder", {
  auth: {
    storage: AsyncStorage,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});

// Su telefono e tablet l'app può restare in background: il rinnovo della sessione
// va fermato e ripreso quando torna in primo piano.
if (Platform.OS !== "web") {
  AppState.addEventListener("change", (state) => {
    if (state === "active") void supabase.auth.startAutoRefresh();
    else void supabase.auth.stopAutoRefresh();
  });
}
