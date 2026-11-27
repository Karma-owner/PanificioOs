import { Ionicons } from "@expo/vector-icons";
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { IconButton } from "@/src/components/panificio-ui";
import { useTheme } from "@/src/theme";

type Step = { title: string; text: string };

const adminSteps: Step[] = [
  { title: "Imposta il laboratorio", text: "In Impostazioni scrivi il nome del laboratorio e i nomi degli operatori che firmano le registrazioni." },
  { title: "Celle e soglie", text: "Sempre in Impostazioni, aggiungi celle e frigoriferi con le temperature ammesse. Le soglie sono quelle del piano di autocontrollo del tuo laboratorio: concordale con il tuo consulente HACCP." },
  { title: "Inserisci le ricette", text: "In Ricette premi «Nuova ricetta»: ingredienti in percentuale rispetto alla farina e allergeni di ciascun ingrediente." },
  { title: "Invita i colleghi", text: "In Impostazioni → Team e inviti crea un codice. Il collega si registra e sceglie «Ho un codice di invito»." },
  { title: "Uso quotidiano", text: "Oggi mostra la situazione del giorno, Produzione gli impasti in corso, Altro magazzino, controlli HACCP e archivio per l'ASL." },
  { title: "Registri non modificabili", text: "I controlli di temperatura registrati non si possono cambiare né cancellare: serve una rettifica che rimanda al record originale. La schermata per le rettifiche arriverà in un prossimo aggiornamento." },
  { title: "Aggiornamenti normativi", text: "In Oggi trovi collegamenti a fonti ufficiali. Sono un promemoria, non una consulenza: per i dubbi chiedi al tuo consulente o alla tua ASL." },
];

const operatorSteps: Step[] = [
  { title: "Scegli il tuo nome", text: "In alto, nel selettore operatore: ogni registrazione che fai porta la tua firma." },
  { title: "Oggi", text: "Mostra la situazione del giorno e le note di passaggio consegne." },
  { title: "Produzione", text: "Qui segui gli impasti in corso e i loro tempi." },
  { title: "Controlli HACCP", text: "In Altro registra le temperature di celle e frigoriferi. Se una cella manca, chiedilo all'amministratore." },
  { title: "Se qualcosa non torna", text: "Lascia una nota di passaggio consegne e avvisa l'amministratore: i registri già salvati non si cambiano." },
];

export function QuickGuide({ visible, isAdmin, onClose }: { visible: boolean; isAdmin: boolean; onClose: () => void }) {
  const { colors } = useTheme();
  if (!visible) return null;
  const steps = isAdmin ? adminSteps : operatorSteps;

  const content = (
    <View style={[styles.backdrop, Platform.OS === "web" ? styles.webOverlay : null, { backgroundColor: colors.surfaceInverse + "CC" }]}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.avoid}>
        <View testID="quick-guide" style={[styles.sheet, { backgroundColor: colors.surface }]}>
          <View style={styles.head}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.brand, fontSize: 11, fontWeight: "900", letterSpacing: 1.1 }}>GUIDA RAPIDA</Text>
              <Text style={{ color: colors.onSurface, fontSize: 22, fontWeight: "900" }}>{isAdmin ? "Primo avvio del laboratorio" : "Come si usa PanificioOS"}</Text>
            </View>
            <IconButton testID="quick-guide-close" icon="close" label="Chiudi" onPress={onClose} />
          </View>
          <ScrollView showsVerticalScrollIndicator={false} style={{ flexGrow: 0 }}>
            {steps.map((step, index) => (
              <View key={step.title} style={[styles.step, { borderBottomColor: colors.divider }]}>
                <View style={[styles.num, { backgroundColor: colors.brand }]}><Text style={{ color: colors.onBrand, fontWeight: "900", fontSize: 13 }}>{index + 1}</Text></View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.onSurface, fontWeight: "900", fontSize: 14 }}>{step.title}</Text>
                  <Text style={{ color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: 3 }}>{step.text}</Text>
                </View>
              </View>
            ))}
          </ScrollView>
          <Pressable testID="quick-guide-done" onPress={onClose} style={[styles.done, { backgroundColor: colors.brand }]}>
            <Ionicons name="checkmark" size={18} color={colors.onBrand} />
            <Text style={{ color: colors.onBrand, fontWeight: "900" }}>Ho capito</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </View>
  );

  return Platform.OS === "web" ? content : <Modal visible transparent animationType="slide" onRequestClose={onClose}>{content}</Modal>;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: "flex-end" },
  webOverlay: { position: "absolute", top: 0, bottom: 0, left: 0, right: 0, zIndex: 100 },
  avoid: { width: "100%", maxWidth: 720, alignSelf: "center", flex: 1, justifyContent: "flex-end" },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, maxHeight: "92%" },
  head: { flexDirection: "row", alignItems: "flex-start", marginBottom: 10, gap: 10 },
  step: { flexDirection: "row", gap: 12, paddingVertical: 12, borderBottomWidth: 1 },
  num: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  done: { minHeight: 48, borderRadius: 12, marginTop: 14, flexDirection: "row", gap: 6, alignItems: "center", justifyContent: "center" },
});
