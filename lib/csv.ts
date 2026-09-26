type Cell = string | number | boolean | null | undefined;

/**
 * RFC 4180 CSV. Also neutralises spreadsheet formula injection: a product name
 * scraped as `=HYPERLINK(...)` must not execute when the user opens the file.
 */
export function csvCell(value: Cell) {
  if (value === null || value === undefined) return "";
  let text = String(value);
  if (typeof value === "string" && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(headers: string[], rows: Cell[][]) {
  // BOM so Excel opens UTF-8 (₹, €) correctly.
  return "﻿" + [headers, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}
