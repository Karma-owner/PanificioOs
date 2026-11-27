# PanificioOS · Compatibilità Android, iOS, Windows (verifica del codice, 27/11/2026)

Verifica fatta leggendo il codice: non ho potuto provare l'app su dispositivi.
Unica prova reale finora: l'app funziona nel browser, in locale (`yarn web`).

| Piattaforma | Stato | Note |
|---|---|---|
| **Windows** (Edge, Chrome, Firefox) | Funziona nel browser | Provato in locale. Un'app Windows "nativa" non è prevista da questa tecnologia: si usa il browser, anche con "Installa app" di Edge/Chrome |
| **Android** (Chrome) | Funziona nel browser | Stesso sito; "Aggiungi a schermata Home" lo trasforma in icona |
| **iPhone/iPad** (Safari) | Funziona nel browser | "Condividi → Aggiungi a Home". Aggiunti i meta tag per l'apertura a tutto schermo |
| **App Android/iOS native** | Predisposta, non provata | Il codice ha già i rami separati (archiviazione, PDF, conferme). Prima prova: `yarn start` e Expo Go sul telefono |

## Cosa è già gestito nel codice
- Archiviazione dati diversa per web e telefono (`storage/index.web.ts` e `index.ts`).
- Creazione PDF diversa per web e telefono (`daily-pdf.web.ts` e `daily-pdf.ts`).
- Finestre di conferma valide ovunque (`confirm.ts`): `Alert` non funziona sul web.
- Rinnovo della sessione di accesso messo in pausa quando l'app va in background su telefono.
- Compatibilità di Supabase su telefono: `url-polyfill.native.ts` (serve `yarn add react-native-url-polyfill`).

## Limiti noti
1. **Stampa etichette allergeni** su Android/iOS: dal codice risulta solo un avviso, non una stampa vera. Sul web e su Windows funziona la stampa del browser.
2. **Pubblicazione negli store** (Google Play, App Store): richiede account sviluppatore a pagamento e cambio degli identificativi attuali (`com.emergent...`). Verifica i costi aggiornati prima di decidere.
3. **Sessione su telefono** salvata senza cifratura aggiuntiva: da rafforzare prima della distribuzione negli store.
4. **Installazione come app (PWA) completa** con icone dedicate: manca il file manifest, da aggiungere e provare.

## Consiglio
Per i primi clienti: **browser o "aggiungi a Home" su tablet e PC**. Niente store, nessun costo di pubblicazione, e gli aggiornamenti arrivano a tutti subito. App native solo se un cliente lo chiede.
