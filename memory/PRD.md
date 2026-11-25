# PanificioOS — PRD

## Overview
Italian bakery ERP mobile app with 3 operational modes (Bottega Artigianale, Reparto GDO, Industriale).

## Features
- 6 modules: Dashboard, Ricettario, Produzione, HACCP, Costi, Report
- Pre-loaded 4 Italian recipes (Pane Comune, Ciabatta, Pane Integrale, Focaccia Pugliese)
- Allergen label modal (REG. UE 1169/2011) printable
- Traceability sheet (HACCP) with lot numbers, signatures, printable
- Shift handover filters (Notte/Mattina/Pomeriggio) + priority tags (Normale/Urgente/Manutenzione)
- Kanban production board with persistent timers (ISO timestamps)
- Dynamic bar/mix charts derived from state
- Sync status badge (Cloud sincronizzato / Salvataggio / Offline)
- Optimistic UI with debounced PUT, offline retry every 10s
- Backend persistence via /api/panificio/state + local cache fallback
- Cross-device polling every 12s
- Reset demo wipes both backend and cache

## Tech
- Expo/React Native (frontend)
- FastAPI + MongoDB (backend)
- No auth (open demo)

## Iterazione 6 (giugno 2026)
- Interfaccia interamente in italiano (Quadro Generale, Lavagna di lavorazione, Indicatori Chiave di Prestazione, Resoconti...)
- Rinfreschi lievito madre: scheda validata (orario, rapporto, °C, pH facoltativo, note) + storico con picco stimato e barra di crescita
- Schede validate: Nuovo lotto materia prima (registro HACCP), Nuovo impasto, Registra reso (bilancio aggiornato), Nuovo controllo temperatura
- Selettore operatore in testata (persistito sul dispositivo): firma automatica su note, controlli HACCP, lotti, rinfreschi, resi, avanzamento impasti, scheda tracciabilità
- PDF giornaliero A4 (web: jsPDF download; nativo: expo-print + condivisione)
- Nuovi campi stato backend: feedings, tempLogs

## Iterazione 7
- Scaletta: orario reale stimato di infornata (fine fase + durate standard per ricetta, src/utils/lab-automation.ts)
- Avanzamento lotto riavvia il conto alla rovescia con la durata standard della fase
- PDF/Archivio: filtro per giorno locale (note con `at`, HACCP, rinfreschi, resi); selettore giornate passate (ispezioni ASL)
- Selettore operatore a tendina sotto 768px; storico rinfreschi a schede su smartphone, tabella su tablet
- Doppio lievito: Pasta Madre Solida (1:1:0.45, temp. cuore, bagnetto/legatura) + Licoli (1:2:2, pH); avvisi "pronto" nel Quadro Generale
- Scarico automatico farine all'ingresso "In Puntata" (scalato sul peso del lotto, avviso sotto soglia, registrato in flourUsage e scheda tracciabilità)
