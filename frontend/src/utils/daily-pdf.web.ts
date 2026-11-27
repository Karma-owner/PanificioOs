import { jsPDF } from "jspdf";
import { autoTable } from "jspdf-autotable";
import { DailySheet } from "@/src/utils/daily-sheet";

// Colori fissi del documento A4 stampato.
const INK: [number, number, number] = [30, 41, 59];
const ACCENT: [number, number, number] = [217, 119, 6];
const GREY: [number, number, number] = [100, 116, 139];

// I caratteri standard PDF non includono alcuni simboli tipografici: li normalizziamo.
const clean = (value: string) => value.replace(/~/g, "ca.").replace(/[–−]/g, "-").replace(/≤/g, "<=").replace(/·/g, "-").replace(/×/g, "x");

export async function exportDailyPdf(sheet: DailySheet): Promise<string> {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const left = 14;
  let y = 16;
  doc.setTextColor(...ACCENT).setFont("helvetica", "bold").setFontSize(9).text("PANIFICIOOS - LABORATORIO", left, y);
  doc.setTextColor(...INK).setFontSize(18).text(sheet.isToday ? "Foglio di lavoro giornaliero" : "Archivio giornata - Registri HACCP", left, y + 8);
  doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(...GREY);
  [`Data: ${sheet.date}`, `Turno: ${sheet.shift}`, `Operatore: ${clean(sheet.operator)}`, `Laboratorio: ${clean(sheet.lab)}`].forEach((line, i) => doc.text(line, 196, y + i * 4.5, { align: "right" }));
  y += 20;
  doc.setDrawColor(...ACCENT).setLineWidth(0.8).line(left, y, 196, y);
  y += 6;

  const section = (title: string, head: string[], body: string[][], highlightCol?: number) => {
    if (y > 260) { doc.addPage(); y = 16; }
    doc.setTextColor(...ACCENT).setFont("helvetica", "bold").setFontSize(10).text(title.toUpperCase(), left, y);
    if (body.length === 0) {
      doc.setTextColor(...GREY).setFont("helvetica", "normal").setFontSize(9).text("Nessun dato registrato.", left, y + 5);
      y += 12;
      return;
    }
    autoTable(doc, {
      startY: y + 2,
      head: [head],
      body: body.map((row) => row.map(clean)),
      margin: { left, right: 14 },
      styles: { fontSize: 8.5, textColor: INK, cellPadding: 1.8 },
      headStyles: { fillColor: INK, textColor: [255, 255, 255], fontStyle: "bold" },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      didParseCell: (data) => {
        if (highlightCol !== undefined && data.section === "body" && data.column.index === highlightCol && String(data.cell.raw).startsWith("NON")) {
          data.cell.styles.textColor = [185, 28, 28];
          data.cell.styles.fontStyle = "bold";
        }
      },
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
  };

  section("Scaletta delle infornate", ["Ora", "Forno", "Prodotto", "Quantità", "Fase"], sheet.schedule.map((r) => [r.time, r.oven, r.product, r.quantity, r.stage]));
  section("Riepilogo impasti", ["Prodotto", "Quantità", "Idratazione", "Farina scaricata", "Fase", "Firmato da"], sheet.doughs.map((d) => [d.product, d.quantity, d.hydration, d.flour, d.stage, d.operator]));
  section("Registro temperature HACCP", ["Area", "Rilevato", "Intervallo", "Esito", "Data/Ora", "Firma"], sheet.temps.map((t) => [t.area, t.value, t.range, t.ok ? "Conforme" : "NON CONFORME", t.time, t.operator]), 3);
  section("Rinfreschi lievito madre", ["Lievito", "Data/Ora", "Rapporto", "Temperatura", "pH / Trattamento", "Picco", "Firma"], sheet.feedings.map((f) => [f.starter, f.time, f.ratio, f.temp, f.extra, f.peak, f.operator]));
  section("Passaggio consegne", ["Ora", "Turno", "Priorità", "Nota", "Firma"], sheet.notes.map((n) => [n.time, n.shift, n.priority, n.text, n.operator ?? "—"]));
  section("Resi e recupero invenduto", ["Prodotto", "Kg", "Destinazione", "Valore", "Firma"], sheet.returns.map((r) => [r.product, r.kg.toLocaleString("it-IT"), r.destination, r.value, r.operator ?? "—"]));

  if (y > 268) { doc.addPage(); y = 20; }
  y += 10;
  doc.setDrawColor(...INK).setLineWidth(0.3).line(left, y, 95, y).line(115, y, 196, y);
  doc.setTextColor(...GREY).setFont("helvetica", "normal").setFontSize(8).text("Responsabile produzione", left, y + 4).text("Responsabile HACCP", 115, y + 4);
  doc.text(`Generato il ${sheet.printedAt} - Conservare in bacheca di laboratorio`, left, 287);

  const fileName = `foglio-lavoro-${sheet.fileDate}.pdf`;
  doc.save(fileName);
  return fileName;
}
