# Passaggi a tuo carico

1. **Supabase → Authentication → URL Configuration:** Site URL `https://karma-owner.github.io/PanificioOs/` (e lo stesso indirizzo tra i Redirect URLs).
2. **Supabase → Authentication:** per i clienti veri imposta un mittente email tuo (SMTP personalizzato); se il tuo piano lo prevede attiva «Leaked password protection».
3. **Supabase → piano Pro** prima del primo cliente: il gratuito non fa backup e mette in pausa il progetto dopo una settimana senza uso.
4. **GitHub → Settings → Pages → Source: «GitHub Actions».** Togli dal repository `index.html` e `index_files/`, poi carica le modifiche.
5. **Dominio Aruba:** registralo, aggiungi il record DNS indicato da GitHub (Settings → Pages → Custom domain), poi in `frontend/app.json` cambia `"baseUrl": "/PanificioOs"` per il dominio alla radice.
6. **Documenti legali** (condizioni d'uso, privacy, contratto sul trattamento dei dati): da far preparare a un professionista.

## Aggiungere un aggiornamento normativo
Supabase → Table Editor → `regulatory_updates` → Insert row: `title`, `source_name`, `source_url` (https://…), `category` (haccp, allergeni, etichettatura, igiene, rintracciabilita, altro), `kind` = `novita`, `published_at`. Solo link a fonti ufficiali, nessuna tua interpretazione.
