import { Alert, Platform } from "react-native";

// Conferma valida su tutte le piattaforme: Alert.alert non funziona sul web.
export function confirmAsync(title: string, message: string, confirmLabel = "Conferma", destructive = true): Promise<boolean> {
  if (Platform.OS === "web") {
    const ok = typeof window !== "undefined" && typeof window.confirm === "function" ? window.confirm(`${title}\n\n${message}`) : false;
    return Promise.resolve(ok);
  }
  return new Promise((resolve) => {
    Alert.alert(
      title,
      message,
      [
        { text: "Annulla", style: "cancel", onPress: () => resolve(false) },
        { text: confirmLabel, style: destructive ? "destructive" : "default", onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}
