import ExcelJS from "exceljs";
import type { ParsedImportTable, SalesImportColumnMapping } from "@/lib/sales-import/types";

const MAX_ROWS = 25_000;

export function parseCsvText(text: string): ParsedImportTable {
  const cleaned = text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = splitCsvLines(cleaned);
  if (lines.length === 0) return { headers: [], rows: [] };
  const delimiter = detectDelimiter(lines[0]!);
  const table = lines.map((line) => parseCsvLine(line, delimiter));
  const headers = (table[0] ?? []).map((h, i) => (h.trim() ? h.trim() : `Column ${i + 1}`));
  const rows: Record<string, string>[] = [];
  for (const cells of table.slice(1)) {
    if (cells.every((c) => !c.trim())) continue;
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      row[h] = cells[i]?.trim() ?? "";
    });
    rows.push(row);
    if (rows.length >= MAX_ROWS) break;
  }
  return { headers, rows };
}

export async function parseSpreadsheetBuffer(
  buffer: Buffer,
  fileName: string,
): Promise<ParsedImportTable> {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".csv") || lower.endsWith(".txt")) {
    return parseCsvText(buffer.toString("utf8"));
  }
  if (!lower.endsWith(".xlsx") && !lower.endsWith(".xls")) {
    throw new Error("Upload a CSV or Excel (.xlsx) file");
  }
  const workbook = new ExcelJS.Workbook();
  // exceljs reads xlsx; .xls is not reliably supported
  if (lower.endsWith(".xls") && !lower.endsWith(".xlsx")) {
    throw new Error("Save the spreadsheet as .xlsx or CSV, then upload again");
  }
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) return { headers: [], rows: [] };

  const matrix: string[][] = [];
  sheet.eachRow({ includeEmpty: false }, (row) => {
    const cells: string[] = [];
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      while (cells.length < colNumber - 1) cells.push("");
      cells.push(cellToString(cell.value));
    });
    if (cells.some((c) => c.trim())) matrix.push(cells);
  });
  if (matrix.length === 0) return { headers: [], rows: [] };
  const headers = (matrix[0] ?? []).map((h, i) => (h.trim() ? h.trim() : `Column ${i + 1}`));
  const rows: Record<string, string>[] = [];
  for (const cells of matrix.slice(1)) {
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      row[h] = cells[i]?.trim() ?? "";
    });
    rows.push(row);
    if (rows.length >= MAX_ROWS) break;
  }
  return { headers, rows };
}

function cellToString(value: ExcelJS.CellValue): string {
  if (value == null) return "";
  if (value instanceof Date) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, "0");
    const d = String(value.getDate()).padStart(2, "0");
    const hh = String(value.getHours()).padStart(2, "0");
    const mm = String(value.getMinutes()).padStart(2, "0");
    if (hh === "00" && mm === "00") return `${d}/${m}/${y}`;
    return `${d}/${m}/${y} ${hh}:${mm}`;
  }
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (typeof value === "string") return value;
  if (typeof value === "object") {
    if ("text" in value && typeof value.text === "string") return value.text;
    if ("richText" in value && Array.isArray(value.richText)) {
      return value.richText.map((p) => p.text).join("");
    }
    if ("result" in value && value.result != null) return cellToString(value.result as ExcelJS.CellValue);
    if ("hyperlink" in value && "text" in value) return String((value as { text?: string }).text ?? "");
  }
  return String(value);
}

function detectDelimiter(headerLine: string): string {
  const counts = {
    ",": (headerLine.match(/,/g) ?? []).length,
    ";": (headerLine.match(/;/g) ?? []).length,
    "\t": (headerLine.match(/\t/g) ?? []).length,
  };
  let best: "," | ";" | "\t" = ",";
  let n = -1;
  (Object.keys(counts) as Array<"," | ";" | "\t">).forEach((k) => {
    if (counts[k] > n) {
      n = counts[k];
      best = k;
    }
  });
  return best;
}

function splitCsvLines(text: string): string[] {
  const lines: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (ch === '"') {
      if (inQuotes && text[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
        current += ch;
      }
      continue;
    }
    if (ch === "\n" && !inQuotes) {
      lines.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  if (current.length) lines.push(current);
  return lines.filter((l, idx) => !(idx === lines.length - 1 && l.trim() === ""));
}

function parseCsvLine(line: string, delimiter: string): string[] {
  const out: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === delimiter && !inQuotes) {
      out.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  out.push(current);
  return out;
}

export function guessColumnMapping(
  headers: string[],
  saved?: SalesImportColumnMapping | null,
  detectedFormat: SalesImportColumnMapping["dateFormat"] = "dmy",
): SalesImportColumnMapping {
  const available = new Set(headers);
  if (saved && saved.date && available.has(saved.date) && saved.quantity && available.has(saved.quantity)) {
    return {
      date: saved.date,
      time: saved.time && available.has(saved.time) ? saved.time : null,
      posItemId: saved.posItemId && available.has(saved.posItemId) ? saved.posItemId : null,
      itemName: saved.itemName && available.has(saved.itemName) ? saved.itemName : null,
      quantity: saved.quantity,
      billNumber: saved.billNumber && available.has(saved.billNumber) ? saved.billNumber : null,
      dateFormat: saved.dateFormat ?? detectedFormat,
    };
  }

  const find = (preds: (h: string) => boolean) => headers.find((h) => preds(h.toLowerCase())) ?? null;
  const date =
    find((h) => /bill\s*date|sale\s*date|txn\s*date|transaction\s*date|^date$/.test(h)) ??
    headers[0] ??
    "";
  const time = find((h) => /bill\s*time|^time$|sale\s*time/.test(h));
  const posItemId = find((h) => /pos\s*(item|code|id)|item\s*id|item\s*code|plu/.test(h));
  const itemName = find((h) => /item\s*name|^item$|menu\s*item|product\s*name|^name$/.test(h));
  const quantity =
    find((h) => /^qty$|quantity|sold\s*qty/.test(h)) ?? headers[headers.length - 1] ?? "";
  const billNumber = find((h) => /bill\s*no|bill\s*#|invoice|check\s*no|receipt/.test(h));
  return { date, time, posItemId, itemName, quantity, billNumber, dateFormat: detectedFormat };
}

export function mappingLooksValid(mapping: SalesImportColumnMapping, headers: string[]): string | null {
  const set = new Set(headers);
  if (!mapping.date || !set.has(mapping.date)) return "Pick a Date column";
  if (!mapping.quantity || !set.has(mapping.quantity)) return "Pick a Quantity column";
  const hasId = mapping.posItemId && set.has(mapping.posItemId);
  const hasName = mapping.itemName && set.has(mapping.itemName);
  if (!hasId && !hasName) return "Pick a POS Item ID column or an Item Name column";
  return null;
}

/** True when every saved mapped column still exists in this file's header row. */
export function savedMappingFitsHeaders(
  saved: SalesImportColumnMapping | null | undefined,
  headers: string[],
): boolean {
  if (!saved) return false;
  const set = new Set(headers);
  const mapped = [saved.date, saved.quantity, saved.time, saved.posItemId, saved.itemName, saved.billNumber];
  for (const column of mapped) {
    if (column && !set.has(column)) return false;
  }
  return mappingLooksValid(saved, headers) === null;
}
