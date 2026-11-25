import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { DailySheet } from "@/src/utils/daily-sheet";

// Colori fissi del documento stampato (A4 bianco), indipendenti dal tema chiaro/scuro.
const INK = "#1E293B";
const ACCENT = "#D97706";
const GREY = "#64748B";

const esc = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function table(head: string[], rows: string[][]): string {
  if (rows.length === 0) return `<p class="empty">Nessun dato registrato.</p>`;
  return `<table><thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${esc(cell)}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
}

export function dailySheetHtml(sheet: DailySheet): string {
  return `<!DOCTYPE html><html lang="it"><head><meta charset="utf-8"/><style>
  @page { size: A4 portrait; margin: 14mm; }
  body { font-family: Helvetica, Arial, sans-serif; color: ${INK}; font-size: 11px; }
  .head { border-bottom: 3px solid ${ACCENT}; padding-bottom: 8px; margin-bottom: 12px; display: flex; justify-content: space-between; }
  .brand { color: ${ACCENT}; font-weight: 900; letter-spacing: 2px; font-size: 11px; }
  h1 { margin: 4px 0 0; font-size: 22px; } h2 { font-size: 13px; margin: 16px 0 6px; text-transform: uppercase; letter-spacing: 1px; color: ${ACCENT}; }
  .meta { text-align: right; color: ${GREY}; line-height: 1.6; }
  table { width: 100%; border-collapse: collapse; } th { background: ${INK}; color: #FFFFFF; text-align: left; padding: 5px; font-size: 10px; }
  td { border-bottom: 1px solid #CBD5E1; padding: 5px; } .ko { color: #B91C1C; font-weight: 700; } .empty { color: ${GREY}; }
  .sign { display: flex; gap: 30px; margin-top: 26px; } .sign div { flex: 1; border-top: 1px solid ${INK}; padding-top: 4px; color: ${GREY}; }
  </style></head><body>
  <div class="head"><div><div class="brand">PANIFICIOOS · LABORATORIO</div><h1>${sheet.isToday ? "Foglio di lavoro giornaliero" : "Archivio giornata · Registri HACCP"}</h1></div>
  <div class="meta">Data: <b>${esc(sheet.date)}</b><br/>Turno: <b>${esc(sheet.shift)}</b><br/>Operatore: <b>${esc(sheet.operator)}</b><br/>Modalità: ${esc(sheet.mode)}</div></div>
  <h2>Scaletta delle infornate</h2>${table(["Ora", "Forno", "Prodotto", "Quantità", "Fase"], sheet.schedule.map((r) => [r.time, r.oven, r.product, r.quantity, r.stage]))}
  <h2>Riepilogo impasti</h2>${table(["Prodotto", "Quantità", "Idratazione", "Farina scaricata", "Fase", "Firmato da"], sheet.doughs.map((d) => [d.product, d.quantity, d.hydration, d.flour, d.stage, d.operator]))}
  <h2>Registro temperature HACCP</h2>${sheet.temps.length === 0 ? `<p class="empty">Nessun controllo registrato.</p>` : `<table><thead><tr><th>Area</th><th>Rilevato</th><th>Intervallo</th><th>Esito</th><th>Data/Ora</th><th>Firma</th></tr></thead><tbody>${sheet.temps.map((t) => `<tr><td>${esc(t.area)}</td><td>${esc(t.value)}</td><td>${esc(t.range)}</td><td class="${t.ok ? "" : "ko"}">${t.ok ? "Conforme" : "NON CONFORME"}</td><td>${esc(t.time)}</td><td>${esc(t.operator)}</td></tr>`).join("")}</tbody></table>`}
  <h2>Rinfreschi lievito madre</h2>${table(["Lievito", "Data/Ora", "Rapporto", "Temperatura", "pH / Trattamento", "Picco", "Firma"], sheet.feedings.map((f) => [f.starter, f.time, f.ratio, f.temp, f.extra, f.peak, f.operator]))}
  <h2>Passaggio consegne</h2>${table(["Ora", "Turno", "Priorità", "Nota", "Firma"], sheet.notes.map((n) => [n.time, n.shift, n.priority, n.text, n.operator ?? "—"]))}
  <h2>Resi e recupero invenduto</h2>${table(["Prodotto", "Kg", "Destinazione", "Valore", "Firma"], sheet.returns.map((r) => [r.product, r.kg.toLocaleString("it-IT"), r.destination, r.value, r.operator ?? "—"]))}
  <div class="sign"><div>Responsabile produzione</div><div>Responsabile HACCP</div></div>
  <p class="empty" style="margin-top:14px">Generato il ${esc(sheet.printedAt)} · Conservare in bacheca di laboratorio</p>
  </body></html>`;
}

export async function exportDailyPdf(sheet: DailySheet): Promise<string> {
  const { uri } = await Print.printToFileAsync({ html: dailySheetHtml(sheet), width: 595, height: 842 });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, { mimeType: "application/pdf", UTI: "com.adobe.pdf", dialogTitle: "Foglio di lavoro giornaliero" });
  }
  return uri;
}
