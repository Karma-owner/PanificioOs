import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useTheme } from "@/src/theme";

export function SectionTitle({ eyebrow, title, action, onAction, testID }: { eyebrow?: string; title: string; action?: string; onAction?: () => void; testID?: string }) {
  const { colors } = useTheme();
  return <View style={styles.sectionHead}><View style={styles.sectionText}>{eyebrow ? <Text style={[styles.eyebrow, { color: colors.brand }]}>{eyebrow.toUpperCase()}</Text> : null}<Text style={[styles.sectionTitle, { color: colors.onSurface }]}>{title}</Text></View>{action ? <Pressable testID={testID} onPress={onAction} style={({ pressed }) => [styles.textAction, { opacity: pressed ? 0.65 : 1 }]}><Text style={[styles.textActionLabel, { color: colors.brand }]}>{action}</Text></Pressable> : null}</View>;
}

export function StatusPill({ label, tone = "neutral" }: { label: string; tone?: "neutral" | "success" | "warning" | "error" | "info" | "brand" }) {
  const { colors } = useTheme();
  const map = { neutral: [colors.surfaceTertiary, colors.onSurfaceTertiary], success: [colors.success, colors.onSuccess], warning: [colors.brandTertiary, colors.onBrandTertiary], error: [colors.error, colors.onError], info: [colors.info, colors.onInfo], brand: [colors.brand, colors.onBrand] } as const;
  const [backgroundColor, color] = map[tone];
  return <View style={[styles.pill, { backgroundColor }]}><Text style={[styles.pillText, { color }]}>{label}</Text></View>;
}

export function MetricCard({ icon, value, label, detail, tone = "brand" }: { icon: keyof typeof Ionicons.glyphMap; value: string; label: string; detail?: string; tone?: "brand" | "success" | "warning" | "info" }) {
  const { colors } = useTheme();
  const toneColor = { brand: colors.brand, success: colors.success, warning: colors.warning, info: colors.info }[tone];
  return <View style={[styles.metric, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}><View style={[styles.metricIcon, { backgroundColor: colors.surfaceTertiary }]}><Ionicons name={icon} size={21} color={toneColor} /></View><Text style={[styles.metricValue, { color: colors.onSurface }]}>{value}</Text><Text style={[styles.metricLabel, { color: colors.muted }]}>{label}</Text>{detail ? <Text style={[styles.metricDetail, { color: toneColor }]}>{detail}</Text> : null}</View>;
}

export function Card({ children, style }: { children: React.ReactNode; style?: object }) {
  const { colors } = useTheme();
  return <View style={[styles.card, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }, style]}>{children}</View>;
}

export function IconButton({ icon, onPress, label, testID }: { icon: keyof typeof Ionicons.glyphMap; onPress: () => void; label: string; testID?: string }) {
  const { colors } = useTheme();
  return <Pressable testID={testID} accessibilityLabel={label} onPress={onPress} style={({ pressed }) => [styles.iconButton, { backgroundColor: colors.surfaceTertiary, opacity: pressed ? 0.65 : 1 }]}><Ionicons name={icon} size={20} color={colors.onSurface} /></Pressable>;
}

const styles = StyleSheet.create({
  sectionHead: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 12, gap: 12 },
  sectionText: { flex: 1 },
  eyebrow: { fontSize: 11, fontWeight: "800", letterSpacing: 1.1, marginBottom: 3 },
  sectionTitle: { fontSize: 21, fontWeight: "800", letterSpacing: -0.4 },
  textAction: { minHeight: 44, justifyContent: "center", paddingHorizontal: 4 },
  textActionLabel: { fontSize: 13, fontWeight: "800" },
  pill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6, alignSelf: "flex-start" },
  pillText: { fontSize: 11, fontWeight: "800", letterSpacing: 0.2 },
  metric: { flex: 1, minWidth: 145, borderRadius: 14, borderWidth: 1, padding: 15, minHeight: 142 },
  metricIcon: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center", marginBottom: 12 },
  metricValue: { fontSize: 26, fontWeight: "900", letterSpacing: -0.8 },
  metricLabel: { fontSize: 12, fontWeight: "700", marginTop: 3 },
  metricDetail: { fontSize: 11, fontWeight: "800", marginTop: 10 },
  card: { borderRadius: 16, borderWidth: 1, padding: 16, marginBottom: 16 },
  iconButton: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center" },
});