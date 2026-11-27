import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";

import { Card, SectionTitle } from "@/src/components/panificio-ui";
import { useTheme } from "@/src/theme";
import { useAuth } from "@/src/utils/auth";
import { storage } from "@/src/utils/storage";
import { supabase } from "@/src/utils/supabase";

const categoryLabels: Record<string, string> = {
  haccp: "HACCP",
  allergeni: "Allergeni",
  etichettatura: "Etichettatura",
  igiene: "Igiene",
  rintracciabilita: "Rintracciabilità",
  altro: "Altro",
};

type Update = {
  id: string;
  title: string;
  summary: string | null;
  source_name: string;
  source_url: string;
  category: string;
  kind: "novita" | "riferimento";
  published_at: string | null;
  created_at: string;
};

// Elenco di collegamenti a fonti ufficiali, curato dal fornitore del software.
// Non contiene interpretazioni: rimanda sempre alla fonte.
export function RegulatoryFeed() {
  const { colors } = useTheme();
  const { membership } = useAuth();
  const seenKey = `panificio_regulatory_seen_${membership?.tenantId ?? "none"}`;
  const [items, setItems] = useState<Update[]>([]);
  const [freshIds, setFreshIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    let active = true;
    (async () => {
      const { data, error } = await supabase
        .from("regulatory_updates")
        .select("id, title, summary, source_name, source_url, category, kind, published_at, created_at")
        .order("published_at", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false })
        .limit(8);
      if (!active || error || !data) return;
      const lastSeen = String(await storage.getItem(seenKey, ""));
      const fresh = new Set<string>(data.filter((row: Update) => row.kind === "novita" && (!lastSeen || row.created_at > lastSeen)).map((row: Update) => row.id));
      setItems(data as Update[]);
      setFreshIds(fresh);
      void storage.setItem(seenKey, new Date().toISOString());
    })();
    return () => { active = false; };
  }, [seenKey]);

  if (items.length === 0) return null;

  return (
    <Card>
      <SectionTitle eyebrow="Normativa" title="Aggiornamenti normativi" />
      <Text style={{ color: colors.muted, fontSize: 12, lineHeight: 18, marginBottom: 8 }}>
        Collegamenti a fonti ufficiali. Non sostituiscono il parere del tuo consulente HACCP.
      </Text>
      {items.map((item) => (
        <Pressable key={item.id} testID={`regulatory-${item.id}`} accessibilityRole="link" onPress={() => void Linking.openURL(item.source_url)} style={[styles.row, { borderBottomColor: colors.divider }]}>
          <View style={{ flex: 1 }}>
            <View style={styles.meta}>
              <Text style={[styles.tag, { color: colors.brand }]}>{categoryLabels[item.category] ?? "Altro"}</Text>
              {item.kind === "riferimento" ? <Text style={[styles.sub, { color: colors.muted }]}>Riferimento</Text> : null}
              {freshIds.has(item.id) ? <Text style={[styles.new, { backgroundColor: colors.brand, color: colors.onBrand }]}>NUOVO</Text> : null}
            </View>
            <Text style={{ color: colors.onSurface, fontWeight: "800", fontSize: 14, lineHeight: 19 }}>{item.title}</Text>
            <Text style={{ color: colors.muted, fontSize: 12, marginTop: 3 }}>
              {item.source_name}{item.published_at ? ` · ${new Date(item.published_at).toLocaleDateString("it-IT")}` : ""}
            </Text>
          </View>
          <Ionicons name="open-outline" size={18} color={colors.muted} />
        </Pressable>
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { minHeight: 64, paddingVertical: 10, borderBottomWidth: 1, flexDirection: "row", alignItems: "center", gap: 10 },
  meta: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 },
  tag: { fontSize: 10, fontWeight: "900", letterSpacing: 0.8, textTransform: "uppercase" },
  sub: { fontSize: 10, fontWeight: "700" },
  new: { fontSize: 9, fontWeight: "900", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, overflow: "hidden" },
});
